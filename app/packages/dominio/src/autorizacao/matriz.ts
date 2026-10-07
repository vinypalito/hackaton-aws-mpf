/**
 * Matriz de autorização do Req. 24.3, declarada como dados e versionada no repositório.
 *
 * Toda célula ausente é negada por padrão. A exigência de mesmo setor vale para todas as
 * linhas e é aplicada antes da matriz (outro setor → HTTP 404).
 * Os níveis de sigilo 1 e 2 são tratados da mesma forma no MVP (Req. 24.8); uma regra
 * distinta por nível pode ser acrescentada como nova `Regra` sem mudar o PDP.
 */
import type { Acao, Perfil, Regra, TipoRecurso } from './tipos.js';

export type CelulaMatriz = Readonly<Record<Perfil, Regra>>;
export type MatrizAutorizacao = Readonly<Record<TipoRecurso, Readonly<Partial<Record<Acao, CelulaMatriz>>>>>;

/** Versão da matriz, registrada junto das decisões quando útil para auditoria. */
export const VERSAO_MATRIZ = '1';

const TODOS: CelulaMatriz = { MEMBRO: 'SIM', CHEFE: 'SIM', SERVIDOR: 'SIM' };

export const MATRIZ_AUTORIZACAO: MatrizAutorizacao = {
  EXPEDIENTE: {
    // Listar, ver detalhe e histórico (o conteúdo sigiloso é mascarado à parte).
    LISTAR: TODOS,
    VER_DETALHE: TODOS,
    VER_HISTORICO: TODOS,
    // Ver conteúdo sigiloso: SERVIDOR só se responsável; senão, máscara (RN6).
    VER_CONTEUDO_SIGILOSO: { MEMBRO: 'SIM', CHEFE: 'SIM', SERVIDOR: 'SE_PUBLICO_OU_RESPONSAVEL' },
    RECEBER: TODOS,
    INCLUIR_MARCADOR: TODOS,
    DAR_CIENCIA: TODOS,
    ANOTAR: TODOS,
    // Designação individual: SERVIDOR só para si mesmo ("assumir").
    DESIGNAR: { MEMBRO: 'SIM', CHEFE: 'SIM', SERVIDOR: 'SO_PARA_SI' },
    // Distribuição balanceada (Req. 16).
    DISTRIBUIR: { MEMBRO: 'SIM', CHEFE: 'SIM', SERVIDOR: 'NAO' },
    ASSINAR: { MEMBRO: 'SIM', CHEFE: 'SIM', SERVIDOR: 'NAO' },
    MOVIMENTAR: { MEMBRO: 'SIM', CHEFE: 'SIM', SERVIDOR: 'SE_RESPONSAVEL' },
    ARQUIVAR: { MEMBRO: 'SIM', CHEFE: 'SIM', SERVIDOR: 'SE_RESPONSAVEL' },
  },
  LOTE: {
    // Executar: permitido; cada item é autorizado conforme a ação, item a item.
    EXECUTAR_LOTE: TODOS,
    // Trilha: próprios e do setor.
    VER_TRILHA_LOTE: TODOS,
    // Desfazer (a janela de 24 h é validada pela regra de lote): só autor; CHEFE, qualquer lote do setor.
    DESFAZER_LOTE: { MEMBRO: 'SE_AUTOR', CHEFE: 'SIM', SERVIDOR: 'SE_AUTOR' },
  },
  FILTRO: {
    // Ler e aplicar: o autor, ou qualquer pessoa do setor se o filtro for compartilhado.
    LER_FILTRO: { MEMBRO: 'SE_AUTOR_OU_COMPARTILHADO', CHEFE: 'SE_AUTOR_OU_COMPARTILHADO', SERVIDOR: 'SE_AUTOR_OU_COMPARTILHADO' },
    APLICAR_FILTRO: { MEMBRO: 'SE_AUTOR_OU_COMPARTILHADO', CHEFE: 'SE_AUTOR_OU_COMPARTILHADO', SERVIDOR: 'SE_AUTOR_OU_COMPARTILHADO' },
    // Editar, excluir e compartilhar: só o autor.
    EDITAR_FILTRO: { MEMBRO: 'SE_AUTOR', CHEFE: 'SE_AUTOR', SERVIDOR: 'SE_AUTOR' },
    EXCLUIR_FILTRO: { MEMBRO: 'SE_AUTOR', CHEFE: 'SE_AUTOR', SERVIDOR: 'SE_AUTOR' },
    COMPARTILHAR_FILTRO: { MEMBRO: 'SE_AUTOR', CHEFE: 'SE_AUTOR', SERVIDOR: 'SE_AUTOR' },
  },
  DADOS_PESSOAIS: {
    // Preferências, favoritos, notificações e tela inicial: só o próprio usuário.
    LER_DADOS_PESSOAIS: { MEMBRO: 'SE_PROPRIO_USUARIO', CHEFE: 'SE_PROPRIO_USUARIO', SERVIDOR: 'SE_PROPRIO_USUARIO' },
    ALTERAR_DADOS_PESSOAIS: { MEMBRO: 'SE_PROPRIO_USUARIO', CHEFE: 'SE_PROPRIO_USUARIO', SERVIDOR: 'SE_PROPRIO_USUARIO' },
  },
  PRODUTIVIDADE: {
    // Ver de outra pessoa: MEMBRO e CHEFE; SERVIDOR só a própria.
    VER_PRODUTIVIDADE: { MEMBRO: 'SIM', CHEFE: 'SIM', SERVIDOR: 'SE_PROPRIO_USUARIO' },
  },
  EXPORTACAO: {
    // Gerar CSV/.ics: todos, com máscara conforme sigilo aplicada na saída.
    GERAR_EXPORTACAO: TODOS,
  },
};
