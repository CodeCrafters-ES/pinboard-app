# Notificaciones push — cliente

Documentación del cliente de push (EPIC-N06, feature F-N06-01). Cubre el **ciclo de vida del Expo Push Token**
en la app: permisos, registro, refresco y borrado (I-F-N06-01-02). El esquema de `push_tokens` y sus policies
viven en las migraciones (`20260618700000`, `20260618800000`, `20260716000002`, `20260801000000`) y la matriz
de RLS en [`docs/rls/push_tokens.md`](rls/push_tokens.md).

El envío (`send-push`), los webhooks de BD, la purga de tokens inválidos y el deep-linking se documentan con
sus issues (F-N06-02 y F-N06-03).

## Piezas

| Fichero | Rol |
|---|---|
| `lib/notifications/pushToken.ts` | Permisos, obtención del Expo token, escritura/borrado en `push_tokens` |
| `lib/notifications/setup.ts` | Handler de foreground y listeners de rotación / vuelta a primer plano |
| `hooks/useSession.tsx` | Dispara el registro cuando hay sesión y expone `pushStatus` |
| `lib/auth.ts` | `signOut()` borra el token de este dispositivo antes de invalidar la sesión |
| `components/PushPermissionNotice.tsx` | Aviso no bloqueante si el usuario ha denegado los permisos |

## Flujo de registro

1. `SessionProvider` resuelve la sesión y, con `userId` no nulo, llama a `registerPushToken(userId)`.
   Cuelga del **userId**, no del evento `SIGNED_IN`: al abrir la app con sesión persistida supabase-js emite
   `INITIAL_SESSION`, y si solo se escuchara `SIGNED_IN` el dispositivo nunca se registraría ni refrescaría
   `last_seen_at`.
2. `registerPushToken` descarta emulador/simulador y web (`Device.isDevice`, `Platform.OS`): Expo no emite
   token ahí y `getExpoPushTokenAsync` lanzaría.
3. Consulta permisos con `getPermissionsAsync` y solo llama a `requestPermissionsAsync` si aún no están
   concedidos, para no reabrir el diálogo del sistema en cada login.
4. Obtiene el Expo token (`projectId` de `expoConfig.extra.eas.projectId`) y hace `UPSERT` con
   `onConflict: 'user_id,token'`, así que re-logear en el mismo dispositivo reutiliza la fila.
5. Cachea el token en `AsyncStorage` (`@push/deviceToken`) — el logout lo necesita.

`registerPushToken` **nunca lanza**: devuelve un estado que la UI usa para avisar sin bloquear la sesión.

| `status` | Significado | UI |
|---|---|---|
| `registered` | Fila escrita en `push_tokens` | — |
| `denied` | El usuario rechazó los permisos | Banner con acceso a Ajustes |
| `unsupported` | Emulador, simulador o web | — (no hay nada que el usuario pueda hacer) |
| `error` | Fallo de red o de BD | — (reintento automático) |

## Refresco y reintentos

`startPushTokenSync()` se monta mientras hay sesión y cubre dos casos:

- **Rotación**: FCM/APNs rota el token del dispositivo y `addPushTokenListener` lo notifica. El device token se
  pasa a `getExpoPushTokenAsync({ devicePushToken })` en lugar de dejar que lo pida por su cuenta: pedirlo
  dentro del listener volvería a dispararlo (bucle infinito, advertido en la documentación de Expo). Tras el
  `UPSERT` del token nuevo se borra la fila del anterior, que ya no entrega.
- **Reintento**: si el `UPSERT` falla por red, el `userId` queda pendiente en `AsyncStorage`
  (`@push/pendingUserId`) y se reintenta cuando `AppState` vuelve a `active`. Los rechazos permanentes de
  Postgres (RLS `42501`, FK `23503`, check `23514`) **no** se marcan como pendientes: reintentarlos en cada
  foreground sería un bucle inútil.

## Logout

`signOut()` llama a `removeCurrentDevicePushToken(userId)` **antes** de `supabase.auth.signOut()`:

- El `DELETE` necesita `auth.uid()` vivo, porque la policy es _own_.
- Borra por `(user_id, token)`, no por `user_id`: los demás dispositivos del usuario siguen recibiendo push.
- Si falla (sin red), el logout continúa igual. La fila queda huérfana hasta la purga por `last_seen_at`
  (> 60 días).

## Foreground y canales Android

`configureNotifications()` se ejecuta al cargar el layout raíz e instala el handler que muestra las
notificaciones con la app en primer plano (`shouldShowAlert`, `shouldPlaySound`; sin badge en el MVP).
Es el punto donde I-F-N06-03-02 enganchará `ensureAndroidChannels()` con los canales `general` y `chat`.

## Troubleshooting

| Síntoma | Causa habitual |
|---|---|
| No se crea ninguna fila y `pushStatus` es `unsupported` | Se está probando en emulador/simulador; hace falta dispositivo físico |
| `getExpoPushTokenAsync` lanza `ERR_NOTIFICATIONS_NO_EXPERIENCE_ID` | Falta `extra.eas.projectId` en `app.config.js` |
| Fila duplicada tras reinstalar la app | Esperado: el token cambia y la fila vieja se purga por `last_seen_at` |
| El usuario deja de recibir push sin haber hecho logout | Token rotado sin que el listener llegara a escribir; se corrige al siguiente arranque con sesión |
| `platform` admite `'web'` pero no hay push web | El check de la columna se mantiene por compatibilidad; el push web está fuera del alcance del EPIC |
