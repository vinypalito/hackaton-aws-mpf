# Documento de Requisitos — Painel Unificado de Expedientes e Nova Tela Inicial

> Spec Kiro · Hackathon AWS × MPF · 07/10/2026 · Fase 1 (Requisitos)
> Status: rascunho para revisão no board · Idioma: português do Brasil

## Introdução

No Único, os expedientes de um gabinete ficam em três gerenciadores separados: **Judicial**, **Documento** e
**Extrajudicial**. Cada um tem tela, caixas, contadores e filtros próprios. Para saber o que vence hoje, o que é
urgente (réu preso, idoso, nova intimação) e o que está parado, membros, chefes de gabinete e servidores abrem os três
gerenciadores e montam a prioridade de cabeça. O resultado: prazos passam despercebidos, a distribuição de trabalho fica
desigual e a tela inicial não mostra o resumo do dia.

Esta spec define o MVP de um **painel unificado de expedientes**, com foco nos **processos judiciais dos gabinetes**,
que pode ser visto de forma unificada ou separada por gerenciador, e de uma **nova tela inicial** com o resumo do dia
(contadores, próximos prazos, alertas, próximo expediente e informes). A solução roda na AWS em arquitetura serverless
e orientada a eventos, usa exclusivamente a base sintética do kit do hackathon e trata segurança, privacidade (LGPD) e
acessibilidade (eMAG/WCAG) como requisitos de primeira classe.

**Resultado esperado na demonstração (caso de uso, seção 3):** login de um usuário fictício; tela inicial com os
contadores do setor e os próximos prazos; painel com filtros por prazo, prioridade, responsável e assunto; selos visuais
de prazo; abrir um processo e ver seu histórico; receber ou designar processos em lote.

**Fora do escopo (caso de uso, seção 3):** integrar com o Único ou com bancos internos; assinar, protocolar ou
movimentar de verdade; emitir documento oficial; usar dados reais. Ações como receber, designar e arquivar alteram
apenas os dados da própria solução.

### Fontes consultadas

| Fonte | Uso nesta spec |
| --- | --- |
| `resources/criterios-avaliacao-hackathon.html` | Seis critérios de avaliação (0–10 cada). A seção "Matriz de cobertura dos critérios de avaliação" mapeia cada item avaliado a um requisito |
| `resources/hackathon-expedientes/instrucoes-hackathon.md` | RF01–RF19, requisitos não funcionais, escopo sugerido e arquitetura sugerida |
| `resources/hackathon-expedientes/caso-de-uso-hackathon.md` | Problema, objetivo, usuários, funcionalidades F1–F10 e regras de negócio RN1–RN7 |
| `resources/hackathon-expedientes/README.md` | Dicionário de dados, domínios, fórmula de risco, regras de sigilo e modelo DynamoDB |
| `resources/hackathon-expedientes/seed/` (`gerar_seed.py`, `saida/csv/*.csv`, `saida/dynamodb/itens.json`) | Base sintética **já existente**. Os nomes de entidades e campos desta spec foram conferidos com os cabeçalhos reais dos 19 CSVs |
| `resources/caso-de-uso-hackathon.pdf` | Versão oficial do caso de uso (4 páginas). Conferida com a versão markdown; ver nota abaixo |

> **Nota sobre o PDF:** na primeira iteração o PDF não pôde ser lido. Nesta revisão, o texto de
> `resources/caso-de-uso-hackathon.pdf` foi extraído (PyMuPDF, 4 páginas) e comparado seção a seção com
> `resources/hackathon-expedientes/caso-de-uso-hackathon.md`. O conteúdo é equivalente: identificação, problema,
> objetivo, resultado esperado, fora do escopo, usuários, F1–F10 com as mesmas prioridades, RN1–RN7 com os mesmos
> exemplos, dados preparados, LGPD e restrições técnicas. Não há divergência. Se o PDF for atualizado, ele prevalece.
>
> **Observação sobre o gerador:** o caso de uso diz que `gerar_seed.py` regera os dados "com outra data ou volume".
> O script aceita outra data (`--data-referencia`), mas não tem parâmetro de volume (apenas `--saida`,
> `--data-referencia`, `--carregar`, `--criar-tabela`, `--tabela` e `--regiao`). Por isso o teste de carga usa um
> gerador próprio (Requisito 31).

### Fatos da base sintética que orientam os requisitos

- Data de referência: **07/10/2026, 17h** (fuso −03:00). `diasRestantes` e `statusPrazo` já vêm calculados para esse
  instante.
- Dois setores: `GABSUB3-DVT` (gabinete; JUDICIAL, DOCUMENTO e EXTRAJUDICIAL) e `CIVINT/STIC` (coordenadoria;
  DOCUMENTO e EXTRAJUDICIAL). Catorze usuários fictícios com perfis `MEMBRO`, `CHEFE` e `SERVIDOR`.
- 4.109 expedientes: 3.043 ativos e 1.066 baixados. São 76 judiciais (56 ativos). `CIVINT/STIC` tem 3.549
  expedientes e `GABSUB3-DVT`, 560. Os sigilosos têm `nivelSigilo` 1 ou 2 (322 itens); `nivelSigilo = 0` é público.
- Os baixados não seguem RN1: o gerador grava `statusPrazo = CUMPRIDO` (540) ou `CUMPRIDO_COM_ATRASO` (526),
  comparando `dataPrazo` com a data de saída, e `pontuacaoPrioridade = 0` (`prioridade = BAIXA`).
- `favoritos.csv` tem 30 linhas, cada uma com `idUsuario`, mas a chave do seed é `PK = SETOR#<sigla>`,
  `SK = FAV#<gerenciador>#<idExpediente>`, sem o usuário. `expedientes.favorito = true` em 30 itens.
- `filtros_salvos.csv` tem 33 filtros, 9 com `compartilhadoComSetor = true`, todos em `PK = USR#<id>`.
- `acoes_lote.csv` tem 52 lotes em `PK = USR#<id>`, `SK = LOTE#<dataHora>#<idLote>`, com `GSI1PK = SETOR#<sigla>`.
  Os lotes não guardam o estado anterior dos itens.
- O catálogo `TIPO_MOVIMENTACAO` tem 11 códigos e `TIPO_ACAO_LOTE`, 7. Não há código para ciência nem para reversão.
- `dynamodb/itens.json` traz 49.108 itens em tabela única (`PK`/`SK`) com os índices `GSI1` e `GSI2`.

### Convenções desta spec

- Critérios de aceitação em notação **EARS** em português:
  - Ubíquo: "O sistema DEVE …"
  - Evento: "QUANDO <gatilho>, ENTÃO o sistema DEVE …"
  - Estado: "ENQUANTO <estado>, o sistema DEVE …"
  - Comportamento indesejado: "SE <condição>, ENTÃO o sistema DEVE …"
  - Opcional: "ONDE <recurso/configuração>, o sistema DEVE …"
- Prioridade sugerida, conforme a tabela "Escopo sugerido para o dia" das instruções: **Essencial**, **Desejável** ou
  **Se sobrar tempo**. Quando o caso de uso atribui prioridade diferente, a divergência é registrada no requisito.
- Itens marcados como **"Definido nesta spec"** são decisões da equipe para lacunas das fontes. Eles ficam explícitos
  para revisão no board.
- Nomes de campos e valores de domínio aparecem em `código` e são idênticos aos CSVs. Códigos e itens novos, criados
  pela migração da aplicação (Requisito 2), são listados no Requisito 2 e marcados como **"Definido nesta spec"**.
- Critérios marcados **[Processo]** descrevem obrigações de entrega da equipe, não comportamento do software. Eles
  usam "A equipe DEVE" de propósito e são verificados por artefato (documento, roteiro, configuração), não por teste
  automatizado. Todos os demais critérios descrevem o sistema.

## Glossário

| Termo | Definição |
| --- | --- |
| **Único** | Sistema do MPF em que hoje ficam os três gerenciadores de expedientes. Não há integração com ele neste MVP |
| **Expediente** | Unidade de trabalho do painel: processo judicial, documento ou procedimento extrajudicial. Uma linha de `expedientes.csv`, identificada por `idExpediente` |
| **Gerenciador** | Origem do expediente no Único: `JUDICIAL`, `DOCUMENTO` ou `EXTRAJUDICIAL` (equivale ao "Procedimento"). No GSI1 é abreviado `JUD`, `DOC`, `EXT` |
| **Visão unificada** | Lista com os expedientes ativos de todos os gerenciadores do setor (contador `gerenciador = TODOS`) |
| **Visão separada** | Lista restrita a um único gerenciador |
| **Setor** | Unidade organizacional do usuário (`siglaSetor`), por exemplo `GABSUB3-DVT`. Delimita o que o usuário pode ver |
| **Caixa** | Localização do expediente no fluxo: `A_RECEBER` (A receber), `NO_SETOR` (No setor), `ENVIADO_NAO_RECEBIDO` (Enviados não recebidos) e `BAIXADO` (histórico) |
| **Expediente ativo** | Expediente com `caixa != BAIXADO`. Só os ativos aparecem no painel e nos contadores (RN7) |
| **Requer ação** | `requerAcao = true`; vale para as caixas `A_RECEBER` e `NO_SETOR`. Indicadores de prazo e urgência dos contadores consideram só esses itens |
| **Situação** | Estado de trabalho do expediente (`situacao`), por exemplo `EM_ANALISE`, `MINUTA_EM_ELABORACAO`, `AGUARDANDO_ASSINATURA`, `AGUARDANDO_CIENCIA` |
| **Ação pendente** | Texto orientativo do próximo passo (`acaoPendente`), por exemplo "Analisar intimação", "Receber", "Dar ciência" |
| **Prazo** | Data-limite do expediente (`dataPrazo`), com `tipoPrazo` `PROCESSUAL` (judicial), `RESPOSTA` (documento) ou `TRAMITACAO` (extrajudicial) |
| **Dias restantes** | `diasRestantes`: dias entre a data de referência e `dataPrazo`. Negativo significa vencido |
| **statusPrazo** | Situação do prazo. Tem dois domínios disjuntos. **Ativos** (RN1, pelos dias restantes): `VENCIDO` (< 0), `VENCE_HOJE` (0), `CRITICO` (1 a 3), `ATENCAO` (4 a 7), `NO_PRAZO` (> 7). **Baixados** (status de cumprimento, pela data de encerramento): `CUMPRIDO` (`dataPrazo` ≥ data de encerramento) ou `CUMPRIDO_COM_ATRASO` (`dataPrazo` < data de encerramento) |
| **Data de encerramento** | Instante da baixa do expediente, registrado em `prazos.dataEncerramento` do prazo encerrado. Nos baixados, `diasRestantes` = `dataPrazo` − data de encerramento |
| **Selo de prazo** | Indicador visual de `statusPrazo` com cor, ícone e texto ("Prazo vencido", "Vence hoje", "Vence em até 3 dias", "Vence em até 7 dias", "No prazo") |
| **pontuacaoPrioridade** | Número de 0 a 100 que soma: prazo (vencido 50, vence hoje 45, crítico 35, atenção 20, no prazo 5), urgente +30, nova intimação +10, parado há mais de 30 dias +10, aguardando assinatura +5. Em `ENVIADO_NAO_RECEBIDO` o total é dividido por 2 (divisão inteira) (RN2). Expediente `BAIXADO` tem pontuação 0, como no gerador |
| **Prioridade** | Faixa da pontuação: `CRITICA` (≥ 60), `ALTA` (≥ 35), `MEDIA` (≥ 20), `BAIXA` (< 20) |
| **Composição da prioridade** | Lista das parcelas que formaram a pontuação de um expediente, exibida para explicar "por que" ele tem aquela prioridade |
| **Urgente** | `urgente = true`, com `motivoUrgencia` (réu preso, idoso, liminar etc.; `Nenhum` quando não há). Sinalizações relacionadas: `reuPreso`, `idoso`, `novaIntimacao`, `novo` (chegou há menos de 24h) |
| **Tempo parado** | `tempoParadoDias`: dias desde a última movimentação |
| **Índice de risco de vencimento** | `min(100, 20 × (tempoParadoDias + 1) ÷ (diasRestantes + 1))`, válido só para prazos não vencidos (`diasRestantes ≥ 0`) |
| **Fila (GSI2)** | Ordem de trabalho: `dataPrazo` crescente e, no empate, `pontuacaoPrioridade` decrescente (RN3). Materializada em `GSI2SK = PRAZO#<dataPrazo>#<100 - pontuação>#<id>` |
| **Modo foco** | Tela "próximo expediente", que apresenta um item por vez na ordem da fila |
| **Responsável** | Pessoa responsável pelo expediente (`idResponsavel`, `nomeResponsavel`), com `tipoResponsabilidade` `TITULAR` (titular do ofício ou setor) ou `DESIGNADO` (designação ativa) |
| **Designação** | Atribuição de um expediente a uma pessoa, com prazo de devolução (`designacoes.csv`). `situacao` `ATIVA`/`ENCERRADA`; `statusDevolucao` `NO_PRAZO`, `VENCIDA`, `DEVOLVIDA_NO_PRAZO`, `DEVOLVIDA_COM_ATRASO` |
| **Designação balanceada** | Sugestão de quem deve receber uma designação, pela menor carga relativa à capacidade |
| **Marcador** | Rótulo colorido do setor por gerenciador (`marcadores.csv`, `idRotulo`), aplicado a expedientes (`marcadores_expedientes.csv`) |
| **Favorito** | Marcação pessoal de um expediente por um usuário, para acesso rápido. Cardinalidade: um registro por par (usuário, expediente); vários usuários podem favoritar o mesmo expediente. Chave da solução: `PK = USR#<idUsuario>`, `SK = FAV#<gerenciador>#<idExpediente>` (Requisito 13). Os 30 registros de `favoritos.csv` são migrados para essa chave |
| **Favoritado no setor** | Significado do booleano `expedientes.favorito`: "ao menos um usuário do setor favoritou". É dado derivado, usado só no contador `favoritos`; nunca indica o favorito do usuário autenticado |
| **Anotação** | Texto livre de um usuário sobre o expediente (`anotacoes.csv`) |
| **Minuta pendente** | Rascunho de manifestação não concluído (`qtdMinutasPendentes`). Impede o arquivamento (RN5) |
| **Movimentação** | Evento do histórico (`movimentacoes.csv`, `tipoMovimentacao`): `CADASTRO`, `ENVIO_AO_SETOR`, `RECEBIMENTO`, `DESIGNACAO`, `MARCADOR_INCLUIDO`, `ANOTACAO_INCLUIDA`, `MINUTA_CRIADA`, `ASSINATURA`, `PRAZO_PRORROGADO`, `ENVIO_PELO_SETOR`, `ARQUIVAMENTO` (11 do seed) e `CIENCIA` e `REVERSAO_LOTE` (2 da migração, Requisito 2). Favoritar não gera movimentação: é marcação pessoal, registrada só na trilha de auditoria |
| **Ação em lote** | Operação aplicada a vários expedientes de uma vez (`tipoAcao`): `RECEBER`, `DESIGNAR`, `INCLUIR_MARCADOR`, `DAR_CIENCIA`, `ASSINAR`, `MOVIMENTAR`, `ARQUIVAR`. Registrada em `acoes_lote` |
| **Pré-visualização do lote** | Resultado simulado do lote antes da execução: o que será alterado, o que será ignorado e o motivo |
| **Desfazer** | Reversão de um lote executado, item a item, a partir do estado anterior salvo, com nova entrada em `acoes_lote` (`tipoAcao = DESFAZER`) |
| **Estado anterior (before-image)** | Cópia, gravada na execução do lote, dos atributos e itens relacionados que o lote alterou em cada expediente, com as versões antes e depois. Base do desfazer |
| **Versão do agregado** | Atributo numérico `versao` do item `META` do expediente, incrementado a cada escrita. Toda escrita é condicional à versão lida (controle otimista de concorrência) |
| **Unidade atômica** | Conjunto de escritas de um único expediente (item `META`, movimentação, designação, marcador, estado anterior, resultado do item, contadores `CONT#` e notificação), gravado numa só `TransactWriteItems`. Um lote é uma sequência de unidades atômicas; falha parcial entre expedientes é permitida |
| **Atualização síncrona** | Contadores `CONT#`, versão do índice de busca e notificações gravados na mesma `TransactWriteItems` da escrita de negócio. Garante que nenhuma escrita confirmada fique sem reflexo, sem fila nem barramento intermediário |
| **eventId** | Identificador único e imutável de um evento de domínio. Consumidores o usam para descartar duplicatas |
| **Índice de busca do setor** | Projeção normalizada (minúsculas, sem acentos) dos expedientes ativos de um setor, com os campos filtráveis e um texto de busca sem conteúdo sigiloso. Atende pesquisa, filtros, ordenação, paginação e total (Requisito 5) |
| **Trilha de auditoria** | Registro imutável de escritas, exportações e negações de acesso, gravado num grupo de logs dedicado do CloudWatch Logs, sem permissão de exclusão para a aplicação (Requisito 25) |
| **Migração da aplicação** | Script idempotente executado depois da carga do seed. Acrescenta à tabela os itens e atributos de que a solução precisa, sem editar os arquivos de `seed/saida/` (Requisito 2) |
| **Massa de carga 10×** | Base sintética dez vezes maior, produzida por um gerador próprio fora de `resources/`, usada só no teste de carga (Requisito 31) |
| **Notificação (alerta)** | Aviso por usuário (`notificacoes.csv`) com `tipoNotificacao`, `severidade` (`CRITICO`, `ATENCAO`, `INFO`) e `lida` |
| **Resumo diário** | E-mail enviado a quem optou (`notificarPorEmail = true`) com vencidos, vencem hoje, novos e devoluções vencidas |
| **Contadores** | Totais por setor e gerenciador (`contadores.csv`, `SK = CONT#<gerenciador>`, incluindo `CONT#TODOS`) |
| **Widget** | Bloco da tela inicial (contadores, próximos prazos, alertas não lidos, próximo expediente, informes etc.) |
| **Informe** | Notícia exibida na tela inicial (`noticias.csv`) dentro do período `dataInicioExibicao`–`dataFimExibicao` |
| **Filtro salvo** | Combinação nomeada de critérios (`filtros_salvos.csv`, `criterios` em JSON), que pode ser padrão e compartilhada com o setor |
| **Espelho de filtro compartilhado** | Cópia de um filtro compartilhado na partição do setor (`PK = SETOR#<sigla>`, `SK = FILTRO#<idFiltro>`), com `idUsuario` do autor. Permite listar os compartilhados do setor por `Query`, sem `Scan` (Requisito 6) |
| **Preferências** | Configuração por usuário e contexto (`preferencias_usuario.csv`; `contexto` `PAINEL_UNIFICADO` ou nome do gerenciador) |
| **Catálogo** | Rótulos, ordem e cores de todos os domínios (`catalogos.csv`) |
| **Nível de sigilo** | `nivelSigilo`: 0 = público; 1 ou 2 = sigiloso (`sigiloso = true`) |
| **Conteúdo sigiloso** | Em expediente sigiloso, os campos `assunto`, `resumo`, `tema`, textos de `anotacoes`, `descricao` de `movimentacoes` e `mensagem` de notificações. **Definido nesta spec** |
| **Máscara de sigilo** | Substituição do conteúdo sigiloso pelo texto "Conteúdo sigiloso" para quem não pode vê-lo, mantendo identificação, prazo e caixa |
| **Membro** | Titular do ofício (`perfil = MEMBRO`). Acompanha prazos e prioridades do gabinete |
| **Chefe de gabinete** | `perfil = CHEFE`. Distribui (designa) processos, acompanha a carga da equipe e os indicadores |
| **Servidor** | `perfil = SERVIDOR` (assessor). Trabalha a própria fila de designados por prazo e prioridade |
| **Data de referência** | Instante tratado como "agora" pela solução. Padrão: 07/10/2026 17:00 −03:00 |
| **PDP** | Ponto de decisão de política: componente único do backend que decide se um usuário pode ver ou alterar um recurso. Implementado como módulo/middleware TypeScript puro no backend, com a matriz declarada como dados (Requisito 24) |
| **Matriz de autorização** | Tabela recurso × operação × perfil × relação (mesmo setor, proprietário, responsável, autor) que define cada decisão do PDP (Requisito 24) |

