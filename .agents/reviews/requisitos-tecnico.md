# Requisitos do painel de expedientes alinhados ao seed, com lacunas de domínio e consistência

A especificação cobre o caso de uso com boa rastreabilidade e usa corretamente a maior parte do vocabulário dos 19 CSVs e da tabela única. A conferência encontrou 49.108 linhas tanto na soma dos CSVs quanto em `itens.json`, e a fórmula de prioridade reproduziu sem divergências os 3.043 expedientes ativos. Ainda assim, alguns critérios não podem ser satisfeitos simultaneamente pelo domínio e pelos access patterns descritos, e os fluxos de escrita não definem garantias suficientes para desfazer, auditoria e processamento assíncrono. **Watch for:** **confirmado** — `statusPrazo` contraditório nos baixados, favoritos sem cardinalidade por usuário, filtros compartilhados sem acesso por setor, eventos ausentes do catálogo e política de autorização conflitante; **provável** — pesquisa textual e filtros arbitrários não sustentam a meta de latência em 10× o volume apenas com os índices atuais.

**Verdict**: NEEDS_CHANGES

## High-level view

A aderência ao seed é forte nos nomes de entidades, campos, caixas, perfis, gerenciadores e na fórmula de prioridade. **Confirmado:** a exceção é o prazo histórico: os 1.066 baixados usam `CUMPRIDO` ou `CUMPRIDO_COM_ATRASO`, enquanto um critério manda reaplicar RN1 a todos os 4.109 registros, produzindo outro domínio.

Os padrões de chave atendem painel por setor, fila, detalhe, designações, notificações e lotes por setor. **Confirmado:** eles não representam favoritos independentes de vários usuários para o mesmo expediente e não oferecem consulta por setor para filtros compartilhados sem `Scan`, que é proibido nas rotas.

A postura de segurança exige Cognito, decisão no backend, máscara antes da serialização, IAM mínimo, TLS, criptografia e minimização de logs. **Confirmado:** falta a matriz de autorização por operação e há conflito entre negar recursos de outro usuário e permitir filtros e lotes compartilhados no setor; a trilha “imutável” também não tem destino, retenção ou prova verificável.

Os lotes e consumidores assíncronos são viáveis em Lambda, DynamoDB, EventBridge e SQS/Step Functions. **Confirmado:** os requisitos não persistem o estado anterior necessário ao desfazer nem exigem controle de versão, outbox ou idempotência dos consumidores, deixando janelas de perda, duplicação e contadores incorretos.

**Provável:** pesquisa livre sem acento e filtros combináveis podem exigir percorrer muitas páginas de uma partição e filtrar na Lambda; com 10× o volume, isso conflita com 800 ms p95 sem um access pattern de busca adicional. **Confirmado:** o teste de 10× também não é executável com o `gerar_seed.py` atual, que não possui parâmetro de escala.

<details>
<summary>Issues (10)</summary>

1. **Domínio de prazo dos baixados — confirmado** — RN1 e o teste de paridade abrangem todos os 4.109 expedientes, mas os 1.066 baixados usam status de cumprimento. Separar regras e testes de ativos e históricos.
2. **Cardinalidade de favoritos — confirmado** — a chave omite `idUsuario` e não permite que dois usuários favoritem o mesmo expediente. Definir chave por usuário e semântica do booleano denormalizado.
3. **Consulta de filtros compartilhados — confirmado** — filtros só têm partição por usuário, embora devam ser listados por setor sem `Scan`. Acrescentar access pattern por setor e critério de teste.
4. **Eventos fora do catálogo — confirmado** — ciência, favorito e reversão exigem histórico, mas não existem em `TIPO_MOVIMENTACAO`. Declarar novos códigos ou um mapeamento válido e carregável.
5. **Política de autorização incompleta — confirmado** — não há matriz por ação/perfil e a negação de recursos de outro usuário contradiz leituras compartilhadas do setor. Definir permissões e exceções testáveis no PDP.
6. **Lotes sem estado anterior e atomicidade — confirmado** — a trilha não permite desfazer com segurança nem detectar mudanças posteriores. Persistir before-images/versões e definir a unidade atômica e a retomada por item.
7. **Eventos sem entrega e deduplicação garantidas — confirmado** — escrita, publicação, contadores, alertas e auditoria não estão ligados atomicamente. Exigir outbox, `eventId`, idempotência, reconciliação e medição do SLA eventual.
8. **Busca incompatível com a meta de latência — provável** — filtros não indexados e busca sem acento tendem a percorrer a partição no volume de 10×. Definir access pattern de busca, paginação, contagem, custo e teste p95.
9. **Massa de carga 10× indisponível — confirmado** — o gerador citado não possui fator de escala e a base oficial não pode ser alterada. Especificar gerador temporário separado ou novo modo que preserve `saida/`.
10. **Auditoria imutável não verificável — confirmado** — não há destino, esquema, retenção ou mecanismo antialteração. Definir armazenamento, proteção, campos e teste de imutabilidade.

