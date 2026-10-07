/**
 * Usuário autenticado a partir das *claims* do ID token validado pelo Cognito Authorizer
 * (Req. 1.4). Nenhum valor equivalente vindo do cliente (query, corpo, cabeçalho) é usado.
 */
import type { Perfil, UsuarioAutenticado } from '@painel/dominio';
import type { APIGatewayProxyEvent } from 'aws-lambda';
import { naoAutenticado } from './erros.js';

const PERFIS: ReadonlySet<string> = new Set<Perfil>(['MEMBRO', 'CHEFE', 'SERVIDOR']);
/** Mesmos limites dos atributos customizados da AuthStack. */
const IDENTIFICADOR = /^[A-Za-z0-9/_-]{1,64}$/;

/** Extrai o usuário das claims ou lança 401. */
export function usuarioDasClaims(evento: Pick<APIGatewayProxyEvent, 'requestContext'>): UsuarioAutenticado {
  const claims: unknown = evento.requestContext?.authorizer?.['claims'];
  if (typeof claims !== 'object' || claims === null) {
    throw naoAutenticado();
  }
  const registro = claims as Record<string, unknown>;
  const idUsuario = registro['custom:idUsuario'];
  const siglaSetor = registro['custom:siglaSetor'];
  const perfil = registro['custom:perfil'];
  if (
    typeof idUsuario !== 'string' ||
    typeof siglaSetor !== 'string' ||
    typeof perfil !== 'string' ||
    !IDENTIFICADOR.test(idUsuario) ||
    !IDENTIFICADOR.test(siglaSetor) ||
    !PERFIS.has(perfil)
  ) {
    throw naoAutenticado();
  }
  return { idUsuario, siglaSetor, perfil: perfil as Perfil };
}
