# Parecer de Cobertura — requirements.md da spec hackathon-expedientes

> Banca · Fase 1 (Requisitos) · Foco A: aderência aos critérios de avaliação e ao caso de uso / cobertura completa
> Documento revisado: `.kiro/specs/hackathon-expedientes/requirements.md`
> Data da revisão: 07/10/2026

O documento de requisitos cobre, de ponta a ponta, as quatro fontes exigidas: os seis critérios de avaliação do HTML
(32 itens avaliados), os 19 requisitos funcionais (RF01–RF19) e os requisitos não funcionais das instruções, as dez
funcionalidades (F1–F10) e as sete regras de negócio (RN1–RN7) do caso de uso, e o dicionário de dados e o modelo
DynamoDB do README. Cada requisito traz User Story no formato "Como… quero… para que…" e critérios de aceitação em
notação EARS em português. Há três matrizes de rastreabilidade (fontes → requisitos, critérios de avaliação →
requisitos, e resumo de prioridades) que tornam a verificação de cobertura direta e auditável. O formato Kiro
(Introdução + requisitos numerados com User Story e critérios de aceitação EARS) está respeitado.

**Watch for:** o PDF `caso-de-uso-hackathon.pdf` não foi lido na elaboração e usou-se a versão markdown equivalente
(confirmado, não bloqueante — documentado na própria spec); alguns critérios de aceitação usam "A equipe DEVE" em vez
de "O sistema DEVE", um desvio leve do EARS clássico que mistura requisito de processo com requisito de sistema
(confirmado, não bloqueante); o critério 4 do HTML cita "Verified Permissions" e o critério 2 cita "Step Functions" e
"SNS/SQS", nem todos nomeados explicitamente (confirmado, não bloqueante).

**Verdict**: APPROVED

## Visão geral

A cobertura dos critérios de avaliação é completa e explícita: a "Matriz de cobertura dos critérios de avaliação"
mapeia os 32 itens dos seis critérios do HTML a um ou mais requisitos, e a contagem bate (5+6+5+6+5+5 = 32). Nenhum
item avaliado ficou órfão.

A cobertura do caso de uso também é completa: F1–F10 e RN1–RN7 têm requisitos correspondentes, inclusive as regras de
cálculo (RN1 situação do prazo, RN2 pontuação e faixas, RN3 fila) replicadas fielmente a partir do README e das
instruções, com os valores de pontuação idênticos (vencido 50, hoje 45, crítico 35, atenção 20, no prazo 5; urgente
+30; nova intimação +10; parado >30 dias +10; aguardando assinatura +5; metade para enviado-não-recebido). O resultado
esperado da demonstração está consolidado no Requisito 35.

Todos os RF01–RF19 estão cobertos (Req 3–21, com RF13→Req 13 fora da ordem numérica mas rastreado na matriz). Os RNF
das instruções — acessibilidade, responsividade, segurança, privacidade e testes — viram requisitos de primeira classe
(Req 24–28, 33), e a arquitetura sugerida vira o Requisito 29. A spec vai além do mínimo com observabilidade (30),
performance (31), custo (32), engenharia com Kiro (34), demo/pitch (35) e viabilidade/reuso (36), o que endereça
diretamente os critérios 5 e 6 da banca.

As decisões próprias da equipe para lacunas das fontes estão marcadas como "Definido nesta spec" e consolidadas numa
tabela (D1–D11), o que facilita a validação no board e evita que a banca confunda invenção com fonte.

As ressalvas são todas não bloqueantes: equivalência PDF↔markdown a confirmar antes da banca; uso ocasional de "A
equipe DEVE" nos requisitos de processo; e serviços citados nos critérios do HTML (Verified Permissions, Step
Functions, SNS) que poderiam ser nomeados para maximizar a pontuação de arquitetura e segurança.

<details>
<summary>Issues (4)</summary>

1. **Equivalência do PDF não confirmada** — o PDF `caso-de-uso-hackathon.pdf` não foi lido; a spec usou o markdown
   equivalente e documentou isso. Confirmar a equivalência antes da apresentação para eliminar o risco de divergência
   que a própria spec admite. Não bloqueante.
2. **"A equipe DEVE" em critérios de aceitação** — Req 2.7, 32.2, 34, 35 e 36 usam "A equipe DEVE" (requisito de
   processo) em vez de "O sistema DEVE". É um desvio leve do EARS de sistema; considerar separar requisitos de
   processo ou rotulá-los como tal para manter o padrão EARS homogêneo. Não bloqueante.
