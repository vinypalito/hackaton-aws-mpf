# Tecnologia

## Stack Principal

Painel unificado de expedientes do Único (MVP de hackathon). Backend serverless
e frontend SPA, tudo na AWS, com infraestrutura como código. Este arquivo é a
fonte da stack; o detalhamento está em `.kiro/specs/hackathon-expedientes/design.md`.

- **Linguagem:** TypeScript (backend, IaC e frontend).
- **Runtime:** Node.js 24 (igual ao runtime `nodejs24.x` do AWS Lambda; alinhe a
  versão local pelo `.nvmrc` com `24` e `engines.node >=24`).
- **Backend:** funções AWS Lambda (handlers enxutos, uma responsabilidade por
  função) atrás do API Gateway REST. Sem framework de servidor (sem Express/Nest
  no caminho da requisição) para evitar cold start.
  - Arquitetura arm64, empacotamento com esbuild (`NodejsFunction` do CDK),
    1024 MB nas Lambdas de consulta.
  - Lotes de até 50 itens são síncronos; de 51 a 200 itens respondem HTTP 202 e
    seguem por invocação assíncrona da Lambda de lote (retentativa nativa).
  - Configuração por variável de ambiente definida no CDK (ex.:
    `DATA_REFERENCIA=2026-10-07T17:00:00-03:00`).
  - AWS Lambda Powertools para TypeScript (Logger e Metrics/EMF).
  - AWS SDK for JavaScript v3.
- **Frontend:** Angular 22 (standalone components, Signals) + Bootstrap 5 (CSS e
  JS pontual, sem jQuery), no padrão visual do Único, servido como SPA estática.
  Sem Angular CDK/Material: modal com `<dialog>` nativo e reordenação por
  *drag and drop* nativo com botões acessíveis por teclado.
- **Gerenciador de pacotes:** npm, monorepo com npm workspaces.
- **Banco de dados:** Amazon DynamoDB em tabela única `Expedientes` (`PK`/`SK` +
  `GSI1` e `GSI2`, String, projeção ALL), conforme o `dynamodb/itens.json` do kit
  de dados. On-demand, PITR, TTL `expiraEm`, criptografia padrão gerenciada pela
  AWS. Nenhuma rota usa `Scan`.
- **Busca:** índice do setor em memória da Lambda, remontado por `Query` no
  `GSI1` quando `SETOR#<sigla>/INDICE#BUSCA.versao` muda.
- **IaC:** AWS CDK v2 (`aws-cdk-lib` 2.x, versões fixadas) em TypeScript, um
  `App` com as stacks `DadosStack`, `AuthStack`, `ApiStack`, `AgendamentosStack`,
  `WebStack` e `ObservabilidadeStack`. Todos os recursos com as tags
  `projeto=painel-expedientes` e `ambiente=<env>`.
- **Infraestrutura / Cloud:** AWS (região `us-east-1`)
  - **Autenticação:** Amazon Cognito User Pool (App Client SPA com PKCE,
    atributos `custom:idUsuario`, `custom:siglaSetor`, `custom:perfil`) e
    Cognito Authorizer no API Gateway.
  - **API:** Amazon API Gateway REST (validação por JSON Schema, throttling,
    *usage plan*, CORS restrito) + AWS Lambda.
  - **Dados:** Amazon DynamoDB (tabela única com GSI1 e GSI2).
  - **Frontend hosting:** Amazon S3 (privado, SSE-S3, Block Public Access) +
    Amazon CloudFront (OAC, TLS 1.2, *response headers policy*).
  - **Agendamentos:** Amazon EventBridge Scheduler + Lambda: rotina diária às
    07:00 (alertas de prazo + resumo por Amazon SES) e reconciliação de
    contadores a cada 15 min.
  - **IA generativa (opcional):** Amazon Bedrock com Amazon Nova Lite
    (`us.amazon.nova-lite-v1:0`), Converse API e Bedrock Guardrails (resumo do
    dia e pesquisa em linguagem natural).
  - **Observabilidade e auditoria:** Amazon CloudWatch Logs (retenção 30 dias,
    trilha de auditoria no grupo `/painel-expedientes/auditoria`), métricas EMF,
    dashboard e alarmes simples.

