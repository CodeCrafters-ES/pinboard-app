-- Migration: N05-01-01 — Completar esquema events (aditiva)
-- Precondition: 20260618300000_create_events_table.sql (scaffold events + trigger)
-- Note: la corrección de RLS (manager own) va en 20260716000001_rls_events_n05_01_03.sql

-- ── 1. Enum de color (paleta de eventos de DESIGN.md) ────────────────────────
create type event_color as enum ('brown', 'sea', 'sage', 'amber', 'parchment');

-- ── 2. Columnas nuevas ────────────────────────────────────────────────────────
alter table public.events
  add column all_day   boolean     not null default false,
  add column color_tag event_color not null default 'brown';

-- ── 3. Constraints de longitud sobre columnas existentes ─────────────────────
alter table public.events
  add constraint events_title_length       check (char_length(title) between 1 and 200),
  add constraint events_description_length check (char_length(description) <= 5000),
  add constraint events_location_length    check (char_length(location) <= 200);

-- ── 4. Conservar eventos si se elimina el autor (decisión 2026-07-16) ────────
alter table public.events
  alter column author_id drop not null;

alter table public.events
  drop constraint events_author_id_fkey;

alter table public.events
  add constraint events_author_id_fkey
  foreign key (author_id) references auth.users(id) on delete set null;

-- ── 5. Índice por color ───────────────────────────────────────────────────────
create index events_color_tag_idx on public.events (color_tag);

-- ── 6. Comentarios de semántica ───────────────────────────────────────────────
comment on column public.events.event_start_at is
  'Rango semántico [event_start_at, event_end_at): inicio inclusivo, fin exclusivo';
comment on column public.events.all_day is
  'Evento de día completo: la UI oculta las horas y normaliza a 00:00 – 23:59:59.999';
comment on column public.events.color_tag is
  'Etiqueta de color (DESIGN.md): brown=reuniones, sea=formaciones, sage=eventos externos, amber=urgente, parchment=cierre de temporada';
comment on column public.events.author_id is
  'NULL si el autor fue eliminado (on delete set null); los eventos huérfanos solo puede editarlos/borrarlos un admin';
