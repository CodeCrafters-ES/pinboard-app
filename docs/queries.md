# Queries API — Nun Ibiza PinBoard App

## profiles

Module: `lib/supabase/queries/profiles.ts`

Two functions cover the two access paths required by ADR-002 (RBAC):

---

### `listProfiles(params?)`

**Who calls it:** admin and manager screens (e.g., `app/(app)/(admin)/users`).

**Underlying table:** `public.profiles` — full columns, including `email`.

**Parameters:**

| Param | Type | Default | Description |
|---|---|---|---|
| `search` | `string` | — | Case-insensitive filter on `name`, `surname`, or `email` |
| `role` | `UserRole` | — | Exact match on `role` column (`admin`, `manager`, `staff`) |
| `page` | `number` | `0` | 0-indexed page number |
| `pageSize` | `number` | `20` | Rows per page |

**Returns:** `Promise<{ rows: ProfileRow[]; total: number }>`

`total` reflects the full result count before pagination (use it to compute page count).

**Example:**
```typescript
const { rows, total } = await listProfiles({ search: 'ana', role: 'staff', page: 0, pageSize: 20 });
```

---

### `listProfilesPublic(params?)`

**Who calls it:** staff-facing features (mention pickers, chat participants, etc.).

**Underlying view:** `public.profiles_public` — limited columns, **no `email`, no `title`**.

**Parameters:** identical to `listProfiles`. The `search` filter matches on `name` and `surname` only (no email search for staff).

**Returns:** `Promise<{ rows: ProfilePublicRow[]; total: number }>`

`ProfilePublicRow` fields: `id`, `user_id`, `full_name` (computed), `name`, `surname`, `avatar_url`, `role`, `created_at`.

**Example:**
```typescript
const { rows, total } = await listProfilesPublic({ search: 'carlos', page: 0 });
```

---

## Column restriction model

PostgreSQL RLS restricts rows, not columns. The `profiles_public` view is the DB-level mechanism that guarantees staff never reads `email` or `title` from other users' profiles:

- **Admin / manager** → `listProfiles` → queries `profiles` table → all columns available
- **Staff / mention pickers** → `listProfilesPublic` → queries `profiles_public` view → `email` and `title` columns do not exist in the view schema

Any attempt to `SELECT email FROM profiles_public` fails at parse time with error `42703` (undefined column), regardless of the RLS session.

The caller is responsible for using the correct function based on the session role (available from `useSession().profile.role`).

---

## Pagination

Both functions use offset-based pagination via Supabase's `.range(from, to)`:

```
from = page * pageSize
to   = from + pageSize - 1
```

`total` is returned via `count: 'exact'`, which adds a `Content-Range` header to the response. Use it to compute the last page: `Math.ceil(total / pageSize)`.
