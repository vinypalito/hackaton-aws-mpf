/**
 * Carga do seed do kit na tabela `Expedientes` (tarefa 1.3, Req. 2.1 e 2.3).
 *
 * Lê `itens.json` (DynamoDB JSON, um item por linha) em streaming e grava com
 * `BatchWriteItem` em lotes de 25, reenviando `UnprocessedItems` com backoff
 * exponencial. Não usa `gerar_seed.py --carregar` nem `--criar-tabela`: a
 * tabela vem da DadosStack e o arquivo do kit é a fonte única.
 *
 * Idempotente: `PutRequest` sobrescreve cada item com o mesmo conteúdo, então
 * rodar de novo é seguro e serve como verificação. Ao final confere o total e a
 * contagem por `entidade` na tabela (Scan paginado, aceitável só neste script
 * operacional) e sai com código ≠ 0 se divergir.
 *
 * `--remover-extras` (desligado por padrão): depois da gravação, apaga com
 * `DeleteRequest` os itens da tabela cujas chaves (PK, SK) não estão no
 * arquivo. Salvaguardas: imprime a contagem por entidade antes de apagar e
 * aborta sem apagar nada se algum extra não for `notificacoes` ou se o total
 * passar de `--max-remocoes` (padrão 2000).
 *
 * Uso (PowerShell): $Env:AWS_PROFILE="hackatongabinete"; npm run carregar-seed -w scripts
 */
import { createReadStream } from 'node:fs';
import { resolve, dirname, isAbsolute } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { setTimeout as esperar } from 'node:timers/promises';
import {
  BatchWriteItemCommand,
  DynamoDBClient,
  ScanCommand,
  type WriteRequest,
} from '@aws-sdk/client-dynamodb';
import {
  agruparPorEntidade,
  calcularEspera,
  calcularExtras,
  chaveDe,
  chaveTexto,
  compararContagens,
  entidadeDe,
  fatiarEmLotes,
  interpretarArgumentos,
  interpretarLinha,
  verificarSalvaguardas,
  type ChaveItem,
  type ItemDynamo,
} from './carregar-seed/nucleo.js';

/** Tentativas de reenvio de `UnprocessedItems` antes de desistir do lote. */
const MAX_TENTATIVAS = 10;

/** Raiz do repositório: app/scripts/src → ../../.. */
const RAIZ_REPOSITORIO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

async function* lerItens(
  caminho: string,
  porEntidade: Map<string, number>,
  chaves: Set<string>,
): AsyncGenerator<ItemDynamo> {
  const linhas = createInterface({ input: createReadStream(caminho, { encoding: 'utf8' }), crlfDelay: Infinity });
  let numero = 0;
  for await (const linha of linhas) {
    numero++;
    const item = interpretarLinha(linha, numero);
    if (item === null) continue;
    const entidade = entidadeDe(item);
    porEntidade.set(entidade, (porEntidade.get(entidade) ?? 0) + 1);
    const { pk, sk } = chaveDe(item);
    chaves.add(chaveTexto(pk, sk));
    yield item;
  }
}

async function gravarLote(cliente: DynamoDBClient, tabela: string, itens: ItemDynamo[]): Promise<void> {
  await enviarLote(cliente, tabela, itens.map((Item) => ({ PutRequest: { Item } })));
}

/** Envia um lote de `BatchWriteItem` (Put ou Delete), reenviando `UnprocessedItems` com backoff. */
async function enviarLote(cliente: DynamoDBClient, tabela: string, requisicoes: WriteRequest[]): Promise<void> {
  let pendentes = requisicoes;
  for (let tentativa = 1; pendentes.length > 0; tentativa++) {
    if (tentativa > MAX_TENTATIVAS) {
      throw new Error(`${pendentes.length} itens não processados após ${MAX_TENTATIVAS} tentativas`);
    }
    if (tentativa > 1) await esperar(calcularEspera(tentativa - 1));
    const resposta = await cliente.send(new BatchWriteItemCommand({ RequestItems: { [tabela]: pendentes } }));
    pendentes = resposta.UnprocessedItems?.[tabela] ?? [];
  }
}

/** Conta os itens da tabela por `entidade` (Scan paginado projetando só `entidade`). */
async function contarTabela(cliente: DynamoDBClient, tabela: string): Promise<Map<string, number>> {
  const contagem = new Map<string, number>();
  let inicio: ItemDynamo | undefined;
  do {
    const resposta = await cliente.send(
      new ScanCommand({
        TableName: tabela,
        ProjectionExpression: '#e',
        ExpressionAttributeNames: { '#e': 'entidade' },
        ExclusiveStartKey: inicio,
      }),
    );
    for (const item of resposta.Items ?? []) {
      const entidade = entidadeDe(item);
      contagem.set(entidade, (contagem.get(entidade) ?? 0) + 1);
    }
    inicio = resposta.LastEvaluatedKey;
  } while (inicio);
  return contagem;
}

/** Lista (PK, SK, entidade) de todos os itens da tabela (Scan paginado, projeção mínima). */
async function listarChaves(cliente: DynamoDBClient, tabela: string): Promise<ChaveItem[]> {
  const chaves: ChaveItem[] = [];
  let inicio: ItemDynamo | undefined;
  do {
    const resposta = await cliente.send(
      new ScanCommand({
        TableName: tabela,
        ProjectionExpression: '#pk, #sk, #e',
        ExpressionAttributeNames: { '#pk': 'PK', '#sk': 'SK', '#e': 'entidade' },
        ExclusiveStartKey: inicio,
      }),
    );
    for (const item of resposta.Items ?? []) chaves.push(chaveDe(item));
    inicio = resposta.LastEvaluatedKey;
  } while (inicio);
  return chaves;
}

