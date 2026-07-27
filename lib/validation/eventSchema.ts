import { z } from 'zod';

export const EVENT_COLORS = ['brown', 'sea', 'sage', 'amber', 'parchment'] as const;

export const eventSchema = z
  .object({
    title: z.string().min(1, 'El título es obligatorio').max(200, 'Máximo 200 caracteres'),
    description: z.string().max(5000, 'Máximo 5.000 caracteres').optional(),
    location: z.string().max(200, 'Máximo 200 caracteres').optional(),
    all_day: z.boolean(),
    event_start_at: z.string().datetime('Fecha de inicio no válida'),
    event_end_at: z.string().datetime('Fecha de fin no válida'),
    color_tag: z.enum(EVENT_COLORS),
    image_url: z.string().optional().nullable(),
  })
  .refine((d) => new Date(d.event_end_at) > new Date(d.event_start_at), {
    message: 'La fecha de fin debe ser posterior a la de inicio',
    path: ['event_end_at'],
  });

export type EventFormData = z.infer<typeof eventSchema>;
