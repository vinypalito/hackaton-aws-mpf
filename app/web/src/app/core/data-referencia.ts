/**
 * Data de referência fixa da base sintética (mesmo valor de DATA_REFERENCIA no
 * backend e de DATA_REFERENCIA_PADRAO em packages/dominio).
 */
export const DATA_REFERENCIA_PADRAO = '2026-10-07T17:00:00-03:00';

const formatador = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/**
 * Formata a data de referência como "07/10/2026, 17:00" no fuso de Brasília.
 * Monta o texto a partir das partes para não depender do separador do ICU.
 * Valor ausente ou inválido cai na data padrão.
 */
export function formatarDataReferencia(iso?: string | null): string {
  let data = new Date(iso ?? DATA_REFERENCIA_PADRAO);
  if (Number.isNaN(data.getTime())) {
    data = new Date(DATA_REFERENCIA_PADRAO);
  }
  const partes = Object.fromEntries(formatador.formatToParts(data).map((p) => [p.type, p.value]));
  return `${partes['day']}/${partes['month']}/${partes['year']}, ${partes['hour']}:${partes['minute']}`;
}

/** Texto exibido no cabeçalho: "Dados de 07/10/2026, 17:00". */
export function textoDataReferencia(iso?: string | null): string {
  return `Dados de ${formatarDataReferencia(iso)}`;
}