## Requisitos

### Bloco A — Fundação

### Requisito 1: Autenticação e contexto do usuário

**Prioridade:** Essencial · **Origem:** caso de uso (seções 3 e 9), RNF Segurança

**User Story:** Como membro, chefe de gabinete ou servidor, quero entrar com meu usuário fictício e ser reconhecido com
meu setor e perfil, para que eu veja só o que me cabe desde o primeiro acesso.

#### Critérios de Aceitação

1. O sistema DEVE autenticar usuários pelo Amazon Cognito User Pool, com os 14 usuários fictícios de `usuarios.csv`
   provisionados a partir desse arquivo.
2. O sistema DEVE guardar `idUsuario`, `siglaSetor` e `perfil` como atributos customizados do Cognito, somente
   leitura para o próprio usuário.
3. QUANDO o login for concluído, ENTÃO o sistema DEVE exibir a tela inicial (Requisito 20) com o nome, o perfil e o
   setor do usuário.
4. QUANDO uma requisição chegar à API, ENTÃO o sistema DEVE obter setor, perfil e identificador do usuário
   exclusivamente das *claims* do token validado, ignorando qualquer valor equivalente enviado pelo cliente.
5. SE o token estiver ausente, expirado ou inválido, ENTÃO o sistema DEVE responder HTTP 401 sem dados de negócio.
6. SE o usuário tiver `ativo = false`, ENTÃO o sistema DEVE negar o login.
7. QUANDO o usuário sair, ENTÃO o sistema DEVE revogar a sessão local e redirecionar para a tela de login.
8. O sistema DEVE exibir, em todas as telas, a data de referência em uso ("Dados de 07/10/2026, 17:00") e o aviso
   "Base 100% sintética".

### Requisito 2: Carga e uso da base sintética existente

**Prioridade:** Essencial · **Origem:** instruções ("Dados", "Gerar e carregar"), critério 1 (uso dos dados sintéticos)

**User Story:** Como equipe do hackathon, quero carregar a base sintética já fornecida sem alterá-la, para que a demo
use dados coerentes, reprodutíveis e sem risco de LGPD.

#### Critérios de Aceitação

1. O sistema DEVE usar como fonte única os arquivos existentes em `resources/hackathon-expedientes/seed/saida/`
   (`dynamodb/itens.json` e os 19 CSVs), sem recriá-los nem editá-los.
2. O sistema DEVE carregar `itens.json` numa tabela DynamoDB única com chaves `PK`/`SK` e os índices `GSI1`
   (`GSI1PK`/`GSI1SK`) e `GSI2` (`GSI2PK`/`GSI2SK`), todos String, com projeção ALL, pelo comando oficial
   `AWS_PROFILE=hackatongabinete python3 resources/hackathon-expedientes/seed/gerar_seed.py --carregar --criar-tabela --tabela Expedientes --regiao us-east-1`.
3. QUANDO a carga terminar, ENTÃO o sistema DEVE verificar que existem 49.108 itens e que a soma por `entidade`
   bate com a quantidade de linhas de cada CSV, registrando o resultado.
4. QUANDO a verificação da carga passar, ENTÃO o sistema DEVE executar a migração da aplicação, que altera só a
   tabela (nunca os arquivos de `seed/saida/`) e cria exatamente os 45 itens abaixo, além de atributos novos:

   | Item da migração | Quantidade | Chave | Motivo |
   | --- | --- | --- | --- |
   | Favorito por usuário, a partir de cada linha de `favoritos.csv` | 30 | `PK = USR#<idUsuario>`, `SK = FAV#<gerenciador>#<idExpediente>` | Cardinalidade por usuário (Requisito 13) |
   | Espelho de filtro compartilhado (`compartilhadoComSetor = true`) | 9 | `PK = SETOR#<sigla>`, `SK = FILTRO#<idFiltro>` | Listar compartilhados sem `Scan` (Requisito 6) |
   | Código `TIPO_MOVIMENTACAO` `CIENCIA` ("Ciência registrada"), ordem 12 | 1 | `PK = CATALOGO#TIPO_MOVIMENTACAO`, `SK = 012#CIENCIA` | Histórico de `DAR_CIENCIA` (Requisito 14) |
   | Código `TIPO_MOVIMENTACAO` `REVERSAO_LOTE` ("Reversão de ação em lote"), ordem 13 | 1 | `PK = CATALOGO#TIPO_MOVIMENTACAO`, `SK = 013#REVERSAO_LOTE` | Histórico do desfazer (Requisito 15) |
   | Código `TIPO_ACAO_LOTE` `DESFAZER` ("Desfazer lote"), ordem 8 | 1 | `PK = CATALOGO#TIPO_ACAO_LOTE`, `SK = 008#DESFAZER` | Trilha do desfazer (Requisito 15) |
   | Domínio `STATUS_EXECUCAO_LOTE`: `PENDENTE`, `EM_PROCESSAMENTO`, `CONCLUIDO` | 3 | `PK = CATALOGO#STATUS_EXECUCAO_LOTE`, `SK = 00n#<codigo>` | Status dos lotes assíncronos (Requisito 29) |

   Atributos novos: `versao = 1` em cada item `META` de expediente (Requisito 15). Os itens `SETOR#…`/`FAV#…` do
   seed permanecem intactos, mas a aplicação não os usa como estado do usuário. **Definido nesta spec.**
5. QUANDO a migração terminar, ENTÃO o sistema DEVE verificar que existem 49.153 itens (49.108 + 45) e que cada
   linha da tabela acima tem a quantidade indicada; executar a migração de novo NÃO DEVE criar itens duplicados.
6. O sistema DEVE tratar a data de referência como parâmetro de configuração (padrão 07/10/2026 17:00 −03:00),
   para que `diasRestantes`, `statusPrazo`, "novos 24h" e alertas sejam coerentes com a base.
7. QUANDO uma ação alterar caixa, situação, designação ou prazo de um expediente, ENTÃO o sistema DEVE recalcular
   `statusPrazo`, `pontuacaoPrioridade`, `prioridade`, `GSI1SK` e `GSI2SK` desse expediente com as mesmas regras do
   gerador: RN1 e RN2 enquanto ativo; status de cumprimento e pontuação 0 quando passar a `BAIXADO` (Requisito 9).
8. O sistema DEVE oferecer um comando de restauração que devolve a base ao estado pós-migração (carga + migração),
   para repetir a demonstração.
9. **[Processo]** SE alguma mudança tentar usar dados que não venham da base sintética, ENTÃO a equipe DEVE
   rejeitá-la na revisão (regra do evento: não levar dados reais nem credenciais do MPF).

### Bloco B — Painel unificado

### Requisito 3: Visão unificada ou separada por gerenciador (RF01)

**Prioridade:** Essencial · **Origem:** RF01, F1

**User Story:** Como servidor, quero ver os processos do gabinete numa lista única e poder alternar para um só
gerenciador, para que eu não precise abrir três telas.

#### Critérios de Aceitação

1. QUANDO o usuário abrir o painel, ENTÃO o sistema DEVE listar os expedientes ativos (`caixa != BAIXADO`) de todos
   os gerenciadores do seu setor, a partir do índice de busca do setor (Requisito 5), que é construído com
   `Query` em `GSI1PK = SETOR#<sigla>` e `begins_with(GSI1SK, "ATIVO#")`.
2. O sistema DEVE oferecer o seletor de visão "Todos", "Judicial", "Documento" e "Extrajudicial", exibindo apenas os
   gerenciadores listados em `setores.gerenciadores` do setor do usuário.
3. QUANDO o usuário escolher um gerenciador, ENTÃO o sistema DEVE restringir a lista a ele (no `GSI1`, prefixos
   `ATIVO#JUD#`, `ATIVO#DOC#` ou `ATIVO#EXT#`).
4. ONDE o setor for um gabinete com o gerenciador `JUDICIAL`, o sistema DEVE oferecer o atalho "Processos judiciais"
   como visão de destaque do MVP.
5. O sistema DEVE identificar o gerenciador de cada linha por texto e cor do catálogo `GERENCIADOR`.
6. O sistema DEVE paginar a lista no servidor, com o tamanho de página das preferências (Requisito 7).
7. QUANDO o usuário trocar de visão, ENTÃO o sistema DEVE preservar os filtros compatíveis e anunciar a nova
   quantidade de itens por `aria-live`.
