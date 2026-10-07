/**
 * Apoio aos testes dos handlers: repositório em memória (implementação real da interface,
 * sem AWS) e montagem de eventos do API Gateway com claims do Cognito.
 */
import type { APIGatewayProxyEvent } from 'aws-lambda';
import type { CamposLog, RegistradorLog } from '../http/logger.js';
import type {
  AlertasUsuario,
  Contador,
  DetalheExpediente,
  Expediente,
  Noticia,
  Notificacao,
  OpcoesListagem,
  PaginaExpedientes,
  PerfilUsuario,
  RepositorioConsulta,
  Setor,
  SigiloExpediente,
} from '../repositorio/tipos.js';

export interface DadosMemoria {
  usuarios?: PerfilUsuario[];
  setores?: Setor[];
  contadores?: Record<string, Contador[]>;
  expedientes?: Expediente[];
  detalhes?: Record<string, Omit<DetalheExpediente, 'expediente'>>;
  notificacoes?: Record<string, Notificacao[]>;
  noticias?: Noticia[];
}

/** Repositório em memória com a mesma semântica de setor da implementação DynamoDB. */
export class RepositorioMemoria implements RepositorioConsulta {
  public readonly chamadas: { metodo: string; args: unknown[] }[] = [];
  public falharEm = new Set<keyof RepositorioConsulta>();

  constructor(private readonly dados: DadosMemoria) {}

  private registrar(metodo: keyof RepositorioConsulta, args: unknown[]): void {
    this.chamadas.push({ metodo, args });
    if (this.falharEm.has(metodo)) throw new Error(`falha simulada em ${metodo}`);
  }

  async obterPerfilUsuario(idUsuario: string) {
    this.registrar('obterPerfilUsuario', [idUsuario]);
    return this.dados.usuarios?.find((u) => u.idUsuario === idUsuario) ?? null;
  }
  async obterSetor(siglaSetor: string) {
    this.registrar('obterSetor', [siglaSetor]);
    return this.dados.setores?.find((s) => s.siglaSetor === siglaSetor) ?? null;
  }
  async obterContadores(siglaSetor: string) {
    this.registrar('obterContadores', [siglaSetor]);
    return this.dados.contadores?.[siglaSetor] ?? [];
  }
  async listarProximosPrazos(siglaSetor: string, quantidade: number) {
    this.registrar('listarProximosPrazos', [siglaSetor, quantidade]);
    return (this.dados.expedientes ?? [])
      .filter((e) => e.siglaSetor === siglaSetor && e['requerAcao'] === true && e.caixa !== 'BAIXADO')
      .slice(0, quantidade);
  }
  async listarAlertas(idUsuario: string, quantidade: number): Promise<AlertasUsuario> {
    this.registrar('listarAlertas', [idUsuario, quantidade]);
    const naoLidas = (this.dados.notificacoes?.[idUsuario] ?? []).filter((n) => !n.lida);
    return { itens: naoLidas.slice(0, quantidade), totalNaoLidas: naoLidas.length };
  }
  async obterSigiloExpedientes(ids: readonly string[]) {
    this.registrar('obterSigiloExpedientes', [ids]);
    const mapa = new Map<string, SigiloExpediente>();
    for (const e of this.dados.expedientes ?? []) {
      if (ids.includes(e.idExpediente)) {
        mapa.set(e.idExpediente, {
          siglaSetor: e.siglaSetor,
          nivelSigilo: e.nivelSigilo,
          idResponsavel: e.idResponsavel ?? null,
        });
      }
    }
    return mapa;
  }
  async listarNoticias() {
    this.registrar('listarNoticias', []);
    return this.dados.noticias ?? [];
  }
  async listarAtivosDoSetor(siglaSetor: string, opcoes: OpcoesListagem): Promise<PaginaExpedientes> {
    this.registrar('listarAtivosDoSetor', [siglaSetor, opcoes]);
    const itens = (this.dados.expedientes ?? []).filter(
      (e) =>
        e.siglaSetor === siglaSetor &&
        e.caixa !== 'BAIXADO' &&
        (!opcoes.gerenciador || e.gerenciador === opcoes.gerenciador) &&
        (!opcoes.caixa || e.caixa === opcoes.caixa) &&
        (!opcoes.statusPrazo || opcoes.statusPrazo.includes(e['statusPrazo'] as never)),
    );
    return { itens: itens.slice(0, opcoes.limite), cursor: null };
  }
  async obterDetalhe(idExpediente: string): Promise<DetalheExpediente | null> {
    this.registrar('obterDetalhe', [idExpediente]);
    const expediente = this.dados.expedientes?.find((e) => e.idExpediente === idExpediente);
    if (!expediente) return null;
    const relacionados = this.dados.detalhes?.[idExpediente] ?? {
      movimentacoes: [],
      prazos: [],
      designacoes: [],
      anotacoes: [],
      marcadores: [],
    };
    return { expediente, ...relacionados };
  }
}

/** Registrador que guarda as linhas em memória (para conferir a lista branca). */
export class RegistradorMemoria implements RegistradorLog {
  public readonly linhas: { nivel: string; mensagem: string; campos: CamposLog }[] = [];
  info(mensagem: string, campos: CamposLog) {
    this.linhas.push({ nivel: 'info', mensagem, campos });
  }
  warn(mensagem: string, campos: CamposLog) {
    this.linhas.push({ nivel: 'warn', mensagem, campos });
  }
  error(mensagem: string, campos: CamposLog) {
    this.linhas.push({ nivel: 'error', mensagem, campos });
  }
}

export interface OpcoesEvento {
  claims?: Record<string, string> | null;
  query?: Record<string, string>;
  path?: Record<string, string>;
  headers?: Record<string, string>;
}

/** Evento REST (proxy) como o API Gateway entrega após o Cognito Authorizer. */
export function eventoApi(opcoes: OpcoesEvento = {}): APIGatewayProxyEvent {
  const authorizer = opcoes.claims === null ? undefined : { claims: opcoes.claims ?? {} };
  return {
    body: null,
    headers: opcoes.headers ?? {},
    multiValueHeaders: {},
    httpMethod: 'GET',
    isBase64Encoded: false,
    path: '/',
    pathParameters: opcoes.path ?? null,
    queryStringParameters: opcoes.query ?? null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    resource: '/',
    requestContext: { requestId: 'req-teste-1', authorizer } as unknown as APIGatewayProxyEvent['requestContext'],
  };
}

export const claimsDe = (idUsuario: string, siglaSetor: string, perfil: string): Record<string, string> => ({
  sub: '00000000-0000-0000-0000-000000000000',
  'custom:idUsuario': idUsuario,
  'custom:siglaSetor': siglaSetor,
  'custom:perfil': perfil,
});
