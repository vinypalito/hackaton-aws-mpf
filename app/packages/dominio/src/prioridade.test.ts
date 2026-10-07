import { describe, expect, it } from 'vitest';
import { calcularPontuacao, classificarPrioridade, type EntradaPontuacao } from './prioridade.js';

const base: EntradaPontuacao = {
  caixa: 'NO_SETOR',
  situacao: 'EM_ANALISE',
  statusPrazo: 'NO_PRAZO',
  urgente: false,
  motivoUrgencia: 'Nenhum',
  novaIntimacao: false,
  tempoParadoDias: 2,
};

const soma = (itens: { pontos: number }[]) => itens.reduce((s, i) => s + i.pontos, 0);

describe('calcularPontuacao (RN2)', () => {
  it('EXP000001 do seed: vencido, A_RECEBER → 50, ALTA', () => {
    const r = calcularPontuacao({ ...base, caixa: 'A_RECEBER', situacao: 'AGUARDANDO_RECEBIMENTO', statusPrazo: 'VENCIDO' });
    expect(r).toMatchObject({ total: 50, faixa: 'ALTA' });
  });

  it('EXP000002 do seed: no prazo → 5, BAIXA', () => {
    expect(calcularPontuacao(base)).toMatchObject({ total: 5, faixa: 'BAIXA' });
  });

  it('explica a composição: vencido +50, urgente (réu preso) +30 → 80, CRITICA', () => {
    const r = calcularPontuacao({ ...base, statusPrazo: 'VENCIDO', urgente: true, motivoUrgencia: 'Réu preso' });
    expect(r.total).toBe(80);
    expect(r.faixa).toBe('CRITICA');
    expect(r.composicao).toEqual([
      { codigo: 'PRAZO_VENCIDO', descricao: 'Prazo vencido', pontos: 50 },
      { codigo: 'URGENTE', descricao: 'Urgente (réu preso)', pontos: 30 },
    ]);
  });

  it('soma nova intimação, tempo parado > 30 e aguardando assinatura', () => {
    const r = calcularPontuacao({
      ...base,
      statusPrazo: 'ATENCAO',
      novaIntimacao: true,
      tempoParadoDias: 31,
      situacao: 'AGUARDANDO_ASSINATURA',
    });
    expect(r.total).toBe(20 + 10 + 10 + 5);
    expect(soma(r.composicao)).toBe(r.total);
  });

  it('tempo parado de exatamente 30 dias não pontua', () => {
    expect(calcularPontuacao({ ...base, tempoParadoDias: 30 }).total).toBe(5);
  });

  it('ENVIADO_NAO_RECEBIDO divide pela metade com divisão inteira', () => {
    // 45 + 10 = 55 → 27
    const r = calcularPontuacao({ ...base, caixa: 'ENVIADO_NAO_RECEBIDO', statusPrazo: 'VENCE_HOJE', tempoParadoDias: 40 });
    expect(r.total).toBe(27);
    expect(r.faixa).toBe('MEDIA');
    expect(r.composicao.at(-1)).toMatchObject({ codigo: 'ENVIADO_NAO_RECEBIDO', pontos: -28 });
    expect(soma(r.composicao)).toBe(27);
  });

  it('limita a 100 pontos (máximo teórico 105)', () => {
    const r = calcularPontuacao({
      ...base,
      statusPrazo: 'VENCIDO',
      urgente: true,
      novaIntimacao: true,
      tempoParadoDias: 60,
      situacao: 'AGUARDANDO_ASSINATURA',
    });
    expect(r.total).toBe(100);
    expect(soma(r.composicao)).toBe(100);
  });

  it('baixados pontuam 0 e ficam BAIXA', () => {
    const r = calcularPontuacao({ ...base, caixa: 'BAIXADO', statusPrazo: 'CUMPRIDO', urgente: true });
    expect(r).toMatchObject({ total: 0, faixa: 'BAIXA' });
  });

  it('deriva o status de diasRestantes quando statusPrazo não vem', () => {
    const { statusPrazo: _ignorado, ...semStatus } = base;
    expect(calcularPontuacao({ ...semStatus, diasRestantes: 2 }).total).toBe(35);
  });
});

describe('classificarPrioridade', () => {
  it.each([
    [100, 'CRITICA'],
    [60, 'CRITICA'],
    [59, 'ALTA'],
    [35, 'ALTA'],
    [34, 'MEDIA'],
    [20, 'MEDIA'],
    [19, 'BAIXA'],
    [0, 'BAIXA'],
  ] as const)('%i → %s', (total, faixa) => {
    expect(classificarPrioridade(total)).toBe(faixa);
  });
});