### Fora do MVP (opcional/futuro)

Não introduza estes serviços sem decisão explícita da equipe: AWS WAF, chave KMS
dedicada, AWS X-Ray, AWS Budgets e alarmes por SNS, S3 Object Lock, Amazon
Verified Permissions (Cedar), barramento EventBridge/SQS/SNS, DynamoDB Streams,
AWS Step Functions, Amazon OpenSearch, WebSocket/AppSync e AWS Secrets Manager/SSM
(não há segredos no MVP).

> Mantenha esta lista atualizada conforme as decisões técnicas evoluírem, para
> que o Kiro use sempre as bibliotecas e os padrões corretos.

## Serviços AWS por camada

| Camada | Serviço | Papel |
| --- | --- | --- |
| Frontend | S3 + CloudFront | Hospeda a SPA Angular (estática), com HTTPS e headers de segurança |
| Autenticação | Cognito User Pool | Login dos usuários fictícios de `usuarios.csv` |
| API | API Gateway REST + Lambda | Endpoints autenticados; autorização por setor e sigilo **no backend** |
| Dados | DynamoDB (tabela única) | Expedientes, histórico, prazos, contadores, preferências, lotes |
| Agendamentos | EventBridge Scheduler + Lambda + SES | Resumo diário por e-mail (RF16), alertas de prazo e reconciliação |
| IA (opcional) | Bedrock (Nova Lite + Guardrails) | Busca em linguagem natural / resumo gerado |
| Observabilidade | CloudWatch Logs + métricas EMF | Logs, auditoria, dashboard e alarmes |
| IaC | CDK v2 (TypeScript) | Provisiona toda a infraestrutura acima |

## Estrutura do repositório

```
app/
├── packages/dominio/      # regras puras (prazo, prioridade, risco, lote, máscara, autorização)
├── packages/contratos/    # tipos e esquemas JSON (OpenAPI) compartilhados
├── services/api/          # handlers Lambda por rota + repositorio/ (DynamoDB) + Bedrock
├── services/agendados/    # rotina diária (alertas + SES) e reconciliação
├── web/                   # SPA Angular 22 + Bootstrap 5
├── infra/                 # app CDK v2
├── scripts/               # carga do seed, migração, restauração, gerador 10×, destruir
└── tests/                 # carga (k6) e E2E opcional (Playwright)
```

## Testes

| Nível | Ferramenta |
| --- | --- |
| Unitário, paridade com o seed e autorização | Vitest (`npm test` na raiz) |
| Propriedade | fast-check |
| API | Vitest chamando os handlers (DynamoDB Local ou conta de teste) |
| Infra | Assertions do CDK (`aws-cdk-lib/assertions`) |
| Frontend + acessibilidade | `ng test` (runner padrão do Angular 22) + axe-core |
| E2E (opcional) | Playwright + axe-core |
| Carga | k6 |
| Segredos | `gitleaks` antes do commit |

Cobertura mínima de 80 % no pacote `packages/dominio`.

## Comandos Comuns

> Credenciais da AWS: use sempre o profile `hackatongabinete` e a região
> `us-east-1` (ver steering `aws-profile`).

```bash
# --- Raiz do monorepo (domínio, API, agendados, CDK) ---
npm ci                        # instalar dependências
npm test                      # domínio + autorização + API + infra
npm run lint                  # lint / formatação
npm run build                 # transpila TypeScript
npm run test:e2e              # opcional (Playwright)

# --- Infraestrutura (CDK) ---
npx cdk synth --profile hackatongabinete
npx cdk bootstrap --profile hackatongabinete --region us-east-1   # uma vez por conta/região
npx cdk deploy --all --profile hackatongabinete --region us-east-1
npx cdk destroy --all --profile hackatongabinete --region us-east-1

# --- Frontend (dentro de web/) ---
npm start                     # ng serve (rodar manualmente no terminal)
npm test                      # ng test
npm run build                 # ng build --configuration production (estáticos para o S3)

# --- Dados sintéticos ---
# A tabela Expedientes é criada pela DadosStack. Carregue o itens.json do kit
# como está (DynamoDB JSON, um item por linha), com o script do projeto:
AWS_PROFILE=hackatongabinete scripts/carregar-seed.sh   # lê seed/saida/dynamodb/itens.json
```