3. **Serviços do critério de arquitetura não nomeados** — o critério 2 do HTML cita Step Functions e SNS/SQS; a spec
   cobre Step Functions (Req 29.4) e SQS/DLQ, mas não cita SNS. Opcionalmente mencionar SNS onde fizer sentido para
   fechar o item avaliado. Não bloqueante.
4. **Verified Permissions não citado** — o critério 4 do HTML cita "Verified Permissions"; a spec descreve um PDP
   único com políticas declarativas (Req 24.2), que é conceitualmente equivalente. Nomear Cedar/Verified Permissions
   como opção de implementação reforçaria a aderência ao item avaliado. Não bloqueante.

</details>

<details>
<summary>Detalhes</summary>

### Cobertura dos 32 itens de avaliação do HTML

O HTML define seis critérios (0–10 cada) com, respectivamente, 5, 6, 5, 6, 5 e 5 itens avaliados, totalizando 32. A
"Matriz de cobertura dos critérios de avaliação" lista exatamente esses 32 itens e aponta requisitos para cada um. A
verificação item a item confirma que não há órfãos:

- Critério 1 (Atendimento aos Requisitos): cobertura de funcionalidades → Req 3–21; fluxo ponta a ponta → 1, 20, 5, 13,
  14, 15, 35; entradas e saídas → 2, 12, 23; qualidade do output → 19, 20, 22, 23; uso dos dados sintéticos → 2, 33.
- Critério 2 (Arquitetura AWS): serverless → 29; orientada a eventos → 17, 18, 29; serviços gerenciados → 1, 18, 22,
  29, 30; IaC → 29, 36; desacoplamento → 29, 36; Bedrock → 22.
- Critério 3 (Inovação): abordagem diferenciada → 8, 10, 11, 16, 22; combinação AWS+Kiro → 22, 29, 34; specs/hooks/
  steering → 34; UX/UI → 7, 9, 11, 20, 21, 27, 28; features extras → 10, 12, 16, 22, 23.
- Critério 4 (Segurança): auth → 1, 24; menor privilégio IAM → 24; validação de inputs → 5, 22, 23, 25; dados fora de
  logs → 24, 26, 30; HTTPS/criptografia → 25; LGPD → 19, 26.
- Critério 5 (Apresentação): estrutura do pitch, demo, clareza, tempo e Q&A → 35 (e 2, 33, 34).
- Critério 6 (Viabilidade): caminho para produção → 36; escala → 29, 31; custo → 32; reuso → 36; manutenibilidade →
  29, 33, 34.

O detalhe que impressiona a banca é que o Bedrock (critério 2) e as features extras (critério 3), que não vêm das
instruções, foram incorporados como Requisito 22 com guardrails, limite de invocações e proibição de enviar conteúdo
sigiloso ao modelo — ou seja, inovação sem abrir buraco de segurança/LGPD.

### Cobertura dos RF01–RF19 e dos RNF das instruções

Os 19 RFs estão todos presentes e fiéis ao enunciado das instruções. A única inversão de ordem é RF13→Requisito 13 (o
histórico vem antes de RF11/RF12 nos números de requisito), mas a matriz rastreia corretamente e a spec justifica a
mudança de prioridade (F5 é Essencial no caso de uso, enquanto RF13 é Desejável nas instruções; a divergência é
resolvida de forma explícita). Os filtros do RF03 (Req 5.2) incluem toda a lista do enunciado — gerenciador, situação,
statusPrazo, prioridade, responsável, assunto, classe, tema, marcador, períodos de chegada e prazo, tempo parado e as
sinalizações urgente/réu preso/idoso/nova intimação/sigiloso/favorito. Os widgets do RF18 (Req 20) batem com o
enunciado (contadores de todos os gerenciadores, próximos prazos, alertas não lidos, próximo expediente, informes).

Os RNF das instruções são tratados como requisitos de primeira classe: acessibilidade eMAG/WCAG (Req 27, incluindo
`caption`/`th id`/`td headers`, `aria-live`, `role="alert"`, contraste, nada só por cor, zoom 200%/reflow 320px),
responsividade (Req 28), segurança com autorização no backend e sem acesso anônimo (Req 24, 25), privacidade/LGPD com
não vazamento de sigiloso em exportações/e-mail/.ics/IA (Req 26) e testes unitários das regras e de API (Req 33). A
regra das instruções de "começar pelo spec do Kiro" e "só base sintética, sem credenciais" aparece em Req 2, 25, 26 e
34.

### Cobertura das funcionalidades F1–F10 e das regras RN1–RN7 do caso de uso

