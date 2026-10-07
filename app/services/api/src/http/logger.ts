/**
 * Log operacional com lista branca de campos (tech.md "Logs"; Req. 25.6 e 26).
 * Qualquer campo fora da lista é descartado antes de chegar ao Powertools Logger.
 */
import { Logger } from '@aws-lambda-powertools/logger';

export const CAMPOS_PERMITIDOS = [
  'idUsuario',
  'idExpediente',
  'rota',
  'status',
  'latenciaMs',
  'correlationId',
  'evento',
  'codigo',
  'erro',
] as const;

export type CampoLog = (typeof CAMPOS_PERMITIDOS)[number];
export type CamposLog = Partial<Record<CampoLog, string | number>>;

export interface RegistradorLog {
  info(mensagem: string, campos: CamposLog): void;
  warn(mensagem: string, campos: CamposLog): void;
  error(mensagem: string, campos: CamposLog): void;
}

const PERMITIDOS: ReadonlySet<string> = new Set(CAMPOS_PERMITIDOS);

/** Mantém só os campos da lista branca com valores texto/número. */
export function filtrarCampos(campos: Record<string, unknown>): CamposLog {
  const saida: Record<string, string | number> = {};
  for (const [chave, valor] of Object.entries(campos)) {
    if (PERMITIDOS.has(chave) && (typeof valor === 'string' || typeof valor === 'number')) {
      saida[chave] = valor;
    }
  }
  return saida as CamposLog;
}

let loggerPadrao: Logger | undefined;

/** Registrador padrão (Powertools, JSON no CloudWatch Logs). */
export function criarRegistradorPadrao(): RegistradorLog {
  loggerPadrao ??= new Logger({ serviceName: process.env['POWERTOOLS_SERVICE_NAME'] ?? 'painel-api' });
  const logger = loggerPadrao;
  return {
    info: (mensagem, campos) => logger.info(mensagem, filtrarCampos(campos)),
    warn: (mensagem, campos) => logger.warn(mensagem, filtrarCampos(campos)),
    error: (mensagem, campos) => logger.error(mensagem, filtrarCampos(campos)),
  };
}
