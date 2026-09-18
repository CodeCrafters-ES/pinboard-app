import { eventSchema } from '@/lib/validation/eventSchema';

const VALID = {
  title: 'Reunión de equipo',
  description: 'Repaso semanal',
  location: 'Sala principal',
  all_day: false,
  event_start_at: '2026-08-01T09:00:00.000Z',
  event_end_at: '2026-08-01T10:00:00.000Z',
  color_tag: 'brown' as const,
  image_url: null,
};

describe('eventSchema', () => {
  it('accepts a valid event', () => {
    const result = eventSchema.safeParse(VALID);
    expect(result.success).toBe(true);
  });

  it('rejects an empty title', () => {
    const result = eventSchema.safeParse({ ...VALID, title: '' });
    expect(result.success).toBe(false);
  });

  it('rejects a title over 200 chars', () => {
    const result = eventSchema.safeParse({ ...VALID, title: 'x'.repeat(201) });
    expect(result.success).toBe(false);
  });

  it('rejects a description over 5000 chars', () => {
    const result = eventSchema.safeParse({ ...VALID, description: 'y'.repeat(5001) });
    expect(result.success).toBe(false);
  });

  it('rejects when end is not after start', () => {
    const result = eventSchema.safeParse({
      ...VALID,
      event_start_at: '2026-08-01T10:00:00.000Z',
      event_end_at: '2026-08-01T10:00:00.000Z',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === 'event_end_at')).toBe(true);
    }
  });

  it('rejects an unknown color_tag', () => {
    const result = eventSchema.safeParse({ ...VALID, color_tag: 'purple' });
    expect(result.success).toBe(false);
  });

  it('allows optional description/location to be omitted', () => {
    const rest = {
      title: VALID.title,
      all_day: VALID.all_day,
      event_start_at: VALID.event_start_at,
      event_end_at: VALID.event_end_at,
      color_tag: VALID.color_tag,
    };
    const result = eventSchema.safeParse(rest);
    expect(result.success).toBe(true);
  });
});
