import { describe, expect, it } from 'vitest';

import { parseEnv } from '../env.js';

const validSource = {
  MONGODB_URI: 'mongodb://localhost:27017/quicktable?replicaSet=rs0',
  REDIS_URL: 'redis://localhost:6379',
  JWT_SECRET: 'a'.repeat(32),
  SMTP_HOST: 'smtp-relay.brevo.com',
  SMTP_PORT: '587',
  SMTP_USER: 'smtp-user',
  SMTP_PASS: 'smtp-pass',
  SMTP_FROM: 'Quick Table <test@example.com>',
};

describe('parseEnv', () => {
  it('accepte une configuration valide et applique les valeurs par défaut', () => {
    const env = parseEnv(validSource);

    expect(env.MONGODB_URI).toBe(validSource.MONGODB_URI);
    expect(env.REDIS_URL).toBe(validSource.REDIS_URL);
    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3000);
  });

  it("convertit PORT en nombre lorsqu'il est fourni", () => {
    const env = parseEnv({ ...validSource, PORT: '4000' });

    expect(env.PORT).toBe(4000);
  });

  it.each([
    'MONGODB_URI',
    'REDIS_URL',
    'JWT_SECRET',
    'SMTP_HOST',
    'SMTP_PORT',
    'SMTP_USER',
    'SMTP_PASS',
    'SMTP_FROM',
  ])('refuse de démarrer si %s est absent', (key) => {
    const source = { ...validSource };
    delete (source as Record<string, string>)[key];

    expect(() => parseEnv(source)).toThrow(/Configuration invalide/);
  });

  it('refuse une valeur NODE_ENV hors de la liste autorisée', () => {
    expect(() => parseEnv({ ...validSource, NODE_ENV: 'preprod' })).toThrow(
      /Configuration invalide/,
    );
  });

  it('refuse un PORT non numérique', () => {
    expect(() => parseEnv({ ...validSource, PORT: 'abc' })).toThrow(/Configuration invalide/);
  });

  it('refuse un JWT_SECRET de moins de 32 caractères (doc 07 §7.1)', () => {
    expect(() => parseEnv({ ...validSource, JWT_SECRET: 'trop-court' })).toThrow(
      /Configuration invalide/,
    );
  });

  it('convertit SMTP_PORT en nombre (doc 04 §4.1)', () => {
    const env = parseEnv(validSource);

    expect(env.SMTP_PORT).toBe(587);
  });
});
