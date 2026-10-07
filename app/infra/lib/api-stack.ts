import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import {
  AuthorizationType,
  CognitoUserPoolsAuthorizer,
  Cors,
  EndpointType,
  LambdaIntegration,
  ResponseType,
  RestApi,
  type IResource,
} from 'aws-cdk-lib/aws-apigateway';
import type { IUserPool } from 'aws-cdk-lib/aws-cognito';
import type { ITable } from 'aws-cdk-lib/aws-dynamodb';
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Architecture, Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import type { Construct } from 'constructs';
import { URL_LOCAL_PADRAO } from './auth-stack.js';
import { obterAmbienteLambdas } from './config.js';

const DIRETORIO_LIB = path.dirname(fileURLToPath(import.meta.url));
/** Raiz do monorepo (`app/`), onde ficam o `package-lock.json` e os workspaces. */
const RAIZ_MONOREPO = path.resolve(DIRETORIO_LIB, '../..');
const HANDLERS = path.join(RAIZ_MONOREPO, 'services/api/src/handlers');

/** Prefixo das rotas dentro do stage (design §4.3). A URL final é `<invoke-url>/<stage>/api/v1/...`. */
export const PREFIXO_API = ['api', 'v1'] as const;

/** Ações DynamoDB de leitura permitidas às Lambdas de consulta (design §6). */
export type AcaoLeitura = 'dynamodb:GetItem' | 'dynamodb:Query';

/** Alvo de uma permissão: a tabela base ou um índice exato. */
export type AlvoDados = 'TABELA' | 'GSI1' | 'GSI2';

interface DefinicaoRota {
  readonly id: string;
  readonly arquivo: string;
  readonly descricao: string;
  /** Permissões exatas da role da função (menor privilégio). */
  readonly permissoes: readonly { readonly acoes: readonly AcaoLeitura[]; readonly alvos: readonly AlvoDados[] }[];
}

/** Lambdas de consulta desta fase e o que cada uma pode ler. */
/** Modelo do resumo com IA (inference profile cross-region `us.`, Amazon Nova Lite). */
export const MODELO_BEDROCK = 'us.amazon.nova-lite-v1:0';

const ROTAS: Readonly<Record<'me' | 'home' | 'listar' | 'detalhe' | 'resumo', DefinicaoRota>> = {
  me: {
    id: 'Me',
    arquivo: 'me.ts',
    descricao: 'GET /me (usuário, setor, perfil e data de referência)',
    permissoes: [{ acoes: ['dynamodb:GetItem'], alvos: ['TABELA'] }],
  },
  home: {
    id: 'Home',
    arquivo: 'home.ts',
    descricao: 'GET /home (widgets da tela inicial)',
    permissoes: [
      { acoes: ['dynamodb:Query', 'dynamodb:GetItem'], alvos: ['TABELA'] },
      { acoes: ['dynamodb:Query'], alvos: ['GSI2'] },
    ],
  },
  listar: {
    id: 'ListarExpedientes',
    arquivo: 'listar-expedientes.ts',
    descricao: 'GET /expedientes (painel do setor via GSI1)',
    permissoes: [{ acoes: ['dynamodb:Query'], alvos: ['GSI1'] }],
  },
  detalhe: {
    id: 'DetalheExpediente',
    arquivo: 'detalhe-expediente.ts',
    descricao: 'GET /expedientes/{id} (detalhe e histórico)',
    permissoes: [{ acoes: ['dynamodb:Query'], alvos: ['TABELA'] }],
  },
  resumo: {
    id: 'ResumoExpediente',
    arquivo: 'resumo-expediente.ts',
    descricao: 'POST /expedientes/{id}/resumo (resumo com IA via Bedrock)',
    permissoes: [{ acoes: ['dynamodb:Query'], alvos: ['TABELA'] }],
  },
};

export interface ApiStackProps extends StackProps {
  /** Ambiente lógico (ex.: `dev`). Vira o nome do stage. */
  readonly ambiente: string;
  readonly tabela: ITable;
  readonly userPool: IUserPool;
  /** URLs extras da SPA (contexto `urlsSpa`, o mesmo da AuthStack). A origem de cada uma entra no CORS. */
  readonly urlsSpa?: readonly string[];
}

