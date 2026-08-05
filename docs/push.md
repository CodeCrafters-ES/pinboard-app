# Notificaciones push

Documentación de push (EPIC-N06). Cubre el **ciclo de vida del Expo Push Token** en la app —permisos,
registro, refresco y borrado (I-F-N06-01-02)— y el **disparo desde la base de datos** hacia la Edge Function
`send-push` (I-F-N06-02-01). El esquema de `push_tokens` y sus policies viven en las migraciones
(`20260618700000`, `20260618800000`, `20260716000002`, `20260801000000`) y la matriz de RLS en
[`docs/rls/push_tokens.md`](rls/push_tokens.md); el contrato de la función, en
[`supabase/functions/send-push/README.md`](../supabase/functions/send-push/README.md).

La resolución de destinatarios y el envío a Expo (I-F-N06-02-02), la purga de tokens inválidos
(I-F-N06-02-03) y el deep-linking (F-N06-03) se documentan con sus issues.

## Piezas

| Fichero | Rol |
|---|---|
| `lib/notifications/pushToken.ts` | Permisos, obtención del Expo token, escritura/borrado en `push_tokens` |
| `lib/notifications/setup.ts` | Handler de foreground y listeners de rotación / vuelta a primer plano |
| `hooks/useSession.tsx` | Dispara el registro cuando hay sesión y expone `pushStatus` |
| `lib/auth.ts` | `signOut()` borra el token de este dispositivo antes de invalidar la sesión |
| `components/PushPermissionNotice.tsx` | Aviso no bloqueante si el usuario ha denegado los permisos |
| `lib/notifications/pushTarget.ts` | Payload de deep-linking: validación y ruta de destino |
| `hooks/usePushNavigation.ts` | Navegación al tocar una notificación |
| `lib/notifications/setupChannels.ts` | Canales de Android `general` y `chat` |

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

`configureNotifications()` se ejecuta al cargar el layout raíz y hace dos cosas: instala el handler que
muestra las notificaciones con la app en primer plano (`shouldShowAlert`, `shouldPlaySound`; sin badge en el
MVP) y crea los canales de Android. Los canales se lanzan sin esperar: son una llamada nativa que no debe
retrasar el primer render, y el push más temprano posible llega mucho después.

Android 8+ exige que cada notificación pertenezca a un canal. Sin declararlos, el sistema las agrupa en uno
por defecto y el usuario no podría silenciar el chat sin silenciar también el tablón.

| Tipo | `channelId` | Importancia | Vibración | Extras |
|---|---|---|---|---|
| `post` | `general` | `DEFAULT` — informativo, no interrumpe | `[0, 250, 250, 250]` | sonido por defecto |
| `event` | `general` | `DEFAULT` | `[0, 250, 250, 250]` | sonido por defecto |
| `chat` (Hito 3) | `chat` | `HIGH` — suena y sale en la pantalla bloqueada | `[0, 100, 100, 100]` | luz `#5B97B4` (nun-sea) |

Los identificadores son el contrato con `send-push`, que los envía en `channelId` con cada mensaje.

`setNotificationChannelAsync` es idempotente —sobre un canal existente lo actualiza— y tras reinstalar la app
los canales se recrean en el arranque. Una vez creado el canal, si el usuario cambia importancia o sonido
desde Ajustes, el sistema ignora lo que declare la app: estos valores son solo el estado inicial.

En **iOS** no hay canales y `setupAndroidChannels()` no hace nada. El equivalente es el `interruptionLevel`
de APNs, que por defecto es `active`: la notificación suena y se muestra, sin atravesar el modo «No
molestar». Es el comportamiento que se quiere para posts y eventos, así que no se envía explícitamente. Si
en Hito 3 se decide que el chat sí lo atraviese, habría que añadir `interruptionLevel: 'timeSensitive'` al
mensaje de Expo y solicitar el entitlement correspondiente.

Los valores canónicos viven en [ADR-003](adr/0003-push-deep-linking.md), revisado el 2026-08-04 para
recoger lo implementado aquí.

## Database Webhooks

Los "Database Webhooks" de Supabase no son un servicio aparte: son **triggers** que llaman a
`supabase_functions.http_request` (pg_net). Se pueden crear desde Studio, pero aquí se versionan como script
para que un entorno nuevo se configure igual y sin clics:
[`supabase/webhooks/send_push_webhooks.sql`](../supabase/webhooks/send_push_webhooks.sql).

| Trigger | Tabla | Eventos | Estado |
|---|---|---|---|
| `posts_send_push` | `public.posts` | `INSERT`, `UPDATE OF status` | Activo |
| `events_send_push` | `public.events` | `INSERT` | Activo |
| `messages_send_push` | `public.messages` | `INSERT` | Hito 3 (`-v enable_messages=true`) |