</details>

<details>
<summary>Details</summary>

## Prazo histórico não obedece à mesma regra dos ativos

**Confirmado:** o Requisito 9, critério 1 (`requirements.md:334`), define `statusPrazo` exclusivamente por `diasRestantes`, e o Requisito 33, critério 2 (`requirements.md:898`) manda recalcular esse campo para todos os 4.109 expedientes e comparar com o CSV. O gerador usa RN1 apenas nos ativos; para `BAIXADO`, grava `CUMPRIDO` ou `CUMPRIDO_COM_ATRASO`. A conferência encontrou 1.066 baixados, todos divergentes se RN1 for reaplicada: 540 `CUMPRIDO` e 526 `CUMPRIDO_COM_ATRASO`.

O critério deve separar explicitamente expedientes ativos de históricos e definir a regra de encerramento dos baixados. O teste de paridade deve validar RN1 nos 3.043 ativos e, separadamente, o status de cumprimento pela relação entre prazo e `dataEncerramento`.

## Favoritos e filtros compartilhados não cabem nos access patterns atuais

**Confirmado:** favorito é definido como marcação por usuário (`requirements.md:99`) e pode ser alternado e filtrado, mas o seed usa `PK = SETOR#<sigla>` e `SK = FAV#<gerenciador>#<idExpediente>` (`gerar_seed.py:1019`). Como `idUsuario` não participa da chave, a segunda pessoa que favoritar o mesmo expediente sobrescreverá a primeira. O booleano `expedientes.favorito` representa “favoritado por alguém”, não “favoritado pelo usuário autenticado”. O requisito deve definir chave por usuário e expediente, remover ou qualificar o booleano e exigir um caso com dois usuários no mesmo item.

**Confirmado:** filtros salvos ficam apenas em `PK = USR#<id>` (`gerar_seed.py:1024`), mas o Requisito 6 exige listar filtros próprios e compartilhados do setor (`requirements.md:267`). Não há GSI ou item espelho por setor; descobrir autores e consultar cada usuário é fan-out, e consultar toda a tabela seria `Scan`, vedado pelo Requisito 31. O requisito deve escolher e testar um access pattern por setor, como item espelho/GSI com partição `SETOR#<sigla>` e identificação de compartilhamento e autor.

## Histórico exige eventos que o catálogo não reconhece

**Confirmado:** o catálogo real de `TIPO_MOVIMENTACAO` contém 11 códigos e não inclui ciência, inclusão/remoção de favorito nem reversão (`gerar_seed.py:191-193`). Mesmo assim, os requisitos exigem registrar ciência no histórico, movimentação ao favoritar/desfavoritar (`requirements.md:426`) e movimentações de reversão (`requirements.md:489`). Isso também conflita com a exigência de obter rótulos do catálogo em vez de fixá-los no código.

A especificação deve declarar os novos códigos e campos mínimos, ou mapear cada comportamento a código existente sem perder semântica. Os critérios de carga precisam esclarecer que o seed permanece imutável, mas o catálogo pode receber itens de migração da aplicação; do contrário, a API produzirá valores fora do domínio usado pelos filtros e pela interface.

## PDP não possui uma política de operação completa

**Confirmado:** os requisitos definem quem pode ler conteúdo sigiloso e mandam validar autorização no backend, mas não dizem quais perfis podem receber, designar, assinar, movimentar, arquivar, desfazer, exportar ou alterar recursos compartilhados. A única regra explícita de papel para ações informa que a designação individual continua disponível a todos os perfis (`requirements.md:517-519`). Não há resultado esperado para testes de autorização das demais operações.

**Confirmado:** o Requisito 24 manda negar filtro, preferência, notificação ou lote de “outro usuário” (`requirements.md:707-710`), enquanto o Requisito 6 permite aplicar filtros compartilhados do setor e o Requisito 15 exige a trilha de lotes do usuário e do setor. O PDP deve ser expresso como matriz recurso × operação × perfil × relação com setor/proprietário, incluindo exceções de leitura compartilhada, com ao menos um caso permitido e um negado por política.

## Desfazer não tem estado anterior nem controle de concorrência

**Confirmado:** `acoes_lote` registra parâmetros, contagens, resultado e IDs, mas não guarda versões nem imagens anteriores. O Requisito 15 exige restaurar cada item e preservar itens alterados depois (`requirements.md:489-493`), o que não é decidível apenas com esses campos. A especificação precisa exigir `before-image` por item ou log de mudanças equivalente, versão otimista em cada agregado, condição de escrita e prazo de disponibilidade do desfazer.

