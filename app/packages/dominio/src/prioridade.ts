/**
 * Pontuação de prioridade explicável (RN2, Req. 8.2 e 8.4).
 * Mesma regra de `pontuar_prioridade` e `nivel_prioridade` do gerador do seed.
 */
import { classificarPrazo, type Caixa, type StatusPrazo, type StatusPrazoAtivo } from './prazo.js';

/** Faixas do catálogo `PRIORIDADE`. */
export type FaixaPrioridade = 'CRITICA' | 'ALTA' | 'MEDIA' | 'BAIXA';

/** Campos do expediente usados pela RN2 (nomes iguais aos de `expedientes.csv`). */
export interface EntradaPontuacao {
  caixa: Caixa;
  situacao: string;
  statusPrazo?: StatusPrazo;
  /** Usado para derivar o `statusPrazo` quando ele não vier preenchido. */
  diasRestantes?: number;
  urgente: boolean;
  motivoUrgencia?: string;
  novaIntimacao: boolean;
  tempoParadoDias: number;
}

/** Item da composição exibida em "Por que esta prioridade?". */
export interface ItemComposicao {
  codigo: string;
  descricao: string;
  /** Pontos somados (positivos) ou retirados (negativos) pelo item. */
  pontos: number;
}

export interface Pontuacao {
  total: number;
  faixa: FaixaPrioridade;
  /** A soma dos `pontos` é sempre igual a `total`. */
  composicao: ItemComposicao[];
}

/** Pontos por situação de prazo (RN2). */
export const PONTOS_STATUS_PRAZO: Readonly<Record<StatusPrazoAtivo, number>> = {
  VENCIDO: 50,
  VENCE_HOJE: 45,
  CRITICO: 35,
  ATENCAO: 20,
  NO_PRAZO: 5,
};

const DESCRICAO_PRAZO: Readonly<Record<StatusPrazoAtivo, string>> = {
  VENCIDO: 'Prazo vencido',
  VENCE_HOJE: 'Vence hoje',
  CRITICO: 'Vence em até 3 dias',
  ATENCAO: 'Vence em até 7 dias',
  NO_PRAZO: 'No prazo',
};

export const PONTOS_URGENTE = 30;
export const PONTOS_NOVA_INTIMACAO = 10;
export const PONTOS_TEMPO_PARADO = 10;
export const LIMITE_TEMPO_PARADO_DIAS = 30;
export const PONTOS_AGUARDANDO_ASSINATURA = 5;
export const PONTUACAO_MAXIMA = 100;

/** Classifica a pontuação: `CRITICA` ≥ 60, `ALTA` ≥ 35, `MEDIA` ≥ 20, senão `BAIXA`. */
export function classificarPrioridade(total: number): FaixaPrioridade {
  if (total >= 60) return 'CRITICA';
  if (total >= 35) return 'ALTA';
  if (total >= 20) return 'MEDIA';
  return 'BAIXA';
}

function statusAtivo(exp: EntradaPontuacao): StatusPrazoAtivo {
  const status = exp.statusPrazo;
  if (status !== undefined && status in PONTOS_STATUS_PRAZO) {
    return status as StatusPrazoAtivo;
  }
  if (exp.diasRestantes === undefined) {
    throw new Error('Expediente ativo sem statusPrazo nem diasRestantes válidos');
  }
  return classificarPrazo(exp.diasRestantes);
}

function descricaoUrgente(motivo?: string): string {
  if (!motivo || motivo === 'Nenhum') return 'Urgente';
  return `Urgente (${motivo.charAt(0).toLocaleLowerCase('pt-BR')}${motivo.slice(1)})`;
}

/**
 * Calcula a pontuação RN2 com a composição explicável.
 * Baixados: 0 e `BAIXA`. `ENVIADO_NAO_RECEBIDO`: metade (divisão inteira). Teto de 100.
 */
export function calcularPontuacao(exp: EntradaPontuacao): Pontuacao {
  if (exp.caixa === 'BAIXADO') {
    return {
      total: 0,
      faixa: 'BAIXA',
      composicao: [{ codigo: 'BAIXADO', descricao: 'Expediente baixado não pontua', pontos: 0 }],
    };
  }

  const status = statusAtivo(exp);
  const composicao: ItemComposicao[] = [
    { codigo: `PRAZO_${status}`, descricao: DESCRICAO_PRAZO[status], pontos: PONTOS_STATUS_PRAZO[status] },
  ];
  if (exp.urgente) {
    composicao.push({ codigo: 'URGENTE', descricao: descricaoUrgente(exp.motivoUrgencia), pontos: PONTOS_URGENTE });
  }
  if (exp.novaIntimacao) {
    composicao.push({ codigo: 'NOVA_INTIMACAO', descricao: 'Nova intimação', pontos: PONTOS_NOVA_INTIMACAO });
  }
  if (exp.tempoParadoDias > LIMITE_TEMPO_PARADO_DIAS) {
    composicao.push({
      codigo: 'TEMPO_PARADO',
      descricao: `Parado há mais de ${LIMITE_TEMPO_PARADO_DIAS} dias`,
      pontos: PONTOS_TEMPO_PARADO,
    });
  }
  if (exp.situacao === 'AGUARDANDO_ASSINATURA') {
    composicao.push({
      codigo: 'AGUARDANDO_ASSINATURA',
      descricao: 'Aguardando assinatura',
      pontos: PONTOS_AGUARDANDO_ASSINATURA,
    });
  }

  let total = composicao.reduce((soma, item) => soma + item.pontos, 0);
  if (exp.caixa === 'ENVIADO_NAO_RECEBIDO') {
    const metade = Math.floor(total / 2);
    composicao.push({
      codigo: 'ENVIADO_NAO_RECEBIDO',
      descricao: 'Enviado e não recebido: metade da pontuação',
      pontos: metade - total,
    });
    total = metade;
  }
  if (total > PONTUACAO_MAXIMA) {
    composicao.push({ codigo: 'TETO', descricao: `Limite de ${PONTUACAO_MAXIMA} pontos`, pontos: PONTUACAO_MAXIMA - total });
    total = PONTUACAO_MAXIMA;
  }

  return { total, faixa: classificarPrioridade(total), composicao };
}
