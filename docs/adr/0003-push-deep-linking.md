# ADR-003 — Push notifications y deep-linking

**Estado:** Aceptado  
**Fecha:** 2026-06-11  
**Autores:** Alex Zapata  
**Issues:** [EPIC-A00 #45](https://github.com/CodeCrafters-ES/pinboard-app/issues/45) · [I-F-A00-03-01 #55](https://github.com/CodeCrafters-ES/pinboard-app/issues/55)

---

## Contexto

La app necesita enviar notificaciones push a los empleados cuando ocurren eventos relevantes (nuevo post, nuevo evento, mensaje de chat). Cada notificación debe llevar al usuario directamente a la pantalla correspondiente al tocarla (_deep-linking_).

Decisiones que condicionan este ADR:

- **Stack**: Expo + React Native con `expo-notifications`. Una sola API unificada para iOS y Android, integrada con EAS y gratuita en el tier de uso esperado.
- **Registro de tokens**: La Edge Function `send-push` lee `push_tokens` con `service_role` para omitir RLS. El cliente registra su token en `push_tokens` al iniciar sesión (ver `lib/notifications/pushToken.ts`).
- **EAS project ID**: `dd87a473-6d49-45ae-839e-490488170699` (declarado en `app.config.js`).
- **Navegación**: Expo Router v3 — las rutas son strings de path.

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
| `post` | `/(app)/posts/[id]` | Hito 1 |
| `event` | `/(app)/events/[id]` | Hito 2 |
| `chat` | `/(app)/chat/[id]` | Hito 3 |

La navegación se ejecuta con `router.push()` de Expo Router, pasando el `id` como parámetro dinámico.

### Canales Android

Obligatorios en Android 8+ (API 26+). Se crean una vez al arrancar la app con `Notifications.setNotificationChannelAsync()`.

| Canal | `channelId` | Nombre | Descripción | Prioridad |
|---|---|---|---|---|
| General | `general` | General | Nuevos posts y eventos del equipo | `HIGH` |
| Chat | `chat` | Chat | Mensajes directos del equipo | `HIGH` + sonido propio |

```ts
// Firma canónica — implementación en EPIC-N06
await Notifications.setNotificationChannelAsync('general', {
  name: 'General',
  description: 'Nuevos posts y eventos del equipo',
  importance: Notifications.AndroidImportance.HIGH,
  vibrationPattern: [0, 250, 250, 250],
  lightColor: '#624325',
});

await Notifications.setNotificationChannelAsync('chat', {
  name: 'Chat',
  description: 'Mensajes directos del equipo',
  importance: Notifications.AndroidImportance.HIGH,
  vibrationPattern: [0, 250, 250, 250],
  lightColor: '#624325',
  sound: 'chat_sound.wav',
});
```

El campo `android_channel_id` en el payload enviado por `send-push` debe coincidir con uno de estos `channelId`.

### Comportamiento en foreground

Cuando la app está en primer plano (`AppState === 'active'`), el handler global controla si se muestra la notificación:

```ts
// Configurado una vez al arrancar la app (app/_layout.tsx o equivalente)
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,   // mostrar banner in-app
    shouldPlaySound: true,
    shouldSetBadge: true,
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

```ts
// Listener registrado una vez; maneja taps tanto en foreground como background/quit
Notifications.addNotificationResponseReceivedListener(response => {
  const data = response.notification.request.content.data as {
    type: 'post' | 'event' | 'chat';
    id: string;
  };
  const routes: Record<typeof data.type, string> = {
    post:  '/(app)/posts/',
    event: '/(app)/events/',
    chat:  '/(app)/chat/',
  };
  router.push(`${routes[data.type]}${data.id}`);
});
```

---

## Consecuencias

**Positivas:**

- Payload mínimo `{ type, id }`: fácil de extender con nuevos tipos sin cambios de contrato en el cliente.
- Un solo listener de respuesta cubre todos los tipos; la tabla de rutas es la única pieza a actualizar cuando se añade un tipo nuevo.
- Los canales Android permiten que el usuario configure preferencias por tipo en ajustes del sistema.

**Negativas / limitaciones conocidas:**

- Las rutas `/(app)/events/[id]` y `/(app)/chat/[id]` no existen en Hito 1; el listener debe ignorar graciosamente los tipos no implementados hasta su hito correspondiente.
- El sonido personalizado `chat_sound.wav` debe incluirse en el bundle nativo (asset en `android/app/src/main/res/raw/`) y referenciarse en el config del plugin `expo-notifications`. Cualquier cambio de sonido requiere nuevo build nativo.

---

## Referencias

- `app.config.js` — configuración del plugin `expo-notifications` (projectId, color, icono)
- `lib/notifications/pushToken.ts` — registro y borrado de tokens en `push_tokens`
- `hooks/useSession.ts` — registro de token al hacer sign-in
- Edge Function `send-push` (EPIC-N06) — envío de notificaciones con `service_role`
- [ADR-002](0002-rbac.md) — policies RLS de `push_tokens`
- [ADR-004](0004-chat-realtime.md) — arquitectura del chat (deep-link `type: 'chat'`)
