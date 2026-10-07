import { describe, expect, it } from 'vitest';
import {
  ARQUIVO_PADRAO,
  TAMANHO_LOTE,
  calcularEspera,
  compararContagens,
  entidadeDe,
  fatiarEmLotes,
  interpretarArgumentos,
  interpretarLinha,
  MAX_REMOCOES_PADRAO,
  agruparPorEntidade,
  calcularExtras,
  chaveDe,
  chaveTexto,
  verificarSalvaguardas,
  type ChaveItem,
} from './nucleo.js';

async function coletar<T>(gerador: AsyncIterable<T>): Promise<T[]> {
  const saida: T[] = [];
  for await (const x of gerador) saida.push(x);
  return saida;
}

describe('interpretarArgumentos', () => {
  it('usa os padrões: tabela Expedientes, us-east-1 e o itens.json do kit', () => {
    expect(interpretarArgumentos([])).toEqual({
      tabela: 'Expedientes',
      regiao: 'us-east-1',
      arquivo: ARQUIVO_PADRAO,
      concorrencia: 8,
      removerExtras: false,
      maxRemocoes: MAX_REMOCOES_PADRAO,
    });
    expect(MAX_REMOCOES_PADRAO).toBe(2000);
  });

  it('--remover-extras é booleana e --max-remocoes exige inteiro positivo', () => {
    expect(interpretarArgumentos(['--remover-extras', '--tabela', 'T1x'])).toMatchObject({
      removerExtras: true,
      tabela: 'T1x',
      maxRemocoes: 2000,
    });
    expect(interpretarArgumentos(['--max-remocoes=10', '--remover-extras']).maxRemocoes).toBe(10);
    expect(() => interpretarArgumentos(['--remover-extras=sim'])).toThrow(/não aceita valor/);
    expect(() => interpretarArgumentos(['--max-remocoes', '-1'])).toThrow(/inteiro positivo/);
  });

  it('aceita --chave valor e --chave=valor', () => {
    const o = interpretarArgumentos(['--tabela', 'Teste', '--regiao=sa-east-1', '--arquivo', 'x.json']);
    expect(o).toMatchObject({ tabela: 'Teste', regiao: 'sa-east-1', arquivo: 'x.json' });
  });

  it('rejeita opção desconhecida, valor ausente e valores inválidos', () => {
    expect(() => interpretarArgumentos(['--carregar'])).toThrow(/Falta valor/);
    expect(() => interpretarArgumentos(['--criar-tabela', 'sim'])).toThrow(/desconhecida/);
    expect(() => interpretarArgumentos(['--tabela', 'a b'])).toThrow(/tabela inválido/);
    expect(() => interpretarArgumentos(['--regiao', 'qualquer'])).toThrow(/Região/);
    expect(() => interpretarArgumentos(['--concorrencia', '0'])).toThrow(/inteiro positivo/);
  });
});

describe('interpretarLinha', () => {
  const item = { PK: { S: 'SETOR#X' }, SK: { S: 'PERFIL' }, entidade: { S: 'setores' }, n: { N: '1' } };

  it('lê o formato do kit {"Item": {...}} e o item direto', () => {
    expect(interpretarLinha(JSON.stringify({ Item: item }))).toEqual(item);
    expect(interpretarLinha(JSON.stringify(item))).toEqual(item);
  });

  it('ignora linha em branco (inclusive com \\r do Windows)', () => {
    expect(interpretarLinha('')).toBeNull();
    expect(interpretarLinha('  \r')).toBeNull();
  });

  it('rejeita JSON inválido e item sem PK/SK String', () => {
    expect(() => interpretarLinha('{', 7)).toThrow(/Linha 7: JSON inválido/);
    expect(() => interpretarLinha('[]')).toThrow(/objeto/);
    expect(() => interpretarLinha(JSON.stringify({ Item: { PK: { S: 'a' } } }))).toThrow(/SK/);
    expect(() => interpretarLinha(JSON.stringify({ PK: { N: '1' }, SK: { S: 'b' } }))).toThrow(/PK/);
  });
});

