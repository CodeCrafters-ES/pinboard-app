-- Migration: N06-01-01 — Completar esquema push_tokens (aditiva)
-- Precondition: 20260618700000_create_push_tokens_table.sql (tabla),
--               20260618800000_rls_push_tokens.sql (RLS own, sin cambios)

alter table public.push_tokens
  add column device_name  text,
  add column last_seen_at timestamptz not null default now();

-- Para la purga por antigüedad (>60 días sin actividad, Documentos esenciales)
create index push_tokens_last_seen_idx on public.push_tokens (last_seen_at);

comment on column public.push_tokens.device_name is
  'Modelo del dispositivo (opcional, solo para debug)';
comment on column public.push_tokens.last_seen_at is
  'Último registro/refresh del token; tokens con >60 días se purgan';
