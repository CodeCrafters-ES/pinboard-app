# Calendario corporativo — modelo de eventos

Documentación del dominio de eventos (EPIC-N05, feature F-N05-01). Cubre el modelo de datos, la paleta de
colores, las reglas de acceso (RLS) y el CRUD móvil de administración.

## Modelo de datos — `public.events`

Una fila por evento. Rango temporal semántico **`[event_start_at, event_end_at)`** (inicio inclusivo, fin
exclusivo), con columnas `timestamptz` separadas. Sin recurrencias ni RSVPs en el MVP.

| Columna | Tipo | Restricciones |
|---|---|---|
| `id` | `uuid` | PK, `default gen_random_uuid()` |
| `author_id` | `uuid` | **nullable**, FK → `auth.users(id) ON DELETE SET NULL` |
| `title` | `text` | `NOT NULL`, longitud 1–200 |
| `description` | `text` | nullable, ≤ 5000 |
| `location` | `text` | nullable, ≤ 200 |
| `image_url` | `text` | nullable — path en el bucket privado `event-images` (no URL pública) |
| `event_start_at` | `timestamptz` | `NOT NULL` |
| `event_end_at` | `timestamptz` | `NOT NULL`, `CHECK (event_end_at > event_start_at)` |
| `all_day` | `boolean` | `NOT NULL DEFAULT false` |
| `color_tag` | `event_color` | `NOT NULL DEFAULT 'brown'` (enum) |
| `created_at` | `timestamptz` | `NOT NULL DEFAULT now()` |
| `updated_at` | `timestamptz` | `NOT NULL DEFAULT now()`, trigger `events_updated_at` |

**Índices:** `events_author_id_idx`, `events_start_at_idx`, `events_event_end_at_idx`, `events_color_tag_idx`.

**Decisiones de diseño:**

- **Borrado del autor:** `author_id` es nullable con `ON DELETE SET NULL` — los eventos corporativos se
  conservan si se elimina el perfil del autor. Un evento huérfano (`author_id` null) solo puede editarlo o
  borrarlo un admin (ver RLS).
- **Día completo (`all_day`):** la UI oculta las horas y normaliza el rango a `00:00` (inicio) y
  `23:59:59.999` (fin) del/los día(s).
- **Eventos pasados:** no se filtran; el listado muestra el rango visible completo, con los pasados atenuados.

Migraciones: `supabase/migrations/20260618300000_create_events_table.sql` (scaffold) +
`20260716000000_alter_events_n05_schema.sql` (enum `event_color`, `all_day`, `author_id` nullable, constraints
de longitud, índice de color).

## Paleta de colores (`color_tag`)

Enum `public.event_color`. Los hex y su semántica de negocio (fuente única: `lib/eventColors.ts`, alineado con
`DESIGN.md`). El bucket de colores no coincide 1:1 con los tokens `nun-*` de Tailwind, por eso los chips/puntos
se pintan vía `style`, no `className`.

| `color_tag` | Hex | Uso |
|---|---|---|
| `brown` | `#7D5A3A` | Reuniones internas |
| `sea` | `#5B97B4` | Formaciones / briefings |
| `sage` | `#7A9060` | Eventos externos |
| `amber` | `#D4A84B` | Urgente / importante |
| `parchment` | `#A07850` | Cierre de temporada |

## Reglas de acceso (RLS)

- **Lectura:** cualquier usuario autenticado ve todos los eventos.
- **Escritura:** solo `manager` o `admin`, con restricción *own* (manager solo sus propios eventos; admin
  cualquiera; huérfanos solo admin).

La barrera real de seguridad es RLS, no el cliente. Detalle completo (policies, `USING`/`WITH CHECK`, tests) en
[`docs/rls/events.md`](./rls/events.md) y en la matriz global de [ADR-002](./adr/0002-rbac.md).

## CRUD móvil (Admin/Manager)

Administración en la propia app Expo (no hay panel web). Patrón contenedor-hook, mismo estilo que `admin/posts/`.

- **Pantallas** `app/(app)/(tabs)/admin/events/`:
  - `index.tsx` — listado con navegación por mes y filtro por color (para manager, filtrado a sus propios
    eventos; admin ve todos). Eventos pasados atenuados.
  - `new.tsx` — creación.
  - `[id]/edit.tsx` — edición + borrado con confirmación (`Alert.alert`).
  - `_layout.tsx` — stack de la sección.
- **Guard de rol:** `app/(app)/(tabs)/admin/_layout.tsx` bloquea a `staff` (redirect a Tablón); `manager`
  accede a `posts`, `events` y `users`.
- **Formulario** `components/EventComposerForm.tsx` — estado controlado (sin `react-hook-form`), selector de
  color por chips, switch `all_day` que oculta las horas y normaliza el rango, y subida de imagen opcional.
- **Validación** `lib/validation/eventSchema.ts` (`zod`): `title` 1–200, `description` ≤ 5000, `location`
  ≤ 200, `event_end_at > event_start_at`, `color_tag` atado al enum de BD. La validación de cliente no sustituye
  a las constraints + RLS del servidor.
- **Lógica de datos** `hooks/useEvents.ts`: fetch por `month` (`YYYY-MM`, filtra por `event_start_at`), `colorTag`
  y `authorId`; `createEvent`/`updateEvent`/`deleteEvent` con actualización optimista del estado local.
- **Imagen** `hooks/useEventImageUpload.ts`: resize a máx. 1920 px + conversión a WebP con `lib/media.ts`
  (`prepareImageForUpload`), subida al bucket **privado** `event-images` en `{userId}/{timestamp}/cover.webp`;
  `image_url` guarda el path (la URL de lectura se firma al mostrar).

## Referencias

- Migraciones: `supabase/migrations/20260618300000_create_events_table.sql`,
  `20260716000000_alter_events_n05_schema.sql`, `20260716000001_rls_events_n05_01_03.sql`.
- Tests RLS: `supabase/tests/rls/rls_events.sql`. Tests de UI: `__tests__/components/EventComposerForm.test.tsx`,
  `__tests__/hooks/useEvents.test.ts`, `__tests__/lib/eventSchema.test.ts`.
- Issues: EPIC-N05 (#247) · F-N05-01 (#248) · I-F-N05-01-01 (#250) · I-F-N05-01-02 (#251) · I-F-N05-01-03 (#252).
