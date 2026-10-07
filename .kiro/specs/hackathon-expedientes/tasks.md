# Plano de Implementação — Painel Unificado de Expedientes e Nova Tela Inicial

> Plano enxugado para entregar o MVP em até 2 horas: 10 tarefas obrigatórias (blocos 1–5); todo o resto é opcional (`*`), no bloco 6.
> Base: `requirements.md` e `design.md` · Stack: steering `tech.md`. Todo comando AWS usa `--profile hackatongabinete` e `--region us-east-1`. Nada em `resources/` é editado.

## Tarefas

- [x] 1. Fundação
  - [x] 1.1 Criar monorepo npm workspaces mínimo (`packages/dominio`, `services/api`, `web`, `infra`, `scripts`) com `.nvmrc` = `24`, TypeScript e Vitest; comandos `npm test` e `npm run build` na raiz (sem ESLint/Prettier obrigatórios)
    - _Requisitos: 29.4, 36.3_
  - [x] 1.2 Criar app CDK v2 com tags `projeto=painel-expedientes`/`ambiente=<env>` e `DadosStack` (tabela `Expedientes` com PK/SK, GSI1, GSI2, on-demand, PITR, TTL `expiraEm`); implantar com `npx cdk deploy DadosStack --profile hackatongabinete --region us-east-1`
    - _Requisitos: 2.2, 29.2, 29.11_
  - [x] 1.3 Criar `scripts/carregar-seed` que lê `resources/hackathon-expedientes/seed/saida/dynamodb/itens.json` (DynamoDB JSON, um item por linha) e grava com `BatchWriteItem` (lotes de 25, reenvio de `UnprocessedItems`), sem usar `gerar_seed.py --carregar` nem `--criar-tabela`; conferir a contagem total gravada; definir `DATA_REFERENCIA=2026-10-07T17:00:00-03:00` como variável de ambiente no CDK
    - _Requisitos: 2.1, 2.3, 2.6_

- [x] 2. Domínio
  - [x] 2.1 Implementar em `packages/dominio` `calcularStatusPrazo`, `calcularPontuacao`, `mascararSigilo` e `autorizar` (matriz como dados, negação por padrão), com testes unitários básicos
    - _Requisitos: 8.1, 9.1, 24.3, 24.6, 33.1_

- [x] 3. Autenticação e API de leitura
  - [x] 3.1 Implementar `AuthStack` (Cognito User Pool com `custom:idUsuario`, `custom:siglaSetor`, `custom:perfil`; App Client PKCE) e script que cria os usuários de `usuarios.csv` com senha informada na execução (nunca gravada no repositório)
    - _Requisitos: 1.1, 1.2_
  - [x] 3.2 Implementar o repositório DynamoDB (`services/api/repositorio/`) e a `ApiStack` (API Gateway REST, Cognito Authorizer, CORS, Lambdas `nodejs24.x` arm64 com `NodejsFunction`) com `GET /me`, `GET /home`, `GET /expedientes` (GSI1, filtros básicos de caixa e prazo, cursor) e `GET /expedientes/{id}` (máscara de sigilo, 404 entre setores)
    - _Requisitos: 1.4, 3.1, 4.2, 13.1, 20.1, 24.1, 24.6_
  - [x] 3.3 Escrever testes de API mínimos: 401 sem token, 404 entre setores e sigilo mascarado
    - _Requisitos: 33.4_

- [x] 4. Frontend
  - [x] 4.1 Criar SPA Angular 22 + Bootstrap 5 com login Cognito, cabeçalho (usuário, setor, perfil e "Dados de 07/10/2026, 17:00"), skip link e `lang="pt-BR"`
    - _Requisitos: 1.3, 27.1_
  - [x] 4.2 Implementar as telas: home (contadores, prazos, alertas), painel (abas de caixa, filtros básicos, tabela acessível com `caption`/`th`) e detalhe com histórico
    - _Requisitos: 3.2, 13.2, 20.1, 27.2_
  - [x] 4.3 Implementar `WebStack` (S3 privado + CloudFront com OAC) e implantar; checkpoint da demo percorrendo login → home → painel → detalhe com `GABSUB3-DVT-U02` e `GABSUB3-DVT-U03`
    - _Requisitos: 25.3, 35.2_