`posts` escucha también el `UPDATE` porque los posts nacen como borrador y se publican después
(`hooks/usePosts.ts`): con un webhook solo de `INSERT`, publicar no notificaría a nadie. Qué merece push y qué
no lo decide la función, no el trigger — ver la tabla de notificabilidad en su README.

### Configurar un entorno nuevo

1. **Publicar el secreto** en la función:

   ```bash
   openssl rand -base64 32                       # genera el secreto
   npx supabase secrets set PUSH_WEBHOOK_SECRET=<secreto> --project-ref <ref>
   ```

2. **Desplegar la función.** `verify_jwt = false` ya está en `supabase/config.toml`; con `--no-verify-jwt` se
   fuerza también desde el deploy:

   ```bash
   npx supabase functions deploy send-push --no-verify-jwt --project-ref <ref>
   ```

3. **Crear los triggers** con el mismo secreto:

   ```bash
   psql "$DB_URL" \
     -v url="https://<ref>.supabase.co/functions/v1/send-push" \
     -v secret="<secreto>" \
     -f supabase/webhooks/send_push_webhooks.sql
   ```

   El script termina listando los triggers creados. Es idempotente: reejecutarlo rota el secreto o cambia la
   URL sin duplicar nada.

4. **Comprobar** insertando un post publicado y mirando los logs de la función (Studio → Edge Functions →
   `send-push`, o `supabase functions logs send-push`). Debe aparecer una línea `send-push` con el
   `record_id` correspondiente.

En **local** la URL tiene que resolverse desde el contenedor de Postgres, así que se usa el gateway interno:

```bash
npx supabase functions serve --env-file supabase/functions/.env.test
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  -v url="http://kong:8000/functions/v1/send-push" \
  -v secret="local-test-webhook-secret" \
  -f supabase/webhooks/send_push_webhooks.sql
```

## Deep-linking: del tap a la pantalla

Al tocar una notificación, la app lee `data: { type, id }` (contrato de
[ADR-003](adr/0003-push-deep-linking.md)) y navega al detalle correspondiente.

| `type` | Ruta | Estado |
|---|---|---|
| `post` | `/(app)/(tabs)/tablon/[id]` | Activo |
| `event` | `/(app)/(tabs)/calendario/[id]` | Activo |
| `chat` | `/(app)/(tabs)/chat/[chatId]` | Activo. El envío de push de chat llega con F-N07-05 |

El hilo de chat recibe solo el `chatId`, que es lo único que trae el payload. La pantalla acepta además
`name` y `partnerId` de forma opcional, así que al abrirse desde una notificación arranca sin el nombre en
la cabecera ni el estado de presencia del interlocutor hasta que se resuelven.

| Pieza | Rol |
|---|---|
| `lib/notifications/pushTarget.ts` | Valida el payload y resuelve la ruta |
| `hooks/usePushNavigation.ts` | Escucha los taps y navega cuando se puede |
| `app/_layout.tsx` | Monta el hook dentro del `SessionProvider` |

**Captura y entrega van separadas** porque casi nunca coinciden en el tiempo:

- **App abierta o en segundo plano**: `addNotificationResponseReceivedListener` recibe el tap.
- **App cerrada (cold start)**: ese listener ya no dispara; el destino se recupera con
  `getLastNotificationResponseAsync`. Como el tap que arranca la app puede llegar por ambas vías, se
  descarta el duplicado por el identificador de la notificación.

El destino se guarda y solo se navega cuando el árbol de navegación está montado (`useRootNavigationState`)
**y** hay sesión: navegar antes se perdería en silencio, y sin sesión el guard de `(app)` redirigiría al
login llevándose el destino por delante. Al iniciar sesión, el efecto reacciona y completa la navegación.

Un payload que no cumpla el contrato se descarta con un aviso en dev: viene de fuera y un tap nunca debe
tirar la app.

> **Nota sobre el scheme.** El deep-linking de push **no** usa el scheme de la app: el destino viaja en
> `data`, no en una URL. El scheme (`nun-ibiza`, en `app.config.js`) lo usan los correos de invitación y
> recuperación de contraseña (`nun-ibiza://set-password`, `nun-ibiza://reset-password`), así que cambiarlo
> rompería esos enlaces.

## Purga de tokens inválidos

Un token deja de valer cuando el usuario desinstala la app o el sistema lo rota sin que la app llegue a
avisar. Expo lo comunica en dos momentos, y ambos se aprovechan:

| Momento | Quién | Qué hace |
|---|---|---|
| Al enviar | `send-push` | Los tickets que ya vuelven con error se procesan en el acto |
| ~15 min después | `process-push-receipts` | Consulta los _receipts_ y purga lo que Expo dé por perdido |

