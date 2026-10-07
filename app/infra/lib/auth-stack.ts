import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import {
  AccountRecovery,
  ClientAttributes,
  Mfa,
  OAuthScope,
  StringAttribute,
  UserPool,
  UserPoolClient,
  UserPoolClientIdentityProvider,
  type IUserPool,
  type IUserPoolClient,
  type UserPoolDomain,
} from 'aws-cdk-lib/aws-cognito';
import type { Construct } from 'constructs';

/** URL do `ng serve` local, sempre aceita como callback/logout no MVP. */
export const URL_LOCAL_PADRAO = 'http://localhost:4200/';

/** Nomes (sem o prefixo `custom:`) dos atributos customizados do Req. 1.2. */
export const ATRIBUTOS_CUSTOM = ['idUsuario', 'siglaSetor', 'perfil'] as const;

export interface AuthStackProps extends StackProps {
  /** Ambiente lógico (ex.: `dev`). Compõe o prefixo do domínio Cognito. */
  readonly ambiente: string;
  /**
   * URLs de callback e logout da SPA. Padrão: só `http://localhost:4200/`.
   * A tarefa 4.3 acrescenta a URL do CloudFront (contexto `urlsSpa`).
   */
  readonly urlsSpa?: readonly string[];
}

/**
 * Autenticação (Req. 1 e 24): Cognito User Pool com os usuários fictícios de
 * `usuarios.csv` (criados pelo script `scripts/src/criar-usuarios.ts`).
 *
 * - Sem auto cadastro; só o administrador cria usuários (Req. 1.1).
 * - `custom:idUsuario`, `custom:siglaSetor` e `custom:perfil` imutáveis e fora dos
 *   atributos graváveis do App Client: somente leitura para o próprio usuário (Req. 1.2).
 * - App Client SPA público (sem segredo), authorization code + PKCE, revogação de token (Req. 1.7).
 * - `RemovalPolicy.DESTROY`: `cdk destroy --all` remove o pool ao fim do evento (Req. 26.7).
 */
export class AuthStack extends Stack {
  public readonly userPool: IUserPool;
  public readonly userPoolClient: IUserPoolClient;
  public readonly dominio: UserPoolDomain;
  public readonly userPoolId: string;
  public readonly userPoolClientId: string;

  constructor(scope: Construct, id: string, props: AuthStackProps) {
    super(scope, id, props);

    const urlsSpa = [...new Set([URL_LOCAL_PADRAO, ...(props.urlsSpa ?? [])])];

    const userPool = new UserPool(this, 'UserPool', {
      userPoolName: `painel-expedientes-${props.ambiente}`,
      selfSignUpEnabled: false,
      // Login pelo idUsuario do CSV (username) ou pelo e-mail sintético.
      signInAliases: { username: true, email: true },
      signInCaseSensitive: false,
      standardAttributes: {
        email: { required: false, mutable: true },
        fullname: { required: false, mutable: true },
      },
      customAttributes: {
        idUsuario: new StringAttribute({ minLen: 1, maxLen: 64, mutable: false }),
        siglaSetor: new StringAttribute({ minLen: 1, maxLen: 64, mutable: false }),
        perfil: new StringAttribute({ minLen: 1, maxLen: 16, mutable: false }),
      },
      passwordPolicy: {
        // Demo do hackathon (base sintética): senhas curtas para o público digitar (ex.: bruno123).
        minLength: 8,
        requireLowercase: true,
        requireUppercase: false,
        requireDigits: true,
        requireSymbols: false,
        tempPasswordValidity: Duration.days(7),
      },
      mfa: Mfa.OFF,
      // E-mails são sintéticos (@exemplo.org): sem recuperação de senha por e-mail.
      accountRecovery: AccountRecovery.NONE,
      // Não verifica nem envia e-mail automaticamente (o script marca email_verified).
      autoVerify: { email: false },
      deletionProtection: false,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // Leitura: e-mail, nome e os três atributos customizados (o token traz as claims).
    const leitura = new ClientAttributes()
      .withStandardAttributes({ email: true, emailVerified: true, fullname: true })
      .withCustomAttributes(...ATRIBUTOS_CUSTOM);
    // Escrita: só `locale`. O usuário não altera perfil, setor, identificador, e-mail nem nome
    // (Req. 1.2). Lista vazia não serve: o Cognito a trata como "todos os atributos padrão".
    const escrita = new ClientAttributes().withStandardAttributes({ locale: true });

    const userPoolClient = userPool.addClient('SpaClient', {
      userPoolClientName: `painel-expedientes-spa-${props.ambiente}`,
      generateSecret: false,
      authFlows: {
        userSrp: true,
        // Facilita obter tokens nos testes de API (CLI). A SPA usa code + PKCE.
        userPassword: true,
      },
      oAuth: {
        flows: { authorizationCodeGrant: true, implicitCodeGrant: false },
        scopes: [OAuthScope.OPENID, OAuthScope.EMAIL, OAuthScope.PROFILE],
        callbackUrls: urlsSpa,
        logoutUrls: urlsSpa,
      },
      supportedIdentityProviders: [UserPoolClientIdentityProvider.COGNITO],
      readAttributes: leitura,
      writeAttributes: escrita,
      preventUserExistenceErrors: true,
      enableTokenRevocation: true,
      accessTokenValidity: Duration.hours(1),
      idTokenValidity: Duration.hours(1),
      refreshTokenValidity: Duration.hours(12),
    });

    // Domínio Cognito (Hosted UI). Prefixo único por ambiente e conta.
    const dominio = userPool.addDomain('Dominio', {
      cognitoDomain: { domainPrefix: `painel-expedientes-${props.ambiente}-${this.account}` },
    });

    this.userPool = userPool;
    this.userPoolClient = userPoolClient;
    this.dominio = dominio;
    this.userPoolId = userPool.userPoolId;
    this.userPoolClientId = userPoolClient.userPoolClientId;

    new CfnOutput(this, 'UserPoolId', {
      value: userPool.userPoolId,
      description: `User Pool do painel (ambiente ${props.ambiente})`,
    });
    new CfnOutput(this, 'UserPoolClientId', { value: userPoolClient.userPoolClientId });
    new CfnOutput(this, 'DominioCognito', { value: dominio.baseUrl() });
  }
}
