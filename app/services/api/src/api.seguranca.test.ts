/**
 * Testes de API de segurança (tarefa 3.3; Req. 24.1, 24.2, 24.6 e 33.4).
 *
 * Exercitam as 4 rotas de consulta com eventos do API Gateway REST como chegam após o
 * Cognito Authorizer, sobre um repositório em memória com fixtures de ids, usuários e
 * textos reais do seed (resources/hackathon-expedientes/seed/saida/csv, somente leitura).
 * Os cenários unitários de cada handler ficam em handlers/handlers.test.ts.
 */
import { TEXTO_SIGILOSO } from '@painel/dominio';
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { describe, expect, it } from 'vitest';
import { criarHandlerDetalheExpediente } from './handlers/detalhe-expediente.js';
import { criarHandlerHome } from './handlers/home.js';
import { criarHandlerListarExpedientes } from './handlers/listar-expedientes.js';
import { criarHandlerMe } from './handlers/me.js';
import type { HandlerApi } from './http/api.js';
import type { Expediente } from './repositorio/tipos.js';
import { RegistradorMemoria, RepositorioMemoria, claimsDe } from './teste/apoio.js';

const GAB = 'GABSUB3-DVT';
const STIC = 'CIVINT/STIC';

// Usuários reais de usuarios.csv.
const MEMBRO = claimsDe('GABSUB3-DVT-U01', GAB, 'MEMBRO');
const CHEFE = claimsDe('GABSUB3-DVT-U02', GAB, 'CHEFE');
const SERVIDOR = claimsDe('GABSUB3-DVT-U03', GAB, 'SERVIDOR');
const RESPONSAVEL = claimsDe('GABSUB3-DVT-U06', GAB, 'SERVIDOR');
const SERVIDOR_STIC = claimsDe('CIVINT-STIC-U02', STIC, 'SERVIDOR');

// Linhas de expedientes.csv (campos relevantes).
const PUBLICO_GAB: Expediente = {
  idExpediente: 'EXP000001',
  gerenciador: 'DOCUMENTO',
  siglaSetor: GAB,
  caixa: 'A_RECEBER',
  statusPrazo: 'VENCIDO',
  requerAcao: true,
  nivelSigilo: 0,
  idResponsavel: 'GABSUB3-DVT-U01',
  etiqueta: 'PGR-00087434/2026',
  assunto: 'Integração de sistemas',
  tema: 'Tecnologia da Informação',
  resumo: 'Memorando sobre integração de sistemas, com origem em Departamento de Polícia Federal.',
};
const SIGILOSO_GAB: Expediente = {
  idExpediente: 'EXP000011',
  gerenciador: 'DOCUMENTO',
  siglaSetor: GAB,
  caixa: 'NO_SETOR',
  statusPrazo: 'VENCE_HOJE',
  requerAcao: true,
  nivelSigilo: 1,
  idResponsavel: 'GABSUB3-DVT-U06',
  etiqueta: 'PGR-00009035/2026',
  assunto: 'Relatório de atividades',
  tema: 'Institucional',
  resumo: 'Despacho sobre relatório de atividades, com origem em Procuradoria da República em Goiás.',
};
const PUBLICO_STIC: Expediente = {
  idExpediente: 'EXP000561',
  gerenciador: 'DOCUMENTO',
  siglaSetor: STIC,
  caixa: 'A_RECEBER',
  statusPrazo: 'VENCE_HOJE',
  requerAcao: true,
  nivelSigilo: 0,
  idResponsavel: 'CIVINT-STIC-U01',
  etiqueta: 'PGR-00025766/2026',
  assunto: 'Pedido de providências',
  tema: 'Administrativa',
  resumo: 'Nota Técnica sobre pedido de providências, com origem em Secretaria-Geral do MPF.',
};

// Textos sigilosos que nunca podem aparecer para quem não tem acesso.
const SEGREDOS = /Relatório de atividades|Institucional|Despacho sobre|Procuradoria da República em Goiás/;

function criarDeps() {
  const repositorio = new RepositorioMemoria({
    usuarios: [
      { idUsuario: 'GABSUB3-DVT-U03', nome: 'Carla Modelo', cargo: 'Assessor(a) Jurídico(a)', siglaSetor: GAB, ativo: true },
    ],
    setores: [{ siglaSetor: GAB, nome: 'Gabinete SUB3', tipoSetor: 'GABINETE', gerenciadores: ['JUDICIAL', 'DOCUMENTO'] }],
    expedientes: [PUBLICO_GAB, SIGILOSO_GAB, PUBLICO_STIC],
    detalhes: {
      EXP000011: {
        // Linhas reais de movimentacoes.csv.
        movimentacoes: [
          {
            idMovimentacao: 'MOV000062',
            tipoMovimentacao: 'CADASTRO',
            dataHora: '2026-08-26T04:33:02-03:00',
            descricao: 'Cadastrado em PR-GO (Procuradoria da República em Goiás)',
          },
        ],
        prazos: [],
        designacoes: [],
        anotacoes: [],
        marcadores: [],
      },
    },
    notificacoes: {
      'GABSUB3-DVT-U03': [
        { idNotificacao: 'NOT-T1', idExpediente: 'EXP000011', mensagem: 'Relatório de atividades vence hoje', lida: false },
      ],
    },
  });
  return {
    repositorio,
    dataReferencia: '2026-10-07T17:00:00-03:00',
    registrador: new RegistradorMemoria(),
    origensPermitidas: ['http://localhost:4200'],
  };
}