- [x] 5. Fechamento
  - [x] 5.1 Escrever README curto (o que é, implantar, carregar, rodar, destruir) e `scripts/destruir` (`npx cdk destroy --all --profile hackatongabinete --region us-east-1`)
    - _Requisitos: 26.7, 34.1_

- [ ] 6. Opcional (pós-MVP)
  - [ ]* 6.1 Adicionar ESLint, Prettier, fast-check e pacotes `packages/contratos`, `services/agendados` e `tests` — _Requisitos: 29.12, 33.6_
  - [ ]* 6.2 Escrever testes de *assertions* do CDK (sem `*` em políticas de dados, `nodejs24.x`, retenção de logs) e parâmetros por ambiente/órgão — _Requisitos: 24.9, 29.11, 32.3, 36.4_
  - [ ]* 6.3 Criar `scripts/verificar-carga` comparando a contagem por `entidade` com as linhas de cada CSV — _Requisitos: 2.3_
  - [ ]* 6.4 Criar `scripts/migrar` idempotente (favoritos, espelhos de filtros, códigos `CIENCIA`/`REVERSAO_LOTE`/`DESFAZER`, `STATUS_EXECUCAO_LOTE`, `versao = 1` em todo `META`) — _Requisitos: 2.4, 2.5_
  - [ ]* 6.5 Criar `scripts/restaurar-demo` (limpa itens da aplicação, recarrega o seed, reaplica a migração e confere contagens) — _Requisitos: 2.8, 35.4_
  - [ ]* 6.6 Completar `calcularStatusPrazo` para baixados (`CUMPRIDO`/`CUMPRIDO_COM_ATRASO`) e faixas de `calcularPontuacao` — _Requisitos: 8.2, 9.2, 9.3_
  - [ ]* 6.7 Implementar `chaveGsi1`/`chaveGsi2` e ordenação da fila (RN3) idênticas ao gerador — _Requisitos: 2.7, 8, 11, 33.1_
  - [ ]* 6.8 Escrever testes de paridade com os CSVs (RN1 nos 3.043 ativos, 540/526 nos baixados, RN2 nos 4.109) — _Requisitos: 33.2_
  - [ ]* 6.9 Escrever teste de propriedade da pontuação (0–100) — _Requisitos: 33.3_
  - [ ]* 6.10 Implementar `validarCriterios` (lista branca do Req. 5) com testes — _Requisitos: 5.5, 5.8, 24.7_
  - [ ]* 6.11 Implementar `calcularRisco` (Alto/Médio/Baixo) com testes — _Requisitos: 10, 33.1_
  - [ ]* 6.12 Completar `autorizar` com 404 outro setor / 403 mesmo setor e testes por linha da matriz — _Requisitos: 24.2, 24.4, 24.5, 24.8_
  - [ ]* 6.13 Provisionar os 14 usuários com `ativo=false` desabilitado e atributos somente leitura — _Requisitos: 1.6, 25.8_
  - [ ]* 6.14 Completar a `ApiStack`: validação por JSON Schema, throttling, *usage plan*, uma role IAM por Lambda, middleware (`correlationId`, erros padronizados, logger com lista branca) — _Requisitos: 1.5, 24.4, 24.9, 24.10, 25.1, 25.2, 25.6, 25.7, 26.2, 29.5, 30.1, 30.2, 31.3_
  - [ ]* 6.15 Implementar `GET /contadores` e home completa (10 prazos do GSI2 com `requerAcao`, 5 alertas não lidos, próximo expediente, informes) — _Requisitos: 4.5, 20.2–20.6_
  - [ ]* 6.16 Completar `GET /expedientes` (visão unificada/separada, filtros de prioridade, responsável e assunto, ordenação) e detalhe completo — _Requisitos: 3.3, 3.6, 4.4, 5.1–5.3, 5.11, 13.2–13.4, 13.9, 13.10_
  - [ ]* 6.17 Aplicar tema visual do Único e `ng test` com o runner padrão — _Requisitos: 27.6, 33.5, 36.2_
  - [ ]* 6.18 Adicionar ao `WebStack` SSE-S3, TLS 1.2 e *response headers policy* (CSP, HSTS, `frame-ancestors 'none'`) — _Requisitos: 25.4, 25.5, 29.1_
  - [ ]* 6.19 Completar o shell (`title` por rota, `aria-live` global, "Base 100% sintética", logout) — _Requisitos: 1.7, 1.8, 27.4, 27.9_
  - [ ]* 6.20 Criar componentes base acessíveis (campo com `aria-describedby`, `td headers`, selos de prazo/prioridade com cor + ícone + texto) — _Requisitos: 9.4–9.6, 27.3, 27.5_
  - [ ]* 6.21 Completar home (erro isolado por widget) e painel (seletor de visão, chips, filtros na URL, estado vazio, paginação) — _Requisitos: 3.3–3.8, 4.1–4.3, 5.6, 5.7, 20.8, 20.10_
  - [ ]* 6.22 Completar o detalhe (histórico com origem/destino, prazos, designações) — _Requisitos: 13.3, 13.4, 13.11_
  - [ ]* 6.23 Implementar layout responsivo (cartões < 768 px, alvos ≥ 24 px, reflow 320 px, zoom 200 %, `prefers-reduced-motion`) — _Requisitos: 27.8, 28.1–28.4_
  - [ ]* 6.24 Implementar validação pura do lote (`avaliarElegibilidade`, `aplicarEfeito`) com testes de propriedade — _Requisitos: 14.2, 15.2, 33.1, 33.3_
  - [ ]* 6.25 Implementar `POST /lotes/preview` — _Requisitos: 14.8, 14.10, 15.1, 15.2, 24.4_
  - [ ]* 6.26 Implementar `POST /lotes` síncrono (≤ 50) transacional com `Idempotency-Key` — _Requisitos: 2.7, 4.6, 14.3–14.7, 14.9, 15.3, 15.4, 15.6, 17.5, 29.3, 29.6_
  - [ ]* 6.27 Implementar lote assíncrono de 51–200 itens (HTTP 202, status, retentativa) — _Requisitos: 29.7, 29.9_
  - [ ]* 6.28 Implementar `POST /lotes/{id}/desfazer` (≤ 24 h) — _Requisitos: 15.5, 15.7–15.9_
  - [ ]* 6.29 Implementar `GET /lotes` com filtros — _Requisitos: 15.11_
  - [ ]* 6.30 Implementar na SPA seleção múltipla, barra de lote e `<dialog>` de pré-visualização com desfazer — _Requisitos: 4.7, 14.1, 14.7, 15.1, 15.5, 15.12, 27.7_
  - [ ]* 6.31 Escrever testes de API do lote (idempotência, desfazer duas vezes, conflito, 403) — _Requisitos: 15.10, 29.6, 33.3, 33.4_
  - [ ]* 6.32 Implementar busca com índice do setor em memória da Lambda — _Requisitos: 4.6, 5.1, 5.2, 5.9, 5.10, 5.11, 31.3_
  - [ ]* 6.33 Implementar `AgendamentosStack` com reconciliação de contadores a cada 15 min — _Requisitos: 4.8, 29.8, 29.10_
  - [ ]* 6.34 Implementar auditoria no grupo `/painel-expedientes/auditoria` — _Requisitos: 25.9, 26.2_
  - [ ]* 6.35 Configurar Bedrock (Guardrail e permissão só para `us.amazon.nova-lite-v1:0`) — _Requisitos: 22.5, 24.9_
  - [ ]* 6.36 Implementar `POST /ia/resumo-dia` com dados mascarados — _Requisitos: 22.1, 22.4, 22.7, 26.3_
  - [ ]* 6.37 Implementar `POST /ia/interpretar-pesquisa` com saída validada — _Requisitos: 22.2, 22.3, 22.8, 30.3_
  - [ ]* 6.38 Implementar na SPA "Resumo do dia" e "Pesquisar com IA" — _Requisitos: 22.1–22.3, 22.6, 22.7_
  - [ ]* 6.39 Implementar filtros salvos — _Requisitos: 6, 33.4_
  - [ ]* 6.40 Implementar personalização do painel em `PREF#<contexto>` — _Requisitos: 7_
  - [ ]* 6.41 Implementar composição visível da prioridade e destaques — _Requisitos: 8_
  - [ ]* 6.42 Implementar modo foco — _Requisitos: 11_
  - [ ]* 6.43 Implementar anotação, favorito e exportação do histórico — _Requisitos: 13.5–13.8, 33.4_
  - [ ]* 6.44 Implementar central de alertas — _Requisitos: 17_
  - [ ]* 6.45 Implementar exportação CSV segura e publicar OpenAPI — _Requisitos: 23, 33.1_
  - [ ]* 6.46 Implementar filtro/ordenação por risco e widget "Maior risco" — _Requisitos: 10, 20.7_
  - [ ]* 6.47 Implementar calendário mensal e exportação `.ics` — _Requisitos: 12, 26.3_
  - [ ]* 6.48 Implementar designação balanceada e widget "Carga da equipe" — _Requisitos: 16, 20.7_
  - [ ]* 6.49 Implementar rotina diária às 07:00 (alertas de prazo + resumo por SES) — _Requisitos: 17.6, 18, 26.4, 29.8, 29.9_
  - [ ]* 6.50 Implementar dashboards com tabela alternativa — _Requisitos: 19, 26.5, 27.7_
  - [ ]* 6.51 Implementar configuração da tela inicial e widgets opcionais — _Requisitos: 20.7, 21_
  - [ ]* 6.52 Implementar `ObservabilidadeStack` (retenção 30 dias, Powertools, dashboard, alarmes) — _Requisitos: 26.6, 30_
  - [ ]* 6.53 Adicionar axe-core aos testes de componente (e E2E com Playwright) — _Requisitos: 27.10, 33.5_
  - [ ]* 6.54 Criar gerador 10× e teste de carga k6 — _Requisitos: 31.1, 31.2, 31.5, 31.6_
  - [ ]* 6.55 Garantir cobertura ≥ 80 % no domínio e configurar `gitleaks` — _Requisitos: 25.8, 33.6_
  - [ ]* 6.56 Preencher steering `product.md` e `structure.md` — _Requisitos: 34.2_
  - [ ]* 6.57 Criar hooks Kiro (testes de domínio, acessibilidade, matriz, segredos) — _Requisitos: 34.3_
  - [ ]* 6.58 Escrever ADRs, `docs/lgpd.md`, `docs/custos.md` e caminho para produção — _Requisitos: 26.6, 32.2, 34.4, 36.1_
  - [ ]* 6.59 Escrever roteiro do pitch de 5 minutos — _Requisitos: 35.1, 35.2, 35.3_
  - [ ]* 6.60 Preparar contingência (gravação, capturas) e FAQ — _Requisitos: 35.5, 35.6_
  - [ ]* 6.61 Revisão final (`restaurar-demo`, `npm test`, sem dados reais nem credenciais) — _Requisitos: 2.9, 26.1, 35.4_

