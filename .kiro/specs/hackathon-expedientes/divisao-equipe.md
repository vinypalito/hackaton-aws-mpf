# Divisão da equipe — Painel Unificado de Expedientes

> Base: `tasks.md`. Cada pessoa é dona de uma trilha e de suas pastas. Os números são as tarefas do `tasks.md`.
> Todo comando AWS usa `--profile hackatongabinete` e região `us-east-1`. Nada em `resources/` é editado.
> Nunca commitar credenciais. Marcar `[x]` aqui e no `tasks.md` ao concluir.

## Responsáveis

| Trilha | Pessoa | Foco | Pastas que domina |
| --- | --- | --- | --- |
| A | Pedro | Infra e deploy (CDK, Cognito, S3/CloudFront, observabilidade) | `infra/`, raiz do monorepo |
| B | Vini | Dados, repositório DynamoDB, busca, auditoria, carga 10× | `scripts/`, `services/api/repositorio/` |
| C | Maurão | Domínio puro (regras de negócio, autorização, testes) | `packages/dominio/` |
| D | Maluco | API (Lambdas, leitura, lotes) | `services/api/`, `services/agendados/` |
| E | Raphael | Frontend Angular | `web/` |
| F | Laercio | IA (Bedrock), extras, documentação, hooks Kiro e pitch | `docs/`, `.kiro/`, partes de `services/api/ia/` |

## Tarefas por pessoa

### Trilha A — Pedro (Infra e deploy)
- [ ] 1.1 Monorepo npm workspaces (**bloqueia todos, fazer primeiro**)
- [ ] 1.2 App CDK v2 com tags e testes de assertions
- [ ] 1.3 `DadosStack` (ver nota sobre a tabela existente)
- [ ] 1.4 Bootstrap e deploy do `DadosStack`
- [ ] 4.1 `AuthStack` (Cognito, PKCE, script dos 14 usuários)
- [ ] 4.3 Parte CDK do `ApiStack` (API Gateway, authorizer, throttling, CORS, roles por Lambda)
- [ ] 5.2 `WebStack` (S3 privado, CloudFront com OAC, headers de segurança)
- [ ] 7.2 `AgendamentosStack` (reconciliação a cada 15 min)
- [ ] 11.1 `ObservabilidadeStack` (logs, métricas, dashboard, alarmes)
- [ ] 12.4 `scripts/destruir`

### Trilha B — Vini (Dados e repositório)
- [ ] 2.2 `scripts/verificar-carga`
- [ ] 2.3 `scripts/migrar` idempotente
- [ ] 2.4 `scripts/restaurar-demo`
- [ ] 2.5 `DATA_REFERENCIA` como variável de ambiente (combinar com Pedro no CDK)
- [ ] 4.2 Camada de repositório DynamoDB (única que conhece PK/SK/GSI)
- [ ] 7.1 Índice de busca do setor em memória e busca livre
- [ ] 7.3 Módulo `auditar` (CloudWatch Logs)
- [ ] 11.3 Gerador 10× e teste de carga k6

### Trilha C — Maurão (Domínio puro)
- [ ] 3.1 `calcularStatusPrazo`
- [ ] 3.2 `calcularPontuacao`
- [ ] 3.3 `chaveGsi1`/`chaveGsi2` e ordenação da fila
- [ ] 3.4 Testes de paridade com os CSVs
- [ ] 3.5 `mascararSigilo` e `validarCriterios`
- [ ] 3.6 `calcularRisco`
- [ ] 3.7 `autorizar` (matriz do Req. 24.3 como dados)
- [ ] 6.1 `avaliarElegibilidade` e `aplicarEfeito` (lote)
- [ ] 11.4 Cobertura ≥ 80 % no domínio e `gitleaks`

### Trilha D — Maluco (API)
- [ ] 4.3 Middleware e handlers base (claims → contexto, `autorizar`, `correlationId`, erros padronizados)
- [ ] 4.4 `GET /me`, `/contadores`, `/home`
- [ ] 4.5 `GET /expedientes`
- [ ] 4.6 `GET /expedientes/{id}`
- [ ] 4.7 Testes de API (401, 404 entre setores, sigilo)
- [ ] 6.2 `POST /lotes/preview`
- [ ] 6.3 `POST /lotes` síncrono
- [ ] 6.4 Lote assíncrono (51–200 itens)
- [ ] 6.5 `POST /lotes/{id}/desfazer`
- [ ] 6.6 `GET /lotes`
- [ ] 6.8 Testes de API do lote
- [ ] 9.1 Filtros salvos
- [ ] 9.5 Anotação, favorito, exportação do histórico (back)
- [ ] 9.7 Exportação CSV segura e OpenAPI