describe('fatiarEmLotes', () => {
  it('fatia em lotes de 25 sem perder nem repetir itens', async () => {
    const itens = Array.from({ length: 101 }, (_, i) => i);
    const lotes = await coletar(fatiarEmLotes(itens));
    expect(TAMANHO_LOTE).toBe(25);
    expect(lotes.map((l) => l.length)).toEqual([25, 25, 25, 25, 1]);
    expect(lotes.flat()).toEqual(itens);
  });

  it('não emite lote vazio e aceita fonte assíncrona', async () => {
    expect(await coletar(fatiarEmLotes([]))).toEqual([]);
    async function* fonte() {
      yield* [1, 2, 3];
    }
    expect(await coletar(fatiarEmLotes(fonte(), 2))).toEqual([[1, 2], [3]]);
  });
});

describe('calcularEspera', () => {
  it('cresce exponencialmente até o teto', () => {
    expect([1, 2, 3, 4].map((t) => calcularEspera(t))).toEqual([100, 200, 400, 800]);
    expect(calcularEspera(20)).toBe(5_000);
  });
});

describe('entidadeDe e compararContagens', () => {
  it('lê a entidade do item', () => {
    expect(entidadeDe({ entidade: { S: 'prazos' } })).toBe('prazos');
    expect(entidadeDe({})).toBe('(sem entidade)');
  });

  it('aponta só as entidades divergentes, inclusive as ausentes num dos lados', () => {
    const arquivo = new Map([
      ['setores', 3],
      ['prazos', 5],
    ]);
    expect(compararContagens(arquivo, new Map(arquivo))).toEqual([]);
    expect(
      compararContagens(
        arquivo,
        new Map([
          ['setores', 3],
          ['prazos', 4],
          ['extra', 1],
        ]),
      ),
    ).toEqual([
      { entidade: 'extra', esperado: 0, encontrado: 1 },
      { entidade: 'prazos', esperado: 5, encontrado: 4 },
    ]);
  });
});

describe('remoção de extras', () => {
  const not = (n: number): ChaveItem => ({ pk: 'USR#u1', sk: `NOT#${n}`, entidade: 'notificacoes' });
  const arquivo = new Set([chaveTexto('SETOR#A', 'PERFIL'), chaveTexto('USR#u1', 'NOT#1')]);

  it('chaveDe lê PK/SK/entidade e rejeita item sem chave', () => {
    expect(chaveDe({ PK: { S: 'a' }, SK: { S: 'b' }, entidade: { S: 'x' } })).toEqual({ pk: 'a', sk: 'b', entidade: 'x' });
    expect(() => chaveDe({ PK: { S: 'a' } })).toThrow(/PK\/SK/);
  });

  it('calcularExtras devolve só as chaves da tabela ausentes do arquivo', () => {
    const tabela: ChaveItem[] = [{ pk: 'SETOR#A', sk: 'PERFIL', entidade: 'setores' }, not(1), not(2), not(3)];
    expect(calcularExtras(arquivo, tabela)).toEqual([not(2), not(3)]);
    expect(calcularExtras(arquivo, [])).toEqual([]);
  });

  it('chaveTexto não confunde PK e SK concatenadas', () => {
    expect(chaveTexto('A#', 'B')).not.toBe(chaveTexto('A', '#B'));
  });

  it('agruparPorEntidade conta os extras por entidade', () => {
    expect(agruparPorEntidade([not(1), not(2), { pk: 'p', sk: 's', entidade: 'prazos' }])).toEqual(
      new Map([
        ['notificacoes', 2],
        ['prazos', 1],
      ]),
    );
  });

  it('verificarSalvaguardas libera só notificacoes dentro do limite', () => {
    expect(verificarSalvaguardas([not(1), not(2)], 2)).toEqual({ ok: true });
    expect(verificarSalvaguardas([], 2000)).toEqual({ ok: true });

    const acima = verificarSalvaguardas([not(1), not(2), not(3)], 2);
    expect(acima.ok).toBe(false);
    expect(!acima.ok && acima.motivos.join()).toMatch(/limite --max-remocoes 2/);

    const proibida = verificarSalvaguardas([not(1), { pk: 'X', sk: 'Y', entidade: 'expedientes' }], 2000);
    expect(proibida.ok).toBe(false);
    expect(!proibida.ok && proibida.motivos.join()).toMatch(/expedientes=1/);

    const semEntidade = verificarSalvaguardas([{ pk: 'X', sk: 'Y', entidade: '(sem entidade)' }], 2000);
    expect(semEntidade.ok).toBe(false);
  });
});