## Notas

- Tarefas com `*` são opcionais e ficam para depois do MVP.
- A tarefa 1.3 substitui a carga antiga via `gerar_seed.py --carregar --criar-tabela`, que conflita com o steering `tech.md`.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "2.1"] },
    { "id": 2, "tasks": ["1.3", "3.1"] },
    { "id": 3, "tasks": ["3.2", "4.1"] },
    { "id": 4, "tasks": ["3.3", "4.2"] },
    { "id": 5, "tasks": ["4.3"] },
    { "id": 6, "tasks": ["5.1"] },
    { "id": 7, "tasks": ["6.1", "6.3", "6.4", "6.6", "6.7", "6.10", "6.11", "6.12", "6.13", "6.17", "6.56", "6.57"] },
    { "id": 8, "tasks": ["6.2", "6.5", "6.8", "6.9", "6.14", "6.18", "6.19", "6.20", "6.24", "6.34", "6.35"] },
    { "id": 9, "tasks": ["6.15", "6.16", "6.25", "6.32", "6.33", "6.52"] },
    { "id": 10, "tasks": ["6.21", "6.22", "6.26", "6.36", "6.37", "6.39", "6.43", "6.44", "6.46", "6.47", "6.48"] },
    { "id": 11, "tasks": ["6.23", "6.27", "6.28", "6.38", "6.40", "6.41", "6.42", "6.45", "6.49", "6.50", "6.51"] },
    { "id": 12, "tasks": ["6.29", "6.30", "6.53", "6.54", "6.55"] },
    { "id": 13, "tasks": ["6.31", "6.58", "6.59", "6.60"] },
    { "id": 14, "tasks": ["6.61"] }
  ]
}
```
