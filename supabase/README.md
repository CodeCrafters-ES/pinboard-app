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

## Seed de desarrollo

El archivo `seed.sql` crea tres usuarios ficticios (uno por rol) al ejecutar `pnpm supabase:reset`:

| Email | Contraseña | Rol |
|---|---|---|
| `admin@nun-ibiza.dev` | `password123` | `admin` |
| `manager@nun-ibiza.dev` | `password123` | `manager` |
| `staff@nun-ibiza.dev` | `password123` | `staff` |

> **AVISO:** El seed no es apto para producción. Los UUIDs de estos usuarios tienen prefijo `aaaaaaaa-0000-...` para identificarlos fácilmente como datos ficticios.

## Comandos habituales

```bash
pnpm supabase:reset          # Destruye la BD local, aplica migraciones y seed
npx supabase test db         # Ejecuta todos los tests pgTAP
npx supabase db diff         # Genera un diff entre el schema local y las migraciones
npx supabase gen types typescript --local > lib/database.types.ts
```
