import { TEXTO_SIGILOSO } from '@painel/dominio';
import { describe, expect, it } from 'vitest';
import type { Expediente } from '../repositorio/tipos.js';
import { RegistradorMemoria, RepositorioMemoria, claimsDe, eventoApi } from '../teste/apoio.js';
import { criarHandlerDetalheExpediente } from './detalhe-expediente.js';
import { criarHandlerHome, filtrarInformesVigentes } from './home.js';
import { criarHandlerListarExpedientes } from './listar-expedientes.js';
import { criarHandlerMe } from './me.js';

const DATA_REFERENCIA = '2026-10-07T17:00:00-03:00';
const SETOR = 'GABSUB3-DVT';
const OUTRO_SETOR = 'CIVINT/STIC';
const MEMBRO = claimsDe('GABSUB3-DVT-U01', SETOR, 'MEMBRO');
const CHEFE = claimsDe('GABSUB3-DVT-U02', SETOR, 'CHEFE');
const SERVIDOR = claimsDe('GABSUB3-DVT-U03', SETOR, 'SERVIDOR');
const SERVIDOR_OUTRO_SETOR = claimsDe('CIVINT-STIC-U02', OUTRO_SETOR, 'SERVIDOR');

function expediente(id: string, extra: Partial<Expediente> = {}): Expediente {
  return {
    idExpediente: id,
    siglaSetor: SETOR,
    gerenciador: 'JUDICIAL',
    caixa: 'A_RECEBER',
    statusPrazo: 'VENCIDO',
    requerAcao: true,
    nivelSigilo: 0,
    idResponsavel: 'GABSUB3-DVT-U01',
    etiqueta: `PGR-${id}`,
    assunto: 'Assunto público',
    resumo: 'Resumo público',
    tema: 'Tema público',
    ...extra,
  };
}

const SIGILOSO = expediente('EXP000010', {
  nivelSigilo: 1,
  idResponsavel: 'GABSUB3-DVT-U01',
  assunto: 'Assunto secreto',
  resumo: 'Resumo secreto',
  tema: 'Tema secreto',
});

function criarRepositorio(): RepositorioMemoria {
  return new RepositorioMemoria({
    usuarios: [
      { idUsuario: 'GABSUB3-DVT-U01', nome: 'Ana Exemplo', cargo: 'Subprocurador(a)', siglaSetor: SETOR, ativo: true },
    ],
    setores: [{ siglaSetor: SETOR, nome: 'Gabinete', tipoSetor: 'GABINETE', gerenciadores: ['JUDICIAL', 'DOCUMENTO'] }],
    contadores: {
      [SETOR]: [
        { gerenciador: 'TODOS', aReceber: 30 },
        { gerenciador: 'JUDICIAL', aReceber: 17 },
      ],
    },
    expedientes: [
      expediente('EXP000001'),
      SIGILOSO,
      expediente('EXP000020', { caixa: 'BAIXADO', requerAcao: false }),
      expediente('EXP003000', { siglaSetor: OUTRO_SETOR, idResponsavel: 'CIVINT-STIC-U02' }),
    ],
    detalhes: {
      EXP000010: {
        movimentacoes: [{ idMovimentacao: 'MOV1', tipoMovimentacao: 'CADASTRO', descricao: 'Descrição secreta' }],
        prazos: [{ idPrazo: 'PRZ1', situacao: 'ABERTO' }],
        designacoes: [],
        anotacoes: [{ idAnotacao: 'ANO1', texto: 'Anotação secreta' }],
        marcadores: [],
      },
    },
    notificacoes: {
      'GABSUB3-DVT-U03': [
        { idNotificacao: 'NOT1', idExpediente: 'EXP000010', mensagem: 'Mensagem sobre o sigiloso', lida: false },
        { idNotificacao: 'NOT2', idExpediente: 'EXP000001', mensagem: 'Mensagem pública', lida: false },
        { idNotificacao: 'NOT3', idExpediente: 'EXP000001', mensagem: 'Lida', lida: true },
      ],
    },
    noticias: [
      { idNoticia: 1, prioridade: 2, destaque: false, dataInicioExibicao: '2026-10-01T10:00:00-03:00', dataFimExibicao: '2026-11-01' },
      { idNoticia: 2, prioridade: 1, destaque: true, dataInicioExibicao: '2026-10-02T11:00:00-03:00', dataFimExibicao: '2026-11-01' },
      { idNoticia: 3, prioridade: 1, destaque: false, dataInicioExibicao: '2026-10-08T00:00:00-03:00', dataFimExibicao: '2026-11-01' },
      { idNoticia: 4, prioridade: 1, destaque: true, dataInicioExibicao: '2026-09-01T00:00:00-03:00', dataFimExibicao: '2026-10-06' },
    ],
  });
}

