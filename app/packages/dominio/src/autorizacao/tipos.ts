/**
 * Tipos do ponto de decisão de política (PDP) — Req. 24.2 e 24.3.
 * Os nomes de campo seguem os CSVs do seed (`usuarios`, `expedientes`, `filtros_salvos`, `acoes_lote`).
 */

export type Perfil = 'MEMBRO' | 'CHEFE' | 'SERVIDOR';

/** Usuário autenticado, montado só a partir das *claims* do token. */
export interface UsuarioAutenticado {
  idUsuario: string;
  siglaSetor: string;
  perfil: Perfil;
}

export interface RecursoExpediente {
  tipo: 'EXPEDIENTE';
  siglaSetor: string;
  nivelSigilo: number;
  idResponsavel?: string | null;
}

export interface RecursoFiltro {
  tipo: 'FILTRO';
  siglaSetor: string;
  /** Autor do filtro. */
  idUsuario: string;
  compartilhadoComSetor: boolean;
}

export interface RecursoLote {
  tipo: 'LOTE';
  siglaSetor: string;
  /** Autor do lote. */
  idUsuario: string;
}

/** Preferências, favoritos, notificações e tela inicial. */
export interface RecursoDadosPessoais {
  tipo: 'DADOS_PESSOAIS';
  siglaSetor: string;
  /** Dono dos dados. */
  idUsuario: string;
}

export interface RecursoProdutividade {
  tipo: 'PRODUTIVIDADE';
  siglaSetor: string;
  /** Pessoa cuja produtividade é consultada. */
  idUsuario: string;
}

export interface RecursoExportacao {
  tipo: 'EXPORTACAO';
  siglaSetor: string;
}

export type Recurso =
  | RecursoExpediente
  | RecursoFiltro
  | RecursoLote
  | RecursoDadosPessoais
  | RecursoProdutividade
  | RecursoExportacao;

export type TipoRecurso = Recurso['tipo'];

/** Ações conhecidas pelo PDP. Qualquer outra é negada por padrão. */
export type Acao =
  // Expediente
  | 'LISTAR'
  | 'VER_DETALHE'
  | 'VER_HISTORICO'
  | 'VER_CONTEUDO_SIGILOSO'
  | 'RECEBER'
  | 'INCLUIR_MARCADOR'
  | 'DAR_CIENCIA'
  | 'ANOTAR'
  | 'DESIGNAR'
  | 'DISTRIBUIR'
  | 'ASSINAR'
  | 'MOVIMENTAR'
  | 'ARQUIVAR'
  // Lote
  | 'EXECUTAR_LOTE'
  | 'VER_TRILHA_LOTE'
  | 'DESFAZER_LOTE'
  // Filtro salvo
  | 'LER_FILTRO'
  | 'APLICAR_FILTRO'
  | 'EDITAR_FILTRO'
  | 'EXCLUIR_FILTRO'
  | 'COMPARTILHAR_FILTRO'
  // Dados pessoais
  | 'LER_DADOS_PESSOAIS'
  | 'ALTERAR_DADOS_PESSOAIS'
  // Produtividade e exportação
  | 'VER_PRODUTIVIDADE'
  | 'GERAR_EXPORTACAO';

/** Parâmetros da operação que influenciam a decisão (ex.: destinatário da designação). */
export interface ContextoAutorizacao {
  /** Pessoa que receberá a designação (`DESIGNAR`). */
  idDestino?: string;
}

/**
 * Regras declarativas usadas nas células da matriz.
 * - `SIM` / `NAO`: decisão direta.
 * - `SE_RESPONSAVEL`: `recurso.idResponsavel` = usuário.
 * - `SE_PUBLICO_OU_RESPONSAVEL`: `nivelSigilo = 0` ou responsável.
 * - `SO_PARA_SI`: `contexto.idDestino` = usuário ("assumir").
 * - `SE_AUTOR` / `SE_PROPRIO_USUARIO`: `recurso.idUsuario` = usuário.
 * - `SE_AUTOR_OU_COMPARTILHADO`: autor ou filtro compartilhado com o setor.
 */
export type Regra =
  | 'SIM'
  | 'NAO'
  | 'SE_RESPONSAVEL'
  | 'SE_PUBLICO_OU_RESPONSAVEL'
  | 'SO_PARA_SI'
  | 'SE_AUTOR'
  | 'SE_PROPRIO_USUARIO'
  | 'SE_AUTOR_OU_COMPARTILHADO';

/** Decisão do PDP. `status` só existe quando o acesso é negado. */
export interface Decisao {
  permitido: boolean;
  status?: 403 | 404;
  motivo: string;
}
