/**
 * Contrato da camada de repositório (design §4.2). Os handlers dependem só desta
 * interface; a implementação DynamoDB (`dynamo.ts`) é a única que conhece PK/SK,
 * GSI1 e GSI2. Os objetos devolvidos já vêm sem os atributos de chave.
 */
import type { ExpedienteMascaravel } from '@painel/dominio';

/** Gerenciadores do catálogo `GERENCIADOR`. */
export type Gerenciador = 'JUDICIAL' | 'DOCUMENTO' | 'EXTRAJUDICIAL';

/** Caixas de trabalho do painel (RN7: `BAIXADO` fica fora do painel). */
export type CaixaAtiva = 'A_RECEBER' | 'NO_SETOR' | 'ENVIADO_NAO_RECEBIDO';

/** Situações de prazo dos ativos (RN1). */
export type StatusPrazoFiltro = 'VENCIDO' | 'VENCE_HOJE' | 'CRITICO' | 'ATENCAO' | 'NO_PRAZO';

/** Item `META` de expediente, com os nomes de atributo do seed. */
export interface Expediente extends ExpedienteMascaravel {
  idExpediente: string;
  gerenciador: string;
  caixa: string;
  [campo: string]: unknown;
}

/** Item genérico do seed (movimentação, prazo, designação, anotação, marcador...). */
export type ItemSeed = Record<string, unknown>;

export interface PerfilUsuario {
  idUsuario: string;
  nome: string | null;
  cargo: string | null;
  siglaSetor: string | null;
  ativo: boolean;
}

export interface Setor {
  siglaSetor: string;
  nome: string | null;
  tipoSetor: string | null;
  gerenciadores: Gerenciador[];
}

/** Item `CONT#<gerenciador>` sem as chaves. */
export interface Contador {
  gerenciador: string;
  [campo: string]: unknown;
}

export interface Notificacao {
  idNotificacao: string;
  idExpediente?: string;
  mensagem?: string;
  lida: boolean;
  [campo: string]: unknown;
}

export interface Noticia {
  idNoticia: number | string;
  titulo?: string;
  prioridade?: number;
  destaque?: boolean;
  dataInicioExibicao?: string;
  dataFimExibicao?: string;
  [campo: string]: unknown;
}

/** Campos mínimos para decidir a máscara de sigilo de um expediente. */
export interface SigiloExpediente {
  siglaSetor: string;
  nivelSigilo: number;
  idResponsavel: string | null;
}

export interface OpcoesListagem {
  gerenciador?: Gerenciador;
  caixa?: CaixaAtiva;
  statusPrazo?: readonly StatusPrazoFiltro[];
  /** Cursor opaco devolvido pela página anterior. */
  cursor?: string;
  /** Tamanho da página (1–100). */
  limite: number;
}

export interface PaginaExpedientes {
  itens: Expediente[];
  /** `null` quando não há próxima página. */
  cursor: string | null;
}

export interface DetalheExpediente {
  expediente: Expediente;
  /** Ordem cronológica (SK `MOV#<dataHora>#...`). */
  movimentacoes: ItemSeed[];
  prazos: ItemSeed[];
  designacoes: ItemSeed[];
  anotacoes: ItemSeed[];
  marcadores: ItemSeed[];
}

export interface AlertasUsuario {
  /** Notificações não lidas, da mais recente para a mais antiga. */
  itens: Notificacao[];
  totalNaoLidas: number;
}

/** Operações de leitura usadas pelas rotas de consulta. */
export interface RepositorioConsulta {
  obterPerfilUsuario(idUsuario: string): Promise<PerfilUsuario | null>;
  obterSetor(siglaSetor: string): Promise<Setor | null>;
  obterContadores(siglaSetor: string): Promise<Contador[]>;
  listarProximosPrazos(siglaSetor: string, quantidade: number): Promise<Expediente[]>;
  listarAlertas(idUsuario: string, quantidade: number): Promise<AlertasUsuario>;
  obterSigiloExpedientes(ids: readonly string[]): Promise<Map<string, SigiloExpediente>>;
  listarNoticias(): Promise<Noticia[]>;
  listarAtivosDoSetor(siglaSetor: string, opcoes: OpcoesListagem): Promise<PaginaExpedientes>;
  obterDetalhe(idExpediente: string): Promise<DetalheExpediente | null>;
}

/** Cursor adulterado, de outro setor ou de outra consulta. O handler responde 400. */
export class CursorInvalidoError extends Error {
  constructor() {
    super('Cursor inválido');
    this.name = 'CursorInvalidoError';
  }
}
