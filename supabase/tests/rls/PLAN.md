# Plan de tests de RLS — Nun Ibiza PinBoard App

## Stack

**Herramienta principal:** [pgTAP](https://pgtap.org/) — extensión de Postgres que integra el protocolo TAP en SQL.

```sql
CREATE EXTENSION IF NOT EXISTS pgtap;
```

pgTAP permite escribir tests como queries SQL estándar y obtener un informe TAP que la Supabase CLI parsea automáticamente con `supabase test db`.

**Alternativa sin pgTAP** (para checks de bajo nivel en migraciones):
```sql
DO $$ BEGIN
  IF NOT (condición) THEN
    RAISE EXCEPTION 'Assertion failed: descripción';
  END IF;
END $$;
```

---

## Convención de nombrado de ficheros

```
rls_<tabla>_<accion>.sql
```

Ejemplos:
- `rls_profiles_update_role.sql`
- `rls_posts_insert.sql`
- `rls_engagement_sessions_write.sql`

Cada fichero cubre **una tabla + una acción** (SELECT, INSERT, UPDATE, DELETE). Si varias acciones comparten la misma policy (p. ej. INSERT/UPDATE en la misma tabla), pueden ir en el mismo fichero con nombre `rls_<tabla>_write.sql`.

---

## Simulación de sesión

Supabase resuelve `auth.uid()` leyendo `current_setting('request.jwt.claims', true)::json->>'sub'`. Para simular un usuario autenticado dentro de una transacción pgTAP:

```sql
-- Simular sesión como el usuario de seed admin
SELECT set_config(
  'request.jwt.claims',
  '{"sub": "aaaaaaaa-0000-0000-0000-000000000001", "role": "authenticated"}',
  true   -- local = true: se resetea al fin de la transacción
);
```

Para los tests que validan el rechazo de requests no autenticados, usar el rol Postgres `anon`:

```sql
SET LOCAL ROLE anon;
-- ... assertions ...
RESET ROLE;
```

---

## Datos de partida (seed)

Los tests de RLS se apoyan en el seed de desarrollo (`supabase/seed.sql`), que crea tres usuarios ficticios uno por rol:

| Email | UUID | Rol |
|---|---|---|
| `admin@nun-ibiza.dev` | `aaaaaaaa-0000-0000-0000-000000000001` | `admin` |
| `manager@nun-ibiza.dev` | `aaaaaaaa-0000-0000-0000-000000000002` | `manager` |
| `staff@nun-ibiza.dev` | `aaaaaaaa-0000-0000-0000-000000000003` | `staff` |

Si un test necesita datos adicionales (p. ej. un post de un usuario concreto), se crean dentro de la transacción y se eliminan automáticamente en el `ROLLBACK` final.

---

## Estructura de cada test

```
BEGIN;
  SELECT plan(N);           -- N = número total de assertions

  -- 1. Setup de sesión
  SELECT set_config('request.jwt.claims', '{"sub":"<uuid>","role":"authenticated"}', true);

  -- 2. Caso positivo (acción debe funcionar)
  SELECT lives_ok( $test$ <query> $test$, 'descripción' );
  -- o:
  SELECT results_eq( $test$ <query> $test$, $expected$ VALUES (...) $expected$, 'descripción' );

  -- 3. Cambio de sesión (si el negativo requiere otro usuario)
  SELECT set_config('request.jwt.claims', '{"sub":"<uuid>","role":"authenticated"}', true);

  -- 4. Caso negativo (acción debe ser rechazada por RLS)
  SELECT throws_ok( $test$ <query> $test$, '42501', null, 'descripción' );
  -- Código 42501 = insufficient_privilege (RLS block)

  SELECT * FROM finish();
ROLLBACK;
```

### Funciones pgTAP más usadas

| Función | Cuándo usarla |
|---|---|
| `lives_ok($query$, msg)` | La query debe ejecutarse sin error |
| `throws_ok($query$, sqlstate, msg, desc)` | La query debe lanzar error con el SQLSTATE dado |
| `results_eq($query$, $expected$, msg)` | El resultado debe coincidir exactamente |
| `is(expr, expected, msg)` | Comparación de valor único |
| `ok(condition, msg)` | Condición booleana genérica |

---

## Gate de merge

> **Ninguna policy se mergea a `main` sin su fichero de test.**

Requisito mínimo por policy:
- ✅ **≥ 1 caso positivo**: la operación permitida se ejecuta sin error.
- ❌ **≥ 1 caso negativo**: la operación prohibida lanza `42501` (o retorna 0 filas en SELECT).

El PR debe incluir **policy + test en el mismo commit/rama**. No se aceptan policies sin test ni tests sin policy documentada en [ADR-002](../../docs/adr/0002-rbac.md).

---

## Cobertura actual

| Tabla / scope | Fichero de test | Estado |
|---|---|---|
| Helpers de rol (F-S00-02) | `helpers.sql` | ✅ Implementado |
| Grants/revokes (F-S00-02) | `helpers_grants.sql` | ✅ Implementado |
| `profiles` (F-S00-04) | `rls_profiles_select.sql`, `rls_profiles_insert.sql`, `rls_profiles_update.sql`, `rls_profiles_delete.sql` | ✅ Implementado |
| `posts` (F-S00-04) | _pendiente_ | ⏳ F-S00-04 |
| `post_reactions` (F-S00-04) | _pendiente_ | ⏳ F-S00-04 |
| `post_ratings` (F-S00-04) | _pendiente_ | ⏳ F-S00-04 |
| `post_comments` (F-S00-04) | _pendiente_ | ⏳ F-S00-04 |
| `events` (F-S00-04) | _pendiente_ | ⏳ F-S00-04 |
| `engagement_sessions` (F-S00-04) | _pendiente_ | ⏳ F-S00-04 |
| `push_tokens` (F-S00-04) | _pendiente_ | ⏳ F-S00-04 |
| `chats` / `messages` (EPIC-N07) | _pendiente_ | ⏳ EPIC-N07 |
