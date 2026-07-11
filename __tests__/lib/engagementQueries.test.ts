import type { SupabaseClient } from '@supabase/supabase-js';

import { listPostEngagement } from '@/lib/supabase/queries/engagement';
import type { Database } from '@/lib/database.types';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

type DailyRow = {
  post_id: string;
  unique_readers: number | null;
  unique_clicks: number | null;
  avg_rating: number | null;
  total_ratings: number | null;
  total_reactions: number | null;
  engaged_users: number | null;
  avg_seconds: number | null;
  avg_scroll: number | null;
};

const gte = jest.fn();
const inFilter = jest.fn();

function fakeClient(daily: DailyRow[], posts: { id: string; title: string }[]) {
  gte.mockResolvedValue({ data: daily, error: null });
  inFilter.mockResolvedValue({ data: posts, error: null });

  return {
    from: (table: string) =>
      table === 'post_engagement_daily'
        ? { select: () => ({ gte }) }
        : { select: () => ({ in: inFilter }) },
  } as unknown as SupabaseClient<Database>;
}

beforeEach(() => jest.clearAllMocks());

describe('listPostEngagement', () => {
  it('aggregates a post across days with weighted averages', async () => {
    const client = fakeClient(
      [
        {
          post_id: 'p1',
          unique_readers: 2,
          unique_clicks: 1,
          avg_rating: 4,
          total_ratings: 2,
          total_reactions: 1,
          engaged_users: 1,
          avg_seconds: 15,
          avg_scroll: 0.6,
        },
        {
          post_id: 'p1',
          unique_readers: 3,
          unique_clicks: 2,
          avg_rating: 2,
          total_ratings: 1,
          total_reactions: 2,
          engaged_users: 2,
          avg_seconds: 5,
          avg_scroll: 0.2,
        },
      ],
      [{ id: 'p1', title: 'Noticia 1' }],
    );

    const [row] = await listPostEngagement({ client });

    expect(row).toMatchObject({
      post_id: 'p1',
      title: 'Noticia 1',
      unique_readers: 5, // 2 + 3
      unique_clicks: 3, // 1 + 2
      total_reactions: 3, // 1 + 2
      // La vista imputa cada usuario engaged a su primer día, así que sumar no dobla.
      engaged_users: 3, // 1 + 2
    });
    expect(row!.click_rate).toBeCloseTo(3 / 5);
    // avg_rating pondera por nº de valoraciones: (4*2 + 2*1) / 3
    expect(row!.avg_rating).toBeCloseTo(10 / 3);
    // las señales opcionales ponderan por nº de sesiones: (15*2 + 5*3) / 5
    expect(row!.avg_seconds).toBeCloseTo(9);
    expect(row!.avg_scroll).toBeCloseTo((0.6 * 2 + 0.2 * 3) / 5);
  });

  it('leaves click_rate and avg_rating as null when there is nothing to divide by', async () => {
    const client = fakeClient(
      [
        {
          post_id: 'p1',
          unique_readers: 0,
          unique_clicks: 0,
          avg_rating: null,
          total_ratings: 0,
          total_reactions: 2,
          engaged_users: 0,
          avg_seconds: null,
          avg_scroll: null,
        },
      ],
      [{ id: 'p1', title: 'Sin lectores' }],
    );

    const [row] = await listPostEngagement({ client });

    expect(row).toMatchObject({
      unique_readers: 0,
      click_rate: null,
      avg_rating: null,
      avg_seconds: null,
      total_reactions: 2,
    });
  });

  it('sorts by unique_clicks descending', async () => {
    const base = {
      unique_readers: 10,
      avg_rating: null,
      total_ratings: 0,
      total_reactions: 0,
      engaged_users: 0,
      avg_seconds: null,
      avg_scroll: null,
    };
    const client = fakeClient(
      [
        { post_id: 'p1', unique_clicks: 1, ...base },
        { post_id: 'p2', unique_clicks: 7, ...base },
        { post_id: 'p3', unique_clicks: 3, ...base },
      ],
      [
        { id: 'p1', title: 'Uno' },
        { id: 'p2', title: 'Dos' },
        { id: 'p3', title: 'Tres' },
      ],
    );

    const rows = await listPostEngagement({ client });

    expect(rows.map((r) => r.post_id)).toEqual(['p2', 'p3', 'p1']);
  });

  it('returns an empty list without querying posts when there is no activity', async () => {
    const client = fakeClient([], []);

    await expect(listPostEngagement({ client })).resolves.toEqual([]);
    expect(inFilter).not.toHaveBeenCalled();
  });
});
