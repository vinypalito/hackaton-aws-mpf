# Plano enxuto — pitch.html (Painel Unificado de Expedientes)

Entregável: `apresentacao/pitch.html` único, CSS/JS inline, sem CDN, SVG à mão, pt-BR. Não editar `resources/`.
Navegação: setas/PageUp/PageDown/Home/End, botões anterior/próximo, sumário clicável (S), barra de progresso
(`role=progressbar`), hash `#slide-N` (pushState + hashchange), tela cheia (F), cronômetro 5:00 (T). Teclas ignoradas
quando o foco está em input/select/range. Foco visível, `aria-live` anunciando "Slide N de M: título",
`prefers-reduced-motion`, nada só por cor (selos com texto), `@media print` um slide por página, < 768 px vira rolagem.
Visual (tokens de `app/web/src/styles.css`, derivados do Único): papel `#f5f4ef`, tinta `#15171c`, marinho `#1b3470`,
azul `#1d3c87`, vermelho `#b42318`, âmbar `#8a5300`, verde `#1f6b4a`; fontes 'IBM Plex Sans'/system-ui,
'Newsreader'/Georgia nas manchetes, 'IBM Plex Mono'/Consolas.

## 1. Critérios de avaliação (resources/criterios-avaliacao-hackathon.html)

6 critérios, **peso igual: nota 0–10 cada, 60 pontos máx.**, nota final = média da banca. Pitch 5 min + 1 min Q&A.
Escala: 9–10 Excelente · 7–8 Bom · 5–6 Satisfatório · 3–4 Parcial · 0–2 Insuficiente.

| # | Critério (0–10) | Itens avaliados | Evidência no projeto (status) |
|---|---|---|---|
| 1 | Atendimento aos Requisitos | funcionalidades do caso; fluxo ponta a ponta; entradas/saídas; qualidade do output; dados sintéticos | F1/F3/F4/F5 implementados (início, painel 3 visões, detalhe+histórico, resumo IA); login→início→painel→detalhe implantado; seed `itens.json` 49.108 itens via `carregar-seed` (BatchWriteItem 25); API JSON com `{codigo,mensagem,correlationId}`; F6–F10 planejados (Parcial) |
| 2 | Arquitetura AWS | serverless; eventos; gerenciados; IaC; desacoplamento; Bedrock | 5 Lambdas nodejs24.x arm64 + API GW REST + DynamoDB + S3/CloudFront + Cognito (Implementado); EventBridge Scheduler/lote assíncrono (Planejado); CDK v2 2.272.0, 4 stacks, 77 recursos; monorepo dominio/api/web/infra/scripts; Bedrock Nova Lite via Converse (Implementado, Guardrails planejado) |
| 3 | Inovação e Criatividade | abordagem; AWS+Kiro; specs/hooks/steering; UX/UI; extras | priorização RN2 0–100, visões lista/quadro/radar, sinais de risco, resumo IA com sigilo barrado antes do modelo; spec Kiro (36 requisitos, design, tasks 10/10 obrigatórias), steering tech/aws-profile/documentação; hooks planejados (Parcial) |
| 4 | Segurança | authN/authZ; menor privilégio; validação; dados sensíveis; HTTPS/cripto; LGPD | Cognito sem auto cadastro, senha ≥12, PKCE, revogação; Authorizer nas 5 rotas; `autorizar` com matriz como dados (negação padrão, outro setor→404); 1 role por Lambda, só `GetItem`/`Query`/`InvokeModel` com ARNs exatos (teste CDK "sem *"); listas brancas + cursor validado; `mascararSigilo`; logger com 9 campos permitidos; SSE-S3, OAC, BPA, enforceSSL, DynamoDB cripto padrão; base 100% sintética, destruir.sh |
| 5 | Apresentação do MVP | estrutura; demo; clareza da arquitetura; tempo; Q&A | este deck (roteiro marcado), diagrama interativo, cronômetro 5:00, apêndice/FAQ |
| 6 | Viabilidade e Escalabilidade | caminho p/ produção; escala; custo; reuso; manutenibilidade | roadmap tarefas 6.x; on-demand, sem Scan, throttling 50/100; calculadora de custos; domínio puro reutilizável; 192 testes passando |

Slide "Critérios × Evidências": tabela com os 32 itens (5+6+5+6+5+5), status Implementado/Parcial/Planejado, link para o slide.

## 2. Fatos do projeto (verificados no código em 07/10/2026)

- Base: 4.109 expedientes, 23.502 movimentações, 4.296 prazos, 7.907 notificações, 49.108 itens; setores GABSUB3-DVT e
  CIVINT/STIC; 14 usuários; perfis MEMBRO/CHEFE/SERVIDOR; data de referência 07/10/2026 17:00 (-03:00).