/**
 * Remove os itens da tabela ausentes do arquivo. Imprime a contagem por
 * entidade e aborta sem apagar nada se alguma salvaguarda falhar.
 * Devolve o número de itens removidos.
 */
async function removerExtras(
  cliente: DynamoDBClient,
  tabela: string,
  chavesArquivo: ReadonlySet<string>,
  maxRemocoes: number,
  concorrencia: number,
): Promise<number> {
  console.log('Procurando itens extras na tabela (Scan paginado de PK/SK/entidade)...');
  const extras = calcularExtras(chavesArquivo, await listarChaves(cliente, tabela));
  console.log(`Extras encontrados: ${extras.length}`);
  if (extras.length === 0) return 0;
  console.table([...agruparPorEntidade(extras)].sort().map(([entidade, extrasQtd]) => ({ entidade, extras: extrasQtd })));

  const salvaguardas = verificarSalvaguardas(extras, maxRemocoes);
  if (!salvaguardas.ok) {
    for (const m of salvaguardas.motivos) console.error(`  BLOQUEADO: ${m}`);
    throw new Error('Remoção abortada pelas salvaguardas; nenhum item foi apagado.');
  }

  let removidos = 0;
  const emAndamento = new Set<Promise<void>>();
  let falha: unknown;
  for await (const lote of fatiarEmLotes(extras)) {
    if (falha) break;
    const requisicoes: WriteRequest[] = lote.map((c) => ({
      DeleteRequest: { Key: { PK: { S: c.pk }, SK: { S: c.sk } } },
    }));
    const tarefa: Promise<void> = enviarLote(cliente, tabela, requisicoes)
      .then(() => {
        removidos += lote.length;
      })
      .catch((erro: unknown) => {
        falha ??= erro;
      })
      .finally(() => emAndamento.delete(tarefa));
    emAndamento.add(tarefa);
    if (emAndamento.size >= concorrencia) await Promise.race(emAndamento);
  }
  await Promise.all(emAndamento);
  if (falha) throw falha;
  console.log(`Removidos ${removidos} itens extras.`);
  return removidos;
}

const somar = (m: ReadonlyMap<string, number>): number => [...m.values()].reduce((a, b) => a + b, 0);

async function principal(): Promise<number> {
  const opcoes = interpretarArgumentos(process.argv.slice(2));
  const arquivo = isAbsolute(opcoes.arquivo) ? opcoes.arquivo : resolve(RAIZ_REPOSITORIO, opcoes.arquivo);
  const cliente = new DynamoDBClient({ region: opcoes.regiao, maxAttempts: 8 });

  console.log(`Carregando ${arquivo} → tabela ${opcoes.tabela} (${opcoes.regiao}), concorrência ${opcoes.concorrencia}`);
  const inicio = Date.now();
  const porEntidadeArquivo = new Map<string, number>();
  const chavesArquivo = new Set<string>();
  const emAndamento = new Set<Promise<void>>();
  let gravados = 0;
  let falha: unknown;

  for await (const lote of fatiarEmLotes(lerItens(arquivo, porEntidadeArquivo, chavesArquivo))) {
    if (falha) break;
    const tarefa: Promise<void> = gravarLote(cliente, opcoes.tabela, lote)
      .then(() => {
        gravados += lote.length;
        if (gravados % 5_000 < lote.length) console.log(`  ${gravados} itens gravados...`);
      })
      .catch((erro: unknown) => {
        falha ??= erro;
      })
      .finally(() => emAndamento.delete(tarefa));
    emAndamento.add(tarefa);
    // Concorrência limitada: espera uma vaga antes de ler o próximo lote.
    if (emAndamento.size >= opcoes.concorrencia) await Promise.race(emAndamento);
  }
  await Promise.all(emAndamento);
  if (falha) throw falha;

  const lidos = somar(porEntidadeArquivo);
  console.log(`Gravação concluída: ${gravados}/${lidos} itens em ${((Date.now() - inicio) / 1000).toFixed(1)} s`);

  if (opcoes.removerExtras) {
    await removerExtras(cliente, opcoes.tabela, chavesArquivo, opcoes.maxRemocoes, opcoes.concorrencia);
  }

  console.log('Conferindo a tabela (Scan paginado)...');
  const porEntidadeTabela = await contarTabela(cliente, opcoes.tabela);
  const total = somar(porEntidadeTabela);
  const divergencias = compararContagens(porEntidadeArquivo, porEntidadeTabela);

  console.table(
    [...porEntidadeArquivo.keys()].sort().map((entidade) => ({
      entidade,
      arquivo: porEntidadeArquivo.get(entidade),
      tabela: porEntidadeTabela.get(entidade) ?? 0,
    })),
  );
  console.log(`Total na tabela: ${total} (esperado ${lidos})`);

  if (gravados !== lidos || total !== lidos || divergencias.length > 0) {
    for (const d of divergencias) console.error(`  DIVERGE ${d.entidade}: arquivo ${d.esperado}, tabela ${d.encontrado}`);
    console.error('FALHA: a contagem da tabela não confere com o arquivo do kit.');
    return 1;
  }
  console.log('OK: contagem total e por entidade conferem com o arquivo do kit.');
  return 0;
}

principal().then(
  (codigo) => {
    process.exitCode = codigo;
  },
  (erro: unknown) => {
    // Sem stack trace: só nome e mensagem (ex.: ExpiredTokenException).
    const e = erro as { name?: string; message?: string };
    console.error(`ERRO: ${e.name ?? 'Erro'}: ${e.message ?? String(erro)}`);
    process.exitCode = 2;
  },
);