### Trilha E — Raphael (Frontend)
- [ ] 5.1 SPA Angular 22 + Bootstrap 5 e tema do Único
- [ ] 5.3 Shell acessível (login, cabeçalho, skip link, `aria-live`)
- [ ] 5.4 Componentes base acessíveis (tabela, campo, selos)
- [ ] 5.5 Tela inicial
- [ ] 5.6 Painel (visões, caixas, filtros, chips, paginação)
- [ ] 5.7 Detalhe do expediente
- [ ] 5.8 Layout responsivo
- [ ] 5.9 **Checkpoint MVP** (com Pedro e Maluco)
- [ ] 6.7 Seleção múltipla, barra de lote e diálogo de pré-visualização
- [ ] 9.2 Personalização (colunas, densidade, tema)
- [ ] 9.3 Composição da prioridade e destaques
- [ ] 9.4 Modo foco
- [ ] 9.6 Central de alertas (front)
- [ ] 11.2 axe-core nos testes de componente

### Trilha F — Laercio (IA, extras, docs e pitch)
- [ ] 8.1 Guardrail e permissão do Bedrock (junto com Pedro no `ApiStack`)
- [ ] 8.2 `POST /ia/resumo-dia`
- [ ] 8.3 `POST /ia/interpretar-pesquisa`
- [ ] 8.4 "Resumo do dia" e "Pesquisar com IA" na SPA (junto com Raphael)
- [ ] 12.1 Steering `product.md` e `structure.md`
- [ ] 12.2 Hooks Kiro
- [ ] 12.3 README, ADRs, `docs/lgpd.md`, `docs/custos.md`
- [ ] 12.5 Roteiro de 5 minutos e dois ensaios
- [ ] 12.6 Contingência e FAQ
- [ ] 10.2 a 10.6 Extras "se sobrar tempo" (calendário, designação balanceada, rotina diária com SES, dashboards, configuração da tela inicial) — só depois do MVP
- [ ] 10.1 Widget "Maior risco" (depende do `calcularRisco` do Maurão)

### Todos
- [ ] 12.7 Revisão final: `restaurar-demo`, `npm test` (raiz e `web/`), sem dado real nem credencial no repositório

## Ordem e dependências

1. **Primeiro (todos esperam):** Pedro entrega 1.1 (monorepo). Até lá, cada um estuda as suas tarefas e o `design.md`.
2. **Contrato da API (Maluco + Raphael, junto com Maurão):** escrever o OpenAPI mínimo em `packages/contratos` para `/me`, `/home`, `/expedientes`, `/expedientes/{id}` e `/lotes*`. Com isso Raphael trabalha com mocks enquanto a API não está pronta.
3. **Já podem começar sem esperar ninguém:** Maurão (domínio puro) e Vini (scripts sobre a tabela que já existe). Raphael começa por 5.1, 5.3 e 5.4.
4. **Maluco** começa pelo middleware e pelos handlers com mocks e consome o domínio do Maurão e o repositório do Vini conforme saem.
5. **Checkpoint MVP (5.9):** Pedro, Vini, Maurão, Maluco e Raphael. Só depois disso Laercio entra nos extras do bloco 10.

## Regras de convivência

- **Cada pessoa mexe só nas suas pastas.** Se precisar de algo em pasta alheia, combine com o dono ou abra um PR pequeno para ele.
- **Branch por tarefa:** `feat/<trilha>-<tarefa>` (ex.: `feat/c-3.2-pontuacao`). PR curto e merge frequente na branch principal.
- **Contratos primeiro:** mudou um tipo ou endpoint em `packages/contratos`? Avise a equipe antes de fazer merge.
- **Domínio é a fonte da verdade das regras** (RN1 a RN5). API e frontend não reimplementam regra de negócio.
- **Segredos:** nunca no repositório. Credenciais ficam no profile `hackatongabinete`; rodem `gitleaks` antes de commitar.

## Pontos de atenção

- **Tabela `Expedientes` já existe** na conta, com os 49.108 itens do seed carregados e os índices `GSI1` e `GSI2`. Por isso as tarefas 1.4 e 2.1 já estão cobertas na prática. Pedro precisa decidir na 1.3: importar a tabela existente no CDK, ou criar com outro nome. Se isso não for decidido, o `cdk deploy` falha com "tabela já existe".
- **Maluco é a trilha mais pesada.** Se atrasar, mover 9.5 (back) e 9.7 para Vini ou Laercio.
- **Laercio (trilha F) é a mais flexível:** assume o que sobrar das outras trilhas depois de 12.1 a 12.3.