**Confirmado:** o critério também não define o que constitui sucesso atômico quando expediente, designação, movimentação, notificação e trilha são itens diferentes. Como lotes podem ter 200 itens e tornam-se assíncronos acima de 50, deve ficar explícito que cada expediente é uma unidade atômica e que a falha parcial entre expedientes é permitida, com retomada idempotente a partir do último item confirmado.

## Publicação assíncrona não está ligada atomicamente à escrita

**Confirmado:** o Requisito 29 publica no EventBridge depois da escrita e delega contadores, notificações e auditoria a consumidores (`requirements.md:825-828`), enquanto contadores devem convergir em cinco segundos (`requirements.md:221-224`) e alertas não podem duplicar (`requirements.md:543-544`). Não há critério para impedir que a escrita seja confirmada e a publicação falhe, nem chave de deduplicação, idempotência de consumidor ou reconciliação após DLQ.

A especificação deve exigir um padrão transacional, como outbox na mesma `TransactWriteItems` do agregado e publicador assíncrono, além de `eventId`, versão do agregado, deduplicação por consumidor, retentativa e rotina de reconciliação. O SLA de cinco segundos deve declarar o ponto inicial, o ambiente de medição e o comportamento visível enquanto o contador está eventual.

## Pesquisa textual e meta de 800 ms não têm access pattern compatível

**Provável:** a pesquisa livre precisa ignorar caixa e acentos em sete campos (`requirements.md:235-237`), e os filtros combinam atributos ausentes das chaves. Com os índices atuais, a alternativa é consultar `GSI1PK = SETOR#<sigla>`, ler páginas de até 1 MB e filtrar depois; isso pode gerar páginas vazias e percorrer a partição lógica para responder contagens ou “todos os resultados”. O maior setor já concentra milhares de expedientes e o requisito exige a mesma arquitetura com 10× o volume e listagem em 800 ms p95 (`requirements.md:863-870`).

O requisito deve escolher uma estratégia compatível com os serviços permitidos e definir semântica de paginação, total de resultados, plano de medição e custo. As opções incluem projeções normalizadas e índices adicionais, serviço de busca serverless ou limites explícitos.

## Massa de 10× não pode ser produzida pelo gerador indicado

**Confirmado:** o Requisito 31 determina teste com 10 vezes o volume “gerado pelo `gerar_seed.py`”, mas o script só aceita `--saida`, `--data-referencia`, `--carregar`, `--criar-tabela`, `--tabela` e `--regiao` (`gerar_seed.py:1099-1105`). Não existe fator de escala, e o Requisito 2 proíbe recriar ou editar os arquivos de seed existentes.

O critério deve indicar um gerador de carga separado que preserve distribuições e domínios sem modificar a base oficial, ou autorizar um novo parâmetro que escreva em diretório temporário e jamais substitua `saida/`. Também deve definir se 10× vale por entidade, por setor ou apenas para expedientes e dependentes.

## “Auditoria imutável” ainda não é verificável

**Confirmado:** o Requisito 25 exige trilha imutável para escritas, exportações e negações (`requirements.md:746`), mas as 19 entidades do seed não incluem auditoria, e `acoes_lote` cobre apenas lotes. Não estão definidos destino, esquema, retenção, acesso, resistência a alteração, correlação nem critério de teste. CloudWatch Logs e itens comuns do DynamoDB não se tornam imutáveis apenas por serem append-only na aplicação.

O requisito deve escolher mecanismo e proteção — por exemplo, eventos assinados enviados a S3 com Object Lock em modo apropriado — e definir campos mínimos, retenção, role somente de escrita e teste que comprove que a aplicação não altera nem apaga registros. Isso precisa ser reconciliado com a destruição integral ao fim do evento e com a retenção de 30 dias dos logs operacionais.

</details>

<details>
<summary>File map</summary>

- `.kiro/specs/hackathon-expedientes/requirements.md` — documento avaliado, incluindo requisitos funcionais, não funcionais e matrizes de rastreabilidade.
- `resources/hackathon-expedientes/seed/gerar_seed.py` — fonte das regras, domínios, cardinalidades e chaves da tabela única.
- `resources/hackathon-expedientes/seed/saida/csv/*.csv` — cabeçalhos e contagens das 19 entidades; amostras usadas para conferir valores e relações.
- `resources/hackathon-expedientes/seed/saida/dynamodb/itens.json` — 49.108 itens conferidos contra a soma dos CSVs e usados para validar os access patterns materializados.

Documento de referência completo: `.kiro/specs/hackathon-expedientes/requirements.md`. Esta revisão não altera a spec e não executa suites de build ou teste.

</details>
