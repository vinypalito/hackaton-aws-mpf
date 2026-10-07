/**
 * Máscara de sigilo (RN6, Req. 24.6 e 24.7; decisão D1).
 *
 * Conteúdo sigiloso: `assunto`, `resumo`, `tema`, `texto` das anotações, `descricao` das
 * movimentações e `mensagem` das notificações. Quem não pode vê-lo recebe "Conteúdo sigiloso";
 * identificação, prazo e caixa são mantidos. A decisão de quem pode ver vem do PDP.
 */
import { autorizar } from './autorizacao/autorizar.js';
import type { UsuarioAutenticado } from './autorizacao/tipos.js';

export const TEXTO_SIGILOSO = 'Conteúdo sigiloso';

/** Campos do expediente que a máscara lê ou substitui. Demais campos passam intactos. */
export interface ExpedienteMascaravel {
  siglaSetor: string;
  nivelSigilo: number;
  idResponsavel?: string | null;
  assunto?: string;
  resumo?: string;
  tema?: string;
  anotacoes?: ReadonlyArray<{ texto?: string }>;
  movimentacoes?: ReadonlyArray<{ descricao?: string }>;
  notificacoes?: ReadonlyArray<{ mensagem?: string }>;
}

/** Indica se o usuário pode ver o conteúdo sigiloso do expediente. */
export function podeVerConteudoSigiloso(exp: ExpedienteMascaravel, usuario: UsuarioAutenticado): boolean {
  return autorizar(usuario, 'VER_CONTEUDO_SIGILOSO', {
    tipo: 'EXPEDIENTE',
    siglaSetor: exp.siglaSetor,
    nivelSigilo: exp.nivelSigilo,
    idResponsavel: exp.idResponsavel ?? null,
  }).permitido;
}

/** Substitui o campo só quando ele existe, preservando a forma do objeto. */
function mascararCampo<T extends object, K extends keyof T>(item: T, campo: K): T {
  return campo in item && item[campo] !== undefined ? { ...item, [campo]: TEXTO_SIGILOSO } : item;
}

/**
 * Devolve uma cópia do expediente com a máscara aplicada quando necessário.
 * Expedientes públicos (`nivelSigilo = 0`) e usuários autorizados recebem o objeto sem alteração.
 * Nunca altera o objeto de entrada.
 */
export function mascararSigilo<T extends ExpedienteMascaravel>(exp: T, usuario: UsuarioAutenticado): T {
  if (exp.nivelSigilo === 0 || podeVerConteudoSigiloso(exp, usuario)) {
    return exp;
  }
  let saida: T = { ...exp };
  for (const campo of ['assunto', 'resumo', 'tema'] as const) {
    saida = mascararCampo(saida, campo);
  }
  if (exp.anotacoes) {
    saida = { ...saida, anotacoes: exp.anotacoes.map((a) => mascararCampo(a, 'texto')) };
  }
  if (exp.movimentacoes) {
    saida = { ...saida, movimentacoes: exp.movimentacoes.map((m) => mascararCampo(m, 'descricao')) };
  }
  if (exp.notificacoes) {
    saida = { ...saida, notificacoes: exp.notificacoes.map((n) => mascararCampo(n, 'mensagem')) };
  }
  return saida;
}