As dez funcionalidades têm requisito correspondente (F1→3/4/5, F2→5, F3→8/9, F4→20, F5→13, F6→14/15, F7→16, F8→6/7,
F9→11, F10→19). As sete regras de negócio estão modeladas com precisão: RN1 (faixas de dias restantes → statusPrazo) em
Req 9.1; RN2 (soma de pontos e faixas) em Req 8.2 com os pontos idênticos à fonte; RN3 (fila por prazo e, no empate,
pontuação) em Req 8.1/8.6 e materializada no GSI2; RN4 (caixa de origem por ação) na tabela de elegibilidade do Req 14;
RN5 (não arquivar com minuta pendente) em Req 14; RN6 (acesso por setor e sigilo, servidor só vê sigiloso se
responsável) em Req 13.7/13.8 e Req 24.4; RN7 (baixados só nos indicadores, fora do painel e dos contadores) em Req
3.1, 4.5 e 19.4. As regras aparecem ainda nos critérios de teste do Req 33, o que fecha o ciclo de verificabilidade.

A spec também incorpora corretamente os fatos da base sintética do README (data de referência 07/10/2026 17h; 4.109
expedientes, 76 judiciais/56 ativos; 49.108 itens; dois setores GABSUB3-DVT e CIVINT/STIC; 14 usuários; chaves PK/SK e
índices GSI1/GSI2), e a fórmula de risco `min(100, 20 × (tempoParadoDias + 1) ÷ (diasRestantes + 1))` só para prazos
não vencidos (Req 10.1). Isso ancora os requisitos em dados reais do kit e evita suposições.

### Formato Kiro e qualidade EARS

O documento segue o formato Kiro: Introdução com contexto, escopo e fora de escopo; glossário; requisitos numerados
agrupados em blocos (A–I); cada requisito com Prioridade, Origem, User Story e critérios de aceitação numerados. A
notação EARS está declarada nas convenções e aplicada: ubíquo ("O sistema DEVE…"), evento ("QUANDO…, ENTÃO o sistema
DEVE…"), estado ("ENQUANTO…, o sistema DEVE…"), comportamento indesejado ("SE…, ENTÃO o sistema DEVE…") e opcional
("ONDE…, o sistema DEVE…"). As User Stories têm as três partes.

O único ponto de atenção de forma: parte dos critérios de aceitação de requisitos de processo (Req 2.7, 32.2, 34, 35,
36) usa "A equipe DEVE" em vez de "O sistema DEVE". Isso é correto do ponto de vista semântico — são ações da equipe,
não comportamento de software — mas foge do EARS clássico, que descreve o sistema. Não compromete a cobertura nem a
clareza; vale, se o board quiser rigor, rotular esses como requisitos de processo/entrega para manter o conjunto EARS
homogêneo.

### Priorização e tratamento de divergências entre fontes

A spec mapeia a tabela "Escopo sugerido para o dia" das instruções (Essencial/Desejável/Se sobrar tempo) a cada
requisito e registra, de forma transparente, as divergências de prioridade entre fontes: RF13×F5, RF11/RF12×demo
esperada, RF14×F7 e RF17×F10. Em cada caso há uma decisão explícita e justificada, o que é exatamente o que a banca
espera ver num processo de requisitos maduro e evita que uma escolha de prioridade pareça arbitrária.

### Lacuna documentada: o PDF do caso de uso

A spec declara que `resources/caso-de-uso-hackathon.pdf` não pôde ser lido na elaboração (fontes embutidas, sem
extrator disponível) e que foi usada a versão markdown equivalente, com a ressalva de que, havendo divergência, o PDF
prevalece. Esta revisão foi conduzida contra as fontes textuais indicadas (HTML, caso-de-uso.md, instrucoes.md,
README.md), portanto a equivalência PDF↔markdown não entra no escopo de cobertura aqui. Ainda assim, por ser a única
fonte não verificada diretamente, convém confirmar a equivalência antes da banca para eliminar o risco que a própria
spec admite. Não é bloqueante para a aprovação da cobertura.

</details>

<details>
<summary>Mapa do documento revisado</summary>

- `.kiro/specs/hackathon-expedientes/requirements.md` — Introdução, fontes, convenções, glossário, 36 requisitos
  (blocos A–I), matriz de rastreabilidade das fontes, matriz de cobertura dos critérios de avaliação, resumo de
  prioridades, tabela de divergências e tabela de decisões (D1–D11).

Fontes conferidas: `resources/criterios-avaliacao-hackathon.html`,
`resources/hackathon-expedientes/caso-de-uso-hackathon.md`, `resources/hackathon-expedientes/instrucoes-hackathon.md`,
`resources/hackathon-expedientes/README.md`.

</details>
