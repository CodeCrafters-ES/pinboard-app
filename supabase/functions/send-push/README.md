# Edge Function: `send-push`

Punto de entrada de los **Database Webhooks** de Supabase para las notificaciones push.
Postgres avisa a esta función cuando se publica un post o se crea un evento, y ella
resuelve destinatarios y llama a la Expo Push API. Implementa el payload de
[ADR-003](../../../docs/adr/0003-push-deep-linking.md).

**Issue:** I-F-N06-02-01 (#269) · **Feature:** F-N06-02 (#265)

> **Estado.** Esta issue entrega el **transporte**: autenticación, validación,
> idempotencia y respuesta rápida. Los handlers por tabla son stubs que loguean y
> devuelven `pending: true`; I-F-N06-02-02 (#270) implementa destinatarios y envío a
> Expo, e I-F-N06-02-03 (#271) la purga de tokens inválidos.

## Contrato

`POST /functions/v1/send-push`

**Auth:** secreto compartido en `Authorization: Bearer <PUSH_WEBHOOK_SECRET>`. No hay
JWT de usuario: la llamada es servidor-a-servidor desde Postgres. Se acepta también la
`SUPABASE_SERVICE_ROLE_KEY`, que es lo que rellena por defecto el asistente de webhooks
de Studio. Sin ninguno de los dos configurados, **todo** se rechaza con 401.

Por eso `verify_jwt = false` para esta función (`supabase/config.toml`): el secreto del
webhook no es un JWT del proyecto y la plataforma lo rechazaría antes de llegar aquí.

**Body:** payload estándar de Database Webhooks.

```jsonc
{
  "type": "INSERT",        // INSERT | UPDATE | DELETE
  "table": "posts",        // posts | events | messages
  "schema": "public",
  "record": {              // fila completa; solo se validan los campos necesarios
    "id": "uuid",
    "title": "Nueva carta de temporada",
    "author_id": "uuid",
    "created_at": "2026-08-04T10:00:00Z",
    "status": "published"
  },
  "old_record": null       // presente en UPDATE
}
```

Campos mínimos por tabla:

| Tabla | Requeridos |
|---|---|
| `posts` | `id`, `title`, `author_id`, `created_at`, `status` |
| `events` | `id`, `title`, `author_id` (nullable), `created_at`, `event_start_at` |
| `messages` | `id`, `chat_id`, `sender_id`, `created_at` |

Los campos extra de la fila se ignoran sin error.

## Cuándo se notifica

| Caso | Resultado |
|---|---|
| `INSERT` de post con `status = 'published'` | Despacha |
| `UPDATE` de post con transición `draft → published` | Despacha |
| `INSERT` de post en borrador | `reason: post_not_published` |
| `UPDATE` de post ya publicado (edición) | `reason: post_already_published` |
| `INSERT` de evento | Despacha |
| `UPDATE`/`DELETE` de evento o mensaje | `reason: operation_not_notifiable` |

La transición `draft → published` **no es opcional**: los posts se crean como borrador
y se publican después (`hooks/usePosts.ts`), así que colgar el push solo del `INSERT`
dejaría sin notificar el flujo real de publicación.

## Respuestas

| Código | Caso |
|---|---|
| `200` | `{ ok: true, dispatched: true }` — aceptado, el envío sigue en segundo plano. |
| `200` | `{ ok: true, dispatched: false, reason }` — no procede notificar. |
| `200` | `{ ok: true, dispatched: false, deduplicated: true }` — repetido en < 60 s. |
| `400` | JSON malformado o payload que no valida (con `issues` de Zod). |
| `401` | Falta el `Authorization` o el secreto no coincide. |
| `405` | Método distinto de `POST`. |

Siempre responde rápido: la validación es síncrona y el envío se delega a
`EdgeRuntime.waitUntil`, de modo que un fallo de Expo no bloquea el webhook ni
encadena reintentos de `pg_net`.

## Idempotencia

`pg_net` reintenta ante timeouts, así que el mismo INSERT puede llegar dos veces. Se
descarta el duplicado de `(table, record.id)` dentro de una ventana de **60 s**, con un
mapa en memoria del worker. No cubre reintentos servidos por workers distintos; si eso
llegara a producir push duplicados en producción, el siguiente paso es una tabla
`push_sent` con `unique (table, record_id)`.

## Logs

JSON estructurado, un evento por request:

```jsonc
{ "table": "posts", "type": "INSERT", "record_id": "…", "sent_count": 0, "failed_count": 0, "duration_ms": 4 }
{ "table": "posts", "type": "INSERT", "record_id": "…", "reason": "post_not_published" }  // send-push ignored
```

## Configuración

| Variable | Uso |
|---|---|
| `PUSH_WEBHOOK_SECRET` | Secreto compartido con el trigger. `supabase secrets set PUSH_WEBHOOK_SECRET=…` |
| `SUPABASE_SERVICE_ROLE_KEY` | La inyecta la plataforma; alternativa aceptada como Bearer y necesaria para leer `push_tokens` (#270). |

Los pasos para crear los webhooks en un entorno nuevo están en
[`docs/push.md`](../../../docs/push.md#database-webhooks); el script reproducible es
[`supabase/webhooks/send_push_webhooks.sql`](../../webhooks/send_push_webhooks.sql).

## Tests

`__tests__/integration/sendPush.test.ts` (job `integration-test`): auth, validación,
notificabilidad, idempotencia y tiempo de respuesta.

```bash
npx supabase start
npx supabase functions serve --env-file supabase/functions/.env.test
npx jest --testPathPattern="integration/sendPush"
```
