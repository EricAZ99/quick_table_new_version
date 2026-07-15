import { describe, expect, it } from 'vitest';

import { createHelloWorldSchema } from '../hello-world.validators.js';

describe('createHelloWorldSchema', () => {
  it('accepte un message valide', () => {
    const result = createHelloWorldSchema.safeParse({ message: 'Hello QuickTable' });

    expect(result.success).toBe(true);
  });

  it('rejette un message vide', () => {
    const result = createHelloWorldSchema.safeParse({ message: '' });

    expect(result.success).toBe(false);
  });

  it('rejette un message manquant', () => {
    const result = createHelloWorldSchema.safeParse({});

    expect(result.success).toBe(false);
  });

  it('rejette un message de plus de 200 caractères', () => {
    const result = createHelloWorldSchema.safeParse({ message: 'a'.repeat(201) });

    expect(result.success).toBe(false);
  });

  it('trim les espaces superflus', () => {
    const result = createHelloWorldSchema.safeParse({ message: '  Hello  ' });

    expect(result.success && result.data.message).toBe('Hello');
  });
});
