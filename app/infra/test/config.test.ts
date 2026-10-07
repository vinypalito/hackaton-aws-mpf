import { App } from 'aws-cdk-lib';
import { describe, expect, it } from 'vitest';
import { DATA_REFERENCIA_PADRAO, obterAmbienteLambdas } from '../lib/config.js';

describe('obterAmbienteLambdas', () => {
  it('define DATA_REFERENCIA=2026-10-07T17:00:00-03:00 por padrão (Req. 2.6)', () => {
    expect(DATA_REFERENCIA_PADRAO).toBe('2026-10-07T17:00:00-03:00');
    expect(obterAmbienteLambdas(new App().node)).toEqual({ DATA_REFERENCIA: '2026-10-07T17:00:00-03:00' });
  });

  it('aceita sobrescrita pelo contexto -c dataReferencia=...', () => {
    const app = new App({ context: { dataReferencia: '2026-10-08T07:00:00-03:00' } });
    expect(obterAmbienteLambdas(app.node).DATA_REFERENCIA).toBe('2026-10-08T07:00:00-03:00');
  });

  it('rejeita data sem fuso ou inválida', () => {
    for (const valor of ['2026-10-07T17:00:00', 'amanhã', '2026-13-40T99:00:00Z']) {
      const app = new App({ context: { dataReferencia: valor } });
      expect(() => obterAmbienteLambdas(app.node)).toThrow(/dataReferencia/);
    }
  });
});
