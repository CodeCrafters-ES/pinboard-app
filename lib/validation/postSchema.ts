import { z } from 'zod';

export const postSchema = z.object({
  title: z.string().min(1, 'El título es obligatorio').max(200, 'Máximo 200 caracteres'),
  subtitle: z.string().max(200, 'Máximo 200 caracteres').optional(),
  external_url: z
    .string()
    .min(1, 'La URL externa es obligatoria')
    .url('Introduce una URL válida')
    .regex(/^https?:\/\//, 'Debe comenzar con http:// o https://'),
  body: z.string().max(20000, 'Máximo 20.000 caracteres').optional(),
  status: z.enum(['draft', 'published']),
});

export type PostFormData = z.infer<typeof postSchema>;
