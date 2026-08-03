# RLS — `public.push_tokens`

Tokens de Expo Push por usuario y dispositivo (EPIC-N06). Cada fila es un dispositivo registrado.

- **Todo es *own*:** un usuario autenticado solo ve y manipula sus propios tokens (`user_id = auth.uid()`),
  sin distinción por rol. No hay policy de admin: un admin tampoco lee los tokens de otro usuario.
- **`service_role` bypassea RLS:** es el único camino para leer tokens ajenos, y existe precisamente
  para que la Edge Function `send-push` resuelva destinatarios y purgue los inválidos (F-N06-02).
- **Sin acceso anónimo:** las policies están limitadas a `to authenticated` y no hay GRANT para `anon`.

## Operaciones × rol

| Acción | Admin | Manager | Staff | `service_role` |
|---|---|---|---|---|
| SELECT | Propios | Propios | Propios | Todos |
| INSERT | Propios | Propios | Propios | — |
| UPDATE | Propios | Propios | Propios | — |
| DELETE | Propios | Propios | Propios | Todos |

> Las policies *own* filtran con `USING`, no lanzan error: un UPDATE/DELETE sobre el token de otro usuario
> no falla, simplemente afecta a 0 filas. El INSERT sí devuelve `42501` porque lo corta el `WITH CHECK`.

## Policies (SQL canónico)

Expresiones implementadas en
[`supabase/migrations/20260618800000_rls_push_tokens.sql`](../../supabase/migrations/20260618800000_rls_push_tokens.sql).

| Policy | Op | USING | WITH CHECK |
|---|---|---|---|
| `push_tokens_select_own` | SELECT | `user_id = auth.uid()` | — |
| `push_tokens_insert_own` | INSERT | — | `user_id = auth.uid()` |
| `push_tokens_update_own` | UPDATE | `user_id = auth.uid()` | `user_id = auth.uid()` |
| `push_tokens_delete_own` | DELETE | `user_id = auth.uid()` | — |

## Grants

`auto_expose_new_tables` está desactivado en `config.toml`, así que los privilegios se conceden a mano:

| Rol | Privilegios | Migración |
|---|---|---|
| `authenticated` | `select, insert, update, delete` | `20260618700000_create_push_tokens_table.sql` |
| `service_role` | `select, delete` | `20260801000000_push_tokens_n06_fk_and_grants.sql` |
| `anon` | — | — |

`service_role` bypassea RLS por atributo de rol, pero **no** los GRANTs: sin el `grant select, delete`
la Edge Function `send-push` no podría ni listar destinatarios ni purgar tokens `DeviceNotRegistered`.

## Esquema relevante

```sql
id           uuid        primary key default gen_random_uuid(),
user_id      uuid        not null references public.profiles(user_id) on delete cascade,
token        text        not null,
platform     text        not null check (platform in ('ios', 'android', 'web')),
device_name  text,                                    -- solo debug
last_seen_at timestamptz not null default now(),      -- purga por antigüedad
created_at   timestamptz not null default now(),
updated_at   timestamptz not null default now(),
unique (user_id, token)
```

- **`unique (user_id, token)`** es el contrato del cliente: el registro del token es un UPSERT con
  `onConflict: 'user_id,token'`, así que reabrir sesión en el mismo dispositivo reutiliza la fila.
- **Borrado en cascada:** la FK apunta a `profiles.user_id` (no a `auth.users`), porque
  `profiles_delete_admin` permite a un admin borrar el perfil sin tocar `auth.users`; con la FK original
  esos tokens quedaban huérfanos. Como `profiles.user_id` ya cascadea desde `auth.users`, ambos caminos
  de borrado —perfil o usuario de auth— eliminan los tokens.
- **`last_seen_at`** lo refresca el cliente en cada registro/refresh; el índice `push_tokens_last_seen_idx`
  sostiene la purga de tokens con más de 60 días sin actividad.
- **`platform = 'web'`** sigue permitido por el check original, pero el push web está **fuera del alcance**
  de EPIC-N06: solo se registran tokens `ios` y `android` desde la app Expo. La opción se mantiene por
  compatibilidad del esquema.

## Tests

Cobertura pgTAP en dos ficheros:

- [`supabase/tests/rls/rls_push_tokens.sql`](../../supabase/tests/rls/rls_push_tokens.sql) — 10 assertions:
  SELECT/INSERT/UPDATE/DELETE propios, INSERT suplantando a otro usuario (`42501`), UPDATE y DELETE
  cruzados (0 filas), borrado del token de un dispositivo sin arrastrar los demás del mismo usuario
  (el logout borra por `(user_id, token)`) y lectura completa desde `service_role`.
- [`supabase/tests/rls/schema_push_tokens.sql`](../../supabase/tests/rls/schema_push_tokens.sql) — 13
  assertions: columnas y tipos, índice de purga, FK a `profiles` con cascade, unicidad `(user_id, token)`,
  UPSERT sin duplicados, cascade al borrar perfil y al borrar el usuario de auth, y grants de `service_role`.

Ejecución local:

```bash
pnpm supabase:test:rls   # supabase db reset && supabase test db supabase/tests/rls/
```

## Referencias

- Migraciones: `20260618700000_create_push_tokens_table.sql` (tabla) ·
  `20260618800000_rls_push_tokens.sql` (policies) ·
  `20260716000002_alter_push_tokens_n06_schema.sql` (`device_name`, `last_seen_at`) ·
  `20260801000000_push_tokens_n06_fk_and_grants.sql` (FK a `profiles`, grants de `service_role`).
- Cliente: [`lib/notifications/pushToken.ts`](../../lib/notifications/pushToken.ts) (I-F-N06-01-02).
- Contrato de payload y deep-linking: [ADR-003](../adr/0003-push-deep-linking.md).
- Matriz global de permisos: [ADR-002 — RBAC + RLS](../adr/0002-rbac.md).
- Issues: I-F-N06-01-01 (#267) · F-N06-01 (#264) · EPIC-N06 (#263).