function deps(repositorio = criarRepositorio()) {
  return {
    repositorio,
    dataReferencia: DATA_REFERENCIA,
    registrador: new RegistradorMemoria(),
    origensPermitidas: ['http://localhost:4200'],
  };
}

const corpo = (resposta: { body: string }) => JSON.parse(resposta.body) as Record<string, unknown>;

describe('envelope (claims, erros, CORS)', () => {
  it('responde 401 sem claims do authorizer (Req. 1.5)', async () => {
    const d = deps();
    const resposta = await criarHandlerMe(d)(eventoApi({ claims: null }));
    expect(resposta.statusCode).toBe(401);
    expect(corpo(resposta)).toEqual({
      codigo: 'NAO_AUTENTICADO',
      mensagem: 'Autenticação necessária',
      correlationId: 'req-teste-1',
    });
    expect(d.repositorio.chamadas).toHaveLength(0);
  });

  it('responde 401 com perfil desconhecido nas claims', async () => {
    const resposta = await criarHandlerMe(deps())(eventoApi({ claims: claimsDe('X-U01', SETOR, 'ADMIN') }));
    expect(resposta.statusCode).toBe(401);
  });

  it('erro inesperado vira 500 genérico, sem stack trace nem mensagem interna', async () => {
    const d = deps();
    d.repositorio.falharEm.add('obterPerfilUsuario');
    const resposta = await criarHandlerMe(d)(eventoApi({ claims: MEMBRO }));
    expect(resposta.statusCode).toBe(500);
    expect(resposta.body).not.toMatch(/falha simulada|at /);
    expect(corpo(resposta)['codigo']).toBe('ERRO_INTERNO');
    expect(d.registrador.linhas.at(-1)?.campos).toMatchObject({ status: 500, erro: 'Error' });
  });

  it('só devolve Access-Control-Allow-Origin para origem permitida', async () => {
    const permitida = await criarHandlerMe(deps())(
      eventoApi({ claims: MEMBRO, headers: { Origin: 'http://localhost:4200' } }),
    );
    expect(permitida.headers?.['Access-Control-Allow-Origin']).toBe('http://localhost:4200');
    const outra = await criarHandlerMe(deps())(eventoApi({ claims: MEMBRO, headers: { origin: 'https://malicioso.exemplo' } }));
    expect(outra.headers?.['Access-Control-Allow-Origin']).toBeUndefined();
  });

  it('registra no log só campos da lista branca', async () => {
    const d = deps();
    await criarHandlerDetalheExpediente(d)(eventoApi({ claims: CHEFE, path: { id: 'EXP000010' } }));
    const linha = d.registrador.linhas.at(-1);
    expect(Object.keys(linha?.campos ?? {}).sort()).toEqual(
      ['correlationId', 'idExpediente', 'idUsuario', 'latenciaMs', 'rota', 'status'].sort(),
    );
  });
});

describe('GET /me', () => {
  it('usa setor, perfil e usuário só das claims e devolve a data de referência (Req. 1.4, 1.8)', async () => {
    const d = deps();
    const resposta = await criarHandlerMe(d)(
      eventoApi({ claims: MEMBRO, query: { siglaSetor: OUTRO_SETOR, idUsuario: 'CIVINT-STIC-U02', perfil: 'CHEFE' } }),
    );
    expect(resposta.statusCode).toBe(200);
    expect(corpo(resposta)).toMatchObject({
      idUsuario: 'GABSUB3-DVT-U01',
      nome: 'Ana Exemplo',
      siglaSetor: SETOR,
      perfil: 'MEMBRO',
      gerenciadores: ['JUDICIAL', 'DOCUMENTO'],
      dataReferencia: DATA_REFERENCIA,
    });
    expect(d.repositorio.chamadas.map((c) => c.args[0])).toEqual(['GABSUB3-DVT-U01', SETOR]);
  });
});