interface OpcoesRequisicao {
  claims?: Record<string, string> | null;
  path?: Record<string, string>;
  query?: Record<string, string>;
  body?: unknown;
}

/** Evento REST (proxy) com o formato entregue pelo API Gateway após o Cognito Authorizer. */
function requisicao(metodo: string, recurso: string, caminho: string, o: OpcoesRequisicao = {}): APIGatewayProxyEvent {
  const headers: Record<string, string> = { Origin: 'http://localhost:4200', Accept: 'application/json' };
  if (o.claims) headers['Authorization'] = 'Bearer eyJ.fake.jwt';
  return {
    body: o.body === undefined ? null : JSON.stringify(o.body),
    headers,
    multiValueHeaders: {},
    httpMethod: metodo,
    isBase64Encoded: false,
    path: caminho,
    pathParameters: o.path ?? null,
    queryStringParameters: o.query ?? null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    resource: recurso,
    requestContext: {
      requestId: `req-${Math.random().toString(36).slice(2, 10)}`,
      stage: 'dev',
      httpMethod: metodo,
      resourcePath: recurso,
      path: `/dev${caminho}`,
      identity: { sourceIp: '203.0.113.10' },
      authorizer: o.claims ? { claims: o.claims } : undefined,
    } as unknown as APIGatewayProxyEvent['requestContext'],
  };
}

const json = (r: APIGatewayProxyResult) => JSON.parse(r.body) as Record<string, any>;
const ids = (r: APIGatewayProxyResult) => (json(r)['itens'] as Expediente[]).map((e) => e.idExpediente);

type Rota = [nome: string, criar: (d: ReturnType<typeof criarDeps>) => HandlerApi, evento: (o: OpcoesRequisicao) => APIGatewayProxyEvent];
const ROTAS: Rota[] = [
  ['GET /me', criarHandlerMe, (o) => requisicao('GET', '/me', '/me', o)],
  ['GET /home', criarHandlerHome, (o) => requisicao('GET', '/home', '/home', o)],
  ['GET /expedientes', criarHandlerListarExpedientes, (o) => requisicao('GET', '/expedientes', '/expedientes', o)],
  [
    'GET /expedientes/{id}',
    criarHandlerDetalheExpediente,
    (o) => requisicao('GET', '/expedientes/{id}', '/expedientes/EXP000001', { ...o, path: { id: 'EXP000001' } }),
  ],
];

describe('401 sem token (Req. 24.1, 33.4)', () => {
  it.each(ROTAS)('%s responde 401 sem claims, com codigo e correlationId e sem stack trace', async (_n, criar, evento) => {
    const deps = criarDeps();
    const ev = evento({ claims: null });
    const r = await criar(deps)(ev);
    expect(r.statusCode).toBe(401);
    expect(json(r)).toEqual({
      codigo: 'NAO_AUTENTICADO',
      mensagem: expect.any(String),
      correlationId: ev.requestContext.requestId,
    });
    expect(r.headers?.['X-Correlation-Id']).toBe(ev.requestContext.requestId);
    expect(r.body).not.toMatch(/\bat \w|stack|Error:|\.ts:\d/);
    // Nenhum dado é lido antes de autenticar.
    expect(deps.repositorio.chamadas).toHaveLength(0);
  });

  it.each(ROTAS)('%s responde 401 com claims incompletas (sem custom:siglaSetor)', async (_n, criar, evento) => {
    const { 'custom:siglaSetor': _s, ...semSetor } = SERVIDOR;
    const r = await criar(criarDeps())(evento({ claims: semSetor }));
    expect(r.statusCode).toBe(401);
  });
});

