/**
 * Repositório DynamoDB (tabela única `Expedientes`) — padrões de acesso A1, A2, A3, A5,
 * A6, A8 e A13 do design §3.3.
 *
 * Regras:
 * - Só `Query` e `GetItem` (nenhum `Scan`, Req. 31.3).
 * - Valores sempre em `ExpressionAttributeValues`; nomes de atributo em
 *   `ExpressionAttributeNames` (Req. 25.2).
 * - Itens devolvidos sem PK/SK/GSI (só esta camada conhece as chaves).
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  type QueryCommandInput,
  type QueryCommandOutput,
} from '@aws-sdk/lib-dynamodb';
import {
  INDICE_GSI1,
  INDICE_GSI2,
  PK_NOTICIA,
  SK_META,
  SK_PERFIL,
  pkExpediente,
  pkSetor,
  pkUsuario,
  prefixoAtivos,
  semChaves,
} from './chaves.js';
import { codificarCursor, decodificarCursor, type ChaveGsi1 } from './cursor.js';
import type {
  AlertasUsuario,
  Contador,
  DetalheExpediente,
  Expediente,
  Gerenciador,
  ItemSeed,
  Noticia,
  Notificacao,
  OpcoesListagem,
  PaginaExpedientes,
  PerfilUsuario,
  RepositorioConsulta,
  Setor,
  SigiloExpediente,
} from './tipos.js';

/** Subconjunto do DocumentClient usado aqui (facilita testar sem AWS). */
export interface ClienteDocumentos {
  send(comando: QueryCommand | GetCommand): Promise<unknown>;
}

type Item = Record<string, unknown>;

/** Itens lidos por página nas consultas com filtro (equilíbrio entre RCU e idas ao DynamoDB). */
const ITENS_POR_PAGINA = 200;
/** Teto de páginas por requisição (o setor maior tem ~3.500 ativos). */
const MAXIMO_PAGINAS = 50;
const GERENCIADORES: ReadonlySet<string> = new Set<Gerenciador>(['JUDICIAL', 'DOCUMENTO', 'EXTRAJUDICIAL']);

function texto(valor: unknown): string | null {
  return typeof valor === 'string' && valor.length > 0 ? valor : null;
}

let clientePadrao: ClienteDocumentos | undefined;

/** Cliente reaproveitado entre invocações da mesma Lambda (fora do handler). */
export function obterClientePadrao(): ClienteDocumentos {
  clientePadrao ??= DynamoDBDocumentClient.from(new DynamoDBClient({}), {
    marshallOptions: { removeUndefinedValues: true },
  });
  return clientePadrao;
}

export class RepositorioDynamo implements RepositorioConsulta {
  constructor(
    private readonly nomeTabela: string,
    private readonly cliente: ClienteDocumentos = obterClientePadrao(),
  ) {
    if (!nomeTabela) {
      throw new Error('NOME_TABELA não configurado');
    }
  }

  private async consultar(entrada: Omit<QueryCommandInput, 'TableName'>): Promise<QueryCommandOutput> {
    return (await this.cliente.send(new QueryCommand({ TableName: this.nomeTabela, ...entrada }))) as QueryCommandOutput;
  }

  /** Consulta paginada até o fim (para partições pequenas: detalhe, contadores, informes). */
  private async consultarTudo(entrada: Omit<QueryCommandInput, 'TableName'>): Promise<Item[]> {
    const itens: Item[] = [];
    let inicio: Record<string, unknown> | undefined;
    for (let pagina = 0; pagina < MAXIMO_PAGINAS; pagina++) {
      const saida = await this.consultar({ ...entrada, ExclusiveStartKey: inicio });
      itens.push(...((saida.Items ?? []) as Item[]));
      inicio = saida.LastEvaluatedKey;
      if (!inicio) break;
    }
    return itens;
  }

  private async obterItem(pk: string, sk: string, projecao?: { expressao: string; nomes: Record<string, string> }) {
    const saida = (await this.cliente.send(
      new GetCommand({
        TableName: this.nomeTabela,
        Key: { PK: pk, SK: sk },
        ...(projecao
          ? { ProjectionExpression: projecao.expressao, ExpressionAttributeNames: projecao.nomes }
          : {}),
      }),
    )) as { Item?: Item };
    return saida.Item;
  }

  /** A1: `GetItem USR#<id>/PERFIL`. */
  async obterPerfilUsuario(idUsuario: string): Promise<PerfilUsuario | null> {
    const item = await this.obterItem(pkUsuario(idUsuario), SK_PERFIL);
    if (!item) return null;
    return {
      idUsuario: texto(item['idUsuario']) ?? idUsuario,
      nome: texto(item['nome']),
      cargo: texto(item['cargo']),
      siglaSetor: texto(item['siglaSetor']),
      ativo: item['ativo'] === true,
    };
  }

