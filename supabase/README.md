# supabase/

Aquí viven las migraciones SQL, seeds y Edge Functions del proyecto.

| Carpeta | Contenido |
|---|---|
| `migrations/` | Migraciones SQL versionadas. Se aplican con `npx supabase db push`. |
| `functions/` | Edge Functions en Deno runtime. Se despliegan con `npx supabase functions deploy`. |
| `tests/` | Tests pgTAP para las migraciones. Se ejecutan con `npx supabase test db`. |
| `seed.sql` | Datos de desarrollo (usuarios ficticios por rol). Solo para entornos locales. |

## Modelo de roles (`user_role`)

El enum `public.user_role` define los tres roles de la aplicación con jerarquía inclusiva:

```
admin > manager > staff
```

| Valor | Descripción |
|---|---|
| `admin` | Acceso total: gestión de usuarios, publicación de contenido, dashboard |
| `manager` | Publicación de contenido propio, dashboard de engagement, chat |
| `staff` | Lectura, reacciones, comentarios, chat |

### Tabla `public.profiles`

Extiende `auth.users` con datos de aplicación. Una fila por usuario autenticado.

| Columna | Tipo | Restricciones |
|---|---|---|
| `id` | `uuid` | PK, FK → `auth.users(id) ON DELETE CASCADE` |
| `role` | `user_role` | `NOT NULL DEFAULT 'staff'` |
| `full_name` | `text` | nullable |
| `avatar_url` | `text` | nullable |
| `created_at` | `timestamptz` | `NOT NULL DEFAULT now()` |
| `updated_at` | `timestamptz` | `NOT NULL DEFAULT now()`, gestionado por trigger |

**Índices:**
- `profiles_role_idx` — B-Tree sobre `(role)` para queries filtradas por rol.
- `profiles_elevated_role_idx` — Parcial sobre `(id) WHERE role IN ('admin','manager')`, optimiza los helpers RLS `is_admin()` / `is_manager()`.

> La autorización vive en Postgres (RLS). El cliente puede ocultar elementos de UI pero nunca es la fuente de verdad de seguridad.

## Helpers de rol (`auth_role`, `is_admin`, `is_manager`, `is_staff`)

Las cuatro funciones helper en `public` encapsulan la lógica de autorización usada por todas las policies RLS.

| Función | Atributo | Devuelve |
|---|---|---|
| `auth_role()` | `SECURITY DEFINER`, `search_path = public, auth` | `user_role` o `null` sin sesión |
| `is_admin()` | `STABLE` | `true` solo para `admin`; `false` si no hay sesión |
| `is_manager()` | `STABLE` | `true` para `admin` y `manager` (jerarquía inclusiva) |
| `is_staff()` | `STABLE` | `true` para cualquier rol autenticado |

### Modelo de privilegios

**Los helpers no son ejecutables por `anon`.** La decisión es deliberada:

- `EXECUTE` revocado a `PUBLIC` → cubre `anon` y cualquier rol no listado.
- `EXECUTE` concedido únicamente a `authenticated` y `service_role`.
- Owner fijado a `postgres` para que `SECURITY DEFINER` en `auth_role()` pueda leer `public.profiles` con un rol de confianza.

Las policies RLS que usen estos helpers asumen sesión autenticada (`auth.uid() IS NOT NULL`). Una petición `anon` que alcance una policy con `is_admin()` recibirá `permission denied for function is_admin` antes de que la query llegue a evaluar filas.

## Seed de desarrollo

El archivo `seed.sql` crea tres usuarios ficticios (uno por rol) al ejecutar `pnpm supabase:reset`:

| Email | Contraseña | Rol |
|---|---|---|
| `admin@nun-ibiza.dev` | `password123` | `admin` |
| `manager@nun-ibiza.dev` | `password123` | `manager` |
| `staff@nun-ibiza.dev` | `password123` | `staff` |

> **AVISO:** El seed no es apto para producción. Los UUIDs de estos usuarios tienen prefijo `aaaaaaaa-0000-...` para identificarlos fácilmente como datos ficticios.

## Arquitectura — ADRs

Las decisiones de autorización y seguridad están documentadas en:

- [ADR-002 — RBAC + RLS](../docs/adr/0002-rbac.md): matriz de permisos por rol y recurso (DB + Storage), convenciones para nuevos recursos.

## Comandos habituales

```bash
pnpm supabase:reset          # Destruye la BD local, aplica migraciones y seed
npx supabase test db         # Ejecuta todos los tests pgTAP
npx supabase db diff         # Genera un diff entre el schema local y las migraciones
npx supabase gen types typescript --local > lib/database.types.ts
```
