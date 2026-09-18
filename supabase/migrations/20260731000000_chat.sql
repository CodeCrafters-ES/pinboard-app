-- Migration: N07-01-01 — Chat base schema (chats, chat_participants, messages)
-- Epic N07 (#274) / Feature F-N07-01 (#275) / Issue I-F-N07-01-01 (#280)
-- FK a auth.users(id) (no profiles): las policies de F-N07-02 comparan con auth.uid().
-- RLS y los índices de paginación (I-F-N07-01-02) quedan fuera de este scope.

-- ── chats ─────────────────────────────────────────────────────────────────────
create table public.chats (
  id              uuid        primary key default gen_random_uuid(),
  is_group        boolean     not null default false,
  created_at      timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);

grant select, insert, update on public.chats to authenticated;

-- ── chat_participants ─────────────────────────────────────────────────────────
create table public.chat_participants (
  chat_id      uuid        not null references public.chats(id) on delete cascade,
  user_id      uuid        not null references auth.users(id) on delete cascade,
  joined_at    timestamptz not null default now(),
  last_read_at timestamptz not null default now(),
  primary key (chat_id, user_id)
);

grant select, insert, update on public.chat_participants to authenticated;

-- ── messages ──────────────────────────────────────────────────────────────────
create table public.messages (
  id         uuid        primary key default gen_random_uuid(),
  chat_id    uuid        not null references public.chats(id) on delete cascade,
  sender_id  uuid        not null references auth.users(id) on delete cascade,
  content    text        not null check (char_length(content) between 1 and 4000),
  created_at timestamptz not null default now(),
  edited_at  timestamptz,
  deleted_at timestamptz
);

grant select, insert, update on public.messages to authenticated;

-- ── chat_direct_pairs ─────────────────────────────────────────────────────────
-- Tabla derivada que materializa el par ordenado de un chat 1:1 para garantizar
-- unicidad: no puede existir más de un chat directo entre el mismo par. Se puebla
-- por trigger al insertarse el segundo participante de un chat con is_group = false.
create table public.chat_direct_pairs (
  chat_id uuid primary key references public.chats(id) on delete cascade,
  user_a  uuid not null references auth.users(id) on delete cascade,
  user_b  uuid not null references auth.users(id) on delete cascade,
  constraint chat_direct_pairs_order check (user_a < user_b),
  unique (user_a, user_b)
);

-- Solo lectura para clientes (lookup de DM existente); las escrituras las hace el
-- trigger vía SECURITY DEFINER.
grant select on public.chat_direct_pairs to authenticated;

-- ── Trigger: materializar par 1:1 ─────────────────────────────────────────────
create or replace function public.chat_direct_pairs_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _is_group     boolean;
  _participants uuid[];
begin
  select is_group into _is_group from public.chats where id = new.chat_id;
  if _is_group then
    return new;
  end if;

  select array_agg(user_id order by user_id)
    into _participants
  from public.chat_participants
  where chat_id = new.chat_id;

  -- Solo al completarse el par (segundo participante) se inserta la fila.
  -- Un chat 1:1 duplicado para el mismo par viola unique(user_a, user_b).
  if array_length(_participants, 1) = 2 then
    insert into public.chat_direct_pairs (chat_id, user_a, user_b)
    values (new.chat_id, _participants[1], _participants[2]);
  end if;

  return new;
end;
$$;

create trigger chat_participants_sync_direct_pair
  after insert on public.chat_participants
  for each row execute function public.chat_direct_pairs_sync();

-- ── Trigger: chats.last_message_at ────────────────────────────────────────────
create or replace function public.messages_set_last_message_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.chats
    set last_message_at = new.created_at
  where id = new.chat_id;
  return new;
end;
$$;

create trigger messages_set_last_message_at
  after insert on public.messages
  for each row execute function public.messages_set_last_message_at();

-- ── Trigger: messages.edited_at ───────────────────────────────────────────────
create or replace function public.messages_set_edited_at()
returns trigger
language plpgsql
as $$
begin
  if new.content is distinct from old.content then
    new.edited_at = now();
  end if;
  return new;
end;
$$;

create trigger messages_set_edited_at
  before update of content on public.messages
  for each row execute function public.messages_set_edited_at();

-- ── Realtime ──────────────────────────────────────────────────────────────────
-- El cliente se suscribe a postgres_changes de messages (stream persistente) y a
-- chat_participants (last_read_at / nuevos chats).
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.chat_participants;
