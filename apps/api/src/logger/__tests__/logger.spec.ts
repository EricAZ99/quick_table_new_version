import { describe, expect, it } from 'vitest';

import { logger, resolveLogLevel } from '../logger.js';

describe('resolveLogLevel', () => {
  it('utilise trace en développement (logs détaillés en local)', () => {
    expect(resolveLogLevel('development')).toBe('trace');
  });

  it('utilise info en staging et production', () => {
    expect(resolveLogLevel('staging')).toBe('info');
    expect(resolveLogLevel('production')).toBe('info');
  });

  it('coupe les logs en environnement de test', () => {
    expect(resolveLogLevel('test')).toBe('silent');
  });

  it('retombe sur info pour une valeur inconnue', () => {
    expect(resolveLogLevel('preprod')).toBe('info');
  });
});

describe('logger', () => {
  it('expose une instance pino fonctionnelle', () => {
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.child).toBe('function');
  });

  it('permet de créer un logger enfant lié à un correlationId', () => {
    const child = logger.child({ correlationId: 'test-correlation-id' });

    expect(child).toBeDefined();
    expect(typeof child.info).toBe('function');
  });
});
