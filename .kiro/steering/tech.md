# Tecnologia

## Stack Principal

Painel unificado de expedientes do Único (MVP de hackathon). Backend serverless
e frontend SPA, tudo na AWS, com infraestrutura como código.

- **Linguagem:** TypeScript (backend e frontend).
- **Runtime:** Node.js 24 (igual ao runtime `nodejs24.x` do AWS Lambda; alinhe a
  versão local pelo `.nvmrc`).
- **Backend:** funções AWS Lambda (handlers enxutos, uma responsabilidade por
  função) atrás do API Gateway. Sem framework de servidor (sem Express/Nest no
  caminho da requisição) para evitar cold start.
- **Frontend:** Angular 22 + Bootstrap 5 (segue o padrão visual do Único),
  servido como SPA estática.
- **Gerenciador de pacotes:** npm.
- **Banco de dados:** Amazon DynamoDB em tabela única (`PK`/`SK` + `GSI1` e
  `GSI2`), conforme o `dynamodb/itens.json` do kit de dados.
- **IaC:** AWS CDK v2 (`aws-cdk-lib` 2.x) em TypeScript.
- **Infraestrutura / Cloud:** AWS
  - **Autenticação:** Amazon Cognito User Pool (authorizer no API Gateway).
  - **API:** Amazon API Gateway (REST ou HTTP API) + AWS Lambda.
  - **Dados:** Amazon DynamoDB (tabela única com GSI1 e GSI2).
  - **Frontend hosting:** Amazon S3 + Amazon CloudFront.
  - **Alertas / resumo diário:** Amazon EventBridge Scheduler + Lambda +
    Amazon SES.
  - **IA generativa (opcional):** Amazon Bedrock (ex.: busca em linguagem
    natural, resumo do dia).
  - **Observabilidade:** Amazon CloudWatch Logs.

> Mantenha esta lista atualizada conforme as decisões técnicas evoluírem, para
> que o Kiro use sempre as bibliotecas e os padrões corretos.

## Serviços AWS por camada

| Camada | Serviço | Papel |
| --- | --- | --- |
| Frontend | S3 + CloudFront | Hospeda a SPA Angular (estática), com HTTPS |
| Autenticação | Cognito User Pool | Login dos usuários fictícios de `usuarios.csv` |
| API | API Gateway + Lambda | Endpoints autenticados; autorização por setor e sigilo **no backend** |
| Dados | DynamoDB (tabela única) | Expedientes, histórico, prazos, contadores, preferências |
| Alertas | EventBridge Scheduler + Lambda + SES | Resumo diário por e-mail (RF16) |
| IA (opcional) | Bedrock | Busca em linguagem natural / resumo gerado |
| IaC | CDK v2 (TypeScript) | Provisiona toda a infraestrutura acima |

## Comandos Comuns

> Credenciais da AWS: use sempre o profile `hackatongabinete` e a região
> `us-east-1` (ver steering `aws-profile`).

```bash
# --- Backend (Lambdas + CDK, TypeScript) ---
# Instalar dependências
npm ci

# Rodar os testes (unitários das regras: prioridade, risco, validação de lote)
npm test

# Lint / formatação
npm run lint

# Build (transpila TypeScript -> JavaScript para empacotar as Lambdas)
npm run build

# Sintetizar o template de infraestrutura
npx cdk synth --profile hackatongabinete

# Provisionar a conta (uma vez por conta/região)
npx cdk bootstrap --profile hackatongabinete --region us-east-1

# Implantar a infraestrutura
npx cdk deploy --profile hackatongabinete --region us-east-1

# --- Frontend (Angular) ---
# Instalar dependências
npm ci                        # dentro da pasta do frontend

# Executar em ambiente de desenvolvimento (rodar manualmente no terminal)
npm start                     # ng serve

# Rodar os testes
npm test                      # ng test

# Build de produção (gera os estáticos para o S3)
npm run build                 # ng build --configuration production

# --- Dados sintéticos ---
# Gerar os CSVs e o itens.json
python3 resources/hackathon-expedientes/seed/gerar_seed.py

# Carregar no DynamoDB da conta do evento
AWS_PROFILE=hackatongabinete python3 resources/hackathon-expedientes/seed/gerar_seed.py \
  --carregar --criar-tabela --tabela Expedientes --regiao us-east-1
```

> Servidores de desenvolvimento e watchers (`ng serve`, `cdk watch`) devem ser
> executados manualmente no terminal, nunca de forma bloqueante por automação.

## Padrões e Convenções Técnicas

- Siga os padrões e as bibliotecas já presentes no projeto antes de introduzir
  novas dependências.
- Prefira versões fixadas (pinned) ao adicionar dependências.
- **Handlers de Lambda enxutos:** cada função faz uma coisa; mantenha a lógica de
  negócio (prioridade, risco, validação de lote) em módulos puros e testáveis,
  separados do handler.
- **Acesso a dados centralizado:** encapsule o DynamoDB numa camada de repositório
  (chaves `PK`/`SK`, GSI1 e GSI2) em vez de montar queries espalhadas.
- **Segurança por padrão:** valide e sanitize toda entrada; autorização por setor
  e por nível de sigilo sempre no backend, nunca só na tela; nenhum endpoint
  anônimo; não exponha dados sensíveis em logs, respostas, e-mails ou `.ics`.
- **IAM com menor privilégio:** cada Lambda recebe só as permissões de que precisa.
- **Acessibilidade (eMAG/WCAG):** navegação por teclado, `label` em todo campo,
  tabelas com `caption`/`th id`/`td headers`, `aria-live` para avisos,
  `role="alert"` para erros, contraste adequado e nenhuma informação só por cor.
- **Responsividade:** funcionar em desktop e em telas menores sem perda de função.
- **Regras de negócio fixas do caso:** situação de prazo, pontuação de prioridade
  e ordenação da fila seguem RN1–RN3 do caso de uso; filtrar `caixa != BAIXADO`
  no painel (RN7).
- **Credenciais:** nunca versione credenciais da conta do evento; use só a base
  sintética.

## Ambiente de Desenvolvimento

- **Sistema operacional de referência:** Linux
- **Shell:** bash
- **Node.js:** 24.x (fixe com `.nvmrc`; alinhado ao runtime da Lambda)
- **npm:** 10+
- **AWS CLI:** v2 (profile `hackatongabinete`, região `us-east-1`)
- **AWS CDK:** v2 (via `npx cdk`)
- **Python:** 3.x (apenas para o gerador da base sintética `gerar_seed.py`)
