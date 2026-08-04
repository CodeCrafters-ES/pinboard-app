# Edge Function: `process-push-receipts`

Drena la cola `push_receipts_pending`: consulta a Expo el resultado real de cada envío
y borra de `push_tokens` los dispositivos que dé por perdidos. La invoca un cron
horario, no un usuario.

**Issue:** I-F-N06-02-03 (#271) · **Feature:** F-N06-02 (#265)

## Por qué existe

El ticket que Expo devuelve al aceptar un mensaje solo dice «recibido». El resultado
real llega en un **receipt** unos minutos más tarde, y es ahí donde aparece la mayoría
de los `DeviceNotRegistered`: el usuario desinstaló la app o el token caducó.
`send-push` purga lo que Expo rechaza en el acto; el resto se sabe aquí.

## Contrato

`POST /functions/v1/process-push-receipts`

**Auth:** el mismo `PUSH_WEBHOOK_SECRET` que `send-push` (también se acepta la
`SUPABASE_SERVICE_ROLE_KEY`). Quien llama es el propio proyecto, así que
`verify_jwt = false` en `supabase/config.toml`.

Sin body: la función decide sola qué procesar.

| Código | Caso |
|---|---|
| `200` | `{ ok: true, processed, purged_count, expired_count, reasons }` |
| `401` | Falta el `Authorization` o el secreto no coincide |
| `405` | Método distinto de `POST` |

## Qué hace en cada pasada

1. Lee de la cola los tickets encolados hace **más de 15 minutos** (antes Expo aún no
   tiene el receipt), en orden de antigüedad y hasta 5000 por ejecución.
2. Los consulta contra `getReceipts` en lotes de 1000, que es el límite de Expo.
3. Aplica el mismo criterio que `send-push`: `DeviceNotRegistered` e
   `InvalidCredentials` borran la fila `(user_id, token)`; `MessageTooBig` y
   `MessageRateExceeded` solo se registran; un código desconocido **no** purga.
4. Vacía de la cola lo resuelto y también lo caducado: pasadas ~24h Expo ya no
   responde por ese ticket, y dejarlo haría crecer la cola sin límite.

Si la petición a Expo falla, el lote se queda en la cola para la siguiente pasada.

## Configuración

| Variable | Uso |
|---|---|
| `PUSH_WEBHOOK_SECRET` | Secreto compartido con el cron |
| `SUPABASE_SERVICE_ROLE_KEY` | La inyecta la plataforma; necesaria para leer la cola y borrar tokens |
| `SUPABASE_URL` | La inyecta la plataforma |
| `EXPO_RECEIPTS_URL` | Opcional. Redirige la consulta a un doble; por defecto, `getReceipts` |

El cron se programa con
[`supabase/schedules/process_push_receipts.sql`](../../schedules/process_push_receipts.sql);
los pasos están en [`docs/push.md`](../../../docs/push.md#purga-de-tokens-inválidos).

## Tests

| Fichero | Cubre |
|---|---|
| `__tests__/lib/sendPushPurge.test.ts` | Clasificación de acuses y borrado por par |
| `__tests__/integration/pushReceipts.test.ts` | Drenaje contra la base real con un doble de Expo |
| `__tests__/integration/sendPush.test.ts` | Contrato HTTP (401/405/200) |
| `supabase/tests/rls/schema_push_receipts_pending.sql` | Aislamiento y GRANTs de la cola |

El trabajo vive en `_shared/push/receipts.ts`, fuera del `Deno.serve`, precisamente
para poder ejercitarlo sin HTTP.
