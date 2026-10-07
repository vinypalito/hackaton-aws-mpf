import { GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { describe, expect, it } from 'vitest';
import { codificarCursor, decodificarCursor } from './cursor.js';
import { RepositorioDynamo, type ClienteDocumentos } from './dynamo.js';
import { CursorInvalidoError } from './tipos.js';

type Entrada = Record<string, any>;

/** Cliente que grava os comandos e responde com páginas pré-definidas. */
class ClienteGravador implements ClienteDocumentos {
  public readonly comandos: (QueryCommand | GetCommand)[] = [];
  constructor(private readonly respostas: unknown[]) {}
  async send(comando: QueryCommand | GetCommand) {
    this.comandos.push(comando);
    return this.respostas.shift() ?? { Items: [] };
  }
  entrada(i: number): Entrada {
    return this.comandos[i]?.input as Entrada;
  }
}

const itemAtivo = (id: string, caixa = 'A_RECEBER') => ({
  PK: `EXP#${id}`,
  SK: 'META',
  GSI1PK: 'SETOR#GABSUB3-DVT',
  GSI1SK: `ATIVO#JUD#${caixa}#2026-10-05T03:58:00-03:00#${id}`,
  GSI2PK: 'SETOR#GABSUB3-DVT',
  GSI2SK: `PRAZO#2026-10-06#050#${id}`,
  entidade: 'expedientes',
  idExpediente: id,
  siglaSetor: 'GABSUB3-DVT',
  caixa,
  nivelSigilo: 0,
});

describe('RepositorioDynamo', () => {
  it('lista ativos por GSI1 com prefixo do gerenciador e caixa, sem chaves na saída', async () => {
    const cliente = new ClienteGravador([{ Items: [itemAtivo('EXP000001'), itemAtivo('EXP000002')] }]);
    const repo = new RepositorioDynamo('Expedientes', cliente);
    const pagina = await repo.listarAtivosDoSetor('GABSUB3-DVT', {
      gerenciador: 'JUDICIAL',
      caixa: 'A_RECEBER',
      statusPrazo: ['VENCIDO'],
      limite: 50,
    });
    const entrada = cliente.entrada(0);
    expect(cliente.comandos[0]).toBeInstanceOf(QueryCommand);
    expect(entrada).toMatchObject({
      TableName: 'Expedientes',
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :pk AND begins_with(GSI1SK, :prefixo)',
      FilterExpression: '#statusPrazo IN (:status0)',
      ExpressionAttributeValues: { ':pk': 'SETOR#GABSUB3-DVT', ':prefixo': 'ATIVO#JUD#A_RECEBER#', ':status0': 'VENCIDO' },
    });
    expect(pagina.cursor).toBeNull();
    expect(pagina.itens[0]).not.toHaveProperty('PK');
    expect(pagina.itens[0]).not.toHaveProperty('GSI1SK');
    expect(pagina.itens[0]).not.toHaveProperty('entidade');
  });

  it('sem gerenciador, usa o prefixo ATIVO# e filtra a caixa', async () => {
    const cliente = new ClienteGravador([{ Items: [] }]);
    await new RepositorioDynamo('Expedientes', cliente).listarAtivosDoSetor('GABSUB3-DVT', {
      caixa: 'NO_SETOR',
      limite: 10,
    });
    expect(cliente.entrada(0)).toMatchObject({
      FilterExpression: '#caixa = :caixa',
      ExpressionAttributeNames: { '#caixa': 'caixa' },
      ExpressionAttributeValues: { ':prefixo': 'ATIVO#', ':caixa': 'NO_SETOR' },
    });
  });

  it('gera cursor com a chave do último item devolvido e o aceita na próxima página', async () => {
    const cliente = new ClienteGravador([
      { Items: [itemAtivo('EXP000001'), itemAtivo('EXP000002'), itemAtivo('EXP000003')], LastEvaluatedKey: {} },
    ]);
    const repo = new RepositorioDynamo('Expedientes', cliente);
    const pagina = await repo.listarAtivosDoSetor('GABSUB3-DVT', { limite: 2 });
    expect(pagina.itens.map((e) => e.idExpediente)).toEqual(['EXP000001', 'EXP000002']);
    expect(pagina.cursor).not.toBeNull();
    await repo.listarAtivosDoSetor('GABSUB3-DVT', { limite: 2, cursor: pagina.cursor as string });
    expect(cliente.entrada(1)['ExclusiveStartKey']).toEqual({
      PK: 'EXP#EXP000002',
      SK: 'META',
      GSI1PK: 'SETOR#GABSUB3-DVT',
      GSI1SK: itemAtivo('EXP000002').GSI1SK,
    });
  });

  it('rejeita cursor de outro setor, adulterado ou de outra consulta', async () => {
    const repo = new RepositorioDynamo('Expedientes', new ClienteGravador([]));
    const deOutroSetor = codificarCursor({ ...itemAtivo('EXP000001'), GSI1PK: 'SETOR#CIVINT/STIC' });
    await expect(repo.listarAtivosDoSetor('GABSUB3-DVT', { limite: 5, cursor: deOutroSetor })).rejects.toBeInstanceOf(
      CursorInvalidoError,
    );
    expect(() => decodificarCursor('nao-e-json', 'SETOR#GABSUB3-DVT', 'ATIVO#')).toThrow(CursorInvalidoError);
    const historico = codificarCursor({ ...itemAtivo('EXP000001'), GSI1SK: 'HIST#JUD#x' });
    expect(() => decodificarCursor(historico, 'SETOR#GABSUB3-DVT', 'ATIVO#')).toThrow(CursorInvalidoError);
    const valido = codificarCursor(itemAtivo('EXP000001'));
    expect(() => decodificarCursor(valido, 'SETOR#GABSUB3-DVT', 'ATIVO#DOC#')).toThrow(CursorInvalidoError);
  });

  it('próximos prazos: GSI2 ascendente filtrando requerAcao e baixados', async () => {
    const cliente = new ClienteGravador([{ Items: [itemAtivo('EXP000001')] }]);
    const itens = await new RepositorioDynamo('Expedientes', cliente).listarProximosPrazos('GABSUB3-DVT', 10);
    expect(itens).toHaveLength(1);
    expect(cliente.entrada(0)).toMatchObject({
      IndexName: 'GSI2',
      ScanIndexForward: true,
      FilterExpression: 'requerAcao = :sim AND caixa <> :baixado',
      ExpressionAttributeValues: { ':pk': 'SETOR#GABSUB3-DVT', ':sim': true, ':baixado': 'BAIXADO' },
    });
  });

  it('alertas: NOT# descendente só não lidas, com contagem total', async () => {
    const cliente = new ClienteGravador([
      { Items: [{ PK: 'USR#U1', SK: 'NOT#2026#N1', idNotificacao: 'N1', lida: false }] },
      { Count: 7 },
    ]);
    const alertas = await new RepositorioDynamo('Expedientes', cliente).listarAlertas('U1', 5);
    expect(alertas.totalNaoLidas).toBe(7);
    expect(alertas.itens).toEqual([{ idNotificacao: 'N1', lida: false }]);
    expect(cliente.entrada(0)).toMatchObject({ ScanIndexForward: false, FilterExpression: 'lida = :nao' });
    expect(cliente.entrada(1)).toMatchObject({ Select: 'COUNT' });
  });

  it('detalhe: uma Query por PK=EXP#<id>, separando os itens por prefixo de SK', async () => {
    const cliente = new ClienteGravador([
      {
        Items: [
          { PK: 'EXP#EXP000001', SK: 'ANO#2026#A1', idAnotacao: 'A1' },
          itemAtivo('EXP000001'),
          { PK: 'EXP#EXP000001', SK: 'MOV#2026-10-01#M1', idMovimentacao: 'M1' },
          { PK: 'EXP#EXP000001', SK: 'MOV#2026-10-02#M2', idMovimentacao: 'M2' },
          { PK: 'EXP#EXP000001', SK: 'PRZ#P1', idPrazo: 'P1' },
          { PK: 'EXP#EXP000001', SK: 'ROT#R1', idRotulo: 'R1' },
        ],
      },
    ]);
    const detalhe = await new RepositorioDynamo('Expedientes', cliente).obterDetalhe('EXP000001');
    expect(cliente.comandos).toHaveLength(1);
    expect(cliente.entrada(0)).toMatchObject({ KeyConditionExpression: 'PK = :pk' });
    expect(detalhe?.expediente.idExpediente).toBe('EXP000001');
    expect(detalhe?.movimentacoes.map((m) => m['idMovimentacao'])).toEqual(['M1', 'M2']);
    expect(detalhe?.anotacoes).toEqual([{ idAnotacao: 'A1' }]);
    expect(detalhe?.prazos).toHaveLength(1);
    expect(detalhe?.marcadores).toHaveLength(1);
    expect(detalhe?.designacoes).toEqual([]);
  });

  it('detalhe inexistente devolve null', async () => {
    const detalhe = await new RepositorioDynamo('Expedientes', new ClienteGravador([{ Items: [] }])).obterDetalhe(
      'EXP999999',
    );
    expect(detalhe).toBeNull();
  });

  it('perfil do usuário por GetItem USR#<id>/PERFIL', async () => {
    const cliente = new ClienteGravador([{ Item: { PK: 'USR#U1', SK: 'PERFIL', idUsuario: 'U1', nome: 'Ana', ativo: true } }]);
    const perfil = await new RepositorioDynamo('Expedientes', cliente).obterPerfilUsuario('U1');
    expect(cliente.comandos[0]).toBeInstanceOf(GetCommand);
    expect(cliente.entrada(0)['Key']).toEqual({ PK: 'USR#U1', SK: 'PERFIL' });
    expect(perfil).toMatchObject({ idUsuario: 'U1', nome: 'Ana', ativo: true });
  });
});
