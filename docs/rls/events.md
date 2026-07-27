# RLS — `public.events`

Reglas de Row Level Security de la tabla de eventos del calendario corporativo (EPIC-N05).

- **Lectura:** cualquier usuario autenticado puede ver todos los eventos.
- **Escritura:** solo `manager` o `admin`, con restricción *own*:
  - `manager` solo puede crear/editar/borrar **sus propios** eventos (`author_id = auth.uid()`).
  - `admin` puede escribir sobre **cualquier** evento (jerarquía inclusiva).
- **Eventos huérfanos:** si el autor se elimina, `author_id` pasa a `null` (`on delete set null`).
  El check *own* falla con `null`, por lo que un evento huérfano **solo puede editarlo/borrarlo un admin**
  (comportamiento deseado, cubierto por test).

`is_manager()` devuelve `true` también para `admin`, así que la condición de INSERT no necesita `is_admin()` extra.

## Operaciones × rol

| Acción | Admin | Manager | Staff |
|---|---|---|---|
| SELECT | Todas | Todas | Todas |
| INSERT | ✓ (propios) | ✓ (propios) | — |
| UPDATE | Todas | Propios | — |
| DELETE | Todas | Propios | — |

## Policies (SQL canónico)

Expresiones exactas implementadas en
[`supabase/migrations/20260716000001_rls_events_n05_01_03.sql`](../../supabase/migrations/20260716000001_rls_events_n05_01_03.sql),
que sustituye a las policies permisivas de `20260618400000_rls_events.sql` (donde cualquier manager podía
escribir sobre cualquier evento).

| Policy | Op | USING | WITH CHECK |
|---|---|---|---|
| `events_select_authenticated` | SELECT | `true` | — |
| `events_insert_manager_or_admin` | INSERT | — | `is_manager() and author_id = auth.uid()` |
| `events_update_own_or_admin` | UPDATE | `is_admin() or (is_manager() and author_id = auth.uid())` | `is_admin() or (is_manager() and author_id = auth.uid())` |
| `events_delete_own_or_admin` | DELETE | `is_admin() or (is_manager() and author_id = auth.uid())` | — |

> `events_select_authenticated` se mantiene desde la migración original; las tres policies de escritura se
> recrean con la restricción *own*.

## Tests

Cobertura pgTAP en
[`supabase/tests/rls/rls_events.sql`](../../supabase/tests/rls/rls_events.sql) — 15 assertions sobre las 4
operaciones × 3 roles, incluyendo:

- Staff: SELECT ok; INSERT rechazado (`42501`); UPDATE/DELETE devuelven 0 filas.
- Manager: INSERT propio ok; INSERT suplantando otro `author_id` rechazado; UPDATE/DELETE ok solo sobre eventos
  propios; ajenos y huérfanos devuelven 0 filas.
- Admin: INSERT/UPDATE/DELETE ok sobre cualquier evento, incluidos los huérfanos (`author_id` null).

Ejecución local:

```bash
pnpm supabase:test:rls   # supabase db reset && supabase test db supabase/tests/rls/
```

## Referencias

- Modelo completo del dominio (esquema, paleta, CRUD móvil): [`docs/calendar.md`](../calendar.md).
- Migración de policies: `supabase/migrations/20260716000001_rls_events_n05_01_03.sql`.
- Esquema de la tabla: `supabase/migrations/20260618300000_create_events_table.sql` +
  `supabase/migrations/20260716000000_alter_events_n05_schema.sql` (`author_id` nullable, `color_tag`, `all_day`).
- Helpers `is_admin()` / `is_manager()`: `supabase/migrations/20260617190000_security_definer_role_helpers.sql`.
- Matriz global de permisos: [ADR-002 — RBAC + RLS](../adr/0002-rbac.md).
- Issues: I-F-N05-01-03 (#252) · F-N05-01 (#248) · EPIC-N05 (#247) · plan general de policies I-F-S00-04-03 (EPIC-S00).
