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
- **Content de borrados no recuperable (F-N07-04):** el cliente lee por la vista `messages_public_v`
  (`security_invoker`), que enmascara `content` a `null` cuando `deleted_at is not null`. Hereda la RLS de
  `messages`, así que solo oculta la columna, no amplía visibilidad. Ver §Soft delete en `docs/chat.md`.
- **`last_read_at`:** cada participante actualiza el suyo (no el de otros) — base del contador de no leídos
  (F-N07-03).

> **Cobertura:** SELECT/INSERT (I-F-N07-02-01, #282) y UPDATE/DELETE (I-F-N07-02-02, #283) están
> implementados, así como el cliente de chat (**F-N07-03**: hilo, etiqueta "editado", render de "Mensaje
> eliminado") y la moderación mínima (**F-N07-04**: vista `messages_public_v` que enmascara los borrados y
> modelo `user_blocks`; ver §Bloqueo entre usuarios más abajo).

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
| `chat_participants` | INSERT | ✓ (cualquiera) | — (solo vía RPC) (§) | — (solo vía RPC) (§) |
| `messages` | SELECT | Todos | Los de su chat | — |
| `messages` | INSERT | — (†) | ✓ (como sí mismo, sin bloqueo con el contraparte) | — |
| `messages` | UPDATE (edit / soft delete) | Todos (moderación) | Propios | — |
| `messages` | DELETE (físico) | ✓ | — | — |
| `chat_participants` | UPDATE (`last_read_at`) | El suyo | El suyo | — |

> (†) La INSERT de `messages` exige `is_chat_participant(chat_id) and sender_id = auth.uid()`: un admin que no
> participe **no** puede insertar en nombre de otros. Admin solo tiene alcance ampliado de **lectura** y
> **moderación** (UPDATE/DELETE), no de suplantación en el envío.
>
> (§) **Fix de seguridad (#274, `20260811000000`):** el alta directa de participantes por el cliente está
> **cerrada** — un usuario ya no puede insertarse a sí mismo en un chat. Antes (`user_id = auth.uid()`) podía
> auto-añadirse a un chat ajeno cuyo `chat_id` hubiera descubierto y leer sus mensajes. El alta la hace la RPC
> `create_or_get_direct_chat` (`SECURITY DEFINER`, da de alta a ambos como owner). Solo `admin` puede insertar
> directamente.

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
| `chat_participants_insert` | INSERT | — | `is_admin()` (§ — alta directa cerrada, #274) |
| `chat_participants_update_own` | UPDATE | `user_id = auth.uid()` | `user_id = auth.uid()` |
| `messages_select_participant` | SELECT | `is_chat_participant(chat_id) or is_admin()` | — |
| `messages_insert_participant` | INSERT | — | `is_chat_participant(chat_id) and sender_id = auth.uid()` **and** sin bloqueo con el contraparte (‡) |
| `messages_update_own` | UPDATE | `sender_id = auth.uid() or is_admin()` | `sender_id = auth.uid() or is_admin()` |
| `messages_no_hard_delete` | DELETE | `is_admin()` | — |

> (‡) F-N07-04 (#288) endurece el `with check` de `messages_insert_participant` añadiendo
> `and not exists (select 1 from chat_participants cp_other where cp_other.chat_id = messages.chat_id and
> cp_other.user_id <> auth.uid() and is_blocked(auth.uid(), cp_other.user_id))`: no se envía a un
> interlocutor bloqueado (en cualquier sentido). Detalle en §Bloqueo entre usuarios.

## Bloqueo entre usuarios (F-N07-04, #288)

`public.user_blocks (blocker_user_id, blocked_user_id)` modela el bloqueo 1:1: un par impide **iniciar** un
DM nuevo y **enviar** mensajes hacia/desde el bloqueado, **sin destruir el historial** (un chat existente se
sigue devolviendo y sus mensajes se leen). Es autoservicio (cada quien gestiona sus filas; admin cualquiera):

- **RLS** (`user_blocks_select` / `_insert` / `_delete`): `blocker_user_id = auth.uid() or is_admin()`. El
  SELECT acota a mis filas, así que el **bloqueado no ve quién le ha bloqueado**. Sin UPDATE (un bloqueo se
  crea o se borra); `check user_blocks_no_self` impide auto-bloquearse.
- **Helpers** `SECURITY DEFINER`: `is_blocked(a, b)` (bidireccional, ignora RLS para comprobar el par del
  contraparte) y `direct_chat_blocked(other)` (acotada al llamante, para la UI).
- **Enforcement**: además del `with check` de `messages_insert_participant` (‡), la RPC
  `create_or_get_direct_chat(other)` aborta con `42501` antes de crear un chat **nuevo** si `is_blocked`.

SQL canónico en
[`20260808100000_user_blocks.sql`](../../supabase/migrations/20260808100000_user_blocks.sql); matriz de
permisos y firma de los helpers en [ADR-002 — RBAC + RLS](../adr/0002-rbac.md). Tests en
[`rls_user_blocks.sql`](../../supabase/tests/rls/rls_user_blocks.sql) (17 assertions) y
[`rls_messages_block.sql`](../../supabase/tests/rls/rls_messages_block.sql) (6 assertions: corta el envío en
ambos sentidos, historial legible, no abre un DM nuevo, re-envío tras desbloqueo).

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

## `chat_direct_pairs` (unicidad del par 1:1)

Tabla derivada que materializa el par ordenado `(user_a < user_b)` de un chat directo para garantizar que
no haya dos DMs entre el mismo par. La puebla por trigger (`SECURITY DEFINER`) el alta del segundo
participante.

**Cerrada a lectura directa (fix #274, `20260811000000`):** filtraba el grafo social (qué pares tienen DM) y
los `chat_id`, que combinados con un self-join abrían mensajes ajenos. Se **revocó** el `grant select` a
`authenticated` y se **habilitó RLS** (deny por defecto). El cliente no la consulta; la RPC
`create_or_get_direct_chat` resuelve el par internamente como definer.

## Referencias

- Modelo del dominio y paginación: [`docs/chat.md`](../chat.md) · ADR-0004 (`docs/adr/0004-chat-realtime.md`).
- Esquema de tablas: `supabase/migrations/20260731000000_chat.sql`.
- Helpers `is_admin()` / `is_manager()`: `supabase/migrations/20260617190000_security_definer_role_helpers.sql`.
- Matriz global de permisos: [ADR-002 — RBAC + RLS](../adr/0002-rbac.md).
- Issues: I-F-N07-02-01 (#282) · I-F-N07-02-02 (#283) · F-N07-02 (#276) · I-F-N07-04-01 (#287) ·
  I-F-N07-04-02 (#288) · F-N07-04 (#278) · EPIC-N07 (#274). Sustituye el placeholder I-F-S00-04-04.