8. SE o setor não tiver expedientes na visão escolhida, ENTÃO o sistema DEVE exibir um estado vazio com texto
   explicativo.

### Requisito 4: Caixas e contadores (RF02)

**Prioridade:** Essencial · **Origem:** RF02, F1, RN7

**User Story:** Como servidor, quero separar os expedientes nas caixas A receber, No setor, Enviados não recebidos e
Baixados, cada uma com seu contador, para que eu saiba onde está cada pendência.

#### Critérios de Aceitação

1. O sistema DEVE apresentar as caixas "A receber", "No setor", "Enviados não recebidos" e "Baixados (histórico)",
   com rótulos do catálogo `CAIXA`.
2. O sistema DEVE exibir em cada caixa o contador da visão corrente, lido de `PK = SETOR#<sigla>`,
   `SK = CONT#<gerenciador>` (`CONT#TODOS` na visão unificada), campos `aReceber`, `noSetor` e
   `enviadosNaoRecebidos`.
3. QUANDO o usuário abrir o painel sem caixa escolhida, ENTÃO o sistema DEVE abrir a `caixaInicial` das suas
   preferências.
4. ENQUANTO a caixa "Baixados" estiver selecionada, o sistema DEVE exibir os itens apenas como histórico consultável
   (`begins_with(GSI1SK, "HIST#")`), sem ações em lote de trabalho.
5. O sistema DEVE excluir expedientes `BAIXADO` dos contadores do painel e da tela inicial (RN7).
6. QUANDO uma ação alterar a caixa de um expediente, ENTÃO o sistema DEVE refletir a mudança nos contadores
   afetados e no índice de busca do setor em até 5 segundos no percentil 95. A medição começa no instante da resposta
   2xx da escrita (registrado no log com `correlationId`) e termina quando o item `CONT#` reflete a nova versão; é
   feita na conta do evento, no ambiente implantado, durante o teste de carga (Requisito 31) e com o roteiro da demo.
7. ENQUANTO o contador ainda não refletir uma ação do próprio usuário, a interface DEVE exibir o valor ajustado
   localmente com o indicador textual "atualizando…" e substituí-lo pelo valor do servidor quando ele convergir.
8. O sistema DEVE manter os contadores coerentes com uma contagem direta dos expedientes ativos; um teste automatizado
   DEVE comparar ambos após a carga, após as ações em lote e após a reconciliação (Requisito 29).

### Requisito 5: Pesquisa e filtros avançados (RF03)

**Prioridade:** Essencial · **Origem:** RF03, F1, F2

**User Story:** Como servidor, quero pesquisar por texto e filtrar por prazo, prioridade, responsável, assunto e outros
campos, para que eu ache rapidamente o que precisa de ação.

#### Critérios de Aceitação

1. O sistema DEVE permitir pesquisa por texto livre em `etiqueta`, `numeroReferencia`, `assunto`, `resumo`, `classe`,
   `orgaoOrigem` e `nomeResponsavel`, sem diferenciar maiúsculas, minúsculas e acentos.
2. O sistema DEVE permitir filtrar por `gerenciador`, `situacao`, `statusPrazo`, `prioridade`, `idResponsavel`,
   `assunto`, `classe`, `tema`, marcador (`idRotulo`), período de `dataChegada`, período de `dataPrazo`,
   `tempoParadoDias` mínimo e pelas sinalizações `urgente`, `reuPreso`, `idoso`, `novaIntimacao`, `sigiloso` e
   `favorito`. O filtro `favorito` significa "favoritado por mim" e usa os favoritos do usuário autenticado
   (`PK = USR#<id>`, `begins_with(SK, "FAV#")`), nunca o booleano `expedientes.favorito`.
3. O sistema DEVE oferecer os atalhos "Meus expedientes" (`idResponsavel` = usuário) e "Designados para mim"
   (`GSI1PK = USR#<id>`, `begins_with(GSI1SK, "DES#ATIVA#")`).
4. O sistema DEVE preencher as opções de cada filtro de domínio a partir de `catalogos.csv` (`CLASSE_<GERENCIADOR>`,
   `ASSUNTO_<GERENCIADOR>`, `TEMA_<GERENCIADOR>`, `SITUACAO`, `STATUS_PRAZO`, `PRIORIDADE`).
5. O sistema DEVE combinar filtros de campos diferentes com "E" e valores do mesmo campo com "OU", no mesmo formato
   de `filtros_salvos.criterios` (lista = "um destes"; sufixo `Min` = "maior ou igual a").
6. QUANDO os filtros forem aplicados, ENTÃO o sistema DEVE mostrar os filtros ativos como etiquetas removíveis por
   teclado e anunciar a quantidade de resultados por `aria-live`.
7. O sistema DEVE refletir os filtros ativos na URL, para que a visão possa ser recarregada e compartilhada dentro do
   setor.
8. SE um critério referenciar campo ou valor fora da lista permitida, ENTÃO o sistema DEVE rejeitar a requisição com
   HTTP 400 e mensagem associada ao campo (`role="alert"`).
9. O sistema NÃO DEVE incluir conteúdo sigiloso no texto de busca do índice: expedientes com `nivelSigilo > 0`
   casam a pesquisa livre só por `etiqueta`, `numeroReferencia`, `classe`, `orgaoOrigem` e `nomeResponsavel`, para
   qualquer perfil. A limitação é exibida como dica no campo de pesquisa. **Definido nesta spec.**
10. O sistema DEVE atender pesquisa, filtros, ordenação e paginação pelo índice de busca do setor, com estas regras:
    - O índice tem uma entrada por expediente ativo, com os campos filtráveis do critério 2, a `versao` do expediente
      e um texto de busca normalizado (minúsculas, sem acentos, Unicode NFD sem diacríticos).
    - O índice é montado em memória pela Lambda de pesquisa por `Query` no `GSI1` (nunca por `Scan`); cada escrita
      incrementa, na mesma transação, a versão do índice do setor, e o índice converge em até 5 segundos (Requisito 4).
    - A Lambda de pesquisa avalia filtros e texto em memória sobre o índice do setor e confere a versão do índice a
      cada requisição, recarregando-o quando houver versão mais nova.
    - O índice de busca não substitui a fonte de verdade: detalhe, pré-visualização e execução de lote releem o item
      no DynamoDB e conferem `versao` (Requisito 15).
    - O índice vive só na memória da Lambda, com ponteiro de versão no próprio DynamoDB; não há bucket nem serviço de
      busca dedicado. Amazon OpenSearch Serverless fica fora do MVP porque sua cobrança mínima por capacidade
      contínua é incompatível com a meta de custo do Requisito 32.
    **Definido nesta spec.**
11. O sistema DEVE paginar resultados por cursor opaco que carrega a versão do índice e a última chave de ordenação
    (ordem estável com desempate por `idExpediente`), sem duplicar nem pular itens entre páginas da mesma versão.
12. O sistema DEVE devolver em cada resposta o total exato de resultados da versão do índice usada; SE o índice mudar
    entre páginas, ENTÃO o sistema DEVE manter a versão do cursor até a última página ou, se ela não estiver mais
    disponível, avisar "A lista foi atualizada" e reiniciar na primeira página.
13. O sistema DEVE responder à pesquisa com até 800 ms no percentil 95 com 10 vezes o volume (Requisito 31), medido
    nos cenários: sem filtro, texto livre, três filtros combinados, ordenação por risco e quinta página.

### Requisito 6: Filtros salvos (RF04)

**Prioridade:** Desejável · **Origem:** RF04, F8

**User Story:** Como servidor, quero salvar combinações de filtros com nome, marcar uma como padrão e compartilhá-la com
o setor, para que eu reaproveite minha visão e a da equipe.

#### Critérios de Aceitação

1. QUANDO o usuário salvar os filtros ativos com um nome, ENTÃO o sistema DEVE gravar `nome`, `criterios` (JSON),
   `ordenacao` (`campo:asc|desc`), `padrao` e `compartilhadoComSetor` em `PK = USR#<id>`, `SK = FILTRO#<idFiltro>`.
2. ENQUANTO um filtro tiver `compartilhadoComSetor = true`, o sistema DEVE manter o espelho em
   `PK = SETOR#<sigla>`, `SK = FILTRO#<idFiltro>`, com `idUsuario` e `nomeUsuario` do autor, `nome`, `criterios` e
   `ordenacao`. Criar, editar, deixar de compartilhar ou excluir o filtro DEVE gravar o item do usuário e o espelho
   na mesma `TransactWriteItems`.
3. O sistema DEVE listar os filtros do usuário com duas consultas `Query` e nenhum `Scan`: os próprios
   (`PK = USR#<id>`, `begins_with(SK, "FILTRO#")`) e os compartilhados do setor (`PK = SETOR#<sigla>`,
   `begins_with(SK, "FILTRO#")`), sem repetir os próprios. Na base, o usuário `GABSUB3-DVT-U02` DEVE ver os
   filtros compartilhados `FIL000001`, `FIL000006` e `FIL000009` dos colegas, e NÃO DEVE ver `FIL000015`, de
   `CIVINT/STIC`.
4. QUANDO o usuário marcar um filtro como padrão, ENTÃO o sistema DEVE desmarcar o padrão anterior do mesmo usuário e
   aplicar o novo ao abrir o painel.
5. ENQUANTO um filtro for compartilhado, o sistema DEVE permitir que só o autor o edite ou exclua; os demais usuários
   do setor só o leem e aplicam (Requisito 24, matriz de autorização).
6. SE o nome tiver mais de 60 caracteres, estiver vazio ou repetir outro filtro do mesmo usuário, ENTÃO o sistema DEVE
   rejeitar o salvamento com mensagem associada ao campo.
7. SE um filtro salvo tiver critério inválido ou obsoleto, ENTÃO o sistema DEVE aplicar só os critérios válidos e
   avisar quais foram ignorados.
8. O sistema DEVE ter testes de API que comprovem: um filtro compartilhado aparece para outro usuário do mesmo setor;
   não aparece para usuário de outro setor; deixa de aparecer após "deixar de compartilhar"; e a edição por quem não é
   o autor recebe HTTP 403.

### Requisito 7: Personalização do painel (RF05)

**Prioridade:** Desejável · **Origem:** RF05, F8

**User Story:** Como servidor, quero escolher e reordenar colunas e definir ordenação, agrupamento, densidade e itens
por página, para que o painel se adapte ao meu jeito de trabalhar.

#### Critérios de Aceitação

1. O sistema DEVE permitir escolher as colunas visíveis entre os campos de `expedientes` e reordená-las por arrastar e
   também por botões "mover para cima/baixo" acessíveis por teclado.
2. O sistema DEVE permitir definir `ordenacaoCampo` e `ordenacaoDirecao`, `agruparPor` (por exemplo `gerenciador`,
   `statusPrazo`, `prioridade`, `nomeResponsavel`), `densidade` (`COMPACTA`, `CONFORTAVEL`), `itensPorPagina`
   (25, 50, 100), `caixaInicial` e `tema` (`CLARO`, `ESCURO`, `AUTO`).
3. QUANDO o usuário alterar uma preferência, ENTÃO o sistema DEVE gravá-la em `PK = USR#<id>`,
   `SK = PREF#<contexto>`, separada por contexto (`PAINEL_UNIFICADO` ou nome do gerenciador).
4. QUANDO o usuário abrir o painel em um contexto, ENTÃO o sistema DEVE aplicar as preferências desse contexto,
   partindo das 48 preferências da base.
5. O sistema DEVE oferecer "Restaurar padrão" para o contexto corrente.
6. O sistema DEVE manter sempre visíveis as colunas `etiqueta` e `statusPrazo`, para que a identificação e o selo de
   prazo nunca sejam ocultados. **Definido nesta spec.**

### Bloco C — Priorização e prazos

### Requisito 8: Priorização explicável (RF06)

**Prioridade:** Essencial · **Origem:** RF06, F3, RN2, RN3

**User Story:** Como membro, quero ver a lista ordenada por prazo e prioridade, com destaque para urgentes, próximos
do vencimento e itens que exigem ação, e saber por que cada item tem sua prioridade, para que eu decida o que fazer
primeiro.

#### Critérios de Aceitação

1. O sistema DEVE oferecer a ordenação padrão "Fila" (RN3): `dataPrazo` crescente e, no empate,
   `pontuacaoPrioridade` decrescente, obtida do `GSI2`.
2. O sistema DEVE calcular `pontuacaoPrioridade` conforme RN2 e classificá-la em `CRITICA` (≥ 60), `ALTA` (≥ 35),
   `MEDIA` (≥ 20) ou `BAIXA`, com resultado idêntico ao campo da base para todos os 4.109 expedientes (os 1.066
   baixados têm pontuação 0 e prioridade `BAIXA`, como no gerador).
3. O sistema DEVE destacar com selo textual e ícone os expedientes urgentes (com `motivoUrgencia`), com `statusPrazo`
   `VENCIDO`, `VENCE_HOJE` ou `CRITICO`, e com `requerAcao = true`.
4. QUANDO o usuário pedir "Por que esta prioridade?", ENTÃO o sistema DEVE exibir a composição da pontuação
   (por exemplo: "Prazo vencido +50; Urgente (réu preso) +30; Total 80 → Crítica") e a regra de metade para
   `ENVIADO_NAO_RECEBIDO`.
5. O sistema DEVE exibir a prioridade com texto e cor do catálogo `PRIORIDADE`, nunca só com cor.
6. QUANDO dois itens tiverem o mesmo prazo, ENTÃO o sistema DEVE posicionar primeiro o de maior pontuação (exemplo de
   RN3: 80 pontos antes de 45).

### Requisito 9: Indicadores visuais de prazo (RF07)

**Prioridade:** Essencial · **Origem:** RF07, F3, RN1

**User Story:** Como membro, quero ver a situação do prazo de cada expediente com cor, ícone e texto, para que eu
identifique o que vence sem depender só da cor.

#### Critérios de Aceitação

1. ENQUANTO o expediente estiver ativo (`caixa != BAIXADO`), o sistema DEVE derivar `statusPrazo` dos
   `diasRestantes` (RN1): < 0 `VENCIDO`; 0 `VENCE_HOJE`; 1 a 3 `CRITICO`; 4 a 7 `ATENCAO`; > 7 `NO_PRAZO`.