> Não use `gerar_seed.py --carregar` para a carga da demo: o gerador sempre
> reescreve a pasta de saída e não é determinístico entre execuções (a ordem de
> iteração de `set` depende do `PYTHONHASHSEED`), então os dados gravados
> divergem do `itens.json` e dos CSVs do kit (ex.: `notificacoes`). Também não
> use `--criar-tabela`, porque a tabela já vem da `DadosStack`. O `gerar_seed.py`
> só é importado pelo gerador de carga 10×, com saída em `build/`.

> Servidores de desenvolvimento e watchers (`ng serve`, `cdk watch`) devem ser
> executados manualmente no terminal, nunca de forma bloqueante por automação.

## Padrões e Convenções Técnicas

- Siga os padrões e as bibliotecas já presentes no projeto antes de introduzir
  novas dependências.
- Prefira versões fixadas (pinned) ao adicionar dependências.
- **Handlers de Lambda enxutos:** cada função faz uma coisa (validar entrada →
  `autorizar` → domínio/repositório → `mascararSigilo` → responder); mantenha a
  lógica de negócio (prioridade, risco, validação de lote, autorização) em
  módulos puros e testáveis em `packages/dominio`, sem dependência de AWS.
- **Acesso a dados centralizado:** encapsule o DynamoDB na camada de repositório
  (`services/api/repositorio/`), a única que conhece `PK`/`SK`, GSI1 e GSI2; use
  só `ExpressionAttributeValues`.
- **Escritas transacionais:** cada escrita de negócio usa `TransactWriteItems`
  com `versao` condicional e atualiza na mesma transação os contadores `CONT#`,
  a versão do índice `INDICE#BUSCA` e as notificações `NOT#`. Comandos com
  `Idempotency-Key`.
- **Segurança por padrão:** valide e sanitize toda entrada; autorização por setor
  e por nível de sigilo sempre no backend (módulo `autorizar` com matriz como
  dados, negação por padrão), nunca só na tela; nenhum endpoint anônimo; setor,
  perfil e usuário só das *claims* do token; não exponha dados sensíveis em logs,
  respostas, CSV, e-mails, `.ics` ou prompts de IA; erros sem *stack trace*, com
  `correlationId`.
- **IAM com menor privilégio:** uma role por Lambda, com ações e ARNs exatos (sem
  `*` em dados), verificada por assertions do CDK.
- **Logs:** Powertools Logger com lista branca de campos (`idUsuario`,
  `idExpediente`, rota, status, latência, `correlationId`).
- **Acessibilidade (eMAG/WCAG):** navegação por teclado, `label` em todo campo,
  tabelas com `caption`/`th id`/`td headers`, `aria-live` para avisos,
  `role="alert"` para erros, contraste adequado e nenhuma informação só por cor.
- **Responsividade:** funcionar em desktop e em telas menores sem perda de função
  (cartões < 768 px, alvos ≥ 24 px, reflow em 320 px).
- **Regras de negócio fixas do caso:** situação de prazo, pontuação de prioridade
  e ordenação da fila seguem RN1–RN3 do caso de uso; filtrar `caixa != BAIXADO`
  no painel (RN7).
- **Dados do kit:** nada em `resources/` é editado; a aplicação só acrescenta
  itens pela migração.
- **Credenciais:** nunca versione credenciais da conta do evento; use só a base
  sintética.

## Ambiente de Desenvolvimento

- **Sistema operacional de referência:** Linux
- **Shell:** bash
- **Node.js:** 24.x (fixe com `.nvmrc`; alinhado ao runtime da Lambda)
- **npm:** 10+
- **AWS CLI:** v2 (profile `hackatongabinete`, região `us-east-1`)
- **AWS CDK:** v2 (via `npx cdk`)
- **Python:** 3.x com `boto3` (gerador `gerar_seed.py` e `scripts/gerar-carga-10x.py`)
