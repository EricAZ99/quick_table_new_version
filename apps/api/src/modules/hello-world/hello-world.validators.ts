import { z } from 'zod';

/** Schéma Zod (doc 12 §12.2, doc 09 §9.1) — réutilisable par un futur `validate.middleware.ts` (Epic 1+, pas encore écrit). */
export const createHelloWorldSchema = z.object({
  message: z
    .string()
    .trim()
    .min(1, 'message est requis')
    .max(200, 'message dépasse 200 caractères'),
});

export type CreateHelloWorldDto = z.infer<typeof createHelloWorldSchema>;
