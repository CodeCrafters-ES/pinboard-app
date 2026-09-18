import type { Database, Tables } from './database.types';

export type UserRole   = Database['public']['Enums']['user_role'];
export type PostStatus = 'draft' | 'published';
export type Post       = Tables<'posts'>;
export type Event      = Tables<'events'>;
export type EventColor = Database['public']['Enums']['event_color'];

// Subconjunto de columnas para listas/calendario (query eficiente por rango).
// El detalle usa la fila completa `Event`.
export type EventListItem = Pick<
  Event,
  'id' | 'title' | 'event_start_at' | 'event_end_at' | 'all_day' | 'color_tag' | 'location'
>;
