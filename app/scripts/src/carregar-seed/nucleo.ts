/**
 * Lógica pura do carregador do seed (sem AWS): leitura de argumentos,
 * interpretação de cada linha do `itens.json`, fatiamento em lotes de 25,
 * backoff e conferência de contagens. Testada em `nucleo.test.ts`.
 */
import type { AttributeValue } from '@aws-sdk/client-dynamodb';

/** Limite do `BatchWriteItem` do DynamoDB. */
export const TAMANHO_LOTE = 25;

/** Caminho do kit relativo à raiz do repositório (nada em `resources/` é editado). */
export const ARQUIVO_PADRAO = 'resources/hackathon-expedientes/seed/saida/dynamodb/itens.json';

export type ItemDynamo = Record<string, AttributeValue>;

export interface Opcoes {
  readonly tabela: string;
  readonly regiao: string;
  /** Caminho do arquivo; relativo é resolvido a partir da raiz do repositório. */
  readonly arquivo: string;
  /** Gravações `BatchWriteItem` simultâneas. */
  readonly concorrencia: number;
  /** Apaga, após a gravação, os itens da tabela que não existem no arquivo (desligado por padrão). */
  readonly removerExtras: boolean;
  /** Teto de remoções: acima dele a remoção aborta sem apagar nada. */
  readonly maxRemocoes: number;
}

/** Padrão de `--max-remocoes`. */
export const MAX_REMOCOES_PADRAO = 2000;

/** Únicas entidades que `--remover-extras` pode apagar (resíduo de carga antiga do gerar_seed.py). */
export const ENTIDADES_REMOVIVEIS: ReadonlySet<string> = new Set(['notificacoes']);

const AJUDA =
  'Uso: carregar-seed [--tabela Expedientes] [--regiao us-east-1] [--arquivo <itens.json>] [--concorrencia 8]' +
  ' [--remover-extras [--max-remocoes 2000]]';

/** Opções sem valor (presença liga a opção). */
const OPCOES_BOOLEANAS = new Set(['remover-extras']);

/** Interpreta `--chave valor` ou `--chave=valor`. Lança erro com a ajuda em caso de uso inválido. */
export function interpretarArgumentos(argv: readonly string[]): Opcoes {
  const valores = new Map<string, string>();
  const ligadas = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? '';
    if (!arg.startsWith('--')) throw new Error(`Argumento inesperado: ${arg}\n${AJUDA}`);
    const [chave, embutido] = arg.slice(2).split(/=(.*)/s, 2) as [string, string | undefined];
    if (OPCOES_BOOLEANAS.has(chave)) {
      if (embutido !== undefined) throw new Error(`--${chave} não aceita valor\n${AJUDA}`);
      ligadas.add(chave);
      continue;
    }
    const valor = embutido ?? argv[++i];
    if (valor === undefined || valor === '') throw new Error(`Falta valor para --${chave}\n${AJUDA}`);
    valores.set(chave, valor);
  }
  const conhecidas = new Set(['tabela', 'regiao', 'arquivo', 'concorrencia', 'max-remocoes']);
  for (const chave of valores.keys()) {
    if (!conhecidas.has(chave)) throw new Error(`Opção desconhecida: --${chave}\n${AJUDA}`);
  }

  const tabela = valores.get('tabela') ?? 'Expedientes';
  if (!/^[A-Za-z0-9_.-]{3,255}$/.test(tabela)) throw new Error(`Nome de tabela inválido: ${tabela}`);
  const regiao = valores.get('regiao') ?? 'us-east-1';
  if (!/^[a-z]{2}(-[a-z]+)+-\d$/.test(regiao)) throw new Error(`Região inválida: ${regiao}`);

  return {
    tabela,
    regiao,
    arquivo: valores.get('arquivo') ?? ARQUIVO_PADRAO,
    concorrencia: valores.has('concorrencia')
      ? Math.min(inteiroPositivo('concorrencia', valores.get('concorrencia')!), 32)
      : 8,
    removerExtras: ligadas.has('remover-extras'),
    maxRemocoes: valores.has('max-remocoes')
      ? inteiroPositivo('max-remocoes', valores.get('max-remocoes')!)
      : MAX_REMOCOES_PADRAO,
  };
}

function inteiroPositivo(nome: string, valor: string): number {
  if (!/^\d+$/.test(valor) || Number(valor) < 1) throw new Error(`--${nome} deve ser inteiro positivo: ${valor}`);
  return Number(valor);
}

/**
 * Converte uma linha do `itens.json` (DynamoDB JSON) no item a gravar.
 * Aceita o formato do kit (`{"Item": {...}}`) e o item direto. Linha em branco
 * devolve `null`. Lança erro se faltar `PK`/`SK` String.
 */
export function interpretarLinha(linha: string, numero = 0): ItemDynamo | null {
  const texto = linha.trim();
  if (texto === '') return null;
  let bruto: unknown;
  try {
    bruto = JSON.parse(texto);
  } catch {
    throw new Error(`Linha ${numero}: JSON inválido`);
  }
  if (!ehObjeto(bruto)) throw new Error(`Linha ${numero}: esperado objeto`);
  const item = 'Item' in bruto ? bruto['Item'] : bruto;
  if (!ehObjeto(item)) throw new Error(`Linha ${numero}: "Item" não é objeto`);
  for (const chave of ['PK', 'SK']) {
    const atributo = item[chave];
    if (!ehObjeto(atributo) || typeof atributo['S'] !== 'string' || atributo['S'] === '') {
      throw new Error(`Linha ${numero}: falta ${chave} do tipo String`);
    }
  }
  return item as ItemDynamo;
}

function ehObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Agrupa os itens de uma sequência (síncrona ou assíncrona) em lotes de no máximo `tamanho`. */
export async function* fatiarEmLotes<T>(
  itens: Iterable<T> | AsyncIterable<T>,
  tamanho: number = TAMANHO_LOTE,
): AsyncGenerator<T[]> {
  if (!Number.isInteger(tamanho) || tamanho < 1) throw new Error('Tamanho de lote inválido');
  let lote: T[] = [];
  for await (const item of itens) {
    lote.push(item);
    if (lote.length === tamanho) {
      yield lote;
      lote = [];
    }
  }
  if (lote.length > 0) yield lote;
}

/** Espera (ms) antes da tentativa `n` (1, 2, ...) de reenviar `UnprocessedItems`: exponencial com teto. */
export function calcularEspera(tentativa: number, base = 100, teto = 5_000): number {
  return Math.min(teto, base * 2 ** Math.max(0, tentativa - 1));
}

/** Valor do atributo `entidade` (ou `(sem entidade)`), usado para conferir a carga por tipo. */
export function entidadeDe(item: ItemDynamo): string {
  return item['entidade']?.S ?? '(sem entidade)';
}

export interface Divergencia {
  readonly entidade: string;
  readonly esperado: number;
  readonly encontrado: number;
}

/** Lista as entidades cuja contagem na tabela difere da do arquivo (inclui as que só existem num dos lados). */
export function compararContagens(
  esperado: ReadonlyMap<string, number>,
  encontrado: ReadonlyMap<string, number>,
): Divergencia[] {
  const nomes = [...new Set([...esperado.keys(), ...encontrado.keys()])].sort();
  return nomes
    .map((entidade) => ({
      entidade,
      esperado: esperado.get(entidade) ?? 0,
      encontrado: encontrado.get(entidade) ?? 0,
    }))
    .filter((d) => d.esperado !== d.encontrado);
}

// ---------------------------------------------------------------------------
// Remoção de extras (--remover-extras): itens na tabela que não estão no arquivo.
// ---------------------------------------------------------------------------

/** Chave primária de um item da tabela, com a entidade para as salvaguardas. */
export interface ChaveItem {
  readonly pk: string;
  readonly sk: string;
  readonly entidade: string;
}

/** Separador que não ocorre em PK/SK do kit (caractere de controle US). */
const SEPARADOR_CHAVE = '\u001f';

/** Chave textual única de (PK, SK), usada no conjunto de chaves do arquivo. */
export function chaveTexto(pk: string, sk: string): string {
  return `${pk}${SEPARADOR_CHAVE}${sk}`;
}

/** Extrai (PK, SK, entidade) de um item; lança erro se faltar PK/SK String. */
export function chaveDe(item: ItemDynamo): ChaveItem {
  const pk = item['PK']?.S;
  const sk = item['SK']?.S;
  if (!pk || !sk) throw new Error('Item sem PK/SK String');
  return { pk, sk, entidade: entidadeDe(item) };
}

/** Itens da tabela cujas chaves (PK, SK) não estão no conjunto de chaves do arquivo. */
export function calcularExtras(chavesArquivo: ReadonlySet<string>, chavesTabela: Iterable<ChaveItem>): ChaveItem[] {
  const extras: ChaveItem[] = [];
  for (const c of chavesTabela) {
    if (!chavesArquivo.has(chaveTexto(c.pk, c.sk))) extras.push(c);
  }
  return extras;
}

/** Contagem dos extras por entidade. */
export function agruparPorEntidade(chaves: Iterable<ChaveItem>): Map<string, number> {
  const contagem = new Map<string, number>();
  for (const c of chaves) contagem.set(c.entidade, (contagem.get(c.entidade) ?? 0) + 1);
  return contagem;
}

export type ResultadoSalvaguardas = { readonly ok: true } | { readonly ok: false; readonly motivos: string[] };

/**
 * Checa as salvaguardas antes de apagar: todos os extras devem ser de entidade
 * removível e o total não pode passar de `maxRemocoes`. Qualquer violação
 * aborta a remoção inteira (nada é apagado).
 */
export function verificarSalvaguardas(
  extras: readonly ChaveItem[],
  maxRemocoes: number,
  permitidas: ReadonlySet<string> = ENTIDADES_REMOVIVEIS,
): ResultadoSalvaguardas {
  const motivos: string[] = [];
  const proibidas = [...agruparPorEntidade(extras)].filter(([e]) => !permitidas.has(e));
  if (proibidas.length > 0) {
    motivos.push(
      `extras de entidade não removível: ${proibidas.map(([e, n]) => `${e}=${n}`).join(', ')}` +
        ` (permitidas: ${[...permitidas].join(', ')})`,
    );
  }
  if (extras.length > maxRemocoes) motivos.push(`${extras.length} extras passam do limite --max-remocoes ${maxRemocoes}`);
  return motivos.length === 0 ? { ok: true } : { ok: false, motivos };
}