  /** `GetItem SETOR#<sigla>/PERFIL` (gerenciadores do setor para o seletor de visão). */
  async obterSetor(siglaSetor: string): Promise<Setor | null> {
    const item = await this.obterItem(pkSetor(siglaSetor), SK_PERFIL);
    if (!item) return null;
    const gerenciadores = String(item['gerenciadores'] ?? '')
      .split(';')
      .map((g) => g.trim())
      .filter((g): g is Gerenciador => GERENCIADORES.has(g));
    return {
      siglaSetor: texto(item['siglaSetor']) ?? siglaSetor,
      nome: texto(item['nome']),
      tipoSetor: texto(item['tipoSetor']),
      gerenciadores,
    };
  }

  /** A2: `Query PK=SETOR#<sigla>, begins_with(SK, "CONT#")`. */
  async obterContadores(siglaSetor: string): Promise<Contador[]> {
    const itens = await this.consultarTudo({
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefixo)',
      ExpressionAttributeValues: { ':pk': pkSetor(siglaSetor), ':prefixo': 'CONT#' },
    });
    return itens.map((item) => semChaves<Contador>(item));
  }

  /** A5: `Query GSI2 SETOR#<sigla>` ascendente, só ativos com `requerAcao = true`. */
  async listarProximosPrazos(siglaSetor: string, quantidade: number): Promise<Expediente[]> {
    const itens: Item[] = [];
    let inicio: Record<string, unknown> | undefined;
    for (let pagina = 0; pagina < MAXIMO_PAGINAS && itens.length < quantidade; pagina++) {
      const saida = await this.consultar({
        IndexName: INDICE_GSI2,
        KeyConditionExpression: 'GSI2PK = :pk AND begins_with(GSI2SK, :prefixo)',
        FilterExpression: 'requerAcao = :sim AND caixa <> :baixado',
        ExpressionAttributeValues: {
          ':pk': pkSetor(siglaSetor),
          ':prefixo': 'PRAZO#',
          ':sim': true,
          ':baixado': 'BAIXADO',
        },
        ScanIndexForward: true,
        Limit: ITENS_POR_PAGINA,
        ExclusiveStartKey: inicio,
      });
      itens.push(...((saida.Items ?? []) as Item[]));
      inicio = saida.LastEvaluatedKey;
      if (!inicio) break;
    }
    return itens.slice(0, quantidade).map((item) => semChaves<Expediente>(item));
  }

  /** A8: `Query PK=USR#<id>, begins_with(SK, "NOT#")` descendente, só não lidas, mais o total. */
  async listarAlertas(idUsuario: string, quantidade: number): Promise<AlertasUsuario> {
    const base = {
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefixo)',
      FilterExpression: 'lida = :nao',
      ExpressionAttributeValues: { ':pk': pkUsuario(idUsuario), ':prefixo': 'NOT#', ':nao': false },
    };
    const recentes = async (): Promise<Item[]> => {
      const itens: Item[] = [];
      let inicio: Record<string, unknown> | undefined;
      for (let pagina = 0; pagina < MAXIMO_PAGINAS && itens.length < quantidade; pagina++) {
        const saida = await this.consultar({
          ...base,
          ScanIndexForward: false,
          Limit: ITENS_POR_PAGINA,
          ExclusiveStartKey: inicio,
        });
        itens.push(...((saida.Items ?? []) as Item[]));
        inicio = saida.LastEvaluatedKey;
        if (!inicio) break;
      }
      return itens.slice(0, quantidade);
    };
    const contar = async (): Promise<number> => {
      let total = 0;
      let inicio: Record<string, unknown> | undefined;
      for (let pagina = 0; pagina < MAXIMO_PAGINAS; pagina++) {
        const saida = await this.consultar({ ...base, Select: 'COUNT', ExclusiveStartKey: inicio });
        total += saida.Count ?? 0;
        inicio = saida.LastEvaluatedKey;
        if (!inicio) break;
      }
      return total;
    };
    const [itens, totalNaoLidas] = await Promise.all([recentes(), contar()]);
    return { itens: itens.map((item) => semChaves<Notificacao>(item)), totalNaoLidas };
  }

  /** `GetItem EXP#<id>/META` com projeção dos campos de sigilo (máscara dos alertas). */
  async obterSigiloExpedientes(ids: readonly string[]): Promise<Map<string, SigiloExpediente>> {
    const unicos = [...new Set(ids.filter((id) => id.length > 0))];
    const resultados = await Promise.all(
      unicos.map(async (id) => {
        const item = await this.obterItem(pkExpediente(id), SK_META, {
          expressao: '#setor, #sigilo, #responsavel',
          nomes: { '#setor': 'siglaSetor', '#sigilo': 'nivelSigilo', '#responsavel': 'idResponsavel' },
        });
        return [id, item] as const;
      }),
    );
    const mapa = new Map<string, SigiloExpediente>();
    for (const [id, item] of resultados) {
      if (item && typeof item['siglaSetor'] === 'string' && typeof item['nivelSigilo'] === 'number') {
        mapa.set(id, {
          siglaSetor: item['siglaSetor'],
          nivelSigilo: item['nivelSigilo'],
          idResponsavel: texto(item['idResponsavel']),
        });
      }
    }
    return mapa;
  }

  /** A13: `Query PK=NOTICIA`. */
  async listarNoticias(): Promise<Noticia[]> {
    const itens = await this.consultarTudo({
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': PK_NOTICIA },
    });
    return itens.map((item) => semChaves<Noticia>(item));
  }

  /**
   * A3: `Query GSI1 SETOR#<sigla>, begins_with(GSI1SK, "ATIVO#[<ger>#[<caixa>#]]")`.
   * Sem gerenciador, a caixa vira filtro. `statusPrazo` é sempre filtro. O cursor é a chave
   * do último item devolvido (não o `LastEvaluatedKey`), para não perder itens filtrados.
   */
  async listarAtivosDoSetor(siglaSetor: string, opcoes: OpcoesListagem): Promise<PaginaExpedientes> {
    const gsi1pk = pkSetor(siglaSetor);
    const prefixo = prefixoAtivos(opcoes.gerenciador, opcoes.gerenciador ? opcoes.caixa : undefined);
    let inicio: Record<string, unknown> | undefined = opcoes.cursor
      ? { ...decodificarCursor(opcoes.cursor, gsi1pk, prefixo) }
      : undefined;

    const filtros: string[] = [];
    const valores: Record<string, unknown> = { ':pk': gsi1pk, ':prefixo': prefixo };
    const nomes: Record<string, string> = {};
    if (opcoes.caixa && !opcoes.gerenciador) {
      filtros.push('#caixa = :caixa');
      nomes['#caixa'] = 'caixa';
      valores[':caixa'] = opcoes.caixa;
    }
    if (opcoes.statusPrazo && opcoes.statusPrazo.length > 0) {
      const marcadores = opcoes.statusPrazo.map((status, i) => {
        valores[`:status${i}`] = status;
        return `:status${i}`;
      });
      filtros.push(`#statusPrazo IN (${marcadores.join(', ')})`);
      nomes['#statusPrazo'] = 'statusPrazo';
    }

    const itens: Item[] = [];
    let cursor: string | null = null;
    for (let pagina = 0; pagina < MAXIMO_PAGINAS; pagina++) {
      const saida = await this.consultar({
        IndexName: INDICE_GSI1,
        KeyConditionExpression: 'GSI1PK = :pk AND begins_with(GSI1SK, :prefixo)',
        ...(filtros.length > 0 ? { FilterExpression: filtros.join(' AND ') } : {}),
        ...(Object.keys(nomes).length > 0 ? { ExpressionAttributeNames: nomes } : {}),
        ExpressionAttributeValues: valores,
        Limit: Math.max(opcoes.limite, ITENS_POR_PAGINA),
        ExclusiveStartKey: inicio,
      });
      const recebidos = (saida.Items ?? []) as Item[];
      inicio = saida.LastEvaluatedKey;
      for (let i = 0; i < recebidos.length; i++) {
        const item = recebidos[i] as Item;
        itens.push(item);
        if (itens.length === opcoes.limite) {
          const ultimoDaConsulta = i === recebidos.length - 1 && !inicio;
          cursor = ultimoDaConsulta ? null : codificarCursor(item as unknown as ChaveGsi1);
          return { itens: itens.map((x) => semChaves<Expediente>(x)), cursor };
        }
      }
      if (!inicio) break;
    }
    // Teto de páginas atingido com mais itens a ler: continua do último avaliado.
    if (inicio) {
      cursor = codificarCursor(inicio as unknown as ChaveGsi1);
    }
    return { itens: itens.map((x) => semChaves<Expediente>(x)), cursor };
  }

  /** A6: `Query PK=EXP#<id>` (META, MOV#, PRZ#, DES#, ANO#, ROT#) numa única consulta. */
  async obterDetalhe(idExpediente: string): Promise<DetalheExpediente | null> {
    const itens = await this.consultarTudo({
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': pkExpediente(idExpediente) },
    });
    const meta = itens.find((item) => item['SK'] === SK_META);
    if (!meta) return null;
    const porPrefixo = (prefixo: string): ItemSeed[] =>
      itens.filter((item) => String(item['SK']).startsWith(prefixo)).map((item) => semChaves<ItemSeed>(item));
    return {
      expediente: semChaves<Expediente>(meta),
      movimentacoes: porPrefixo('MOV#'),
      prazos: porPrefixo('PRZ#'),
      designacoes: porPrefixo('DES#'),
      anotacoes: porPrefixo('ANO#'),
      marcadores: porPrefixo('ROT#'),
    };
  }
}
