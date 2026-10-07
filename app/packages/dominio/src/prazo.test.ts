import { describe, expect, it } from 'vitest';
import { calcularStatusPrazo, classificarPrazo, diasEntre } from './prazo.js';

describe('calcularStatusPrazo — ativos (RN1)', () => {
  it.each([
    [-5, 'VENCIDO'],
    [-1, 'VENCIDO'],
    [0, 'VENCE_HOJE'],
    [1, 'CRITICO'],
    [3, 'CRITICO'],
    [4, 'ATENCAO'],
    [7, 'ATENCAO'],
    [8, 'NO_PRAZO'],
    [28, 'NO_PRAZO'],
  ] as const)('%i dias restantes → %s', (dias, esperado) => {
    expect(calcularStatusPrazo(dias, 'NO_SETOR')).toBe(esperado);
    expect(calcularStatusPrazo(dias, 'A_RECEBER')).toBe(esperado);
    expect(calcularStatusPrazo(dias, 'ENVIADO_NAO_RECEBIDO')).toBe(esperado);
  });

  it('rejeita dias não inteiros', () => {
    expect(() => classificarPrazo(1.5)).toThrow();
  });
});

describe('calcularStatusPrazo — baixados', () => {
  it('usa o sinal de diasRestantes quando não há datas', () => {
    expect(calcularStatusPrazo(0, 'BAIXADO')).toBe('CUMPRIDO');
    expect(calcularStatusPrazo(3, 'BAIXADO')).toBe('CUMPRIDO');
    expect(calcularStatusPrazo(-1, 'BAIXADO')).toBe('CUMPRIDO_COM_ATRASO');
  });

  it('compara dataPrazo com a data civil de encerramento', () => {
    const noPrazo = { dataPrazo: '2026-09-10', dataEncerramento: '2026-09-10T23:30:00-03:00' };
    const atrasado = { dataPrazo: '2026-09-10', dataEncerramento: '2026-09-11T08:00:00-03:00' };
    // As datas prevalecem sobre diasRestantes.
    expect(calcularStatusPrazo(-99, 'BAIXADO', noPrazo)).toBe('CUMPRIDO');
    expect(calcularStatusPrazo(99, 'BAIXADO', atrasado)).toBe('CUMPRIDO_COM_ATRASO');
  });

  it('diasEntre conta dias civis', () => {
    expect(diasEntre('2026-10-06', '2026-10-01T22:00:00-03:00')).toBe(5);
    expect(diasEntre('2026-03-01', '2026-02-28')).toBe(1);
  });
});
