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

> **Alcance de esta issue (I-F-N07-02-01, #282): SELECT + INSERT.** El `UPDATE` (edición y soft delete) es
> [I-F-N07-02-02 (#283)](https://github.com/CodeCrafters-ES/pinboard-app/issues/283). Con RLS activada y sin
> policy de `UPDATE`/`DELETE`, ambas quedan **denegadas por defecto** hasta que #283 las materialice.

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
| `messages`/`chats`/`participants` | UPDATE / DELETE | — (#283) | — (#283) | — (#283) |

> (†) La INSERT de `messages` exige `is_chat_participant(chat_id) and sender_id = auth.uid()`: un admin que no
> participe **no** puede insertar en nombre de otros. Admin solo tiene alcance ampliado de **lectura**
> (moderación).

## Policies (SQL canónico)

Expresiones exactas en
[`supabase/migrations/20260803000000_rls_chat_n07_02_01.sql`](../../supabase/migrations/20260803000000_rls_chat_n07_02_01.sql).

| Policy | Op | USING | WITH CHECK |
|---|---|---|---|
| `chats_select_participant` | SELECT | `is_chat_participant(id) or is_admin()` | — |
| `chats_insert_authenticated` | INSERT | — | `true` |
| `chat_participants_select` | SELECT | `user_id = auth.uid() or is_chat_participant(chat_id) or is_admin()` | — |
| `chat_participants_insert` | INSERT | — | `user_id = auth.uid() or is_admin()` |
| `messages_select_participant` | SELECT | `is_chat_participant(chat_id) or is_admin()` | — |
| `messages_insert_participant` | INSERT | — | `is_chat_participant(chat_id) and sender_id = auth.uid()` |

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

Ejecución local:

```bash
pnpm supabase:test:rls   # supabase db reset && supabase test db supabase/tests/rls/
```

## Pendiente / follow-ups

- **`UPDATE` (edición + soft delete)** de `messages`: I-F-N07-02-02 (#283).
- **`chat_direct_pairs`** (materializa el par 1:1 para la unicidad) tiene solo `grant select` y **RLS
  deshabilitada**, por lo que un autenticado podría listar qué pares tienen DM. Endurecerlo (activar RLS o
  revocar el `select` directo dejando el lookup a una RPC) queda fuera del alcance de #282.

## Referencias

- Modelo del dominio y paginación: [`docs/chat.md`](../chat.md) · ADR-0004 (`docs/adr/0004-chat-realtime.md`).
- Esquema de tablas: `supabase/migrations/20260731000000_chat.sql`.
- Helpers `is_admin()` / `is_manager()`: `supabase/migrations/20260617190000_security_definer_role_helpers.sql`.
- Matriz global de permisos: [ADR-002 — RBAC + RLS](../adr/0002-rbac.md).
- Issues: I-F-N07-02-01 (#282) · F-N07-02 (#276) · EPIC-N07 (#274). Sustituye el placeholder I-F-S00-04-04.
