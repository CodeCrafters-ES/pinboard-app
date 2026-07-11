# ADR-0006 — Señales de comportamiento en engagement: focused_seconds y max_scroll_pct

**Estado:** Aceptado
**Fecha:** 2026-07-10
**Extiende:** [ADR-001](0001-engagement.md)
**Autores:** Alex Zapata
**Issues:** [EPIC-N04 #172](https://github.com/CodeCrafters-ES/pinboard-app/issues/172) · [F-N04-02 #174](https://github.com/CodeCrafters-ES/pinboard-app/issues/174) · [I-F-N04-02-01 #178](https://github.com/CodeCrafters-ES/pinboard-app/issues/178)

---

## Contexto

[ADR-001](0001-engagement.md) define el engagement de posts alrededor de `link_clicked` como métrica principal y un `status` de negocio (`viewed → engaged → clicked`). En su "Opción C" descartó el **tiempo de lectura in-app como métrica principal**, con razón: el contenido es externo y el tiempo dentro de la app no mide el consumo del artículo.

El cliente de EPIC-N04 (`usePostEngagement`, #173) ya captura dos señales de comportamiento in-app: segundos de foco real (`focused_seconds`) y scroll máximo sobre la card (`max_scroll_pct`). No pretenden sustituir a `link_clicked`, sino enriquecer el análisis editorial (¿la card genera interés antes del clic?). El conflicto que resolvió el revert del PR #226 fue precisamente que ese trabajo se coló como un modelo alternativo (`viewed → skimmed → read`) que desplazaba a `link_clicked` y citaba ADR-001 en falso.

Este ADR fija la relación correcta: las señales de comportamiento son **aditivas y opcionales**, no una métrica principal.

---

## Decisión

### Modelo aditivo

Se añaden a `engagement_sessions` dos columnas **opcionales**:

- `focused_seconds` (`integer`, default 0, `>= 0`): segundos de foco in-app acumulados. El cliente envía deltas por heartbeat; la Edge Function los **suma**.
- `max_scroll_pct` (`numeric(4,3)`, default 0, `∈ [0,1]`): scroll máximo alcanzado en la card; monotónico. La Edge Function toma el **máximo**.

```sql
alter table public.engagement_sessions
  add column focused_seconds integer      not null default 0 check (focused_seconds >= 0),
  add column max_scroll_pct  numeric(4,3) not null default 0
                             check (max_scroll_pct >= 0 and max_scroll_pct <= 1);
```

### Invariantes respecto a ADR-001

- `link_clicked` **sigue siendo la métrica principal** y append-only. Sin cambios.
- `status` **sigue siendo** `viewed / engaged / clicked`. Las nuevas columnas **no** lo gobiernan (no hay `skimmed` ni `read`).
- La tabla mantiene 1 fila por `(user_id, post_id)`, `id` PK, FK `user_id → auth.users(id)` (guarda `auth.uid()`, RLS `user_id = auth.uid()` directo). Sin cambios respecto a ADR-001.
- Toda escritura sigue pasando exclusivamente por la Edge Function `track-engagement` con `service_role`.

### Contrato de la Edge Function (extensión)

La Edge Function `track-engagement` (ver ADR-001) se extiende para:

1. Aceptar un **lote (array)** de eventos por request — es lo que ya envía la cola offline del cliente (`lib/engagement/queue.ts`). El contrato de objeto único de ADR-001 se amplía a `Event[] | { events: Event[] }`.
2. Por evento, acumular las señales opcionales en el UPSERT:

```sql
on conflict (user_id, post_id) do update set
  focused_seconds = engagement_sessions.focused_seconds + excluded.focused_seconds,
  max_scroll_pct  = greatest(engagement_sessions.max_scroll_pct, excluded.max_scroll_pct),
  -- ... resto de la lógica de status / link_clicked según ADR-001
  last_seen_at    = now();
```

Los campos `focused_seconds_delta` y `max_scroll_pct` del payload son **opcionales**: un evento que solo trae `link_clicked` funciona igual.

### Coherencia con la "Opción C" de ADR-001

No contradice el descarte de ADR-001: allí se rechazó el tiempo in-app como métrica **principal** de consumo del artículo externo. Aquí se acepta como señal **secundaria y opcional** de interés sobre la card, sin desplazar a `link_clicked`. La crítica semántica de ADR-001 sigue siendo válida y se asume: estas columnas miden interés sobre la preview, no lectura del artículo.

---

## Consecuencias

**Positivas:**

- Se conserva la telemetría de comportamiento que ya captura el cliente, sin reconstruirla más tarde.
- Cambio de esquema puramente aditivo: `alter table add column` con defaults; las filas existentes quedan válidas.
- `link_clicked` y el dashboard de ADR-001 no se ven afectados.

**Negativas / limitaciones:**

- Estas columnas miden interés sobre la card/preview, no lectura del artículo externo (proxy).
- Acumular deltas exige que la Edge Function sea idempotente por lote: los reintentos de la cola offline no deben doblar la suma (dedup por sesión / lote).

---

## Referencias

- [ADR-001](0001-engagement.md) — modelo base de engagement (`link_clicked` + `status`). Este ADR lo **extiende**, no lo supersede.
- `supabase/migrations/*_engagement_sessions_additive.sql` — migración que añade las columnas (I-F-N04-02-01).
- `supabase/functions/track-engagement/` — Edge Function extendida (I-F-N04-02-02 / #179).
- `hooks/usePostEngagement.ts` + `lib/engagement/` — cliente que captura las señales (#173).
