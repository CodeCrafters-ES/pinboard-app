import type { SupabaseClient } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';

// Métricas de engagement por post para el dashboard (F-N04-03 / #182).
// Lee la vista public.post_engagement_daily (respaldada por la materializada, con
// lag máximo de 1h) — nunca engagement_sessions cruda. El acceso lo impone Postgres:
// la vista lleva el guard is_manager(), así que a staff le devuelve 0 filas.

export type PostEngagement = {
  post_id: string;
  title: string;
  unique_readers: number;
  unique_clicks: number;
  click_rate: number | null; // null si el post no tuvo lectores en el periodo
  avg_rating: number | null;
  total_reactions: number;
  // ADR-001: interactuaron (reacción/valoración/comentario) sin clicar el enlace.
  engaged_users: number;
  // Señales opcionales (ADR-0006): pueden no estar informadas.
  avg_seconds: number | null;
  avg_scroll: number | null;
};

export const DEFAULT_DAYS = 30;

type Totals = {
  readers: number;
  clicks: number;
  reactions: number;
  engaged: number;
  ratingSum: number;
  ratingCount: number;
  secondsSum: number;
  scrollSum: number;
};

function emptyTotals(): Totals {
  return {
    readers: 0,
    clicks: 0,
    reactions: 0,
    engaged: 0,
    ratingSum: 0,
    ratingCount: 0,
    secondsSum: 0,
    scrollSum: 0,
  };
}

export async function listPostEngagement({
  days = DEFAULT_DAYS,
  client = supabase,
}: {
  days?: number;
  client?: SupabaseClient<Database>;
} = {}): Promise<PostEngagement[]> {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const { data: daily, error } = await client
    .from('post_engagement_daily')
    .select(
      'post_id, unique_readers, unique_clicks, avg_rating, total_ratings, total_reactions, engaged_users, avg_seconds, avg_scroll',
    )
    .gte('day', cutoff);
  if (error) throw error;

  const totals = new Map<string, Totals>();
  for (const row of daily ?? []) {
    if (!row.post_id) continue;
    const t = totals.get(row.post_id) ?? emptyTotals();
    const readers = row.unique_readers ?? 0;

    // Sumar unique_readers entre días es correcto porque engagement_sessions guarda
    // 1 fila por (user_id, post_id): cada usuario cae en un único día por post, así
    // que no hay doble conteo al agregar el periodo. engaged_users cumple lo mismo
    // porque la vista imputa cada usuario al día de su primera interacción.
    t.readers += readers;
    t.clicks += row.unique_clicks ?? 0;
    t.reactions += row.total_reactions ?? 0;
    t.engaged += row.engaged_users ?? 0;

    // Medias ponderadas: avg_rating pesa por nº de valoraciones de ese día; las
    // señales de comportamiento pesan por nº de sesiones (= lectores) de ese día.
    const ratings = row.total_ratings ?? 0;
    t.ratingSum += (row.avg_rating ?? 0) * ratings;
    t.ratingCount += ratings;
    t.secondsSum += (row.avg_seconds ?? 0) * readers;
    t.scrollSum += (row.avg_scroll ?? 0) * readers;

    totals.set(row.post_id, t);
  }

  const postIds = [...totals.keys()];
  if (postIds.length === 0) return [];

  const { data: posts, error: postsError } = await client
    .from('posts')
    .select('id, title')
    .in('id', postIds);
  if (postsError) throw postsError;

  const titles = new Map((posts ?? []).map((p) => [p.id, p.title]));

  return postIds
    .map((postId) => {
      const t = totals.get(postId)!;
      return {
        post_id: postId,
        title: titles.get(postId) ?? 'Post eliminado',
        unique_readers: t.readers,
        unique_clicks: t.clicks,
        click_rate: t.readers > 0 ? t.clicks / t.readers : null,
        avg_rating: t.ratingCount > 0 ? t.ratingSum / t.ratingCount : null,
        total_reactions: t.reactions,
        engaged_users: t.engaged,
        avg_seconds: t.readers > 0 ? t.secondsSum / t.readers : null,
        avg_scroll: t.readers > 0 ? t.scrollSum / t.readers : null,
      };
    })
    .sort((a, b) => b.unique_clicks - a.unique_clicks || b.unique_readers - a.unique_readers);
}
