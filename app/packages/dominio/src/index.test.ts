import { describe, expect, it } from 'vitest';
import { DATA_REFERENCIA_PADRAO, obterDataReferencia } from './index.js';

describe('obterDataReferencia', () => {
  it('usa 07/10/2026 17:00 (-03:00) por padrão', () => {
    expect(obterDataReferencia().toISOString()).toBe('2026-10-07T20:00:00.000Z');
    expect(DATA_REFERENCIA_PADRAO).toBe('2026-10-07T17:00:00-03:00');
  });

  it('rejeita texto que não é data', () => {
    expect(() => obterDataReferencia('nao-e-data')).toThrow('Data de referência inválida');
  });
});
