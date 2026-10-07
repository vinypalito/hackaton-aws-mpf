/**
 * Ponto de entrada do pacote de domínio.
 *
 * Aqui ficam as regras puras do painel (RN1–RN3, máscara de sigilo, autorização),
 * sem nenhuma dependência de AWS.
 */

export * from './prazo.js';
export * from './prioridade.js';
export * from './sigilo.js';
export * from './autorizacao/tipos.js';
export * from './autorizacao/matriz.js';
export * from './autorizacao/autorizar.js';

/** Data de referência padrão da base sintética (07/10/2026, 17:00, horário de Brasília). */
export const DATA_REFERENCIA_PADRAO = '2026-10-07T17:00:00-03:00';

/**
 * Converte a data de referência (ISO 8601 com fuso) em `Date`.
 * Lança erro se o texto não for uma data válida.
 */
export function obterDataReferencia(valor: string = DATA_REFERENCIA_PADRAO): Date {
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) {
    throw new Error(`Data de referência inválida: ${valor}`);
  }
  return data;
}