El criterio es el mismo en los dos sitios: `DeviceNotRegistered` e `InvalidCredentials` borran la fila
`(user_id, token)`; `MessageTooBig` y `MessageRateExceeded` solo se registran, porque el token está sano; un
código desconocido **no** purga, que reenviar sale más barato que perder el dispositivo de alguien.

El borrado va siempre por el par `(user_id, token)`, nunca por token suelto: dos usuarios pueden compartir
token si alguien cerró sesión sin red y otro inició sesión en ese mismo dispositivo.

`push_receipts_pending` es la cola que une ambos momentos: guarda qué ticket corresponde a qué dispositivo.
Tiene RLS activo y **cero policies**, así que ningún cliente la ve; solo entran las Edge Functions con
`service_role`.

### Programar el job

```bash
psql "$DB_URL" \
  -v url="https://<ref>.supabase.co/functions/v1/process-push-receipts" \
  -v secret="<el mismo PUSH_WEBHOOK_SECRET>" \
  -f supabase/schedules/process_push_receipts.sql
```

Crea un job horario de `pg_cron` que llama a la función con `net.http_post`, que es asíncrono: el worker de
cron encola la petición y termina. Reejecutar el script reprograma el job con la URL o el secreto nuevos.

Para comprobarlo: `select jobname, schedule, active from cron.job;` y, tras la siguiente hora en punto,
`select * from cron.job_run_details order by start_time desc limit 5;`.

La función también se puede invocar a mano, que es lo cómodo al depurar:

```bash
curl -X POST "$SUPABASE_URL/functions/v1/process-push-receipts" \
  -H "Authorization: Bearer $PUSH_WEBHOOK_SECRET"
```

### Fallback sin Database Webhooks

Si la integración de webhooks no estuviera disponible en un proyecto, el mismo efecto se consigue con un
trigger propio y `pg_net.http_post` — que es exactamente lo que hace por dentro `http_request`:

```sql
create or replace function public.notify_send_push() returns trigger
language plpgsql security definer as $$
begin
  perform net.http_post(
    url     := current_setting('send_push.url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('send_push.secret')
    ),
    body    := jsonb_build_object(
      'type', tg_op, 'table', tg_table_name, 'schema', tg_table_schema,
      'record', to_jsonb(new), 'old_record', case when tg_op = 'UPDATE' then to_jsonb(old) end
    )
  );
  return null;
end $$;
```

El payload es idéntico, así que la Edge Function no cambia. `net.http_post` es asíncrono: no bloquea el
`INSERT` ni lo revierte si la función falla.

## Troubleshooting

| Síntoma | Causa habitual |
|---|---|
| No se crea ninguna fila y `pushStatus` es `unsupported` | Se está probando en emulador/simulador; hace falta dispositivo físico |
| `getExpoPushTokenAsync` lanza `ERR_NOTIFICATIONS_NO_EXPERIENCE_ID` | Falta `extra.eas.projectId` en `app.config.js` |
| Fila duplicada tras reinstalar la app | Esperado: el token cambia y la fila vieja se purga por `last_seen_at` |
| El usuario deja de recibir push sin haber hecho logout | Token rotado sin que el listener llegara a escribir; se corrige al siguiente arranque con sesión |
| `platform` admite `'web'` pero no hay push web | El check de la columna se mantiene por compatibilidad; el push web está fuera del alcance del EPIC |
| El INSERT funciona pero la función no recibe nada | El trigger no existe (`select * from information_schema.triggers where trigger_name like '%send_push'`) o la URL no se resuelve desde el contenedor de Postgres |
| La función responde `401` al webhook | El secreto del trigger y `PUSH_WEBHOOK_SECRET` no coinciden: reejecuta el script con el valor correcto |
| La función responde `401` sin llegar al código | Falta `verify_jwt = false` / `--no-verify-jwt`: la plataforma rechaza el Bearer porque no es un JWT del proyecto |
| Publicar un borrador no notifica | El trigger de `posts` debe escuchar `UPDATE OF status`, no solo `INSERT` |
| Llega el push por duplicado | Reintento de `pg_net` servido por otro worker: la deduplicación es por worker (ventana de 60 s) |
| Un dispositivo desinstalado sigue recibiendo envíos | El job de receipts no corre: `select * from cron.job` y revisa `cron.job_run_details` |
| `push_receipts_pending` crece sin parar | El job no llega a la cola (secreto o URL mal) o Expo no responde; los tickets se sueltan solos a las 24 h |
| Se purgó un token que sí valía | Revisa el `reason` en los logs: solo `DeviceNotRegistered` e `InvalidCredentials` borran |