- URLs (README): SPA https://d1rlsn9g5sqwu6.cloudfront.net/ · API https://ia21eq5d4i.execute-api.us-east-1.amazonaws.com/dev/api/v1/
- Demo: `GABSUB3-DVT-U02` (CHEFE), `GABSUB3-DVT-U03` (SERVIDOR).
- Rotas (`/api/v1`, stage `dev`): GET /me, GET /home, GET /expedientes (GSI1, filtros caixa/gerenciador/statusPrazo, limite 1–100, cursor), GET /expedientes/{id}, POST /expedientes/{id}/resumo (Bedrock).
- Bedrock: `us.amazon.nova-lite-v1:0`, Converse, maxTokens 300, temperatura 0,2, prompt de sistema fixo, contexto só com campos não sensíveis, sigiloso → 403 sem chamar o modelo, falha → 502 `IA_INDISPONIVEL`, selo "Gerado por IA".
- Testes (`npm test` em `app/`, todos passando): dominio 55 · api 53 · infra 28 · scripts 32 · web 24 = **192 testes / 21 arquivos**.
  fast-check, axe-core, k6, cobertura ≥80 % medida, ESLint, gitleaks e hooks: **planejados** (não instalados).
- Acessibilidade implementada: `lang=pt-BR`, skip link, `title` por rota, tabelas com `caption`/`th scope`, `aria-live`, `role=alert` com correlationId, `label`, `aria-pressed`, reduced-motion, contraste ≥4,5:1.
- Planejado / não implantado: AgendamentosStack (Scheduler 07:00 + SES, reconciliação 15 min), ObservabilidadeStack (dashboard, alarmes, EMF, grupo `/painel-expedientes/auditoria`), Guardrails, JSON Schema no API GW, usage plan, lote ≤50 síncrono / 51–200 HTTP 202, índice de busca em memória, CSP própria. Mostrar com borda tracejada + selo "Planejado".
- Nota honesta: TLS 1.2 mínimo está no código, mas sem domínio próprio o CloudFront usa o certificado padrão.
- Não exibir o ID da conta AWS (aparece nos templates) — usar `<conta>`.

## 3. Recursos reais do cdk.out (77 recursos; tags `projeto=painel-expedientes`, `ambiente=dev`)

**DadosStack (1)** — `TabelaExpedientes` DynamoDB `Expedientes`: PK/SK String, GSI1 (GSI1PK/GSI1SK) e GSI2 (GSI2PK/GSI2SK) projeção ALL, PAY_PER_REQUEST, PITR ligado, TTL `expiraEm`, criptografia padrão AWS, DeletionPolicy Delete.

**AuthStack (3)** — UserPool `painel-expedientes-dev` (só admin cria, alias e-mail, senha ≥12 maiúsc/minúsc/dígito, MFA off, recuperação admin_only, custom imutáveis idUsuario 1–64, siglaSetor 1–64, perfil 1–16); UserPoolClient `painel-expedientes-spa-dev` (sem segredo, code flow, escopos openid/email/profile, SRP + USER_PASSWORD + refresh, access/id 60 min, refresh 12 h, revogação, grava só `locale`); UserPoolDomain (Hosted UI).

**ApiStack (59)** — RestApi `painel-expedientes-dev` REGIONAL; Stage `dev` (throttling 50 rps / burst 100, métricas); Deployment; Authorizer COGNITO_USER_POOLS (cache 300 s); 7 Resources (api, v1, me, home, expedientes, {id}, resumo); 13 Methods (5 de negócio com Cognito + 8 OPTIONS CORS para localhost:4200 e CloudFront); 10 Lambda::Permission; 5 GatewayResponses (401, 403, 429, 4xx, 5xx com correlationId); 5 LogGroups (30 dias); 5 Roles (AWSLambdaBasicExecutionRole) + 5 Policies; 5 Functions:

| Função | Rota | Runtime/arch | Mem | Timeout | IAM de dados |
|---|---|---|---|---|---|
| FnMe | GET /me | nodejs24.x arm64 | 1024 MB | 10 s | GetItem tabela |
| FnHome | GET /home | idem | 1024 MB | 10 s | Query+GetItem tabela; Query GSI2 |
| FnListarExpedientes | GET /expedientes | idem | 1024 MB | 10 s | Query GSI1 |
| FnDetalheExpediente | GET /expedientes/{id} | idem | 1024 MB | 10 s | Query tabela |
| FnResumoExpediente | POST /expedientes/{id}/resumo | idem | 1024 MB | 15 s | Query tabela; bedrock:InvokeModel (inference-profile us.amazon.nova-lite-v1:0 + foundation-model amazon.nova-lite-v1:0) |

