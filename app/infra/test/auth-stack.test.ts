import { Match, Template } from 'aws-cdk-lib/assertions';
import { beforeAll, describe, expect, it } from 'vitest';
import { criarApp } from '../lib/app.js';

describe('AuthStack', () => {
  let template: Template;

  beforeAll(() => {
    const { auth } = criarApp({
      context: { ambiente: 'teste', urlsSpa: 'https://d111111abcdef8.cloudfront.net/' },
    });
    template = Template.fromStack(auth);
  });

  it('cria um User Pool sem auto cadastro (Req. 1.1)', () => {
    template.resourceCountIs('AWS::Cognito::UserPool', 1);
    template.hasResourceProperties('AWS::Cognito::UserPool', {
      AdminCreateUserConfig: { AllowAdminCreateUserOnly: true },
      UsernameConfiguration: { CaseSensitive: false },
    });
  });

  it('declara custom:idUsuario, custom:siglaSetor e custom:perfil imutáveis (Req. 1.2)', () => {
    const pool = Object.values(template.findResources('AWS::Cognito::UserPool'))[0];
    const schema = pool?.Properties.Schema as { Name: string; Mutable: boolean; AttributeDataType: string }[];
    for (const nome of ['idUsuario', 'siglaSetor', 'perfil']) {
      const attr = schema.find((a) => a.Name === nome);
      expect(attr, nome).toBeDefined();
      expect(attr?.Mutable).toBe(false);
      expect(attr?.AttributeDataType).toBe('String');
    }
  });

  it('remove o User Pool no destroy (Req. 26.7)', () => {
    template.hasResource('AWS::Cognito::UserPool', {
      DeletionPolicy: 'Delete',
      UpdateReplacePolicy: 'Delete',
    });
  });

  it('App Client público, code flow com PKCE e sem implicit', () => {
    template.resourceCountIs('AWS::Cognito::UserPoolClient', 1);
    template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
      GenerateSecret: false,
      AllowedOAuthFlowsUserPoolClient: true,
      AllowedOAuthFlows: ['code'],
      AllowedOAuthScopes: Match.arrayWith(['openid', 'email', 'profile']),
      ExplicitAuthFlows: Match.arrayWith(['ALLOW_USER_SRP_AUTH', 'ALLOW_REFRESH_TOKEN_AUTH']),
      SupportedIdentityProviders: ['COGNITO'],
      EnableTokenRevocation: true,
      PreventUserExistenceErrors: 'ENABLED',
      CallbackURLs: ['http://localhost:4200/', 'https://d111111abcdef8.cloudfront.net/'],
      LogoutURLs: ['http://localhost:4200/', 'https://d111111abcdef8.cloudfront.net/'],
    });
  });

  it('client lê os atributos custom, mas não grava nenhum deles nem e-mail/nome (Req. 1.2)', () => {
    const client = Object.values(template.findResources('AWS::Cognito::UserPoolClient'))[0];
    const leitura = client?.Properties.ReadAttributes as string[];
    const escrita = (client?.Properties.WriteAttributes ?? []) as string[];
    expect(leitura).toEqual(
      expect.arrayContaining(['custom:idUsuario', 'custom:siglaSetor', 'custom:perfil', 'email', 'name']),
    );
    // Lista explícita e mínima (vazia equivale a "todos os padrão" no Cognito).
    expect(escrita).toEqual(['locale']);
  });

  it('cria domínio Cognito e publica os outputs', () => {
    template.resourceCountIs('AWS::Cognito::UserPoolDomain', 1);
    template.hasOutput('UserPoolId', {});
    template.hasOutput('UserPoolClientId', {});
    template.hasOutput('DominioCognito', {});
  });

  it('aplica as tags projeto e ambiente', () => {
    template.hasResourceProperties('AWS::Cognito::UserPool', {
      UserPoolTags: { ambiente: 'teste', projeto: 'painel-expedientes' },
    });
  });
});
