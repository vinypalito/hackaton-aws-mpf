/**
 * Formatação de datas (pt-BR, fuso America/Sao_Paulo) e rótulos de domínio
 * usados pelas telas. Funções puras, sem dependência do Angular.
 */

const FUSO = 'America/Sao_Paulo';

const formatadorDataHora = new Intl.DateTimeFormat('pt-BR', {
  timeZone: FUSO,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

const SO_DATA = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * "2026-10-06" → "06/10/2026" (data civil, sem conversão de fuso);
 * "2026-10-05T03:58:00-03:00" → "05/10/2026, 03:58" no fuso de Brasília.
 * Vazio ou inválido → "—".
 */
export function formatarData(valor: unknown): string {
  if (typeof valor !== 'string' || !valor) return '—';
  const soData = SO_DATA.exec(valor);
  if (soData) return `${soData[3]}/${soData[2]}/${soData[1]}`;
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return '—';
  const p = Object.fromEntries(formatadorDataHora.formatToParts(data).map((x) => [x.type, x.value]));
  return `${p['day']}/${p['month']}/${p['year']}, ${p['hour']}:${p['minute']}`;
}

/** Texto seguro para exibição (null/undefined/vazio → "—"). */
export function texto(valor: unknown): string {
  if (valor === null || valor === undefined || valor === '') return '—';
  return String(valor);
}

export const SITUACOES_PRAZO = ['VENCIDO', 'VENCE_HOJE', 'CRITICO', 'ATENCAO', 'NO_PRAZO'] as const;
export type SituacaoPrazo = (typeof SITUACOES_PRAZO)[number];

const ROTULO_SITUACAO: Record<string, string> = {
  VENCIDO: 'Vencido',
  VENCE_HOJE: 'Vence hoje',
  CRITICO: 'Crítico',
  ATENCAO: 'Atenção',
  NO_PRAZO: 'No prazo',
  SEM_PRAZO: 'Sem prazo',
};

/** Situações conhecidas → sufixo das classes `selo-*` e `tom-*` (styles.css). A cor nunca vem sozinha: o selo sempre tem texto. */
const SUFIXO_SITUACAO: Record<string, string> = {
  VENCIDO: 'vencido',
  VENCE_HOJE: 'vence_hoje',
  CRITICO: 'critico',
  ATENCAO: 'atencao',
  NO_PRAZO: 'no_prazo',
  CUMPRIDO: 'cumprido',
  CUMPRIDO_COM_ATRASO: 'vencido',
};
export function rotuloSituacaoPrazo(situacao: unknown): string {
  return typeof situacao === 'string' ? (ROTULO_SITUACAO[situacao] ?? situacao) : 'Sem prazo';
}

export function classeSituacaoPrazo(situacao: unknown): string {
  const sufixo = typeof situacao === 'string' ? SUFIXO_SITUACAO[situacao] : undefined;
  return `selo selo-${sufixo ?? 'sem'}`;
}

/** Classe `tom-*` que define a cor de destaque (barra lateral, marcador do radar). */
export function tomSituacaoPrazo(situacao: unknown): string {
  const sufixo = typeof situacao === 'string' ? SUFIXO_SITUACAO[situacao] : undefined;
  return `tom-${sufixo ?? 'sem'}`;
}

/** Iniciais de um nome para avatares ("Ana Exemplo" → "AE"; vazio → "—"). */
export function iniciais(nome: unknown): string {
  if (typeof nome !== 'string') return '—';
  const partes = nome.trim().split(/\s+/).filter((p) => p.length > 0);
  if (partes.length === 0) return '—';
  const ultima = partes.length > 1 ? partes[partes.length - 1]!.charAt(0) : '';
  return (partes[0]!.charAt(0) + ultima).toLocaleUpperCase('pt-BR');
}

/** Número de dias restantes, ou null quando ausente/inválido. */
export function numeroDias(dias: unknown): number | null {
  const n = typeof dias === 'number' ? dias : typeof dias === 'string' && dias !== '' ? Number(dias) : NaN;
  return Number.isFinite(n) ? n : null;
}

export const NOME_GERENCIADOR: Record<string, string> = {
  JUDICIAL: 'Judicial',
  DOCUMENTO: 'Documento',
  EXTRAJUDICIAL: 'Extrajudicial',
};

export const CAIXAS = [
  { valor: 'A_RECEBER', rotulo: 'A receber', campoContador: 'aReceber' },
  { valor: 'NO_SETOR', rotulo: 'No setor', campoContador: 'noSetor' },
  { valor: 'ENVIADO_NAO_RECEBIDO', rotulo: 'Enviado não recebido', campoContador: 'enviadosNaoRecebidos' },
] as const;
export type Caixa = (typeof CAIXAS)[number]['valor'];

const ROTULO_PRIORIDADE: Record<string, string> = {
  CRITICA: 'Crítica',
  ALTA: 'Alta',
  MEDIA: 'Média',
  BAIXA: 'Baixa',
};

export function rotuloPrioridade(prioridade: unknown): string {
  return typeof prioridade === 'string' ? (ROTULO_PRIORIDADE[prioridade] ?? prioridade) : '—';
}

/** "Vence em 3 dias", "Vence hoje", "Vencido há 2 dias". */
export function textoDiasRestantes(dias: unknown): string {
  const n = typeof dias === 'number' ? dias : typeof dias === 'string' && dias !== '' ? Number(dias) : NaN;
  if (!Number.isFinite(n)) return '';
  if (n === 0) return 'vence hoje';
  if (n > 0) return n === 1 ? 'falta 1 dia' : `faltam ${n} dias`;
  const atraso = Math.abs(n);
  return atraso === 1 ? 'vencido há 1 dia' : `vencido há ${atraso} dias`;
}