describe('GET /expedientes', () => {
  it('lista só ativos do setor das claims, ignorando siglaSetor da query (RN7, Req. 1.4)', async () => {
    const d = deps();
    const resposta = await criarHandlerListarExpedientes(d)(
      eventoApi({ claims: MEMBRO, query: { siglaSetor: OUTRO_SETOR } }),
    );
    expect(resposta.statusCode).toBe(200);
    const ids = (corpo(resposta)['itens'] as Expediente[]).map((e) => e.idExpediente);
    expect(ids).toEqual(['EXP000001', 'EXP000010']);
    expect(d.repositorio.chamadas[0]?.args[0]).toBe(SETOR);
  });

  it('repassa os filtros validados ao repositório', async () => {
    const d = deps();
    await criarHandlerListarExpedientes(d)(
      eventoApi({
        claims: MEMBRO,
        query: { gerenciador: 'JUDICIAL', caixa: 'NO_SETOR', statusPrazo: 'VENCIDO,CRITICO', limite: '25' },
      }),
    );
    expect(d.repositorio.chamadas[0]?.args[1]).toEqual({
      gerenciador: 'JUDICIAL',
      caixa: 'NO_SETOR',
      statusPrazo: ['VENCIDO', 'CRITICO'],
      limite: 25,
    });
  });

  it.each([
    [{ caixa: 'BAIXADO' }, 'caixa'],
    [{ gerenciador: 'TODOS' }, 'gerenciador'],
    [{ statusPrazo: 'VENCIDO,CUMPRIDO' }, 'statusPrazo'],
    [{ limite: '0' }, 'limite'],
    [{ limite: '101' }, 'limite'],
    [{ limite: '1e2' }, 'limite'],
  ])('responde 400 para entrada inválida %o', async (query, campo) => {
    const d = deps();
    const resposta = await criarHandlerListarExpedientes(d)(eventoApi({ claims: MEMBRO, query }));
    expect(resposta.statusCode).toBe(400);
    expect(corpo(resposta)).toMatchObject({ codigo: 'ENTRADA_INVALIDA', campos: { [campo]: expect.any(String) } });
    expect(d.repositorio.chamadas).toHaveLength(0);
  });

  it('mascara o sigiloso para SERVIDOR que não é o responsável (Req. 24.6)', async () => {
    const resposta = await criarHandlerListarExpedientes(deps())(eventoApi({ claims: SERVIDOR }));
    const sigiloso = (corpo(resposta)['itens'] as Expediente[]).find((e) => e.idExpediente === 'EXP000010');
    expect(sigiloso).toMatchObject({ assunto: TEXTO_SIGILOSO, resumo: TEXTO_SIGILOSO, tema: TEXTO_SIGILOSO });
    expect(sigiloso?.['etiqueta']).toBe('PGR-EXP000010');
  });

  it('mostra o conteúdo sigiloso ao CHEFE do setor', async () => {
    const resposta = await criarHandlerListarExpedientes(deps())(eventoApi({ claims: CHEFE }));
    const sigiloso = (corpo(resposta)['itens'] as Expediente[]).find((e) => e.idExpediente === 'EXP000010');
    expect(sigiloso?.assunto).toBe('Assunto secreto');
  });
});