2. ENQUANTO o expediente estiver `BAIXADO`, o sistema DEVE usar o status de cumprimento, sem aplicar RN1:
   `CUMPRIDO` quando `dataPrazo` ≥ data de encerramento e `CUMPRIDO_COM_ATRASO` quando `dataPrazo` < data de
   encerramento, com `diasRestantes` = `dataPrazo` − data de encerramento (regra do gerador).
3. QUANDO um expediente passar a `BAIXADO` (ação `ARQUIVAR`), ENTÃO o sistema DEVE fixar a data de encerramento no
   instante da ação, encerrar o prazo `ABERTO` em `PRZ#` com `situacao` `CUMPRIDO_NO_PRAZO` ou `CUMPRIDO_COM_ATRASO`
   e `dataEncerramento`, e gravar o status de cumprimento correspondente; QUANDO o desfazer reabrir o expediente,
   ENTÃO o sistema DEVE restaurar o prazo e o `statusPrazo` do estado anterior.
4. O sistema DEVE exibir o selo de prazo com o texto do catálogo `STATUS_PRAZO` ("Prazo vencido", "Vence hoje",
   "Vence em até 3 dias", "Vence em até 7 dias", "No prazo"), um ícone distinto por situação e a cor do catálogo.
5. O sistema DEVE exibir ao lado do selo a data do prazo e o texto relativo ("venceu há 2 dias", "vence em 2 dias").
6. O sistema DEVE garantir contraste mínimo de 4,5:1 entre texto e fundo do selo; ONDE a cor do catálogo não atingir
   esse contraste (por exemplo `#FDD835`), o sistema DEVE usá-la como borda ou faixa e manter texto escuro.
