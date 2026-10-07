# Painel Unificado de Expedientes (MVP de hackathon)

Painel que reúne os expedientes do Único em uma fila priorizada por prazo e
risco, com busca, filtros, detalhes, ações em lote e resumo diário. É um MVP de
hackathon (AWS/MPF) e usa **somente a base sintética** do kit em `resources/`.
Nenhum dado real ou credencial é versionado.

## Arquitetura

SPA Angular 22 + Bootstrap 5 servida por S3 privado + CloudFront (OAC). Login no
Amazon Cognito (PKCE). A SPA chama uma API Gateway REST com Cognito Authorizer;
as Lambdas (Node.js 24, arm64) aplicam autorização por setor e sigilo no backend
e leem/escrevem na tabela única DynamoDB `Expedientes` (GSI1/GSI2, sem `Scan`).
Toda a infraestrutura é CDK v2 em `app/infra` (stacks `DadosStack`, `AuthStack`,
`ApiStack`, `WebStack`), região `us-east-1`.

## Pré-requisitos

- Node.js 24 (`app/.nvmrc`) e npm 10+
- AWS CLI v2 com o profile `hackatongabinete` (região `us-east-1`)

```bash
cd app
npm ci
npm run build
```

## Implantar

```bash
cd app
npm run build -w @painel/web          # gera os estáticos antes da WebStack
cd infra
npx cdk bootstrap --profile hackatongabinete --region us-east-1   # uma vez por conta/região
npx cdk deploy --all --profile hackatongabinete --region us-east-1
```

Ambiente novo: após o primeiro deploy, copie a saída `WebStack.UrlSpa` para o
contexto `urlsSpa` em `app/infra/cdk.json` e rode de novo o deploy de
`AuthStack` e `ApiStack` (callback do Cognito e CORS).

URLs atuais (dev):

- SPA: https://d1rlsn9g5sqwu6.cloudfront.net/
- API: https://ia21eq5d4i.execute-api.us-east-1.amazonaws.com/dev/api/v1/

## Carregar dados

Carrega `resources/hackathon-expedientes/seed/saida/dynamodb/itens.json`
(49.108 itens) na tabela criada pela `DadosStack`. Idempotente.

```bash
cd app
npm run carregar-seed -w scripts          # opções: --remover-extras, --tabela, --regiao
# ou: scripts/carregar-seed.sh  |  .\scripts\carregar-seed.ps1
```

Não use `gerar_seed.py --carregar` nem `--criar-tabela`.

## Criar usuários

```bash
cd app
npm run criar-usuarios -w scripts -- --user-pool-id <UserPoolId>
```

A senha é pedida em prompt oculto (ou via variável `SENHA_DEMO`). Nunca a
versione. Usuários de demonstração: `GABSUB3-DVT-U02` (CHEFE) e
`GABSUB3-DVT-U03` (SERVIDOR).

## Rodar local

```bash
cd app
npm start -w @painel/web    # ng serve em http://localhost:4200 (usa a API implantada)
```

## Testar

```bash
cd app
npm test                    # domínio, autorização, API e infra (Vitest + fast-check)
```

## Destruir

> **Atenção:** apaga todas as stacks, **incluindo a tabela `Expedientes` e os
> dados**, o Cognito (usuários), a API e o site. Irreversível.

```bash
cd app
scripts/destruir.sh         # ou: .\scripts\destruir.ps1  |  npm run destruir -w scripts
```

O script pede que você digite `destruir` e então roda
`npx cdk destroy --all --force --profile hackatongabinete --region us-east-1`
em `app/infra`.
