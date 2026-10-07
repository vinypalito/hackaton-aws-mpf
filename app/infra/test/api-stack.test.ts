import { Match, Template } from 'aws-cdk-lib/assertions';
import { beforeAll, describe, expect, it } from 'vitest';
import { origensCors } from '../lib/api-stack.js';
import { criarApp } from '../lib/app.js';

type Recurso = { Properties: Record<string, any> };

describe('ApiStack', () => {
  let template: Template;

  beforeAll(() => {
    const { api } = criarApp({
      context: {
        ambiente: 'teste',
        urlsSpa: 'https://d111111abcdef8.cloudfront.net/',
      },
    });
    template = Template.fromStack(api);
  });

  it('cria as Lambdas de consulta em nodejs24.x, arm64 e 1024 MB', () => {
    const funcoes = Object.values(template.findResources('AWS::Lambda::Function')) as Recurso[];
    expect(funcoes).toHaveLength(5);
    for (const funcao of funcoes) {
      expect(funcao.Properties['Runtime']).toBe('nodejs24.x');
      expect(funcao.Properties['Architectures']).toEqual(['arm64']);
      expect(funcao.Properties['MemorySize']).toBe(1024);
      expect(funcao.Properties['Environment'].Variables).toMatchObject({
        DATA_REFERENCIA: '2026-10-07T17:00:00-03:00',
        NOME_TABELA: expect.anything(),
        ORIGENS_PERMITIDAS: 'http://localhost:4200,https://d111111abcdef8.cloudfront.net',
      });
    }
  });

  it('usa uma role por Lambda', () => {
    const funcoes = Object.values(template.findResources('AWS::Lambda::Function')) as Recurso[];
    const roles = new Set(funcoes.map((f) => JSON.stringify(f.Properties['Role'])));
    expect(roles.size).toBe(funcoes.length);
  });

  it('protege todas as rotas (exceto o preflight OPTIONS) com o authorizer Cognito (Req. 24.1)', () => {
    template.resourceCountIs('AWS::ApiGateway::Authorizer', 1);
    template.hasResourceProperties('AWS::ApiGateway::Authorizer', { Type: 'COGNITO_USER_POOLS' });
    const metodos = Object.values(template.findResources('AWS::ApiGateway::Method')) as Recurso[];
    const negocio = metodos.filter((m) => m.Properties['HttpMethod'] !== 'OPTIONS');
    expect(negocio).toHaveLength(5);
    for (const metodo of negocio) {
      expect(metodo.Properties['AuthorizationType']).toBe('COGNITO_USER_POOLS');
      expect(metodo.Properties['AuthorizerId']).toBeDefined();
    }
    for (const metodo of metodos.filter((m) => m.Properties['HttpMethod'] === 'OPTIONS')) {
      expect(metodo.Properties['AuthorizationType']).toBe('NONE');
    }
  });

  it('expõe as rotas em /api/v1', () => {
    const caminhos = (Object.values(template.findResources('AWS::ApiGateway::Resource')) as Recurso[]).map(
      (r) => r.Properties['PathPart'],
    );
    expect(caminhos.sort()).toEqual(['api', 'expedientes', 'home', 'me', 'resumo', 'v1', '{id}'].sort());
  });

  it('não concede "*" em ações nem recursos de dados (Req. 24.9)', () => {
    const politicas = Object.values(template.findResources('AWS::IAM::Policy')) as Recurso[];
    expect(politicas.length).toBeGreaterThan(0);
    for (const politica of politicas) {
      for (const declaracao of politica.Properties['PolicyDocument'].Statement as Record<string, unknown>[]) {
        const acoes = ([] as unknown[]).concat(declaracao['Action']).map(String);
        for (const acao of acoes) {
          expect(acao).not.toContain('*');
          expect(['dynamodb:GetItem', 'dynamodb:Query', 'bedrock:InvokeModel']).toContain(acao);
        }
        expect(JSON.stringify(declaracao['Resource'])).not.toMatch(/"\*"|index\/\*/);
      }
    }
  });

  it('restringe bedrock:InvokeModel ao Nova Lite (inference profile us. + foundation models)', () => {
    const politicas = Object.values(template.findResources('AWS::IAM::Policy')) as Recurso[];
    const declaracoes = politicas
      .flatMap((p) => p.Properties['PolicyDocument'].Statement as Record<string, unknown>[])
      .filter((d) => ([] as unknown[]).concat(d['Action']).includes('bedrock:InvokeModel'));
    expect(declaracoes).toHaveLength(1);
    const recursos = JSON.stringify(declaracoes[0]!['Resource']);
    expect(recursos).toContain('inference-profile/us.amazon.nova-lite-v1:0');
    expect(recursos).toContain('bedrock:*::foundation-model/amazon.nova-lite-v1:0');
    expect((declaracoes[0]!['Resource'] as unknown[]).length).toBe(2);
    template.hasResourceProperties('AWS::Lambda::Function', {
      Timeout: 15,
      Environment: { Variables: Match.objectLike({ BEDROCK_MODEL_ID: 'us.amazon.nova-lite-v1:0' }) },
    });
  });

  it('aplica throttling no stage e CORS restrito', () => {
    template.hasResourceProperties('AWS::ApiGateway::Stage', {
      StageName: 'teste',
      MethodSettings: Match.arrayWith([
        Match.objectLike({ ThrottlingRateLimit: 50, ThrottlingBurstLimit: 100 }),
      ]),
    });
    expect(origensCors(['https://d111111abcdef8.cloudfront.net/x'])).toEqual([
      'http://localhost:4200',
      'https://d111111abcdef8.cloudfront.net',
    ]);
  });

  it('retém os logs das Lambdas por 30 dias', () => {
    template.resourceCountIs('AWS::Logs::LogGroup', 5);
    template.allResourcesProperties('AWS::Logs::LogGroup', { RetentionInDays: 30 });
  });

  it('responde 401 padronizado do authorizer', () => {
    template.hasResourceProperties('AWS::ApiGateway::GatewayResponse', {
      ResponseType: 'UNAUTHORIZED',
      StatusCode: '401',
    });
  });

  it('publica a URL da API', () => {
    template.hasOutput('UrlApi', {});
  });
});