Env comum: DATA_REFERENCIA, NOME_TABELA, ORIGENS_PERMITIDAS, POWERTOOLS_SERVICE_NAME=painel-api, NODE_OPTIONS; esbuild CJS minificado, SDK v3 empacotado.

**WebStack (14)** — Bucket SPA (Block Public Access total, SSE-S3 AES256, enforceSSL, autoDelete); BucketPolicy; OriginAccessControl (SigV4 always); Distribution (HTTP/2+3, IPv6, redirect-to-https, compress, CachingOptimized, SecurityHeadersPolicy gerenciada, 403/404→/index.html); 2 Custom::CDKBucketDeployment + 2 AwsCliLayer + Lambda python3.13 arm64 1024 MB 900 s + Role + Policy; Custom::S3AutoDeleteObjects + provider Lambda nodejs24.x 128 MB 900 s + Role.

Gerar a tabela de inventário lendo `app/infra/cdk.out/*.template.json` com um snippet Node (excluir `AWS::CDK::Metadata`, trocar `\d{12}` por `<conta>`) e embutir como JSON; filtros por stack e serviço + busca.

## 4. Diagrama de arquitetura (SVG, us-east-1)

Usuário → CloudFront (OAC, TLS, headers) → S3 privado (SPA Angular 22 + Bootstrap 5); Usuário → Cognito Hosted UI (PKCE);
SPA → API Gateway REST direto (ID token; Authorizer, throttling, CORS restrito) → 5 Lambdas → DynamoDB (GSI1/GSI2, sem Scan);
FnResumo → Bedrock Nova Lite; Lambdas → CloudWatch Logs. Tracejados: Guardrails, Lambda de lote assíncrona, Scheduler →
rotina diária → SES, reconciliação → DynamoDB, ObservabilidadeStack. Caixas por stack com cor + rótulo + legenda.
Nós `role=button tabindex=0`; Enter/clique abre painel lateral (serviço, papel, config da tabela acima, IAM, stack,
requisitos, custo do cenário atual); Esc fecha e devolve o foco. Botões de fluxo: login, consultar painel, resumo com IA,
lote assíncrono (planejado), resumo diário por e-mail (planejado), com passos em `aria-live`. Lista textual alternativa.

## 5. Preços unitários us-east-1 (sob demanda, consulta 07/10/2026)

| Serviço | Preço | Faixa gratuita | Fonte |
|---|---|---|---|
| Lambda arm64 | US$ 0,20/milhão req + US$ 0,0000133334/GB-s | 1 M req + 400 mil GB-s/mês (sempre) | https://aws.amazon.com/lambda/pricing/ |
| API Gateway REST | US$ 3,50/milhão (até 333 M) | 1 M/mês por 12 meses (contas antigas) | https://aws.amazon.com/api-gateway/pricing/ |
| DynamoDB on-demand | US$ 0,125/milhão RRU · US$ 0,625/milhão WRU · US$ 0,25/GB-mês · PITR US$ 0,20/GB-mês | 25 GB armazenamento | https://aws.amazon.com/dynamodb/pricing/on-demand/ |
| S3 Standard | US$ 0,023/GB-mês · GET US$ 0,0004/1.000 | 5 GB 12 meses | https://aws.amazon.com/s3/pricing/ |
| CloudFront | US$ 0,085/GB · US$ 0,01/10.000 req HTTPS | 1 TB + 10 M req/mês (sempre) | https://aws.amazon.com/cloudfront/pricing/ |
| Cognito Essentials | US$ 0,015/MAU | 10.000 MAU | https://aws.amazon.com/cognito/pricing/ |
| EventBridge Scheduler | US$ 1,00/milhão | 14 M/mês | https://aws.amazon.com/eventbridge/pricing/ |
| SES | US$ 0,10/1.000 e-mails | 3.000/mês 12 meses | https://aws.amazon.com/ses/pricing/ |
| Bedrock Nova Lite | US$ 0,00006/1K tokens entrada · US$ 0,00024/1K saída | — | https://aws.amazon.com/bedrock/pricing/ |
| Guardrails | filtro de conteúdo US$ 0,15/1K unidades de texto · PII US$ 0,10/1K (1 unidade = até 1.000 caracteres) | — | https://aws.amazon.com/about-aws/whats-new/2024/12/amazon-bedrock-guardrails-reduces-pricing-85-percent/ |
| CloudWatch | logs US$ 0,50/GB ingestão + US$ 0,03/GB-mês · métrica US$ 0,30 · dashboard US$ 3 · alarme US$ 0,10 | 5 GB, 10 métricas, 3 dashboards, 10 alarmes | https://aws.amazon.com/cloudwatch/pricing/ |
| Transferência saída | US$ 0,09/GB | 100 GB/mês | https://aws.amazon.com/ec2/pricing/on-demand/ |