/** Converte URLs da SPA em origens CORS (`esquema://host[:porta]`), sem repetição. */
export function origensCors(urlsSpa: readonly string[] = []): string[] {
  return [...new Set([URL_LOCAL_PADRAO, ...urlsSpa].map((url) => new URL(url).origin))];
}

/**
 * API REST do painel (Req. 1.4, 3, 4, 13, 20, 24).
 *
 * - API Gateway REST regional; rotas em `/api/v1`, stage = ambiente.
 * - Cognito User Pools Authorizer em todas as rotas de negócio (Req. 24.1); só o
 *   OPTIONS do CORS fica sem autenticação. O authorizer valida o **ID token**
 *   (que traz `custom:idUsuario`, `custom:siglaSetor` e `custom:perfil`).
 * - CORS restrito a `http://localhost:4200` e às origens do contexto `urlsSpa`.
 * - Lambdas `nodejs24.x` arm64, 1024 MB, empacotadas pelo esbuild (inclui `@painel/dominio`
 *   e o AWS SDK v3 fixado), uma role por função com ações e ARNs exatos.
 * - Throttling no stage; logs das Lambdas com retenção de 30 dias.
 */
export class ApiStack extends Stack {
  public readonly api: RestApi;
  /** URL base das rotas (`.../<stage>/api/v1/`). */
  public readonly urlApi: string;
  public readonly funcoes: Readonly<Record<keyof typeof ROTAS, NodejsFunction>>;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    const origens = origensCors(props.urlsSpa);
    const arnTabela = props.tabela.tableArn;
    const arnAlvo: Record<AlvoDados, string> = {
      TABELA: arnTabela,
      GSI1: `${arnTabela}/index/GSI1`,
      GSI2: `${arnTabela}/index/GSI2`,
    };
    const ambienteLambdas = {
      ...obterAmbienteLambdas(this.node),
      NOME_TABELA: props.tabela.tableName,
      ORIGENS_PERMITIDAS: origens.join(','),
      POWERTOOLS_SERVICE_NAME: 'painel-api',
      NODE_OPTIONS: '--enable-source-maps',
    };

    const criarFuncao = (
      definicao: DefinicaoRota,
      ambienteExtra: Record<string, string> = {},
      timeout = Duration.seconds(10),
    ): NodejsFunction => {
      const logGroup = new LogGroup(this, `Logs${definicao.id}`, {
        retention: RetentionDays.ONE_MONTH,
        removalPolicy: RemovalPolicy.DESTROY,
      });
      const funcao = new NodejsFunction(this, `Fn${definicao.id}`, {
        description: `Painel de expedientes (${props.ambiente}) - ${definicao.descricao}`,
        entry: path.join(HANDLERS, definicao.arquivo),
        handler: 'handler',
        runtime: Runtime.NODEJS_24_X,
        architecture: Architecture.ARM_64,
        memorySize: 1024,
        timeout,
        environment: { ...ambienteLambdas, ...ambienteExtra },
        logGroup,
        projectRoot: RAIZ_MONOREPO,
        depsLockFilePath: path.join(RAIZ_MONOREPO, 'package-lock.json'),
        bundling: {
          format: OutputFormat.CJS,
          target: 'node24',
          minify: true,
          sourceMap: true,
          // Empacota tudo (inclusive o AWS SDK v3) para usar as versões fixadas no lockfile.
          externalModules: [],
        },
      });
      for (const permissao of definicao.permissoes) {
        funcao.addToRolePolicy(
          new PolicyStatement({
            effect: Effect.ALLOW,
            actions: [...permissao.acoes],
            resources: permissao.alvos.map((alvo) => arnAlvo[alvo]),
          }),
        );
      }
      return funcao;
    };