7. O sistema DEVE expor ao leitor de tela o texto completo da situação (por exemplo "Prazo: vence em até 3 dias,
   09/10/2026").
8. O sistema DEVE exibir uma legenda dos selos acessível no painel e na tela inicial.

### Requisito 10: Índice de risco de vencimento (RF08)

**Prioridade:** Se sobrar tempo · **Origem:** RF08, README (fórmula)

**User Story:** Como chefe de gabinete, quero um índice que combine tempo parado e dias restantes, para que eu
antecipe os itens que tendem a vencer antes de virarem vencidos.

#### Critérios de Aceitação

1. O sistema DEVE calcular o risco como `min(100, 20 × (tempoParadoDias + 1) ÷ (diasRestantes + 1))`, arredondado
   para inteiro, apenas quando `diasRestantes ≥ 0`.
2. SE o prazo já estiver vencido, ENTÃO o sistema DEVE exibir "Vencido" no lugar do índice e excluí-lo do cálculo.
3. O sistema DEVE classificar o risco em "Alto" (≥ 70), "Médio" (≥ 40) e "Baixo" (< 40), com texto e cor.
   **Definido nesta spec.**
4. O sistema DEVE permitir ordenar a lista pelo risco e filtrar por risco mínimo (`riscoMin`).
5. QUANDO o usuário consultar o risco de um item, ENTÃO o sistema DEVE mostrar os valores de `tempoParadoDias` e
   `diasRestantes` usados no cálculo.

### Requisito 11: Próximo expediente — modo foco (RF09)

**Prioridade:** Desejável · **Origem:** RF09, F9

**User Story:** Como servidor, quero ver um expediente por vez, na ordem da fila, com a ação pendente e um atalho para
executá-la, para que eu trabalhe sem me distrair com a lista inteira.

#### Critérios de Aceitação

1. QUANDO o usuário entrar no modo foco, ENTÃO o sistema DEVE apresentar o primeiro expediente da fila do `GSI2` que
   tenha `requerAcao = true` e respeite os filtros ativos.
2. O sistema DEVE exibir no cartão do item: etiqueta, gerenciador, selo de prazo, prioridade com composição,
   `acaoPendente`, responsável e o botão da ação correspondente.
3. O sistema DEVE oferecer os atalhos de teclado N (próximo), P (anterior), X (executar ação pendente), A (abrir
   detalhe) e D (designar), listados na tela e desativáveis.
4. QUANDO o usuário executar a ação pendente, ENTÃO o sistema DEVE registrar a movimentação, avançar para o próximo
   item e anunciar o resultado por `aria-live`.
5. ENQUANTO houver itens restantes, o sistema DEVE exibir a posição ("3 de 47").
6. SE a fila estiver vazia, ENTÃO o sistema DEVE informar "Nenhum expediente pendente na fila".
7. O sistema DEVE levar o foco do teclado para o título do item a cada troca.

### Requisito 12: Calendário de prazos e exportação iCal (RF10)

**Prioridade:** Se sobrar tempo · **Origem:** RF10

**User Story:** Como membro, quero ver os prazos num calendário mensal e levá-los para minha agenda, com lembrete, para
que eu não perca nenhum vencimento.

#### Critérios de Aceitação

1. O sistema DEVE exibir um calendário mensal com a quantidade de prazos por dia agrupada por `statusPrazo`, com texto
   e ícone.
2. QUANDO o usuário escolher um dia, ENTÃO o sistema DEVE listar os expedientes daquele dia.
3. O sistema DEVE oferecer uma visão alternativa em lista/tabela com os mesmos dados, navegável por teclado.
4. QUANDO o usuário exportar, ENTÃO o sistema DEVE gerar um arquivo `.ics` (RFC 5545) com um evento por prazo dos
   itens filtrados e um alarme (`VALARM`) com a antecedência `antecedenciaAlertaPrazoDias` das preferências,
   ajustável na exportação.
5. O sistema DEVE incluir em cada evento só etiqueta, número de referência, gerenciador, data do prazo e link para o
   painel.
6. SE o expediente for sigiloso, ENTÃO o sistema NÃO DEVE incluir assunto, resumo ou qualquer conteúdo sigiloso no
   `.ics`, usando o título "Expediente sigiloso — <etiqueta>".

### Bloco D — Expediente, ações em lote e rastreabilidade

### Requisito 13: Detalhe do expediente e histórico de movimentações (RF13)

**Prioridade:** Essencial para o detalhe e o histórico (F5 do caso de uso e demo esperada); Desejável para o filtro
por tipo e a exportação (RF13 nas instruções) · **Origem:** RF13, F5

**User Story:** Como servidor, quero abrir um processo e ver o histórico de movimentações, prazos, designações,
marcadores e anotações, para que eu entenda o andamento antes de agir.

#### Critérios de Aceitação

1. QUANDO o usuário abrir um expediente, ENTÃO o sistema DEVE carregar o detalhe por `PK = EXP#<id>` (itens `META`,
   `MOV#`, `PRZ#`, `DES#`, `ANO#` e `ROT#`) em uma única consulta.
2. O sistema DEVE exibir identificação, caixa, situação, ação pendente, prazo com selo, prioridade com composição,
   risco, responsável, marcadores, sinalizações, quantidade de minutas pendentes e anotações.
3. O sistema DEVE exibir as movimentações em ordem cronológica com `dataHora`, `tipoMovimentacao`, `nomeUsuario`,
   `setorOrigem`, `setorDestino` e `descricao` (quem, quando, de onde e para onde).
4. O sistema DEVE exibir os prazos do expediente (`ABERTO`, `PRORROGADO`, `CUMPRIDO_NO_PRAZO`,
   `CUMPRIDO_COM_ATRASO`) e as designações com `statusDevolucao`.
5. O sistema DEVE permitir filtrar o histórico por `tipoMovimentacao` e exportá-lo em CSV (Requisito 23).
6. O sistema DEVE permitir incluir anotação, registrando a movimentação `ANOTACAO_INCLUIDA`.
7. O sistema DEVE permitir favoritar e desfavoritar o expediente como marcação pessoal, gravando ou removendo
   `PK = USR#<idUsuario>`, `SK = FAV#<gerenciador>#<idExpediente>`. Favoritar NÃO DEVE gerar movimentação no
   histórico do expediente (não é ato sobre o processo); DEVE gerar registro na trilha de auditoria (Requisito 25) e
   atualizar o derivado `expedientes.favorito` ("favoritado no setor") e o contador `favoritos`. **Definido nesta spec.**
8. QUANDO dois usuários do mesmo setor favoritarem o mesmo expediente, ENTÃO o sistema DEVE manter os dois
   registros; e QUANDO um deles desfavoritar, ENTÃO o expediente DEVE continuar favorito para o outro e
   `expedientes.favorito` DEVE continuar `true`. Um teste de API DEVE cobrir esse caso.
9. SE o expediente pertencer a outro setor, ENTÃO o sistema DEVE responder HTTP 404 e exibir "Expediente não
   encontrado ou sem acesso", sem revelar se o expediente existe (RN6; mesma regra do Requisito 24, critério 4).
10. SE o expediente for sigiloso e o usuário não puder ver o conteúdo (Requisito 24), ENTÃO o sistema DEVE aplicar a
    máscara de sigilo ao detalhe, às anotações e às descrições do histórico.
11. O sistema DEVE apresentar o histórico em tabela com `caption`, `th id` e `td headers`.

### Requisito 14: Ações em lote (RF11)

**Prioridade:** Desejável — alvo da demonstração para `RECEBER` e `DESIGNAR` · **Origem:** RF11, F6, RN4, RN5

**User Story:** Como chefe de gabinete, quero receber, designar, incluir marcador, dar ciência, assinar, movimentar e
arquivar vários expedientes de uma vez, para que eu reduza o trabalho repetitivo do dia.

#### Critérios de Aceitação

1. O sistema DEVE permitir selecionar vários expedientes no painel (individualmente, por página ou por todos os
   resultados do filtro) e escolher uma das ações `RECEBER`, `DESIGNAR`, `INCLUIR_MARCADOR`, `DAR_CIENCIA`, `ASSINAR`,
   `MOVIMENTAR` ou `ARQUIVAR`.
2. O sistema DEVE aplicar as regras de elegibilidade abaixo e ignorar, com motivo, os itens que não as atendam:

   | Ação | Elegível quando | Efeito simulado |
   | --- | --- | --- |
   | `RECEBER` | `caixa = A_RECEBER` (RN4) | Caixa passa a `NO_SETOR`; preenche `dataRecebimento`; movimentação `RECEBIMENTO` |
   | `DESIGNAR` | `caixa = NO_SETOR` (RN4); designado ativo e do mesmo setor | Encerra a designação ativa anterior; cria designação `ATIVA` com `prazoDevolucao`; `tipoResponsabilidade = DESIGNADO`; movimentação `DESIGNACAO`; notificação `DESIGNACAO` ao designado |
   | `INCLUIR_MARCADOR` | `caixa = NO_SETOR`; marcador do mesmo setor e gerenciador; marcador ainda não aplicado | Vínculo em `marcadores_expedientes`; movimentação `MARCADOR_INCLUIDO` |
   | `DAR_CIENCIA` | `caixa = NO_SETOR`; `gerenciador = JUDICIAL`; `situacao = AGUARDANDO_CIENCIA` | Situação passa a `EM_ANALISE`; movimentação `CIENCIA` (código da migração, Requisito 2) |
   | `ASSINAR` | `caixa = NO_SETOR`; `situacao = AGUARDANDO_ASSINATURA` | Movimentação `ASSINATURA` (sem assinatura real); situação passa a `PRONTO_PARA_ENVIO` |
   | `MOVIMENTAR` | `caixa = NO_SETOR` (RN4); setor de destino informado | Caixa passa a `ENVIADO_NAO_RECEBIDO`; movimentação `ENVIO_PELO_SETOR` |
   | `ARQUIVAR` | `caixa = NO_SETOR` (RN4); `qtdMinutasPendentes = 0` (RN5) | Caixa passa a `BAIXADO`; movimentação `ARQUIVAMENTO` |

   Os efeitos de situação em `DAR_CIENCIA` e `ASSINAR` são **definidos nesta spec**.
3. O sistema DEVE executar cada lote de forma idempotente (mesma chave de idempotência não gera efeito duplicado).
4. O sistema DEVE tratar cada expediente do lote como unidade atômica: item `META` (com `versao` incrementada),
   movimentação, designação ou marcador, estado anterior, resultado do item e contadores (Requisito 29) DEVEM ser
   gravados numa única `TransactWriteItems`, condicionada a `versao` igual à lida na pré-visualização. Falha parcial
   entre expedientes é permitida; falha parcial dentro de um expediente, não.
5. O sistema DEVE registrar o resultado de cada item (`PK = LOTE#<idLote>`, `SK = ITEM#<idExpediente>`, com
   `status` `SUCESSO`, `IGNORADO` ou `FALHA` e motivo) na mesma transação do item. SE a execução for interrompida,
   ENTÃO a retomada DEVE pular os itens já confirmados e continuar pelos pendentes, sem reaplicar efeitos.
6. QUANDO o lote terminar, ENTÃO o sistema DEVE gravar a trilha em `acoes_lote` (`PK = USR#<id>`, `SK = LOTE#<dataHora>#<idLote>`, `GSI1PK = SETOR#<sigla>`, como no seed)
   com `idLote`, `siglaSetor`, `idUsuario`, `nomeUsuario`, `tipoAcao`, `parametros`, `dataHora`, `qtdExpedientes`,
   `qtdSucesso`, `qtdFalhas`, `resultado` (`SUCESSO` ou `PARCIAL`), `gerenciadores` e `idsExpedientes`.
7. QUANDO o lote terminar, ENTÃO o sistema DEVE recalcular prioridade, índices e contadores dos itens afetados
   (Requisito 2, critério 7) e anunciar o resultado por `aria-live`.
8. SE o lote tiver mais de 200 itens, ENTÃO o sistema DEVE recusá-lo e sugerir dividir a seleção. **Definido nesta
   spec.**
9. SE algum item falhar durante a execução, ENTÃO o sistema DEVE concluir os demais, marcar `resultado = PARCIAL` e
   listar as falhas com motivo.
10. O sistema DEVE validar no backend a elegibilidade e a autorização de cada item, independentemente da seleção feita
    na tela.

### Requisito 15: Pré-visualizar e desfazer lotes (RF12)

**Prioridade:** Desejável · **Origem:** RF12, F6

**User Story:** Como chefe de gabinete, quero ver o que será alterado antes de executar um lote e poder desfazê-lo
depois, para que eu aja em massa sem medo de errar.

#### Critérios de Aceitação

1. QUANDO o usuário solicitar uma ação em lote, ENTÃO o sistema DEVE exibir a pré-visualização antes de qualquer
   alteração, com duas listas: "Serão alterados" (com o efeito em cada item) e "Serão ignorados" (com o motivo, por
   exemplo "Não está na caixa A receber" ou "Possui 1 minuta pendente").
2. O sistema DEVE calcular a pré-visualização no backend com as mesmas regras da execução, sem efeitos colaterais.
3. QUANDO o usuário confirmar, ENTÃO o sistema DEVE executar apenas os itens listados como "Serão alterados".
4. SE algum item mudar de estado entre a pré-visualização e a confirmação, ENTÃO o sistema DEVE ignorá-lo e informar
   o motivo no resultado.
5. QUANDO o lote for concluído, ENTÃO o sistema DEVE oferecer "Desfazer" na mensagem de resultado e na trilha de lotes.
6. QUANDO o lote executar um item, ENTÃO o sistema DEVE gravar, na mesma transação, o estado anterior do item
   (`PK = LOTE#<idLote>`, `SK = ANTES#<idExpediente>`): atributos alterados do `META` com seus valores anteriores,
   `versaoAntes`, `versaoDepois` e as chaves dos itens relacionados criados ou encerrados (designação, marcador,
   prazo). Lotes do seed (52) não têm estado anterior e NÃO DEVEM oferecer "Desfazer". **Definido nesta spec.**
7. O sistema DEVE manter o desfazer disponível por 24 horas após a conclusão do lote e só para o autor do lote ou
   para `CHEFE` do setor (Requisito 24); depois disso, o botão DEVE sumir e a API DEVE responder HTTP 409.
   O estado anterior expira por TTL do DynamoDB após 7 dias. **Definido nesta spec.**
8. QUANDO o usuário desfizer um lote, ENTÃO o sistema DEVE restaurar, por unidade atômica, o estado anterior de
   cada item, registrar a movimentação `REVERSAO_LOTE` e gravar uma nova entrada em `acoes_lote` com
   `tipoAcao = DESFAZER` e `parametros` contendo `desfazer=<idLote original>`.
9. SE a `versao` atual de um item for diferente da `versaoDepois` gravada no estado anterior (o item foi alterado
   por outra ação depois do lote), ENTÃO o sistema DEVE manter esse item como está, marcá-lo `IGNORADO` com o motivo
   "Alterado depois do lote" e seguir com os demais. A restauração DEVE ser escrita condicional a essa versão.
10. O sistema DEVE ter testes que comprovem: executar e desfazer restaura exatamente o estado anterior (teste de
    propriedade); um item alterado entre execução e desfazer é preservado; desfazer duas vezes não gera efeito extra;
    e a retomada após falha simulada no meio do lote não duplica movimentações.
11. O sistema DEVE exibir a trilha de lotes do usuário e do setor (52 lotes na base), com filtro por `tipoAcao` e
    `resultado`.
12. O diálogo de pré-visualização DEVE ser modal acessível (`<dialog>` nativo ou equivalente), prender o foco e
    devolvê-lo ao controle de origem ao fechar.

### Requisito 16: Designação balanceada (RF14)

**Prioridade:** Se sobrar tempo (o caso de uso classifica F7 como Desejável) · **Origem:** RF14, F7

**User Story:** Como chefe de gabinete, quero que o sistema sugira a quem designar pela carga atual de cada pessoa e
distribua vários itens de forma equilibrada, para que o trabalho da equipe fique justo.

#### Critérios de Aceitação

1. O sistema DEVE calcular, para cada usuário ativo do setor elegível a designação, a carga = designações `ATIVA` +
   2 × designações com `statusDevolucao = VENCIDA`, e a capacidade = média diária de `totalAcoes` em
   `produtividade_diaria` nos últimos 14 dias (mínimo 1). Os pesos e a janela são **definidos nesta spec**.
2. O sistema DEVE ordenar as sugestões pelo índice carga ÷ capacidade crescente e exibir, para cada pessoa, os três
   componentes do cálculo.
3. QUANDO o usuário distribuir vários itens, ENTÃO o sistema DEVE atribuir cada item, na ordem da fila, à pessoa com
   menor índice naquele momento, recalculando o índice a cada atribuição.
4. O sistema DEVE mostrar a distribuição proposta na pré-visualização do lote `DESIGNAR` (Requisito 15), permitindo
   trocar o designado de qualquer item antes de confirmar.
5. O sistema DEVE oferecer a distribuição balanceada apenas aos perfis `CHEFE` e `MEMBRO`. A designação individual
   segue a matriz do Requisito 24 (`SERVIDOR` só designa para si mesmo). **Definido nesta spec.**
6. SE não houver pessoa elegível no setor, ENTÃO o sistema DEVE informar o motivo e não sugerir ninguém.

### Bloco E — Alertas e notificações

### Requisito 17: Central de alertas (RF15)

**Prioridade:** Desejável · **Origem:** RF15

**User Story:** Como servidor, quero ser avisado de novos expedientes, novas intimações, prazos, designações,
devoluções vencidas e alterações, para que nada importante passe despercebido.

#### Critérios de Aceitação

1. O sistema DEVE listar as notificações do usuário (`PK = USR#<id>`, `SK = NOT#…`) com `tipoNotificacao`,
   `severidade`, `titulo`, `mensagem`, `dataHora`, `lida` e link para o expediente.
2. O sistema DEVE suportar os tipos `NOVO_EXPEDIENTE`, `NOVA_INTIMACAO`, `PRAZO_VENCIDO`, `PRAZO_VENCE_HOJE`,
   `PRAZO_PROXIMO`, `DESIGNACAO`, `DEVOLUCAO_VENCIDA`, `ALTERACAO` e `ENVIO_PENDENTE`.
3. O sistema DEVE permitir filtrar por tipo, severidade e situação de leitura, e marcar uma, várias ou todas como
   lidas ou não lidas.
4. O sistema DEVE exibir no cabeçalho um contador de não lidas, com texto acessível ("12 alertas não lidos").
5. QUANDO um evento de negócio gerar alerta (designação, recebimento, inclusão de marcador ou anotação por outro
   usuário), ENTÃO o sistema DEVE criar a notificação na mesma transação da escrita e exibi-la ao destinatário em até 30 segundos
   sem recarregar a página.
6. QUANDO a rotina diária rodar, ENTÃO o sistema DEVE gerar os alertas de prazo (`PRAZO_VENCIDO`, `PRAZO_VENCE_HOJE`,
   `PRAZO_PROXIMO` com 3 e 7 dias de antecedência), `DEVOLUCAO_VENCIDA` e `ENVIO_PENDENTE` (5 dias ou mais), sem
   duplicar alertas já existentes.
7. O sistema DEVE anunciar novos alertas por `aria-live="polite"`, e os de severidade `CRITICO` com texto explícito
   de severidade, nunca só por cor.
8. ENQUANTO o expediente for sigiloso e o destinatário não puder ver o conteúdo, o sistema DEVE aplicar a máscara de
   sigilo à `mensagem` do alerta.

### Requisito 18: Resumo diário por e-mail (RF16)

**Prioridade:** Se sobrar tempo · **Origem:** RF16, arquitetura sugerida (EventBridge Scheduler + Lambda + SES)

**User Story:** Como membro, quero receber de manhã um e-mail com vencidos, vencem hoje, novos e devoluções vencidas,
para que eu planeje o dia antes de abrir o sistema.

#### Critérios de Aceitação

1. O sistema DEVE enviar o resumo apenas a usuários com `notificarPorEmail = true` em alguma preferência.
2. QUANDO o agendamento diário disparar (EventBridge Scheduler, 07:00 de Brasília), ENTÃO o sistema DEVE montar, por
   usuário, as quantidades e a lista (até 10 itens por seção) de vencidos, vencem hoje, novos (24h) e devoluções
   vencidas, e enviá-las pelo Amazon SES.
3. O sistema DEVE incluir no e-mail versões HTML acessível e texto simples, link para a tela inicial e link para
   desativar o resumo.
4. SE o expediente for sigiloso, ENTÃO o sistema NÃO DEVE incluir assunto, resumo ou outro conteúdo sigiloso no
   e-mail, apenas etiqueta e prazo.
5. O sistema DEVE oferecer a pré-visualização do resumo na própria aplicação.
6. ONDE o SES estiver em *sandbox*, o sistema DEVE enviar só para identidades verificadas da equipe e registrar os
   demais envios como simulados (os e-mails `@exemplo.org` são fictícios).
7. SE o envio falhar, ENTÃO o sistema DEVE tentar novamente com recuo exponencial e, esgotadas as tentativas, enviar a
   mensagem para uma fila de mensagens mortas com alarme.

### Bloco F — Indicadores

### Requisito 19: Dashboards de indicadores (RF17)

**Prioridade:** Se sobrar tempo (o caso de uso classifica F10 como Desejável) · **Origem:** RF17, F10

**User Story:** Como chefe de gabinete, quero ver volume, estoque, pendências, cumprimento de prazos e produtividade por
pessoa, com filtro por período e gerenciador, para que eu acompanhe a equipe e antecipe gargalos.

#### Critérios de Aceitação

1. O sistema DEVE apresentar: indicadores-chave do dia (de `CONT#`); série de estoque, entradas, recebimentos e saídas
   dos últimos 90 dias (`estoque_diario`); pendências por caixa e por `statusPrazo`; cumprimento de prazos (`prazos`,
   `CUMPRIDO_NO_PRAZO` × `CUMPRIDO_COM_ATRASO`); e produtividade por pessoa (`produtividade_diaria`).
2. O sistema DEVE permitir filtrar todos os gráficos por período (7, 30, 90 dias ou intervalo) e por gerenciador.
3. O sistema DEVE oferecer, para cada gráfico, uma tabela alternativa com `caption`, `th id` e `td headers`, e um
   resumo textual do dado principal.
4. O sistema DEVE usar os expedientes `BAIXADO` como histórico nos indicadores (RN7).
5. ENQUANTO o perfil do usuário for `SERVIDOR`, o sistema DEVE exibir só a produtividade do próprio usuário e os
   agregados da equipe sem identificação individual. `MEMBRO` e `CHEFE` veem a produtividade por pessoa.
   **Definido nesta spec** (minimização de dados, LGPD).
6. O sistema DEVE permitir exportar a tabela de cada gráfico em CSV e imprimir o painel com folha de estilo própria.
7. O sistema DEVE usar padrões, rótulos diretos ou texto além da cor para distinguir séries.

### Bloco G — Nova tela inicial

### Requisito 20: Tela inicial com widgets (RF18)

**Prioridade:** Essencial · **Origem:** RF18, F4

**User Story:** Como membro, chefe de gabinete ou servidor, quero uma tela inicial com os contadores de todos os
gerenciadores, os próximos prazos, os alertas não lidos, o próximo expediente e os informes, para que eu comece o dia
sabendo o que importa.

#### Critérios de Aceitação

1. QUANDO o usuário entrar, ENTÃO o sistema DEVE exibir a tela inicial com os widgets: contadores (`CONT#TODOS` e um
   por gerenciador do setor), próximos prazos, alertas não lidos, próximo expediente e informes.
2. O widget de contadores DEVE mostrar `aReceber`, `noSetor`, `enviadosNaoRecebidos`, `vencidos`, `venceHoje`,
   `criticos`, `urgentes`, `novos24h` e `designados`, cada um como link para o painel já filtrado.
3. O widget de próximos prazos DEVE listar os 10 primeiros itens da fila do `GSI2` com `requerAcao = true`, com selo
   de prazo e prioridade.
4. O widget de alertas DEVE mostrar as 5 notificações não lidas mais recentes e o total de não lidas.
5. O widget de próximo expediente DEVE mostrar o primeiro item do modo foco e um link para iniciá-lo.
6. O widget de informes DEVE listar as notícias de `PK = NOTICIA` dentro do período de exibição, com as de
   `destaque = true` primeiro e, depois, por `prioridade` (1 = maior).
7. O sistema DEVE oferecer também os widgets opcionais "Filtros salvos", "Estoque (90 dias)", "Maior risco" e
   "Carga da equipe" (este só para `CHEFE` e `MEMBRO`).
8. SE um widget falhar ao carregar, ENTÃO o sistema DEVE exibir mensagem de erro só nesse widget, com botão
   "Tentar novamente", sem bloquear os demais.
9. O sistema DEVE carregar o conteúdo acima da dobra da tela inicial em até 2 segundos no percentil 95 (Requisito 31).
10. O sistema DEVE estruturar a tela inicial com regiões e títulos (`h1`/`h2`) navegáveis por leitor de tela.

### Requisito 21: Configuração da tela inicial (RF19)

**Prioridade:** Se sobrar tempo · **Origem:** RF19

**User Story:** Como servidor, quero escolher quais widgets aparecem e em que ordem, para que a tela inicial mostre
primeiro o que eu uso mais.

#### Critérios de Aceitação

1. O sistema DEVE permitir mostrar e ocultar cada widget e reordená-los por arrastar e por botões acessíveis por
   teclado.
2. QUANDO o usuário salvar a configuração, ENTÃO o sistema DEVE gravá-la em `PK = USR#<id>`,
   `SK = PREF#TELA_INICIAL` e aplicá-la nos próximos acessos. A chave é **definida nesta spec**.
3. O sistema DEVE oferecer um leiaute padrão por perfil: `SERVIDOR` com próximo expediente e próximos prazos no topo;
   `CHEFE` com contadores e carga da equipe; `MEMBRO` com contadores e próximos prazos. **Definido nesta spec.**
4. O sistema DEVE oferecer "Restaurar padrão".
5. QUANDO a ordem mudar, ENTÃO o sistema DEVE anunciar a nova posição do widget por `aria-live`.

### Bloco H — Diferenciais

### Requisito 22: Assistente com IA generativa (Amazon Bedrock)

**Prioridade:** Desejável (diferencial de inovação) · **Origem:** critério 2 (uso apropriado do Bedrock) e critério 3
(features extras). **Definido nesta spec.**

**User Story:** Como membro, quero um resumo do dia em linguagem natural e poder pesquisar escrevendo o que procuro,
para que eu chegue mais rápido ao que precisa de atenção.

#### Critérios de Aceitação

1. ONDE o assistente estiver habilitado, o sistema DEVE exibir na tela inicial o widget "Resumo do dia", gerado pelo
   Amazon Bedrock a partir dos contadores e dos 10 primeiros itens da fila (etiqueta, prazo, prioridade e motivo).
2. ONDE o assistente estiver habilitado, o sistema DEVE aceitar uma pesquisa em linguagem natural (por exemplo
   "judiciais urgentes que vencem esta semana") e convertê-la em `criterios` no formato de `filtros_salvos`.
3. QUANDO a pesquisa em linguagem natural for convertida, ENTÃO o sistema DEVE validar os critérios contra a mesma
   lista de campos e valores permitidos do Requisito 5, mostrar os filtros interpretados e só aplicá-los após
   confirmação do usuário.
4. O sistema NÃO DEVE enviar ao modelo conteúdo sigiloso, nomes, e-mails ou textos de anotações.
5. O sistema DEVE aplicar Amazon Bedrock Guardrails às entradas e saídas e tratar a saída do modelo como dado não
   confiável (sem execução, apenas JSON validado).
6. O sistema DEVE identificar todo conteúdo gerado como "Gerado por IA — confira antes de agir".
7. SE o Bedrock estiver indisponível ou exceder 5 segundos, ENTÃO o sistema DEVE ocultar o recurso ou cair para os
   filtros manuais, sem afetar o restante da tela.
8. O sistema DEVE limitar invocações por usuário (por exemplo 30 por hora) e registrar custo estimado por chamada.

### Requisito 23: Exportações e formatos de saída

**Prioridade:** Desejável · **Origem:** RF10, RF13, RF17, critério 1 (entradas e saídas), RNF Privacidade

**User Story:** Como chefe de gabinete, quero exportar a lista filtrada, o histórico e as tabelas dos indicadores,
para que eu use os dados em relatórios sem copiar à mão.

#### Critérios de Aceitação

1. O sistema DEVE exportar em CSV (UTF-8 com BOM, separador vírgula, cabeçalho na primeira linha) a lista filtrada do
   painel com as colunas visíveis, o histórico de um expediente e as tabelas dos indicadores.
2. O sistema DEVE expor a API em JSON, com esquema documentado (OpenAPI).
3. O sistema DEVE neutralizar injeção de fórmulas em CSV, prefixando com apóstrofo valores iniciados por `=`, `+`, `-`,
   `@`, tabulação ou retorno de carro.
4. SE a exportação incluir expediente sigiloso que o usuário não pode ver, ENTÃO o sistema DEVE aplicar a máscara de
   sigilo; e, para qualquer usuário, a exportação DEVE omitir `resumo` e textos de anotação de sigilosos.
5. O sistema DEVE limitar cada exportação a 5.000 linhas e nomear o arquivo com contexto e data (por exemplo
   `painel-GABSUB3-DVT-2026-10-07.csv`).
6. QUANDO uma exportação for gerada, ENTÃO o sistema DEVE registrar na trilha de auditoria quem exportou, quando,
   quais filtros e quantas linhas.

### Bloco I — Requisitos não funcionais

### Requisito 24: Segurança — autenticação e autorização por setor e sigilo

**Prioridade:** Essencial · **Origem:** RNF Segurança, RN6, critério 4

**User Story:** Como chefe de gabinete, quero que cada pessoa só veja e altere o que pertence ao seu setor e ao seu
nível de acesso, para que informações do gabinete e de sigilosos fiquem protegidas.

#### Critérios de Aceitação

1. O sistema DEVE proteger todas as rotas da API com o Cognito User Pool Authorizer do API Gateway; nenhuma rota de
   negócio DEVE aceitar acesso anônimo.
2. O sistema DEVE tomar toda decisão de acesso num ponto de decisão de política (PDP) único no backend, implementado
   como módulo/middleware TypeScript puro (`autorizar(usuario, acao, recurso)`) com a matriz versionada no
   repositório como dados, nunca só na tela. Todo *handler* Lambda DEVE passar por ele antes de ler ou gravar.
3. O sistema DEVE aplicar a matriz de autorização abaixo. Todo acesso exige mesmo setor (`siglaSetor` da *claim* =
   `siglaSetor` do recurso); tudo o que não está na matriz é negado por padrão. **Definido nesta spec.**

   | Recurso | Operação | `MEMBRO` | `CHEFE` | `SERVIDOR` |
   | --- | --- | --- | --- | --- |
   | Expediente público (`nivelSigilo = 0`) | Listar, ver detalhe e histórico | Sim | Sim | Sim |
   | Expediente sigiloso (`nivelSigilo > 0`) | Ver conteúdo sigiloso | Sim | Sim | Só se `idResponsavel` = usuário; senão, máscara (RN6) |
   | Expediente | `RECEBER`, `INCLUIR_MARCADOR`, `DAR_CIENCIA`, anotar | Sim | Sim | Sim |
   | Expediente | `DESIGNAR` individual | Sim | Sim | Sim, só para si mesmo ("assumir") |
   | Expediente | Distribuição balanceada (Requisito 16) | Sim | Sim | Não |
   | Expediente | `ASSINAR` | Sim | Sim | Não |
   | Expediente | `MOVIMENTAR`, `ARQUIVAR` | Sim | Sim | Só se `idResponsavel` = usuário |
   | Lote | Executar | Conforme a ação, item a item | Conforme a ação, item a item | Conforme a ação, item a item |
   | Lote | Ver trilha | Próprios e do setor | Próprios e do setor | Próprios e do setor |
   | Lote | Desfazer (até 24 h) | Só autor | Autor ou qualquer lote do setor | Só autor |
   | Filtro salvo próprio | Ler, editar, excluir, compartilhar | Autor | Autor | Autor |
   | Filtro compartilhado do setor | Ler e aplicar | Sim | Sim | Sim |
   | Filtro compartilhado do setor | Editar, excluir | Só autor | Só autor | Só autor |
   | Preferências, favoritos, notificações, tela inicial | Ler e alterar | Só o próprio usuário | Só o próprio usuário | Só o próprio usuário |
   | Produtividade individual (Requisito 19) | Ver de outra pessoa | Sim | Sim | Não |
   | Exportação (CSV, `.ics`) | Gerar | Sim, com máscara conforme sigilo | Sim, com máscara conforme sigilo | Sim, com máscara conforme sigilo |
   | Qualquer recurso de outro setor | Qualquer operação | Não | Não | Não |

4. SE o PDP negar o acesso a um recurso, ENTÃO o sistema DEVE responder HTTP 404 para recurso de outro setor (sem
   revelar existência) e HTTP 403 para operação não permitida sobre recurso do próprio setor, e registrar a negação
   na trilha de auditoria (RN6). Em lote, a negação de um item DEVE aparecer como "Serão ignorados" com o motivo
   "Sem permissão para esta ação".
5. O sistema DEVE ter, para cada linha da matriz, ao menos um teste de política permitido e um negado, executados
   contra o módulo de autorização com `npm test`, por exemplo: `GABSUB3-DVT-U03` (`SERVIDOR`) aplica `FIL000001` (permitido) e edita
   `FIL000001` (negado, autor `GABSUB3-DVT-U01`); `GABSUB3-DVT-U02` (`CHEFE`) desfaz lote do setor (permitido);
   `CIVINT-STIC-U02` abre expediente do `GABSUB3-DVT` (negado, HTTP 404).
6. ENQUANTO o expediente tiver `nivelSigilo > 0`, o sistema DEVE entregar o conteúdo sigiloso apenas a `MEMBRO` e
   `CHEFE` do setor e ao `SERVIDOR` que for o responsável (`idResponsavel`); para os demais, a API DEVE devolver o
   item com a máscara de sigilo (RN6).
7. O sistema DEVE aplicar a máscara de sigilo no backend antes da serialização, em todas as saídas: lista, detalhe,
   histórico, alertas, exportações, `.ics`, e-mail e prompts de IA.
8. O sistema DEVE tratar os níveis 1 e 2 da mesma forma no MVP e manter o PDP preparado para regras distintas por
   nível. **Definido nesta spec.**
9. O sistema DEVE conceder a cada função Lambda uma role IAM própria, limitada às ações e aos recursos que ela usa
   (sem `*` em ações ou recursos de dados).
10. O sistema DEVE restringir CORS ao domínio da distribuição CloudFront.

### Requisito 25: Segurança — validação de entradas e proteção de dados

**Prioridade:** Essencial · **Origem:** critério 4

**User Story:** Como equipe responsável pela solução, quero validar toda entrada e proteger os dados em trânsito e em
repouso, para que a aplicação resista a injeções e vazamentos.

#### Critérios de Aceitação

1. O sistema DEVE validar todo corpo, parâmetro de rota e *query string* contra um esquema (tipos, tamanhos, listas de
   valores permitidos) e responder HTTP 400 com mensagem genérica quando inválido.
2. O sistema DEVE montar consultas DynamoDB só com expressões parametrizadas (`ExpressionAttributeValues`), nunca
   concatenando entrada do usuário em expressões.
3. O frontend DEVE renderizar dados como texto (sem `innerHTML` com dado não confiável) e servir *Content Security
   Policy*, HSTS, `X-Content-Type-Options`, `Referrer-Policy` e `frame-ancestors 'none'` pela política de cabeçalhos do
   CloudFront.
4. O sistema DEVE aceitar apenas HTTPS (TLS 1.2 ou superior) no CloudFront e no API Gateway.
5. O sistema DEVE criptografar em repouso a tabela DynamoDB e o bucket S3 da SPA com a criptografia padrão gerenciada
   pela AWS (DynamoDB e SSE-S3), e manter o bucket com bloqueio de acesso público e acesso só via *Origin Access
   Control*. Chave KMS dedicada fica como opcional/futuro (Requisito 36).
6. SE ocorrer erro inesperado, ENTÃO a API DEVE responder sem *stack trace* nem detalhes internos, com um
   identificador de correlação.
7. O sistema DEVE aplicar limites de requisição (*throttling*) no stage e por *usage plan* do API Gateway. AWS WAF
   com regras gerenciadas e limite por IP fica como opcional/futuro (Requisito 36).
8. O repositório NÃO DEVE conter credenciais; segredos, se houver, DEVEM ficar no AWS Secrets Manager ou no SSM
   Parameter Store, e um verificador de segredos DEVE rodar antes do commit.
9. O sistema DEVE manter trilha de auditoria imutável das ações de escrita, favoritos, exportações e negações de
   acesso, com estas regras (**Definido nesta spec**):
   - Destino: grupo de logs dedicado do CloudWatch Logs (`/painel-expedientes/auditoria`), com retenção de 30 dias.
     O registro é gravado pelo próprio *handler* (módulo `auditar`) logo após a escrita confirmada ou a negação.
   - Campos mínimos de cada registro: `idAuditoria`, `eventId`, `dataHora`, `idUsuario`, `perfil`, `siglaSetor`,
     `acao`, `recurso` (tipo e id), `resultado` (`PERMITIDO`, `NEGADO`, `SUCESSO`, `FALHA`), `motivo`,
     `correlationId` e `idLote` quando houver. Sem nomes, e-mails, assuntos, resumos nem textos (Requisito 26).
   - Acesso: as roles da aplicação só têm `logs:CreateLogStream` e `logs:PutLogEvents` nesse grupo; nenhuma tem
     `logs:DeleteLogGroup`, `logs:DeleteLogStream`, `logs:PutRetentionPolicy` nem `logs:DeleteRetentionPolicy`. O
     CloudWatch Logs não permite editar eventos já gravados.
   - Retenção: 30 dias, igual aos logs operacionais (Requisito 26). A role de administração da equipe remove o grupo
     ao fim do evento (Requisito 26, critério 7). Em produção, o caminho para produção (Requisito 36) prevê trilha
     com retenção legal (opcional/futuro: S3 Object Lock modo *Compliance*).
   - Teste: um teste automatizado DEVE comprovar que, com as credenciais das roles da aplicação, apagar o grupo ou um
     *stream* da trilha falha com `AccessDenied`, e que cada escrita da demo gera exatamente um registro
     (mesmo `eventId` não gera registro duplicado).

### Requisito 26: Privacidade e LGPD

**Prioridade:** Essencial · **Origem:** RNF Privacidade, caso de uso 8.3, critério 4 (LGPD)

**User Story:** Como membro, quero que a solução trate dados pessoais e sigilosos com o mínimo necessário, para que ela
esteja em conformidade com a LGPD desde o MVP.

#### Critérios de Aceitação

1. O sistema DEVE operar só com a base sintética; nenhum dado real de homologação ou produção DEVE ser carregado na
   conta do evento.
2. O sistema NÃO DEVE registrar em logs nomes, e-mails, assuntos, resumos, anotações ou tokens; logs DEVEM usar só
   identificadores (`idUsuario`, `idExpediente`).
3. O sistema NÃO DEVE vazar conteúdo de sigilosos em exportações, e-mails, arquivos `.ics` ou prompts de IA
   (Requisitos 12, 18, 22, 23 e 24).
4. O sistema DEVE enviar o resumo por e-mail só a quem optou (`notificarPorEmail = true`) e permitir desativá-lo a
   qualquer momento.
5. O sistema DEVE restringir a produtividade individual conforme o Requisito 19, critério 5.
6. O sistema DEVE definir retenção de 30 dias para logs operacionais e documentar a finalidade de cada dado pessoal
   tratado (registro simplificado de operações de tratamento).
7. O sistema DEVE oferecer um comando para destruir toda a infraestrutura e os dados ao fim do evento.

### Requisito 27: Acessibilidade (eMAG/WCAG)

**Prioridade:** Essencial · **Origem:** RNF Acessibilidade, caso de uso seção 9

**User Story:** Como servidor que usa teclado ou leitor de tela, quero operar todas as funções do painel, para que eu
trabalhe com autonomia.

#### Critérios de Aceitação

1. O sistema DEVE permitir usar todas as funções só pelo teclado, com foco visível, ordem lógica, link "Pular para o
   conteúdo" e nenhum `tabindex` positivo.
2. O sistema DEVE associar um `label` a todo campo de formulário.
3. O sistema DEVE estruturar toda tabela de dados com `caption`, `th` com `id` e `td` com `headers`.
4. O sistema DEVE anunciar avisos e resultados por `aria-live` e erros por `role="alert"`, associando cada erro ao
   campo (`aria-describedby`).
5. O sistema NÃO DEVE transmitir informação só por cor: prazo, prioridade, severidade, gerenciador e séries de gráficos
   DEVEM ter texto ou ícone com nome acessível.
6. O sistema DEVE manter contraste mínimo de 4,5:1 para texto e 3:1 para componentes de interface e foco, nos temas
   claro e escuro.
7. O sistema DEVE oferecer tabela alternativa para cada gráfico e usar diálogos modais que prendem e devolvem o foco.
8. O sistema DEVE funcionar com zoom de 200% e reflow em 320 px de largura sem perda de conteúdo, e respeitar
   `prefers-reduced-motion`.
9. O sistema DEVE declarar `lang="pt-BR"` e um `title` único por página.
10. O pipeline DEVE executar verificação automática de acessibilidade (por exemplo axe-core) nas telas principais sem
    violações críticas ou sérias. A conformidade plena com eMAG/WCAG ainda exige teste manual com leitor de tela
    (NVDA) e revisão especializada, registrados na documentação.

### Requisito 28: Responsividade

**Prioridade:** Essencial · **Origem:** RNF Responsividade

**User Story:** Como membro, quero usar o painel no notebook e em telas menores sem perder funções, para que eu
acompanhe prazos fora da mesa de trabalho.

#### Critérios de Aceitação

1. O sistema DEVE funcionar de 320 px a 1920 px de largura, nas orientações retrato e paisagem.
2. ENQUANTO a largura for menor que 768 px, o sistema DEVE apresentar a lista em cartões (ou tabela com rolagem
   horizontal que mantém os cabeçalhos associados), preservando selo de prazo, prioridade e ação pendente.
3. O sistema DEVE manter disponíveis em telas pequenas filtros, ações em lote, modo foco e alertas.
4. O sistema DEVE garantir alvos de toque de no mínimo 24 × 24 px.

### Requisito 29: Arquitetura serverless, orientada a eventos e como código

**Prioridade:** Essencial (serverless e IaC); Desejável (eventos assíncronos) · **Origem:** arquitetura sugerida,
critério 2

**User Story:** Como equipe responsável pela solução, quero uma arquitetura serverless, desacoplada e descrita como
código, para que ela seja implantada com um comando e escale sem re-arquitetura.

#### Critérios de Aceitação

1. O sistema DEVE hospedar o frontend (SPA) em S3 privado servido pelo CloudFront.
2. O sistema DEVE expor a API pelo API Gateway com funções Lambda e persistir no DynamoDB em tabela única
   (capacidade sob demanda e *point-in-time recovery*).
3. QUANDO uma escrita de negócio for gravada, ENTÃO o sistema DEVE atualizar na mesma `TransactWriteItems` os
   contadores `CONT#` afetados (`ADD`), a versão do índice de busca do setor e, quando houver destinatário, a
   notificação `NOT#`, de modo que nenhuma escrita confirmada fique sem reflexo.
4. O sistema DEVE usar *handlers* Lambda enxutos, com uma responsabilidade por função e sem framework de servidor
   (sem Express/Nest), em Node.js 24 (`nodejs24.x`). Regras de negócio (prioridade, risco, elegibilidade e validação
   de lote, autorização) DEVEM ficar em módulos puros e testáveis, separados do *handler*.
5. O sistema DEVE centralizar o acesso ao DynamoDB numa camada de repositório (chaves `PK`/`SK`, `GSI1` e `GSI2`),
   sem montar consultas espalhadas pelos *handlers*.
6. O sistema DEVE manter os comandos idempotentes: a chave `Idempotency-Key` é registrada com escrita condicional
   `attribute_not_exists` (com TTL) e o resultado por item `LOTE#/ITEM#` impede reaplicar a mesma unidade atômica;
   repetir o comando não altera contadores nem índice.
7. O sistema DEVE processar os lotes na própria Lambda, em blocos (por exemplo 25 expedientes com concorrência
   limitada), com `TransactWriteItems` por expediente. Lotes de até 50 itens respondem de forma síncrona; lotes de 51
   a 200 itens respondem HTTP 202 e seguem numa invocação assíncrona da Lambda de lote, com status consultável
   (`PENDENTE`, `EM_PROCESSAMENTO`, `CONCLUIDO`) e retomada pelo critério de unidade atômica do Requisito 14.
8. O sistema DEVE agendar as rotinas diárias (alertas de prazo e resumo por e-mail) com o EventBridge Scheduler +
   Lambda + Amazon SES.
9. O sistema DEVE registrar em log (CloudWatch Logs) toda falha de invocação assíncrona e de envio de e-mail, com
   alarme no CloudWatch para erros da Lambda. A retentativa usa a política nativa da invocação assíncrona da Lambda.
10. O sistema DEVE executar uma reconciliação, agendada a cada 15 minutos pelo EventBridge Scheduler e também sob
    comando, que recalcula os contadores de cada setor por `Query` no `GSI1` e corrige divergências, registrando a
    quantidade corrigida como métrica.
11. O sistema DEVE descrever toda a infraestrutura em AWS CDK v2 (`aws-cdk-lib` 2.x, TypeScript), com implantação e
    destruição por comando único e parâmetros por ambiente; recursos criados à mão no console limitam-se à
    verificação de identidade do SES.
12. O sistema DEVE separar o código em camadas: regras de domínio puras (sem dependência de AWS), repositório de
    persistência, *handlers* da API e frontend.

### Requisito 30: Observabilidade

**Prioridade:** Desejável · **Origem:** critério 2, critério 6 (caminho para produção)

**User Story:** Como equipe responsável pela solução, quero logs, métricas e rastreamento, para que eu detecte e
diagnostique falhas durante a demo e em produção.

#### Critérios de Aceitação

1. O sistema DEVE emitir logs estruturados em JSON com `correlationId`, rota, status, latência e `idUsuario`, sem dados
   pessoais ou sigilosos (Requisito 26).
2. O sistema DEVE propagar o `correlationId` do API Gateway para todas as Lambdas e logs, permitindo seguir uma
   requisição no CloudWatch Logs Insights. Rastreamento distribuído com AWS X-Ray fica como opcional/futuro.
3. O sistema DEVE publicar métricas de negócio: lotes executados e ignorados, alertas gerados, e-mails enviados,
   invocações de IA e negações de acesso.
4. O sistema DEVE manter um painel no CloudWatch e alarmes para taxa de erro 5xx acima de 1%, latência p95 acima da
   meta, erros de Lambda e *throttling*.

### Requisito 31: Performance e escalabilidade

**Prioridade:** Desejável · **Origem:** critério 6

**User Story:** Como servidor, quero que o painel responda rápido mesmo com milhares de expedientes, para que a
ferramenta não atrapalhe o meu ritmo.

#### Critérios de Aceitação

1. O sistema DEVE responder à listagem paginada do painel em até 800 ms no percentil 95 (função aquecida) para o setor
   `CIVINT/STIC`, o maior da base.
2. O sistema DEVE carregar a tela inicial em até 2 segundos no percentil 95.
3. O sistema NÃO DEVE usar `Scan` em rotas de requisição nem em consumidores; todo acesso DEVE usar chave primária,
   `GSI1`, `GSI2` ou o índice de busca do setor (Requisito 5).
4. O sistema DEVE paginar por cursor (Requisito 5, critério 11) e servir os ativos estáticos com cache no CloudFront.
5. O sistema DEVE manter as metas acima com 10 vezes o volume atual, sem mudança de arquitetura; um teste de carga
   DEVE registrar p50, p95 e p99 de cada cenário do Requisito 5, critério 13, e da tela inicial.
6. O sistema DEVE produzir a massa de carga 10× com um gerador próprio da solução, fora de `resources/`, que:
   - reutiliza as regras de `gerar_seed.py` por importação, sem editar o script nem os arquivos de `seed/saida/`;
   - grava só em diretório temporário (por exemplo `build/carga-10x/`) e numa tabela separada (por exemplo
     `Expedientes-carga`), e recusa executar se o destino for `seed/saida/` ou a tabela da demo;
   - multiplica por 10 os expedientes de cada setor e todos os seus dependentes (movimentações, prazos,
     designações, anotações, marcadores aplicados, notificações), preservando as distribuições por caixa, gerenciador,
     `statusPrazo` e sigilo; mantém os 2 setores, os 14 usuários, os catálogos e as notícias; e recalcula contadores,
     estoque e produtividade a partir da massa gerada;
   - registra a semente aleatória e verifica, ao fim, que a contagem de expedientes é 41.090 (10 × 4.109).
   **Definido nesta spec.**

### Requisito 32: Custo operacional

**Prioridade:** Desejável · **Origem:** critério 6 (estimativa realista de custo)

**User Story:** Como gestor do MPF, quero saber quanto a solução custa para operar, para que eu avalie a viabilidade de
levá-la à produção.

#### Critérios de Aceitação

1. O sistema DEVE usar só serviços com cobrança por uso, sem servidores ligados permanentemente.
2. **[Processo]** A equipe DEVE documentar a estimativa mensal (AWS Pricing Calculator) para o cenário do evento e para um cenário de
   produção com premissas explícitas (setores, usuários, requisições por dia, e-mails, chamadas de IA).
3. O sistema DEVE etiquetar todos os recursos com `projeto` e `ambiente`, para filtrar o custo no Cost Explorer.
   Alarme de orçamento (AWS Budgets) fica como opcional/futuro.
4. O custo do cenário do evento DEVE ficar abaixo de US$ 25 por mês. **Meta definida nesta spec**, a validar no design.

### Requisito 33: Testes e qualidade

**Prioridade:** Essencial · **Origem:** RNF Testes, entregas, critério 6 (manutenibilidade)

**User Story:** Como equipe responsável pela solução, quero testes automatizados das regras e da API, para que a demo
seja confiável e o código possa evoluir.

#### Critérios de Aceitação

1. O sistema DEVE ter testes unitários para `statusPrazo` (RN1), `pontuacaoPrioridade` e faixas (RN2), ordenação da
   fila (RN3), índice de risco, elegibilidade de lote (RN4, RN5), máscara de sigilo, validação de critérios de filtro
   e neutralização de CSV.
2. O sistema DEVE ter testes de paridade com a base, sem divergências:
   - RN1 nos 3.043 ativos: `statusPrazo` recalculado a partir de `diasRestantes`;
   - status de cumprimento nos 1.066 baixados: `CUMPRIDO` (540) ou `CUMPRIDO_COM_ATRASO` (526) pela relação entre
     `dataPrazo` e a `dataEncerramento` do prazo encerrado, coerente com `prazos.situacao`;
   - RN2 nos 4.109: `pontuacaoPrioridade` e `prioridade` (0 e `BAIXA` nos baixados).
3. O sistema DEVE ter testes baseados em propriedades para as regras de domínio (por exemplo: pontuação sempre entre
   0 e 100; desfazer após executar restaura o estado; pré-visualização e execução classificam os itens do mesmo jeito;
   repetir o mesmo comando com a mesma `Idempotency-Key` não altera contadores nem índice de busca).
4. O sistema DEVE ter testes de API para os principais acessos: painel, detalhe, filtros salvos, lote, alertas e tela
   inicial, incluindo os casos negativos 401, 404 entre setores, 403 por operação não permitida e sigiloso para
   servidor não responsável; os testes de política da matriz de autorização (Requisito 24, critério 5); dois usuários
   favoritando o mesmo expediente (Requisito 13, critério 8); e filtros compartilhados (Requisito 6, critério 8).
5. O sistema DEVE ter um teste ponta a ponta do roteiro da demo e a verificação automática de acessibilidade
   (Requisito 27, critério 10).
6. O módulo de regras de domínio DEVE ter cobertura de linhas de pelo menos 80%, e todos os testes DEVEM rodar por um
   único comando documentado.

### Requisito 34: Engenharia com Kiro e documentação

**Prioridade:** Essencial · **Origem:** instruções (regras e entregas), critério 3 (specs, hooks e steering),
critério 6 (manutenibilidade)

**User Story:** Como banca avaliadora, quero ver como specs, hooks e steering do Kiro conduziram a construção, para que
o processo seja reprodutível e auditável.

#### Critérios de Aceitação

1. **[Processo]** A equipe DEVE manter esta spec (requisitos, design e tarefas) em `.kiro/specs/hackathon-expedientes/`, com cada
   tarefa rastreável a requisitos e cada requisito coberto pelo design.
2. **[Processo]** A equipe DEVE preencher os arquivos de steering `product.md`, `tech.md` e `structure.md` com o produto, a stack, os
   comandos e as convenções reais.
3. **[Processo]** A equipe DEVE configurar hooks do Kiro que, no mínimo: executem os testes de domínio ao salvar arquivos de regras;
   verifiquem acessibilidade ao salvar componentes de interface; e bloqueiem segredos antes do commit.
4. **[Processo]** O repositório DEVE ter README com propósito, diagrama de arquitetura, como implantar, carregar a base, executar,
   testar e destruir, além de registros de decisão de arquitetura (ADR) para as escolhas principais.

### Requisito 35: Demonstração e pitch

**Prioridade:** Essencial · **Origem:** caso de uso seção 3 (resultado esperado), critério 5

**User Story:** Como equipe, quero um roteiro de demonstração ensaiado e um ambiente estável, para que a banca veja o
fluxo completo em 5 minutos.

#### Critérios de Aceitação

1. **[Processo]** A equipe DEVE ter um roteiro de até 5 minutos na ordem problema → solução → demo → resultados → próximos passos.
2. **[Processo]** O roteiro DEVE cobrir o resultado esperado do caso de uso: login de usuário fictício; tela inicial com contadores e
   próximos prazos; painel filtrado por prazo, prioridade, responsável e assunto; selos de prazo; detalhe com
   histórico; recebimento ou designação em lote com pré-visualização e desfazer.
3. **[Processo]** O roteiro DEVE usar ao menos dois perfis do `GABSUB3-DVT` (por exemplo `GABSUB3-DVT-U02`, `CHEFE`, e
   `GABSUB3-DVT-U03`, `SERVIDOR`) e mostrar a negação de acesso a sigiloso ou a outro setor.
4. QUANDO o comando de preparação da demo for executado, ENTÃO o sistema DEVE restaurar a base ao estado
   pós-migração e confirmar as contagens (Requisito 2, critério 8).
5. **[Processo]** A equipe DEVE ter um plano de contingência (gravação da demo e capturas de tela) para falha de rede.
6. **[Processo]** A equipe DEVE preparar respostas curtas para perguntas prováveis sobre arquitetura, segurança, custo e caminho para
   produção.

### Requisito 36: Viabilidade, caminho para produção e reuso

**Prioridade:** Desejável · **Origem:** critério 6

**User Story:** Como gestor do MPF, quero saber o que falta para levar o MVP à produção e como reaproveitá-lo, para que
o investimento gere valor contínuo.

#### Critérios de Aceitação

1. **[Processo]** A equipe DEVE documentar o caminho para produção: integração com o Único por eventos, federação do Cognito com o
   provedor de identidade institucional, assinatura digital real, revisão de segurança e LGPD (incluindo relatório de
   impacto), trilha de auditoria com retenção legal, múltiplos ambientes e
   testes com usuários. Também DEVE listar como opcional/futuro os serviços fora da stack do MVP (S3 Object Lock
   *Compliance*, AWS WAF, KMS dedicada, AWS X-Ray, AWS Budgets, Amazon Verified Permissions, fila/barramento de
   eventos para integração com o Único).
2. O sistema DEVE obter gerenciadores, caixas, rótulos e cores do catálogo e da configuração do setor, sem valores
   fixos no código, para permitir o reuso por outras unidades ou órgãos.
3. O sistema DEVE isolar as regras de prazo, prioridade, risco e elegibilidade de lote num módulo reutilizável e
   documentado.
4. **[Processo]** A infraestrutura como código DEVE ser parametrizável por órgão e ambiente.

## Matriz de rastreabilidade das fontes

| Fonte | Item | Requisito(s) |
| --- | --- | --- |
| Instruções | RF01 Visão unificada ou separada | 3 |
| Instruções | RF02 Caixas | 4 |
| Instruções | RF03 Pesquisa e filtros avançados | 5 |
| Instruções | RF04 Filtros salvos | 6 |
| Instruções | RF05 Personalização | 7 |
| Instruções | RF06 Priorização | 8 |
| Instruções | RF07 Indicadores visuais de prazo | 9 |
| Instruções | RF08 Risco de vencimento | 10 |
| Instruções | RF09 Próximo expediente (modo foco) | 11 |
| Instruções | RF10 Calendário de prazos | 12 |
| Instruções | RF11 Ações em lote | 14 |
| Instruções | RF12 Pré-visualizar e desfazer | 15 |
| Instruções | RF13 Histórico | 13 |
| Instruções | RF14 Designação balanceada | 16 |
| Instruções | RF15 Central de alertas | 17 |
| Instruções | RF16 Resumo diário por e-mail | 18 |
| Instruções | RF17 Dashboards | 19 |
| Instruções | RF18 Widgets da tela inicial | 20 |
| Instruções | RF19 Configuração da tela inicial | 21 |
| Instruções | RNF Acessibilidade | 27 |
| Instruções | RNF Responsividade | 28 |
| Instruções | RNF Segurança | 1, 24, 25 |
| Instruções | RNF Privacidade | 26 (e 12, 18, 22, 23) |
| Instruções | RNF Testes | 33 |
| Instruções | Arquitetura sugerida | 29 |
| Instruções | Regras (só base sintética, sem credenciais, spec antes de implementar) | 2, 25, 26, 34 |
| Instruções | Entregas (MVP, modelo de dados, testes, acessibilidade, responsividade, privacidade, segurança, specs, demo) | 2, 24–29, 33, 34, 35 |
| Caso de uso | F1 Lista única com filtro por caixa, gerenciador e responsável | 3, 4, 5 |
| Caso de uso | F2 Filtros por prazo, prioridade, assunto, classe, data e urgência | 5 |
| Caso de uso | F3 Ordenação por prazo e prioridade com selo de prazo | 8, 9 |
| Caso de uso | F4 Tela inicial com contadores, prazos e alertas | 20 |
| Caso de uso | F5 Detalhe com histórico, prazos e designações | 13 |
| Caso de uso | F6 Receber e designar em lote com pré-visualização e desfazer | 14, 15 |
| Caso de uso | F7 Sugestão de designação pela carga | 16 |
| Caso de uso | F8 Filtros salvos, colunas e ordenação | 6, 7 |
| Caso de uso | F9 Modo "próximo processo" | 11 |
| Caso de uso | F10 Painel de indicadores | 19 |
| Caso de uso | RN1 Situação do prazo | 9, 33 |
| Caso de uso | RN2 Pontuação e faixas de prioridade | 8, 33 |
| Caso de uso | RN3 Ordenação da fila | 8, 11, 33 |
| Caso de uso | RN4 Caixa de origem por ação | 14, 15, 33 |
| Caso de uso | RN5 Não arquivar com minuta pendente | 14, 33 |
| Caso de uso | RN6 Acesso por setor e sigilo | 13, 24, 33 |
| Caso de uso | RN7 Baixados só nos indicadores | 3, 4, 19 |
| Caso de uso | Resultado esperado na demonstração | 35 |

## Matriz de cobertura dos critérios de avaliação

Todos os 32 itens avaliados de `criterios-avaliacao-hackathon.html` estão cobertos.

| Critério | Item avaliado | Requisito(s) |
| --- | --- | --- |
| 1. Atendimento aos Requisitos | Cobertura das funcionalidades descritas no caso de uso | 3–21 |
| 1. Atendimento aos Requisitos | Fluxo principal implementado de ponta a ponta (demo funcional) | 1, 20, 5, 13, 14, 15, 35 |
| 1. Atendimento aos Requisitos | Tratamento de entradas e saídas conforme especificado | 2, 12, 23 |
| 1. Atendimento aos Requisitos | Qualidade e utilidade do output gerado | 19, 20, 22, 23 |
| 1. Atendimento aos Requisitos | Uso adequado dos dados sintéticos do kit | 2 (carga, verificação e migração sem editar o seed), 9 (domínios de prazo de ativos e baixados), 31 (massa 10× fora de `resources/`), 33 (critério 2) |
| 2. Arquitetura AWS | Arquitetura serverless | 29 (Lambda, API Gateway, S3 + CloudFront, DynamoDB) |
| 2. Arquitetura AWS | Arquitetura orientada a eventos | 4, 17, 18, 29 (EventBridge Scheduler para rotina diária e reconciliação, invocação assíncrona da Lambda de lote, atualização transacional de contadores e alertas, comandos idempotentes) |
| 2. Arquitetura AWS | Uso correto de serviços gerenciados | 1 (Cognito), 18 (SES), 22 (Bedrock), 24, 25 (CloudWatch Logs como trilha), 29, 30 |
| 2. Arquitetura AWS | Infraestrutura como código | 29, 36 |
| 2. Arquitetura AWS | Desacoplamento e separação de responsabilidades | 29, 36 |
| 2. Arquitetura AWS | Uso apropriado do Bedrock | 22 |
| 3. Inovação e Criatividade | Abordagem diferenciada | 8 (prioridade explicável), 10, 11, 16, 22 |
| 3. Inovação e Criatividade | Combinação criativa de serviços AWS e Kiro | 22, 29, 34 |
| 3. Inovação e Criatividade | Uso de specs, hooks e steering do Kiro | 34 |
| 3. Inovação e Criatividade | UX/UI bem pensada | 7, 9, 11, 20, 21, 27, 28 |
| 3. Inovação e Criatividade | Features extras além do escopo mínimo | 10, 12, 16, 22, 23 |
| 4. Segurança | Autenticação e autorização | 1, 24 (Cognito, PDP em módulo TypeScript no backend, matriz de autorização com testes permitido/negado) |
| 4. Segurança | Menor privilégio IAM | 24 (critério 9) |
| 4. Segurança | Validação e sanitização de inputs | 5 (critério 8), 22 (critério 3), 23 (critério 3), 25 |
| 4. Segurança | Dados sensíveis fora de logs/API | 24 (critério 7), 25 (critério 9), 26, 30 |
| 4. Segurança | HTTPS e criptografia em trânsito e em repouso | 25 (critérios 4 e 5) |
| 4. Segurança | Considerações de LGPD | 19 (critério 5), 26 |
| 5. Apresentação do MVP | Estrutura do pitch | 35 |
| 5. Apresentação do MVP | Demo ao vivo funcional e convincente | 2 (critério 8), 33 (critério 5), 35 |
| 5. Apresentação do MVP | Clareza na explicação da arquitetura | 34 (critério 4), 35 |
| 5. Apresentação do MVP | Gestão do tempo | 35 (critério 1) |
| 5. Apresentação do MVP | Respostas objetivas no Q&A | 35 (critério 6) |
| 6. Viabilidade e Escalabilidade | Caminho claro de MVP para produção | 36 |
| 6. Viabilidade e Escalabilidade | Arquitetura que escala sem re-arquitetura | 5 (índice de busca do setor), 29, 31 (teste com massa 10×) |
| 6. Viabilidade e Escalabilidade | Estimativa realista de custo | 32 |
| 6. Viabilidade e Escalabilidade | Potencial de reuso | 36 |
| 6. Viabilidade e Escalabilidade | Manutenibilidade do código | 29 (critério 12), 33, 34 |

## Resumo de prioridades

| Prioridade | Requisitos |
| --- | --- |
| Essencial | 1, 2, 3 (RF01), 4 (RF02), 5 (RF03), 8 (RF06), 9 (RF07), 13 (detalhe e histórico, F5), 20 (RF18), 24, 25, 26, 27, 28, 29 (serverless e IaC), 33, 34, 35 |
| Desejável | 6 (RF04), 7 (RF05), 11 (RF09), 13 (filtro e exportação do histórico, RF13), 14 (RF11), 15 (RF12), 17 (RF15), 22, 23, 29 (eventos assíncronos), 30, 31, 32, 36 |
| Se sobrar tempo | 10 (RF08), 12 (RF10), 16 (RF14), 18 (RF16), 19 (RF17), 21 (RF19) |

Divergências entre as fontes, resolvidas assim:

- **RF13 × F5:** as instruções classificam o histórico como Desejável; o caso de uso classifica F5 como Essencial e o
  inclui na demo esperada. O detalhe com histórico fica Essencial; filtro por tipo e exportação ficam Desejáveis.
- **RF11/RF12 × demo esperada:** continuam Desejáveis, mas `RECEBER` e `DESIGNAR` com pré-visualização são alvo
  explícito da demo.
- **RF14 × F7 e RF17 × F10:** as instruções dizem "Se sobrar tempo"; o caso de uso diz "Desejável". Fica a
  classificação das instruções, com a divergência registrada para decisão no board.

## Decisões definidas nesta spec (para validação no board)

| # | Decisão | Requisito |
| --- | --- | --- |
| D1 | Campos que compõem o "conteúdo sigiloso" e texto da máscara | Glossário, 24 |
| D2 | `etiqueta` e `statusPrazo` sempre visíveis | 7 |
| D3 | Faixas de risco: Alto ≥ 70, Médio ≥ 40, Baixo < 40 | 10 |
| D4 | Efeitos de situação em `DAR_CIENCIA` e `ASSINAR`; limite de 200 itens por lote | 14 |
| D5 | Desfazer com estado anterior por item, versão otimista, janela de 24 h, TTL de 7 dias; reversão em `acoes_lote` com `tipoAcao = DESFAZER` e `parametros = desfazer=<idLote>`; lotes do seed sem desfazer | 15 |
| D6 | Fórmula de carga e capacidade da designação balanceada; restrita a `CHEFE` e `MEMBRO` | 16 |
| D7 | Produtividade individual visível só para `MEMBRO` e `CHEFE` | 19 |
| D8 | Chave `PREF#TELA_INICIAL` e leiaute padrão por perfil | 21 |
| D9 | Assistente com Bedrock (resumo do dia e pesquisa em linguagem natural) | 22 |
| D10 | Níveis de sigilo 1 e 2 tratados igualmente no MVP | 24 |
| D11 | Metas de performance (800 ms p95 na API; 2 s na tela inicial) e de custo (< US$ 25/mês) | 31, 32 |
| D12 | Migração da aplicação com 45 itens (favoritos por usuário, espelhos de filtros compartilhados, códigos `CIENCIA`, `REVERSAO_LOTE`, `DESFAZER` e domínio `STATUS_EXECUCAO_LOTE`) e atributo `versao`, sem editar o seed | 2 |
| D13 | `statusPrazo` em dois domínios: RN1 nos ativos; status de cumprimento nos baixados | 9, 33 |
| D14 | Favorito por usuário (`USR#<id>` / `FAV#…`); `expedientes.favorito` = "favoritado no setor"; favoritar não gera movimentação | 5, 13 |
| D15 | Espelho de filtros compartilhados em `SETOR#<sigla>` / `FILTRO#…`, gravado na mesma transação | 6 |
| D16 | Matriz de autorização num módulo/middleware TypeScript do backend, com 404 entre setores e 403 dentro do setor | 24 |
| D17 | Cada expediente é unidade atômica do lote, com resultado por item e retomada idempotente | 14 |
| D18 | Contadores, versão do índice e notificações atualizados na mesma transação, versão do agregado, comandos idempotentes, reconciliação a cada 15 min; SLA de 5 s medido da resposta 2xx até o `CONT#` | 4, 29 |
| D19 | Índice de busca do setor, sem conteúdo sigiloso, com cursor por versão e total exato; OpenSearch Serverless fora do MVP por custo | 5, 31 |
| D20 | Gerador de carga 10× próprio, fora de `resources/`, multiplicando expedientes e dependentes por setor | 31 |
| D21 | Trilha de auditoria em grupo dedicado do CloudWatch Logs (30 dias), roles só com `PutLogEvents`, teste de `AccessDenied` na exclusão | 25 |
| D22 | Alinhamento à stack do `tech.md`: Node.js 24, Angular 22 + Bootstrap 5, CDK v2, sem serviços fora da lista (opcionais/futuros no Requisito 36) | 29, 36 |
