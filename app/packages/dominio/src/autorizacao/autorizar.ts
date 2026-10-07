/**
 * Ponto de decisão de política (PDP) único — Req. 24.2 a 24.4.
 *
 * Ordem da decisão:
 * 1. Usuário ou recurso inválido, ou de outro setor → negado com 404 (sem revelar existência).
 * 2. Célula ausente na matriz → negado com 403 (negação por padrão).
 * 3. Regra da célula avaliada → permitido, ou negado com 403.
 */
import { MATRIZ_AUTORIZACAO, type MatrizAutorizacao } from './matriz.js';
import type { Acao, ContextoAutorizacao, Decisao, Perfil, Recurso, Regra, UsuarioAutenticado } from './tipos.js';

export const MOTIVO_NAO_ENCONTRADO = 'Recurso não encontrado ou sem acesso';
export const MOTIVO_SEM_PERMISSAO = 'Sem permissão para esta ação';

const PERFIS: ReadonlySet<string> = new Set<Perfil>(['MEMBRO', 'CHEFE', 'SERVIDOR']);

function textoPreenchido(valor: unknown): valor is string {
  return typeof valor === 'string' && valor.length > 0;
}

function usuarioValido(usuario: UsuarioAutenticado | null | undefined): usuario is UsuarioAutenticado {
  return (
    !!usuario &&
    textoPreenchido(usuario.idUsuario) &&
    textoPreenchido(usuario.siglaSetor) &&
    PERFIS.has(usuario.perfil)
  );
}

/** Avalia uma regra declarativa da matriz. Regras desconhecidas negam. */
function avaliarRegra(
  regra: Regra,
  usuario: UsuarioAutenticado,
  recurso: Recurso,
  contexto: ContextoAutorizacao,
): boolean {
  switch (regra) {
    case 'SIM':
      return true;
    case 'SE_RESPONSAVEL':
      return recurso.tipo === 'EXPEDIENTE' && recurso.idResponsavel === usuario.idUsuario;
    case 'SE_PUBLICO_OU_RESPONSAVEL':
      return (
        recurso.tipo === 'EXPEDIENTE' &&
        (recurso.nivelSigilo === 0 || recurso.idResponsavel === usuario.idUsuario)
      );
    case 'SO_PARA_SI':
      return contexto.idDestino === usuario.idUsuario;
    case 'SE_AUTOR':
    case 'SE_PROPRIO_USUARIO':
      return 'idUsuario' in recurso && recurso.idUsuario === usuario.idUsuario;
    case 'SE_AUTOR_OU_COMPARTILHADO':
      return (
        recurso.tipo === 'FILTRO' &&
        (recurso.idUsuario === usuario.idUsuario || recurso.compartilhadoComSetor === true)
      );
    default:
      // 'NAO' e qualquer valor inesperado.
      return false;
  }
}

/**
 * Decide se o usuário pode executar a ação sobre o recurso.
 * `matriz` é injetável só para testes; o padrão é a matriz versionada.
 */
export function autorizar(
  usuario: UsuarioAutenticado | null | undefined,
  acao: Acao | string,
  recurso: Recurso | null | undefined,
  contexto: ContextoAutorizacao = {},
  matriz: MatrizAutorizacao = MATRIZ_AUTORIZACAO,
): Decisao {
  if (!usuarioValido(usuario) || !recurso || !textoPreenchido(recurso.siglaSetor)) {
    return { permitido: false, status: 404, motivo: MOTIVO_NAO_ENCONTRADO };
  }
  if (recurso.siglaSetor !== usuario.siglaSetor) {
    return { permitido: false, status: 404, motivo: MOTIVO_NAO_ENCONTRADO };
  }

  const linhas = Object.hasOwn(matriz, recurso.tipo) ? matriz[recurso.tipo] : undefined;
  const celula = linhas && Object.hasOwn(linhas, acao) ? linhas[acao as Acao] : undefined;
  const regra = celula?.[usuario.perfil];
  if (!regra) {
    return { permitido: false, status: 403, motivo: MOTIVO_SEM_PERMISSAO };
  }

  if (avaliarRegra(regra, usuario, recurso, contexto)) {
    return { permitido: true, motivo: `Permitido pela matriz (${recurso.tipo}.${acao}: ${regra})` };
  }
  return { permitido: false, status: 403, motivo: MOTIVO_SEM_PERMISSAO };
}