describe('GET /expedientes/{id}', () => {
  it('devolve detalhe e histórico ao CHEFE do setor (Req. 13.1)', async () => {
    const resposta = await criarHandlerDetalheExpediente(deps())(eventoApi({ claims: CHEFE, path: { id: 'EXP000010' } }));
    expect(resposta.statusCode).toBe(200);
    const dados = corpo(resposta);
    expect(dados['expediente']).toMatchObject({ idExpediente: 'EXP000010', assunto: 'Assunto secreto' });
    expect(dados['movimentacoes']).toEqual([
      { idMovimentacao: 'MOV1', tipoMovimentacao: 'CADASTRO', descricao: 'Descrição secreta' },
    ]);
    expect(dados['prazos']).toHaveLength(1);
  });

  it('mascara detalhe, anotações e histórico para SERVIDOR não responsável (Req. 13.10)', async () => {
    const resposta = await criarHandlerDetalheExpediente(deps())(
      eventoApi({ claims: SERVIDOR, path: { id: 'EXP000010' } }),
    );
    const dados = corpo(resposta);
    expect(resposta.body).not.toMatch(/secret/);
    expect(dados['expediente']).toMatchObject({ assunto: TEXTO_SIGILOSO, resumo: TEXTO_SIGILOSO });
    expect(dados['anotacoes']).toEqual([{ idAnotacao: 'ANO1', texto: TEXTO_SIGILOSO }]);
    expect((dados['movimentacoes'] as { descricao: string }[])[0]?.descricao).toBe(TEXTO_SIGILOSO);
  });

  it('responde 404 idêntico para expediente de outro setor e inexistente (Req. 13.9, 24.4)', async () => {
    const d = deps();
    const handler = criarHandlerDetalheExpediente(d);
    const outroSetor = await handler(eventoApi({ claims: SERVIDOR_OUTRO_SETOR, path: { id: 'EXP000001' } }));
    const inexistente = await handler(eventoApi({ claims: SERVIDOR_OUTRO_SETOR, path: { id: 'EXP999999' } }));
    expect(outroSetor.statusCode).toBe(404);
    expect(inexistente.statusCode).toBe(404);
    expect(outroSetor.body).toBe(inexistente.body);
    expect(corpo(outroSetor)['mensagem']).toBe('Expediente não encontrado ou sem acesso');
    expect(d.registrador.linhas.some((l) => l.campos.evento === 'AcessoNegado')).toBe(true);
  });

  it('responde 400 para id fora do formato', async () => {
    const resposta = await criarHandlerDetalheExpediente(deps())(
      eventoApi({ claims: CHEFE, path: { id: 'EXP#1 OR 1=1' } }),
    );
    expect(resposta.statusCode).toBe(400);
  });
});

describe('GET /home', () => {
  it('agrega contadores, prazos, alertas não lidos e informes vigentes (Req. 20.1–20.6)', async () => {
    const resposta = await criarHandlerHome(deps())(eventoApi({ claims: SERVIDOR }));
    expect(resposta.statusCode).toBe(200);
    const dados = corpo(resposta) as Record<string, any>;
    expect(dados['contadores'].todos).toEqual({ gerenciador: 'TODOS', aReceber: 30 });
    expect(Object.keys(dados['contadores'].porGerenciador)).toEqual(['JUDICIAL']);
    expect(dados['proximosPrazos'].map((e: Expediente) => e.idExpediente)).toEqual(['EXP000001', 'EXP000010']);
    expect(dados['proximoExpediente'].idExpediente).toBe('EXP000001');
    expect(dados['alertas'].totalNaoLidas).toBe(2);
    expect(dados['informes'].map((n: { idNoticia: number }) => n.idNoticia)).toEqual([2, 1]);
    expect(dados['widgetsComErro']).toEqual([]);
  });

  it('aplica a máscara nos prazos e nos alertas do sigiloso (Req. 24.7)', async () => {
    const resposta = await criarHandlerHome(deps())(eventoApi({ claims: SERVIDOR }));
    expect(resposta.body).not.toMatch(/secreto|sobre o sigiloso/);
    const dados = corpo(resposta) as Record<string, any>;
    expect(dados['alertas'].itens[0].mensagem).toBe(TEXTO_SIGILOSO);
    expect(dados['alertas'].itens[1].mensagem).toBe('Mensagem pública');
  });

  it('isola a falha de um widget sem derrubar os demais (Req. 20.8)', async () => {
    const d = deps();
    d.repositorio.falharEm.add('obterContadores');
    const resposta = await criarHandlerHome(d)(eventoApi({ claims: MEMBRO }));
    expect(resposta.statusCode).toBe(200);
    const dados = corpo(resposta);
    expect(dados['contadores']).toBeNull();
    expect(dados['widgetsComErro']).toEqual(['contadores']);
    expect(dados['proximosPrazos']).not.toBeNull();
  });

  it('filtra informes pelo período de exibição na data de referência', () => {
    expect(
      filtrarInformesVigentes(
        [{ idNoticia: 9, dataInicioExibicao: '2026-10-07T17:00:00-03:00', dataFimExibicao: '2026-10-07' }],
        DATA_REFERENCIA,
      ),
    ).toHaveLength(1);
  });
});
