# Edge Function: `track-engagement`

Punto de entrada único de escritura para `public.engagement_sessions`. Los clientes
no escriben esa tabla directamente (RLS lo bloquea); esta función, con `service_role`,
centraliza el UPSERT. Implementa el modelo de [ADR-001](../../../docs/adr/0001-engagement.md)
(`link_clicked` + `status`) y [ADR-0006](../../../docs/adr/0006-engagement-behavioral-signals.md)
(señales de comportamiento aditivas).

**Issue:** I-F-N04-02-02 (#179) · **Feature:** F-N04-02 (#174)

## Contrato

`POST /functions/v1/track-engagement`

**Auth:** JWT de Supabase en `Authorization: Bearer <token>`. `user.id` (= `auth.uid()`)
es el `user_id` que se persiste — **nunca** se acepta del body.

**Body = LOTE (array).** El cliente (`lib/engagement/queue.ts`) envía `JSON.stringify(batch)`.
Se acepta tanto un array top-level como el envoltorio `{ "events": [...] }` (1–50 eventos).

```jsonc
[
  {
    "session_id": "uuid",             // requerido
    "post_id": "uuid",                // requerido
    "link_clicked": true,             // opcional (métrica principal, append-only)
    "focused_seconds_delta": 12,      // opcional, entero 0..3600 (se acumula)
    "max_scroll_pct": 0.42,           // opcional, 0..1 (se toma el máximo)
    "client_ts": "2026-07-10T12:00:00.000Z" // opcional (ISO 8601)
  }
]
```

## Semántica del UPSERT (por `(user_id, post_id)`)

El lote se pre-agrega por `post_id` (varios eventos del mismo post en un request se
combinan) y se escribe con la RPC `public.apply_engagement_events`:

- **`link_clicked`**: append-only (`OR`). Una vez `true`, nunca vuelve a `false`.
- **`status`**: `clicked` es terminal. Con clic → `clicked`; sin clic se conserva el
  status actual (fila nueva → `viewed`). `engaged` **no** lo fija esta función (lo deriva
  el dashboard desde reacciones/valoraciones/comentarios).
- **`focused_seconds`**: se acumula (suma de deltas).
- **`max_scroll_pct`**: se toma el máximo (monotónico).

Idempotente a nivel de filas: `unique (user_id, post_id)` garantiza 1 fila por par
sin importar cuántos eventos/reintentos lleguen.

## Respuestas

| Código | Caso |
|---|---|
| `200` | Lote procesado. Body: `{ "ok": true, "sessions": [...] }` (filas afectadas). |
| `400` | Payload inválido (Zod), `post_id` inexistente (FK) o valor que viola un CHECK. |
| `401` | Falta el `Authorization` o el JWT es inválido/expirado. |
| `405` | Método distinto de `POST`. |
| `500` | Error interno inesperado. |

Logs estructurados por sesión afectada: `{ user_id, post_id, link_clicked, new_status }`.

## Tests

- **Lógica de escritura** (pgTAP, job `rls-tests`): `supabase/tests/rls/rpc_track_engagement.sql`.
- **Contrato HTTP/JWT/array** (Jest + stack local, job `integration-test`):
  `__tests__/integration/trackEngagement.test.ts`.

Local: `npx supabase functions serve track-engagement` y luego
`npx jest --testPathPattern="integration/trackEngagement"`.