Aviso: contas criadas desde 15/07/2025 recebem créditos em vez da faixa de 12 meses
(https://aws.amazon.com/about-aws/whats-new/2025/07/aws-free-tier-credits-month-free-plan). Estimativa; conferir no
AWS Pricing Calculator (https://calculator.aws/). Câmbio editável, padrão R$ 5,50.

Fórmulas: req = usuários × req/usuário/dia × dias; GB-s = req × (MB/1024) × ms/1000 (+ 2.910 invocações agendadas/mês × 5 s se planejados);
DynamoDB = req × RRU/req (20) + escritas × WRU (12, planejado) + GB + PITR; Bedrock = chamadas × (tokens in × p_in + out × p_out);
Guardrails = chamadas × 2 unidades × (0,15+0,10)/1000; saída = req × 8 KB. Modos: sem faixas / "sempre gratuito" / + 12 meses;
toggle "incluir planejados".

Cenários (premissas na tela) e totais de referência (USD/mês, sem faixas, completo / só implantado):
- Demo do hackathon: 14 usuários, 350 req/dia, 30 dias, 17 chamadas IA/dia, 3 e-mails/dia, 1 GB logs → **≈ 9,10 / 2,48** (com "sempre gratuito": 1,32).
- Piloto (1 unidade): 300 usuários, 150 req/dia, 22 dias, 300 IA/dia, 300 e-mails/dia, 5 GB logs → **≈ 30,32 / 19,57**.
- Produção (MPF nacional): 12.000 usuários, 150 req/dia, 22 dias, 150 ms, 12.000 IA/dia, 60 GB DynamoDB, 60 GB logs → **≈ 828 / 643** (com "sempre gratuito": 638).
Gráfico de barras em SVG por serviço + tabela; total mensal e anual em USD e BRL.

Comparação servidor sempre ligado (referência on-demand, conferir): mínimo = t4g.small US$ 0,0168/h + EBS 20 GB gp3
US$ 0,08/GB + ALB US$ 0,0225/h + 1 LCU US$ 0,008/h + RDS PostgreSQL db.t4g.micro US$ 0,016/h + 20 GB US$ 0,115/GB ≈ **US$ 50/mês**
mesmo ocioso; produção HA = 2× t4g.medium US$ 0,0336/h + ALB + RDS db.t4g.medium Multi-AZ (2× US$ 0,065/h) 100 GB
(US$ 0,23/GB) + NAT US$ 0,045/h ≈ **US$ 250/mês** só de computação/dados. Mensagem honesta: demo/piloto serverless custa
uma fração; na escala nacional a ordem de grandeza se aproxima, sem servidor para corrigir, escalar ou pagar ocioso.

## 6. Slides (19; ★ = roteiro de 5 min)

1★ Capa · 2★ Problema e público · 3★ Solução (abas Início/Painel/Detalhe/Resumo IA + roteiro da demo) ·
4 Critérios de avaliação + matriz Critérios × Evidências · 5 Atendimento aos requisitos (RF/RN com status) ·
6★ Arquitetura AWS (diagrama interativo) · 7 Inventário de infraestrutura (77 recursos) · 8 Dados (tabela única, padrões
A1/A2/A3/A5/A6/A8/A13 implementados, IAM nem concede Scan) · 9★ Segurança e LGPD · 10 Escalabilidade e desempenho ·
11 Acessibilidade eMAG/WCAG (conformidade plena exige teste manual) · 12 Qualidade e testes (192) · 13 IA generativa ·
14 Observabilidade · 15 Inovação e Kiro · 16★ Custos (calculadora) · 17 Serverless × servidor sempre ligado ·
18★ Roadmap MVP → produção · 19★ Encerramento + FAQ. Cada slide com selo "Critério N".

## 7. Implementação

- [ ] 1. Escrever `apresentacao/pitch.html` com shell, navegação, slides 1–19, diagrama, inventário e calculadora.
      Verify: abrir no navegador; `node -e` extraindo os `<script>` e checando sintaxe com `new vm.Script`; nenhum `src=`/`@import` externo.
- [ ] 2. Conferir totais da calculadora contra os valores de referência da seção 5 (demo ≈ 9,10 sem faixas, completo).
