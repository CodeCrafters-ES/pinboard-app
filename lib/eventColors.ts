import type { Database } from '@/lib/database.types';

export type EventColor = Database['public']['Enums']['event_color'];

// Paleta de eventos de DESIGN.md ("Calendario — Event Color Tags"). Los tags
// mapean a hex explícitos (no todos existen como token nun-* de Tailwind, y el
// tag "parchment" usa #A07850, distinto de nun-parchment), por eso se aplican
// vía style en los chips/puntos de color en lugar de className.
export const EVENT_COLOR_META: Record<EventColor, { hex: string; label: string }> = {
  brown: { hex: '#7D5A3A', label: 'Reuniones internas' },
  sea: { hex: '#5B97B4', label: 'Formaciones / briefings' },
  sage: { hex: '#7A9060', label: 'Eventos externos' },
  amber: { hex: '#D4A84B', label: 'Urgente / importante' },
  parchment: { hex: '#A07850', label: 'Cierre de temporada' },
};

export const EVENT_COLORS = Object.keys(EVENT_COLOR_META) as EventColor[];