describe('isolamento entre setores (Req. 24.2)', () => {
  it('detalhe de outro setor responde 404 com corpo idêntico ao de id inexistente', async () => {
    const handler = criarHandlerDetalheExpediente(criarDeps());
    const evento = (id: string) =>
      requisicao('GET', '/expedientes/{id}', `/expedientes/${id}`, { claims: SERVIDOR_STIC, path: { id } });
    const outroSetor = await handler(evento('EXP000001'));
    const inexistente = await handler(evento('EXP999999'));
    expect(outroSetor.statusCode).toBe(404);
    expect(inexistente.statusCode).toBe(404);
    // Só o correlationId difere entre as requisições.
    const semId = (r: APIGatewayProxyResult) => ({ ...json(r), correlationId: undefined });
    expect(semId(outroSetor)).toEqual(semId(inexistente));
    expect(outroSetor.body).not.toMatch(/Integração de sistemas|GABSUB3/);
  });

  it('nem MEMBRO nem CHEFE de outro setor veem o detalhe', async () => {
    const handler = criarHandlerDetalheExpediente(criarDeps());
    const chefeStic = claimsDe('CIVINT-STIC-U01', STIC, 'CHEFE');
    const r = await handler(
      requisicao('GET', '/expedientes/{id}', '/expedientes/EXP000011', { claims: chefeStic, path: { id: 'EXP000011' } }),
    );
    expect(r.statusCode).toBe(404);
  });

  it('listagem usa só o setor das claims, ignorando siglaSetor em query e body', async () => {
    const deps = criarDeps();
    const r = await criarHandlerListarExpedientes(deps)(
      requisicao('GET', '/expedientes', '/expedientes', {
        claims: SERVIDOR_STIC,
        query: { siglaSetor: GAB, setor: GAB },
        body: { siglaSetor: GAB },
      }),
    );
    expect(r.statusCode).toBe(200);
    expect(ids(r)).toEqual(['EXP000561']);
    expect(deps.repositorio.chamadas.every((c) => c.args[0] === STIC)).toBe(true);
  });

  it('listagem do gabinete nunca traz itens de outro setor', async () => {
    const r = await criarHandlerListarExpedientes(criarDeps())(
      requisicao('GET', '/expedientes', '/expedientes', { claims: CHEFE, query: { siglaSetor: STIC } }),
    );
    const itens = json(r)['itens'] as Expediente[];
    expect(itens.length).toBeGreaterThan(0);
    expect(itens.every((e) => e.siglaSetor === GAB)).toBe(true);
  });
});

describe('máscara de sigilo (Req. 24.6)', () => {
  const listar = (claims: Record<string, string>) =>
    criarHandlerListarExpedientes(criarDeps())(requisicao('GET', '/expedientes', '/expedientes', { claims }));
  const detalhar = (claims: Record<string, string>) =>
    criarHandlerDetalheExpediente(criarDeps())(
      requisicao('GET', '/expedientes/{id}', '/expedientes/EXP000011', { claims, path: { id: 'EXP000011' } }),
    );
  const home = (claims: Record<string, string>) =>
    criarHandlerHome(criarDeps())(requisicao('GET', '/home', '/home', { claims }));
  const sigilosoDe = (r: APIGatewayProxyResult) =>
    (json(r)['itens'] as Expediente[]).find((e) => e.idExpediente === 'EXP000011');

  it('SERVIDOR não responsável recebe "Conteúdo sigiloso" na listagem, mantendo identificação e prazo', async () => {
    const r = await listar(SERVIDOR);
    expect(sigilosoDe(r)).toMatchObject({
      assunto: TEXTO_SIGILOSO,
      resumo: TEXTO_SIGILOSO,
      tema: TEXTO_SIGILOSO,
      etiqueta: 'PGR-00009035/2026',
      statusPrazo: 'VENCE_HOJE',
    });
    expect(r.body).not.toMatch(SEGREDOS);
    // O público do mesmo setor segue visível.
    expect((json(r)['itens'] as Expediente[]).find((e) => e.idExpediente === 'EXP000001')?.assunto).toBe(
      'Integração de sistemas',
    );
  });

  it('SERVIDOR não responsável recebe detalhe e histórico mascarados', async () => {
    const r = await detalhar(SERVIDOR);
    expect(r.statusCode).toBe(200);
    expect(r.body).not.toMatch(SEGREDOS);
    const corpo = json(r);
    expect(corpo['expediente']).toMatchObject({ assunto: TEXTO_SIGILOSO, resumo: TEXTO_SIGILOSO, tema: TEXTO_SIGILOSO });
    for (const m of corpo['movimentacoes'] as { descricao: string }[]) expect(m.descricao).toBe(TEXTO_SIGILOSO);
  });

  it('SERVIDOR não responsável recebe prazos e alertas da home mascarados', async () => {
    const r = await home(SERVIDOR);
    expect(r.statusCode).toBe(200);
    expect(r.body).not.toMatch(SEGREDOS);
    const corpo = json(r);
    const prazo = (corpo['proximosPrazos'] as Expediente[]).find((e) => e.idExpediente === 'EXP000011');
    expect(prazo?.assunto).toBe(TEXTO_SIGILOSO);
    expect(corpo['alertas'].itens[0].mensagem).toBe(TEXTO_SIGILOSO);
  });

  it.each([
    ['MEMBRO', MEMBRO],
    ['CHEFE', CHEFE],
    ['SERVIDOR responsável', RESPONSAVEL],
  ])('%s vê o conteúdo sigiloso na listagem, no detalhe e na home', async (_n, claims) => {
    expect(sigilosoDe(await listar(claims))?.assunto).toBe('Relatório de atividades');

    const detalhe = json(await detalhar(claims));
    expect(detalhe['expediente']).toMatchObject({ assunto: 'Relatório de atividades', tema: 'Institucional' });
    expect(detalhe['movimentacoes'][0].descricao).toBe('Cadastrado em PR-GO (Procuradoria da República em Goiás)');

    const prazos = json(await home(claims))['proximosPrazos'] as Expediente[];
    expect(prazos.find((e) => e.idExpediente === 'EXP000011')?.assunto).toBe('Relatório de atividades');
  });
});
