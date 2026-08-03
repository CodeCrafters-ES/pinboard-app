# RLS — chat (`chats`, `chat_participants`, `messages`)

Reglas de Row Level Security del chat 1:1 (EPIC-N07). La autorización vive en Postgres: el cliente puede
ocultar un botón por UX, pero si la policy no permite la operación, la query falla.

- **Lectura:** solo **participantes** del chat (o **admin**, para moderación) pueden leer el `chat`, sus filas
  de `chat_participants` y sus `messages`.
- **Escritura de mensajes:** solo un **participante** puede insertar mensajes, y **como remitente propio**
  (`sender_id = auth.uid()`) — sin suplantación.
- **Alta de participantes:** cada usuario solo puede **añadirse a sí mismo** (`user_id = auth.uid()`); admin
  puede añadir a cualquiera. El alta del contraparte de un 1:1 la hará una RPC `SECURITY DEFINER` en F-N07-03.
- **Creación del chat:** cualquier autenticado puede crear el contenedor `chats`; solo es útil cuando además
  se insertan sus participantes.
- **Edición / borrado de mensajes:** solo el **remitente** puede editar el `content` o hacer **soft delete**
  (`deleted_at`); el **admin** puede intervenir (moderación) sobre cualquier mensaje. **No** hay `DELETE`
  físico para `authenticated` salvo admin. La ventana de edición de 15 min es **UX en cliente**, no RLS
  (ADR-0004).
- **`last_read_at`:** cada participante actualiza el suyo (no el de otros) — base del contador de no leídos
  (F-N07-03).

