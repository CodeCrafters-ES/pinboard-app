import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';

import { currentMonthRangeMadrid, currentWeekRangeMadrid, type DateRange } from './dateRange';

export type LeaderboardPeriod = 'weekly' | 'monthly';

export type LeaderboardEntry =
  Database['public']['Functions']['leaderboard']['Returns'][number];

export const DEFAULT_LEADERBOARD_LIMIT = 20;

export function rangeForPeriod(period: LeaderboardPeriod, now: Date = new Date()): DateRange {
  return period === 'weekly' ? currentWeekRangeMadrid(now) : currentMonthRangeMadrid(now);
}

// La RPC devuelve el top N ordenado por puesto y, si el usuario queda fuera, una
// fila extra al final con su posición real. No se filtra ni se reordena aquí: el
// orden viene ya resuelto en SQL (puntos desc, desempate por primer awarded_at).
export async function getLeaderboard(
  period: LeaderboardPeriod,
  limit: number = DEFAULT_LEADERBOARD_LIMIT,
  now: Date = new Date(),
): Promise<LeaderboardEntry[]> {
  const { start, end } = rangeForPeriod(period, now);

  const { data, error } = await supabase.rpc('leaderboard', {
    period_start: start.toISOString(),
    period_end: end.toISOString(),
    limit_n: limit,
  });

  if (error) throw error;
  return data ?? [];
}

export function getWeeklyLeaderboard(limit: number = DEFAULT_LEADERBOARD_LIMIT) {
  return getLeaderboard('weekly', limit);
}

export function getMonthlyLeaderboard(limit: number = DEFAULT_LEADERBOARD_LIMIT) {
  return getLeaderboard('monthly', limit);
}

// Separa el top de la fila propia añadida por la RPC: el cliente la pinta bajo un
// divider ("Tu posición") en vez de dentro de la lista.
//
// El criterio es el mismo que aplica el SQL (`rnk > limit_n` en la rama de la fila
// propia), no la distancia entre puestos: con el top a 20 y el usuario en el 21 la
// diferencia es de un solo puesto y sería indistinguible de una fila normal.
export function splitSelfBelowTop(
  entries: LeaderboardEntry[],
  limit: number = DEFAULT_LEADERBOARD_LIMIT,
): { top: LeaderboardEntry[]; selfBelowTop: LeaderboardEntry | null } {
  const last = entries[entries.length - 1];
  if (!last) return { top: [], selfBelowTop: null };

  return last.is_self && last.rank > limit
    ? { top: entries.slice(0, -1), selfBelowTop: last }
    : { top: entries, selfBelowTop: null };
}