    const funcoes = {
      me: criarFuncao(ROTAS.me),
      home: criarFuncao(ROTAS.home),
      listar: criarFuncao(ROTAS.listar),
      detalhe: criarFuncao(ROTAS.detalhe),
      resumo: criarFuncao(ROTAS.resumo, { BEDROCK_MODEL_ID: MODELO_BEDROCK }, Duration.seconds(15)),
    };
    // Resumo com IA: só o inference profile `us.` e os foundation models para onde ele roteia.
    funcoes.resumo.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['bedrock:InvokeModel'],
        resources: [
          `arn:${this.partition}:bedrock:${this.region}:${this.account}:inference-profile/${MODELO_BEDROCK}`,
          `arn:${this.partition}:bedrock:*::foundation-model/${MODELO_BEDROCK.replace(/^us\./, '')}`,
        ],
      }),
    );

    const api = new RestApi(this, 'Api', {
      restApiName: `painel-expedientes-${props.ambiente}`,
      description: `API do painel de expedientes (${props.ambiente})`,
      endpointTypes: [EndpointType.REGIONAL],
      // Sem role de conta para logs do API Gateway (recurso de conta, fora do MVP).
      cloudWatchRole: false,
      deployOptions: {
        stageName: props.ambiente,
        throttlingRateLimit: 50,
        throttlingBurstLimit: 100,
        metricsEnabled: true,
      },
      defaultCorsPreflightOptions: {
        allowOrigins: origens,
        allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key'],
        exposeHeaders: ['X-Correlation-Id'],
        maxAge: Duration.hours(1),
      },
    });

    // Respostas do próprio API Gateway (401 do authorizer, 403, 429, 5xx) no formato padrão.
    // A origem CORS é fixa: a da SPA publicada (CloudFront) quando houver; senão a local.
    const cabecalhosCors = {
      'Access-Control-Allow-Origin': `'${origens[origens.length - 1]}'`,
      Vary: "'Origin'",
    };
    const corpoErro = (codigo: string, mensagem: string) => ({
      'application/json': JSON.stringify({ codigo, mensagem, correlationId: '$context.requestId' }),
    });
    api.addGatewayResponse('RespostaNaoAutenticado', {
      type: ResponseType.UNAUTHORIZED,
      statusCode: '401',
      responseHeaders: cabecalhosCors,
      templates: corpoErro('NAO_AUTENTICADO', 'Autenticação necessária'),
    });
    api.addGatewayResponse('RespostaAcessoNegado', {
      type: ResponseType.ACCESS_DENIED,
      statusCode: '403',
      responseHeaders: cabecalhosCors,
      templates: corpoErro('SEM_PERMISSAO', 'Sem permissão para esta ação'),
    });
    api.addGatewayResponse('RespostaLimite', {
      type: ResponseType.THROTTLED,
      statusCode: '429',
      responseHeaders: cabecalhosCors,
      templates: corpoErro('LIMITE_EXCEDIDO', 'Muitas requisições. Tente novamente em instantes.'),
    });
    api.addGatewayResponse('Resposta4xx', {
      type: ResponseType.DEFAULT_4XX,
      responseHeaders: cabecalhosCors,
      templates: corpoErro('REQUISICAO_INVALIDA', 'Requisição inválida'),
    });
    api.addGatewayResponse('Resposta5xx', {
      type: ResponseType.DEFAULT_5XX,
      responseHeaders: cabecalhosCors,
      templates: corpoErro('ERRO_INTERNO', 'Erro inesperado. Informe o correlationId ao suporte.'),
    });

    const authorizer = new CognitoUserPoolsAuthorizer(this, 'AutorizadorCognito', {
      cognitoUserPools: [props.userPool],
      authorizerName: `painel-expedientes-${props.ambiente}`,
      identitySource: 'method.request.header.Authorization',
      resultsCacheTtl: Duration.minutes(5),
    });
    const protegida = { authorizationType: AuthorizationType.COGNITO, authorizer };
    const integrar = (funcao: NodejsFunction) => new LambdaIntegration(funcao, { proxy: true });

    let base: IResource = api.root;
    for (const segmento of PREFIXO_API) {
      base = base.addResource(segmento);
    }
    base.addResource('me').addMethod('GET', integrar(funcoes.me), protegida);
    base.addResource('home').addMethod('GET', integrar(funcoes.home), protegida);
    const expedientes = base.addResource('expedientes');
    expedientes.addMethod('GET', integrar(funcoes.listar), protegida);
    const expediente = expedientes.addResource('{id}');
    expediente.addMethod('GET', integrar(funcoes.detalhe), protegida);
    expediente.addResource('resumo').addMethod('POST', integrar(funcoes.resumo), protegida);

    this.api = api;
    this.funcoes = funcoes;
    this.urlApi = `${api.url}${PREFIXO_API.join('/')}/`;

    new CfnOutput(this, 'UrlApi', {
      value: this.urlApi,
      description: `URL base da API do painel (ambiente ${props.ambiente}); envie o ID token no cabeçalho Authorization`,
    });
  }
}