> **Cobertura:** SELECT/INSERT (I-F-N07-02-01, #282) y UPDATE/DELETE (I-F-N07-02-02, #283) están
> implementados. La etiqueta "editado" y el render de "Mensaje eliminado" en la UI pertenecen a **F-N07-03**
> (la pantalla de hilo de chat aún no existe).

## Helper

`public.is_chat_participant(p_chat_id uuid) → boolean` (`SECURITY DEFINER`, `stable`). Devuelve `true` si
`auth.uid()` participa en el chat. Es `SECURITY DEFINER` para **romper la recursión**: la policy de
`chat_participants` lo invoca y él a su vez lee `chat_participants`; al correr como owner, su lectura interna
ignora RLS y no se auto-dispara. `execute` concedido solo a `authenticated` y `service_role`.

## Operaciones × rol

| Tabla | Acción | Admin | Participante | No participante |
|---|---|---|---|---|
| `chats` | SELECT | Todos | Su chat | — |
| `chats` | INSERT | ✓ | ✓ (cualquier autenticado) | ✓ (cualquier autenticado) |
| `chat_participants` | SELECT | Todos | Los de su chat + su fila | — |
| `chat_participants` | INSERT | ✓ (cualquiera) | ✓ (solo a sí mismo) | ✓ (solo a sí mismo) |
| `messages` | SELECT | Todos | Los de su chat | — |
| `messages` | INSERT | — (†) | ✓ (como sí mismo) | — |
| `messages` | UPDATE (edit / soft delete) | Todos (moderación) | Propios | — |
| `messages` | DELETE (físico) | ✓ | — | — |
| `chat_participants` | UPDATE (`last_read_at`) | El suyo | El suyo | — |

> (†) La INSERT de `messages` exige `is_chat_participant(chat_id) and sender_id = auth.uid()`: un admin que no
> participe **no** puede insertar en nombre de otros. Admin solo tiene alcance ampliado de **lectura** y
> **moderación** (UPDATE/DELETE), no de suplantación en el envío.

## Policies (SQL canónico)

Expresiones exactas en
[`20260803000000_rls_chat_n07_02_01.sql`](../../supabase/migrations/20260803000000_rls_chat_n07_02_01.sql)
(SELECT/INSERT) y
[`20260803010000_rls_chat_update_n07_02_02.sql`](../../supabase/migrations/20260803010000_rls_chat_update_n07_02_02.sql)
(UPDATE/DELETE).

| Policy | Op | USING | WITH CHECK |
|---|---|---|---|
| `chats_select_participant` | SELECT | `is_chat_participant(id) or is_admin()` | — |
| `chats_insert_authenticated` | INSERT | — | `true` |
| `chat_participants_select` | SELECT | `user_id = auth.uid() or is_chat_participant(chat_id) or is_admin()` | — |
| `chat_participants_insert` | INSERT | — | `user_id = auth.uid() or is_admin()` |
| `chat_participants_update_own` | UPDATE | `user_id = auth.uid()` | `user_id = auth.uid()` |
| `messages_select_participant` | SELECT | `is_chat_participant(chat_id) or is_admin()` | — |
| `messages_insert_participant` | INSERT | — | `is_chat_participant(chat_id) and sender_id = auth.uid()` |
| `messages_update_own` | UPDATE | `sender_id = auth.uid() or is_admin()` | `sender_id = auth.uid() or is_admin()` |
| `messages_no_hard_delete` | DELETE | `is_admin()` | — |

## Tests

Cobertura pgTAP en
[`supabase/tests/rls/rls_chat.sql`](../../supabase/tests/rls/rls_chat.sql) — 16 assertions. Fixtures:
**Chat A** = admin + manager, **Chat B** = manager + staff (así `staff` es participante de B pero **no** de A,
y **no** es admin, lo que permite probar el camino negativo puro). Incluye:

- Participante (staff): SELECT de `messages`/`chats`/`chat_participants` de su chat; INSERT de mensaje propio.
- No participante (staff sobre Chat A): SELECT devuelve 0 filas; INSERT de mensaje rechazado (`42501`).
- Suplantación: INSERT con `sender_id ≠ auth.uid()` rechazado (`42501`).
- Alta de participante: a sí mismo ok; a otro usuario rechazado (`42501`).
- Admin: SELECT de mensajes y del chat aunque **no** participe.
- Helper `is_chat_participant`: `true` para participante, `false` para no participante.

Cobertura de UPDATE/DELETE (#283) en
[`supabase/tests/rls/rls_chat_update.sql`](../../supabase/tests/rls/rls_chat_update.sql) — 10 assertions:

- Sender: edita su `content` (fija `edited_at`) y hace soft delete; no puede editar mensaje ajeno.
- `authenticated` no-admin: `DELETE` físico rechazado (0 filas).
- `last_read_at`: el participante actualiza el suyo; el de otro devuelve 0 filas.
- Admin: soft-delete y edición de cualquier mensaje, y `DELETE` físico.

Ejecución local:

```bash
pnpm supabase:test:rls   # supabase db reset && supabase test db supabase/tests/rls/
```

## Pendiente / follow-ups

- **UI de chat** (etiqueta "editado" junto a `edited_at`, render de "Mensaje eliminado", RPC de creación de
  1:1 que añade al contraparte): F-N07-03.
- **`chat_direct_pairs`** (materializa el par 1:1 para la unicidad) tiene solo `grant select` y **RLS
  deshabilitada**, por lo que un autenticado podría listar qué pares tienen DM. Endurecerlo (activar RLS o
  revocar el `select` directo dejando el lookup a una RPC) queda fuera del alcance de F-N07-02.

## Referencias

- Modelo del dominio y paginación: [`docs/chat.md`](../chat.md) · ADR-0004 (`docs/adr/0004-chat-realtime.md`).
- Esquema de tablas: `supabase/migrations/20260731000000_chat.sql`.
- Helpers `is_admin()` / `is_manager()`: `supabase/migrations/20260617190000_security_definer_role_helpers.sql`.
- Matriz global de permisos: [ADR-002 — RBAC + RLS](../adr/0002-rbac.md).
- Issues: I-F-N07-02-01 (#282) · I-F-N07-02-02 (#283) · F-N07-02 (#276) · EPIC-N07 (#274). Sustituye el
  placeholder I-F-S00-04-04.
