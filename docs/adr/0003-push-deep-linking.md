# ADR-003 — Push notifications y deep-linking

**Estado:** Aceptado  
**Fecha:** 2026-06-11  
**Última revisión:** 2026-08-04 — alineado con lo implementado en EPIC-N06 (ver [Historial](#historial-de-revisiones))  
**Autores:** Alex Zapata  
**Issues:** [EPIC-A00 #45](https://github.com/CodeCrafters-ES/pinboard-app/issues/45) · [I-F-A00-03-01 #55](https://github.com/CodeCrafters-ES/pinboard-app/issues/55) · [EPIC-N06 #263](https://github.com/CodeCrafters-ES/pinboard-app/issues/263)

---

## Contexto

La app necesita enviar notificaciones push a los empleados cuando ocurren eventos relevantes (nuevo post, nuevo evento, mensaje de chat). Cada notificación debe llevar al usuario directamente a la pantalla correspondiente al tocarla (_deep-linking_).

Decisiones que condicionan este ADR:

- **Stack**: Expo + React Native con `expo-notifications`. Una sola API unificada para iOS y Android, integrada con EAS y gratuita en el tier de uso esperado.
- **Registro de tokens**: La Edge Function `send-push` lee `push_tokens` con `service_role` para omitir RLS. El cliente registra su token en `push_tokens` al iniciar sesión (ver `lib/notifications/pushToken.ts`).
- **EAS project ID**: `dd87a473-6d49-45ae-839e-490488170699` (declarado en `app.config.js`).
- **Navegación**: Expo Router v4 — las rutas son strings de path.

---

## Decisión

### Payload canónico

Todas las notificaciones push enviadas desde la Edge Function `send-push` incluyen en `data` el siguiente objeto:

```ts
{
  type: 'post' | 'event' | 'chat',
  id: string   // UUID del recurso
}
```

**Ejemplos JSON:**

```json
// Nuevo post
{ "type": "post", "id": "a1b2c3d4-0000-0000-0000-000000000001" }

// Nuevo evento
{ "type": "event", "id": "a1b2c3d4-0000-0000-0000-000000000002" }

// Nuevo mensaje de chat
{ "type": "chat", "id": "a1b2c3d4-0000-0000-0000-000000000003" }
```

El campo `id` referencia el UUID primario del recurso en Postgres (`posts.id`, `events.id`, `chats.id`). No se incluyen datos redundantes en el payload para mantener el tamaño bajo el límite de 4 KB de APNs/FCM.

### Rutas de navegación destino

| `type` | Ruta de Expo Router | Hito |
|---|---|---|
| `post` | `/(app)/(tabs)/tablon/[id]` | Hito 1 |
| `event` | `/(app)/(tabs)/calendario/[id]` | Hito 2 |
| `chat` | `/(app)/(tabs)/chat/[id]` | Hito 3 |

La navegación se ejecuta con `router.push()` de Expo Router, pasando el `id` como parámetro dinámico. Las
pantallas cuelgan del grupo de pestañas, así que la ruta incluye `(tabs)`; Expo Router omite los grupos en
la URL, pero escribirlos evita ambigüedades si un segmento se repite en otro grupo.

### Canales Android

Obligatorios en Android 8+ (API 26+). Se crean una vez al arrancar la app con `Notifications.setNotificationChannelAsync()`.

| Canal | `channelId` | Nombre | Descripción | Importancia |
|---|---|---|---|---|
| General | `general` | General | Posts y eventos del calendario corporativo | `DEFAULT` |
| Chat | `chat` | Mensajes de chat | Nuevos mensajes en tus conversaciones | `HIGH` |

`general` va en importancia **normal**: un post o un evento son informativos y no deben interrumpir lo que
el usuario esté haciendo. `chat` va en **alta** porque un mensaje directo sí interrumpe, suena y aparece en
la pantalla bloqueada. Que sean canales distintos es justamente lo que permite al usuario silenciar uno sin
silenciar el otro desde Ajustes.

```ts
// Implementado en lib/notifications/setupChannels.ts (I-F-N06-03-02)
await Notifications.setNotificationChannelAsync('general', {
  name: 'General',
  description: 'Posts y eventos del calendario corporativo',
  importance: Notifications.AndroidImportance.DEFAULT,
  vibrationPattern: [0, 250, 250, 250],
  sound: 'default',
});

await Notifications.setNotificationChannelAsync('chat', {
  name: 'Mensajes de chat',
  description: 'Nuevos mensajes en tus conversaciones',
  importance: Notifications.AndroidImportance.HIGH,
  vibrationPattern: [0, 100, 100, 100],
  sound: 'default',
  enableLights: true,
  lightColor: '#5B97B4', // nun-sea (DESIGN.md)
});
```

El campo `channelId` de cada mensaje enviado a la Expo Push API debe coincidir con uno de estos
identificadores. Una vez creado el canal, si el usuario cambia importancia o sonido desde Ajustes, Android
ignora lo que declare la app: estos valores son solo el estado inicial.

**Equivalente en iOS.** No hay canales; el control es `interruptionLevel`, cuyo valor por defecto (`active`)
ya es el buscado para posts y eventos, así que no se envía explícitamente. Si el chat debe atravesar el modo
«No molestar», habrá que enviar `interruptionLevel: 'timeSensitive'` y solicitar el entitlement.

### Comportamiento en foreground

Cuando la app está en primer plano (`AppState === 'active'`), el handler global controla si se muestra la notificación:

```ts
// Configurado una vez al cargar el layout raíz (lib/notifications/setup.ts)
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,   // mostrar banner in-app
    shouldPlaySound: true,
    shouldSetBadge: false,   // el badge de no leídos queda fuera del MVP
  }),
});
```

**Reglas de comportamiento:**

| Situación | Comportamiento |
|---|---|
| App en foreground, llega notificación | Mostrar banner in-app; **no navegar automáticamente** |
| Usuario toca el banner (foreground) | Navegar a la ruta destino según `{ type, id }` |
| App en background o cerrada, usuario toca notificación | Expo Router abre la ruta destino al montar la app |

La decisión de no navegar automáticamente al recibir en foreground evita interrumpir el flujo actual del usuario (p.ej. escribiendo un mensaje).

### Handler de respuesta (tap)

Implementado en `hooks/usePushNavigation.ts` (I-F-N06-03-01). La **captura** del tap y la **entrega** al
router van separadas, porque casi nunca coinciden en el tiempo:

```ts
// Captura — con la app abierta o en segundo plano
Notifications.addNotificationResponseReceivedListener(accept);

// Captura — cold start: la app se abrió tocando la notificación y el listener ya no dispara
Notifications.getLastNotificationResponseAsync().then(accept);

// Entrega — solo cuando el árbol de navegación está montado y hay sesión
if (pending && isRouterReady && status === 'authenticated') router.push(route);
```

Tres reglas que se derivan de esa separación:

- El payload se valida con Zod (`lib/notifications/pushTarget.ts`): viene de fuera y un tap nunca debe
  tirar la app. Lo que no cumpla `{ type, id }` se descarta.
- El tap que arranca la app puede llegar por **ambas** vías; el duplicado se descarta por el identificador
  de la notificación.
- Sin sesión el destino **espera**: el guard de `(app)` redirigiría al login y el push se perdería. Al
  autenticarse se completa la navegación.

---

## Consecuencias

**Positivas:**

- Payload mínimo `{ type, id }`: fácil de extender con nuevos tipos sin cambios de contrato en el cliente.
- Un solo listener de respuesta cubre todos los tipos; la tabla de rutas es la única pieza a actualizar cuando se añade un tipo nuevo.
- Los canales Android permiten que el usuario configure preferencias por tipo en ajustes del sistema.

**Negativas / limitaciones conocidas:**

- La ruta de chat no existe hasta Hito 3; el handler ignora ese tipo en vez de navegar, porque llevar al usuario a una ruta inexistente lo dejaría en «Unmatched Route».
- Los dos canales usan el sonido por defecto del sistema. Un sonido propio para el chat obligaría a incluir el asset en el bundle nativo (`android/app/src/main/res/raw/`), declararlo en el plugin `expo-notifications` y hacer un build nuevo por cada cambio; se descartó por no compensar en el MVP.
- Los valores de los canales solo se aplican al crearlos: una vez el usuario toca Ajustes, Android manda. Cambiarlos en el código no se refleja sin desinstalar y reinstalar.

---

## Historial de revisiones

| Fecha | Cambio |
|---|---|
| 2026-06-11 | Versión inicial (EPIC-A00) |
| 2026-08-04 | Alineado con lo implementado en EPIC-N06: rutas destino reales (`(tabs)`), canales Android (`general` pasa a importancia `DEFAULT`; el canal de chat pasa a llamarse «Mensajes de chat», con luz `#5B97B4` y sonido del sistema en vez de `chat_sound.wav`), `channelId` en lugar de `android_channel_id`, `shouldSetBadge: false`, y el handler de respuesta con captura y entrega separadas |

El cambio de `general` a importancia normal responde a que un post o un evento son informativos: subirlos a
`HIGH` los equipararía a un mensaje directo y anularía la razón de tener dos canales.

---

## Referencias

- `app.config.js` — configuración del plugin `expo-notifications` (projectId, color, icono)
- `lib/notifications/pushToken.ts` — registro y borrado de tokens en `push_tokens`
- `lib/notifications/setupChannels.ts` — canales Android `general` y `chat`
- `lib/notifications/pushTarget.ts` — validación del payload y mapa de rutas
- `hooks/usePushNavigation.ts` — navegación al tocar una notificación
- `hooks/useSession.tsx` — registro de token al resolverse la sesión
- Edge Function `send-push` (EPIC-N06) — envío de notificaciones con `service_role`
- [`docs/push.md`](../push.md) — guía operativa: registro, webhooks, purga y deep-linking
- [ADR-002](0002-rbac.md) — policies RLS de `push_tokens`
- [ADR-004](0004-chat-realtime.md) — arquitectura del chat (deep-link `type: 'chat'`)
