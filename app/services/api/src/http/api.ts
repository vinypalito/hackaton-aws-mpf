/**
 * Envelope comum dos handlers REST (sem framework): correlationId, usuário das claims,
 * tratamento de erro padronizado, CORS restrito, cabeçalhos de segurança e log com
 * lista branca de campos.
 */
import type { UsuarioAutenticado } from '@painel/dominio';
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { usuarioDasClaims } from './claims.js';
import { ErroApi } from './erros.js';
import { criarRegistradorPadrao, type RegistradorLog } from './logger.js';

export interface ContextoRequisicao {
  readonly usuario: UsuarioAutenticado;
  readonly correlationId: string;
  readonly evento: APIGatewayProxyEvent;
  /** Log com lista branca de campos (ex.: registro de AcessoNegado). */
  readonly registrador: RegistradorLog;
}

export interface RespostaOk {
  readonly status?: number;
  readonly corpo: unknown;
  /** Só para o log (campo da lista branca). */
  readonly idExpediente?: string;
}

export type LogicaRota = (ctx: ContextoRequisicao) => Promise<RespostaOk>;
export type HandlerApi = (evento: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>;

export interface OpcoesEnvelope {
  readonly registrador?: RegistradorLog;
  /** Origens aceitas no CORS. Padrão: env `ORIGENS_PERMITIDAS` (separadas por vírgula). */
  readonly origensPermitidas?: readonly string[];
}

function origensDoAmbiente(): string[] {
  return String(process.env['ORIGENS_PERMITIDAS'] ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter((o) => o.length > 0);
}

function cabecalho(evento: APIGatewayProxyEvent, nome: string): string | undefined {
  const alvo = nome.toLowerCase();
  for (const [chave, valor] of Object.entries(evento.headers ?? {})) {
    if (chave.toLowerCase() === alvo && typeof valor === 'string') return valor;
  }
  return undefined;
}

function cabecalhosResposta(
  evento: APIGatewayProxyEvent,
  correlationId: string,
  origens: readonly string[],
): Record<string, string> {
  const cabecalhos: Record<string, string> = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Correlation-Id': correlationId,
    Vary: 'Origin',
  };
  const origem = cabecalho(evento, 'origin');
  if (origem && origens.includes(origem)) {
    cabecalhos['Access-Control-Allow-Origin'] = origem;
    cabecalhos['Access-Control-Expose-Headers'] = 'X-Correlation-Id';
  }
  return cabecalhos;
}

/** Cria o handler Lambda da rota a partir da lógica de negócio. */
export function criarHandlerApi(rota: string, logica: LogicaRota, opcoes: OpcoesEnvelope = {}): HandlerApi {
  const registrador = opcoes.registrador ?? criarRegistradorPadrao();
  return async (evento) => {
    const inicio = Date.now();
    const correlationId = evento.requestContext?.requestId || crypto.randomUUID();
    const origens = opcoes.origensPermitidas ?? origensDoAmbiente();
    const cabecalhos = cabecalhosResposta(evento, correlationId, origens);
    let idUsuario: string | undefined;
    try {
      const usuario = usuarioDasClaims(evento);
      idUsuario = usuario.idUsuario;
      const resposta = await logica({ usuario, correlationId, evento, registrador });
      const status = resposta.status ?? 200;
      registrador.info('requisicao', {
        rota,
        status,
        latenciaMs: Date.now() - inicio,
        correlationId,
        idUsuario,
        ...(resposta.idExpediente ? { idExpediente: resposta.idExpediente } : {}),
      });
      return { statusCode: status, headers: cabecalhos, body: JSON.stringify(resposta.corpo) };
    } catch (erro) {
      const conhecido = erro instanceof ErroApi;
      const status = conhecido ? erro.status : 500;
      const codigo = conhecido ? erro.codigo : 'ERRO_INTERNO';
      const mensagem = conhecido ? erro.message : 'Erro inesperado. Informe o correlationId ao suporte.';
      const campos = {
        rota,
        status,
        codigo,
        latenciaMs: Date.now() - inicio,
        correlationId,
        ...(idUsuario ? { idUsuario } : {}),
      };
      if (conhecido) {
        registrador.warn('requisicao recusada', campos);
      } else {
        // Só o tipo do erro vai para o log (sem mensagem, que pode conter dados).
        registrador.error('erro inesperado', { ...campos, erro: erro instanceof Error ? erro.name : 'desconhecido' });
      }
      const corpo = {
        codigo,
        mensagem,
        correlationId,
        ...(conhecido && erro.campos ? { campos: erro.campos } : {}),
      };
      return { statusCode: status, headers: cabecalhos, body: JSON.stringify(corpo) };
    }
  };
}
