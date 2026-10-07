import { App, type AppProps } from 'aws-cdk-lib';
import { ApiStack, PREFIXO_API } from './api-stack.js';
import { AuthStack } from './auth-stack.js';
import { obterAmbienteLambdas } from './config.js';
import { DadosStack } from './dados-stack.js';
import { aplicarTags } from './tags.js';
import { WebStack } from './web-stack.js';

export const REGIAO_PADRAO = 'us-east-1';
export const AMBIENTE_PADRAO = 'dev';

export interface Stacks {
  readonly app: App;
  readonly ambiente: string;
  readonly dados: DadosStack;
  readonly auth: AuthStack;
  readonly api: ApiStack;
  readonly web: WebStack;
}

/**
 * Monta o App CDK com todas as stacks do painel. Próximas tarefas acrescentam
 * AuthStack, ApiStack, AgendamentosStack, WebStack e ObservabilidadeStack aqui.
 *
 * O ambiente vem do contexto `-c ambiente=<env>` (padrão `dev`).
 */
export function criarApp(props?: AppProps): Stacks {
  const app = new App(props);
  const ambiente = String(app.node.tryGetContext('ambiente') ?? AMBIENTE_PADRAO);
  if (!/^[a-z0-9-]{1,20}$/.test(ambiente)) {
    throw new Error(`Contexto "ambiente" inválido: ${ambiente}`);
  }

  const env = {
    account: process.env['CDK_DEFAULT_ACCOUNT'],
    region: process.env['CDK_DEFAULT_REGION'] ?? REGIAO_PADRAO,
  };

  const dados = new DadosStack(app, 'DadosStack', {
    env,
    ambiente,
    description: `Painel de expedientes (${ambiente}) - dados (DynamoDB)`,
  });

  // URLs extras da SPA (callback/logout), separadas por vírgula: `-c urlsSpa=https://...`.
  const urlsSpa = String(app.node.tryGetContext('urlsSpa') ?? '')
    .split(',')
    .map((url) => url.trim())
    .filter((url) => url.length > 0);

  const auth = new AuthStack(app, 'AuthStack', {
    env,
    ambiente,
    urlsSpa,
    description: `Painel de expedientes (${ambiente}) - autenticação (Cognito)`,
  });

  const api = new ApiStack(app, 'ApiStack', {
    env,
    ambiente,
    tabela: dados.tabela,
    userPool: auth.userPool,
    urlsSpa,
    description: `Painel de expedientes (${ambiente}) - API (API Gateway + Lambda)`,
  });
  const web = new WebStack(app, 'WebStack', {
    env,
    ambiente,
    apiUrl: `${api.api.url}${PREFIXO_API.join('/')}`,
    dominioCognito: auth.dominio.baseUrl(),
    clientId: auth.userPoolClientId,
    dataReferencia: obterAmbienteLambdas(app.node).DATA_REFERENCIA,
    diretorioSpa: app.node.tryGetContext('diretorioSpa') as string | undefined,
    description: `Painel de expedientes (${ambiente}) - SPA (S3 + CloudFront)`,
  });
  aplicarTags(app, ambiente);
  return { app, ambiente, dados, auth, api, web };
}
