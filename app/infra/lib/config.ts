import type { Node } from 'constructs';

/**
 * Data de referência padrão da base sintética (07/10/2026, 17:00, horário de
 * Brasília) — mesmo valor de `DATA_REFERENCIA_PADRAO` em `@painel/dominio`
 * (Req. 2.6). Sobrescreva com `-c dataReferencia=<ISO 8601 com fuso>`.
 */
export const DATA_REFERENCIA_PADRAO = '2026-10-07T17:00:00-03:00';

const ISO_COM_FUSO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/;

/** Variáveis de ambiente comuns a todas as Lambdas do painel (a ApiStack e a AgendamentosStack as usam). */
export interface AmbienteLambdas {
  readonly DATA_REFERENCIA: string;
  readonly [nome: string]: string;
}

/** Lê o contexto do CDK e monta as variáveis de ambiente comuns das Lambdas. */
export function obterAmbienteLambdas(no: Node): AmbienteLambdas {
  const dataReferencia = String(no.tryGetContext('dataReferencia') ?? DATA_REFERENCIA_PADRAO);
  if (!ISO_COM_FUSO.test(dataReferencia) || Number.isNaN(new Date(dataReferencia).getTime())) {
    throw new Error(`Contexto "dataReferencia" inválido (use ISO 8601 com fuso): ${dataReferencia}`);
  }
  return { DATA_REFERENCIA: dataReferencia };
}
