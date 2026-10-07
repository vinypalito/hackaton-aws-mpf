import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiExpedientesService, type Contador, type Expediente, type RespostaHome } from '../../core/api-expedientes.service';
import {
  CAIXAS,
  NOME_GERENCIADOR,
  classeSituacaoPrazo,
  formatarData,
  iniciais,
  rotuloPrioridade,
  rotuloSituacaoPrazo,
  texto,
  textoDiasRestantes,
  tomSituacaoPrazo,
} from '../../core/formatos';
import { ContextoUsuarioService } from '../../usuario/contexto-usuario.service';

interface Grupo {
  readonly id: string;
  readonly titulo: string;
  readonly nota: string;
  readonly tom: string;
  readonly itens: Expediente[];
}

/** Sinais de risco exibidos abaixo das caixas (campos do item `CONT#`). */
const SINAIS: readonly { campo: string; rotulo: string; nota: string; tom?: 'alerta' | 'atencao' }[] = [
  { campo: 'urgentes', rotulo: 'Urgentes', nota: 'marcados como urgentes', tom: 'alerta' },
  { campo: 'prioridadeCritica', rotulo: 'Prioridade crítica', nota: 'pontuação ≥ 60', tom: 'alerta' },
  { campo: 'parados30dias', rotulo: 'Parados há +30 dias', nota: 'sem movimentação', tom: 'atencao' },
  { campo: 'novos24h', rotulo: 'Novos em 24 h', nota: 'chegaram desde ontem' },
];

const DIAS_SEMANA = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

/**
 * Início em formato "mesa de foco" (Req. 20): manchete com o estado do dia,
 * caixas, sinais de risco, fila de prazos agrupada com painel de leitura,
 * alertas e informes. Cada widget trata o próprio erro (Req. 20.8).
 */
@Component({
  selector: 'app-inicio',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .topo { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 16px; margin-bottom: 20px; }
    .topo > div { flex: 1 1 420px; }
    .cta { display: inline-flex; align-items: center; gap: 8px; min-height: 40px; padding: 0 16px; border-radius: 10px;
      background: var(--u-azul); color: #fff; font-weight: 600; text-decoration: none; }
    .cta:hover { background: var(--u-azul-escuro); color: #fff; }
    .caixas { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; margin: 0 0 14px; padding: 0; list-style: none; }
    .cartao-contador { padding: 16px 18px; height: 100%; display: flex; flex-direction: column; gap: 4px; }
    .cartao-contador h3 { margin: 0; font-size: 0.8125rem; font-weight: 500; color: #3f4450; }
    .numero { font-family: var(--u-serif); font-size: 2.5rem; font-weight: 500; line-height: 1.05; margin: 0; }
    .quebra { display: flex; flex-wrap: wrap; gap: 4px 12px; margin: 0; padding: 0; list-style: none; font-size: 0.75rem; color: var(--u-tinta-3); }
    .quebra b { font-family: var(--u-mono); font-weight: 500; color: var(--u-tinta); }
    .cartao-contador a { margin-top: auto; padding-top: 6px; font-size: 0.8125rem; font-weight: 600; }
    .sinais { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; margin: 0 0 20px; padding: 0; list-style: none; }
    .sinal { padding: 12px 16px; display: flex; align-items: baseline; gap: 10px; }
    .sinal .valor { font-family: var(--u-mono); font-size: 1.375rem; font-weight: 500; }
    .sinal .valor.alerta { color: var(--u-vermelho); }
    .sinal .valor.atencao { color: var(--u-ambar); }
    .sinal .rotulo { font-size: 0.8125rem; font-weight: 600; }
    .sinal .nota { display: block; font-size: 0.75rem; color: var(--u-tinta-3); }
    .mesa { display: grid; grid-template-columns: minmax(0, 1.55fr) minmax(0, 1fr); gap: 20px; align-items: start; }
    .grupos { display: flex; flex-direction: column; gap: 14px; }
    .grupo { overflow: hidden; }
    .grupo ul { margin: 0; padding: 0; list-style: none; }
    .linha { width: 100%; display: grid; grid-template-columns: 4px minmax(0, 1fr) auto 28px; align-items: center; column-gap: 14px;
      min-height: 58px; padding: 6px 16px 6px 0; border: 0; border-bottom: 1px solid var(--u-linha-fraca); background: #fff; text-align: left; color: inherit; }
    .linha:hover { background: #fafaf7; }
    .linha[aria-pressed='true'] { background: var(--u-azul-sel); }
    .linha .barra { align-self: stretch; background: transparent; }
    .linha[aria-pressed='true'] .barra { background: var(--u-azul); }
    .linha .id { font-family: var(--u-mono); font-size: 0.75rem; color: var(--u-tinta-3); display: flex; gap: 6px; align-items: center; }
    .linha .assunto { display: block; font-size: 0.875rem; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .leitura { position: sticky; top: 16px; padding: 24px; display: flex; flex-direction: column; gap: 16px; }
    .leitura h2 { margin: 6px 0 10px; font-family: var(--u-serif); font-weight: 500; font-size: 1.5rem; line-height: 1.2; }
    .leitura dl { margin: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 20px; font-size: 0.8125rem; }
    .leitura dt { color: var(--u-tinta-3); font-size: 0.75rem; font-weight: 400; }
    .leitura dd { margin: 2px 0 0; font-weight: 500; }
    .resumo { font-size: 0.8125rem; color: var(--u-tinta-2); padding: 10px 12px; border-radius: 10px; background: var(--u-papel); margin: 0; }
    .passo { border-radius: 14px; background: var(--u-azul-sel); padding: 16px; display: flex; flex-direction: column; gap: 6px; }
    .passo .u-rotulo-secao { color: var(--u-azul); font-size: 0.75rem; }
    .passo strong { font-size: 1rem; }
    .rodape { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; margin-top: 20px; }
    .lista-simples { margin: 0; padding: 0; list-style: none; }
    .lista-simples li { padding: 12px 16px; border-bottom: 1px solid var(--u-linha-fraca); font-size: 0.875rem; }
    .lista-simples li:last-child { border-bottom: 0; }
    .lista-simples .meta { font-size: 0.75rem; color: var(--u-tinta-3); }
    .vazio { padding: 16px; margin: 0; color: var(--u-tinta-3); font-size: 0.875rem; }
    @media (max-width: 1199.98px) { .mesa { grid-template-columns: 1fr; } .leitura { position: static; } .sinais { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 767.98px) { .caixas, .rodape { grid-template-columns: 1fr; } .linha { grid-template-columns: 4px minmax(0, 1fr) auto; } .linha .u-avatar { display: none; } }
  `,
  template: `
    <div class="topo">
      <div>
        <p class="u-sobretitulo mb-1">{{ hoje() }}{{ contexto()?.siglaSetor ? ' · ' + contexto()?.siglaSetor : '' }}</p>
        <h1 class="u-manchete">
          @if (todos(); as t) {
            O gabinete hoje: <span class="u-alerta">{{ t['vencidos'] ?? 0 }} vencidos</span>, {{ t['venceHoje'] ?? 0 }} vencem hoje e
            <em>{{ t['criticos'] ?? 0 }} em até 3 dias</em>
          } @else {
            Início
          }
        </h1>
        @if (contexto(); as usuario) {
          <p class="u-sobretitulo mt-2 mb-0">Olá, {{ usuario.nome ?? 'usuário' }}. Comece pelos itens em vermelho.</p>
        }
      </div>
      @if (todos(); as t) {
        <a class="cta" routerLink="/painel" [queryParams]="{ caixa: 'A_RECEBER' }">
          {{ t['aReceber'] ?? 0 }} a receber
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
        </a>
      }
    </div>

    <p class="visually-hidden" aria-live="polite">{{ carregando() ? 'Carregando a tela inicial…' : '' }}</p>

    @if (erroGeral()) {
      <div class="alert alert-danger" role="alert">
        Não foi possível carregar a tela inicial. Tente novamente em instantes.
        <button type="button" class="btn btn-sm btn-outline-danger ms-2" (click)="carregar()">Tentar novamente</button>
      </div>
    }

    <section aria-labelledby="titulo-contadores">
      <h2 id="titulo-contadores" class="visually-hidden">Contadores por caixa</h2>
      @if (carregando()) {
        <p class="u-cartao vazio">Carregando contadores…</p>
      } @else if (falhou('contadores')) {
        <p class="alert alert-warning" role="alert">Não foi possível carregar os contadores.</p>
      } @else if (dados()?.contadores; as contadores) {
        <ul class="caixas">
          @for (caixa of caixas; track caixa.valor) {
            <li>
              <div class="u-cartao cartao-contador">
                <h3>{{ caixa.rotulo }}</h3>
                <p class="numero">{{ contadores.todos?.[caixa.campoContador] ?? 0 }}</p>
                <ul class="quebra">
                  @for (g of gerenciadores(); track g) {
                    <li>{{ nomeGerenciador(g) }} <b>{{ contadores.porGerenciador[g]?.[caixa.campoContador] ?? 0 }}</b></li>
                  }
                </ul>
                <a [routerLink]="['/painel']" [queryParams]="{ caixa: caixa.valor }">Abrir a caixa {{ caixa.rotulo }} →</a>
              </div>
            </li>
          }
        </ul>
        @if (contadores.todos; as t) {
          <ul class="sinais" aria-label="Sinais de risco">
            @for (s of sinais; track s.campo) {
              <li class="u-cartao sinal">
                <span class="valor" [class.alerta]="s.tom === 'alerta'" [class.atencao]="s.tom === 'atencao'">{{ t[s.campo] ?? 0 }}</span>
                <span><span class="rotulo">{{ s.rotulo }}</span><span class="nota">{{ s.nota }}</span></span>
              </li>
            }
          </ul>
        }
      }
    </section>

    <div class="mesa">
      <section aria-labelledby="titulo-prazos" class="grupos">
        <h2 id="titulo-prazos" class="visually-hidden">Próximos prazos</h2>
        @if (carregando()) {
          <p class="u-cartao vazio">Carregando prazos…</p>
        } @else if (falhou('proximosPrazos')) {
          <p class="alert alert-warning" role="alert">Não foi possível carregar os próximos prazos.</p>
        } @else if (grupos().length === 0) {
          <p class="u-cartao vazio">Nenhum prazo próximo. Abra o painel para ver a fila completa.</p>
        } @else {
          @for (g of grupos(); track g.id) {
            <div class="u-cartao grupo">
              <div class="u-cartao-cab">
                <span class="u-ponto" [style.background]="g.tom"></span>
                <h3 class="u-rotulo-secao">{{ g.titulo }}</h3>
                <span class="u-contagem">{{ g.itens.length }}</span>
                <span class="ms-auto small text-body-secondary d-none d-md-inline">{{ g.nota }}</span>
              </div>
              <ul>
                @for (e of g.itens; track e.idExpediente) {
                  <li>
                    <button type="button" class="linha" [attr.aria-pressed]="selecionado()?.idExpediente === e.idExpediente" (click)="selecionar(e)">
                      <span class="barra" aria-hidden="true"></span>
                      <span class="d-block" style="min-width: 0">
                        <span class="id">
                          {{ texto(e['etiqueta'] ?? e.idExpediente) }}
                          @if (sigiloso(e)) {
                            <span class="u-chip u-chip-sigilo">Restrito</span>
                          }
                          @if (e['urgente'] === true) {
                            <span class="u-chip u-chip-urgente">Urgente</span>
                          }
                        </span>
                        <span class="assunto">{{ texto(e['assunto']) }}</span>
                      </span>
                      <span class="badge {{ classeSituacao(e['statusPrazo']) }}">{{ dias(e['diasRestantes']) || rotuloSituacao(e['statusPrazo']) }}</span>
                      <span class="u-avatar" [attr.title]="texto(e['nomeResponsavel'])" aria-hidden="true">{{ iniciais(e['nomeResponsavel']) }}</span>
                    </button>
                  </li>
                }
              </ul>
            </div>
          }
        }
      </section>

      @if (selecionado(); as s) {
        <aside class="u-cartao leitura" aria-label="Resumo do expediente selecionado" aria-live="polite">
          <div>
            <div class="u-mono small text-body-secondary d-flex gap-2 align-items-center">
              {{ texto(s['etiqueta']) }}
              @if (sigiloso(s)) {
                <span class="u-chip u-chip-sigilo">Restrito</span>
              }
            </div>
            <h2>
              <a [routerLink]="['/expedientes', s.idExpediente]">{{ texto(s['numeroReferencia'] ?? s.idExpediente) }}</a>
            </h2>
            <span class="badge {{ classeSituacao(s['statusPrazo']) }}">{{ rotuloSituacao(s['statusPrazo']) }}</span>
          </div>
          <dl>
            <div><dt>Assunto</dt><dd>{{ texto(s['assunto']) }}</dd></div>
            <div><dt>Origem</dt><dd>{{ texto(s['orgaoOrigem']) }}</dd></div>
            <div><dt>Prazo</dt><dd>{{ data(s['dataPrazo']) }} · {{ dias(s['diasRestantes']) || '—' }}</dd></div>
            <div><dt>Prioridade</dt><dd>{{ prioridade(s['prioridade']) }}{{ s['pontuacaoPrioridade'] !== undefined ? ' (' + s['pontuacaoPrioridade'] + ' pts)' : '' }}</dd></div>
            <div><dt>Responsável</dt><dd>{{ texto(s['nomeResponsavel']) }}</dd></div>
            <div><dt>Chegou em</dt><dd>{{ data(s['dataChegada']) }}</dd></div>
          </dl>
          @if (s['resumo']) {
            <p class="resumo">{{ texto(s['resumo']) }}</p>
          }
          <div class="passo">
            <span class="u-rotulo-secao">Próximo passo</span>
            <strong>{{ texto(s['acaoPendente']) }}</strong>
            <a class="btn btn-primary align-self-start mt-1" [routerLink]="['/expedientes', s.idExpediente]">Abrir expediente completo</a>
          </div>
        </aside>
      }
    </div>

    <div class="rodape">
      <section aria-labelledby="titulo-alertas" class="u-cartao">
        <div class="u-cartao-cab">
          <span class="u-ponto" style="background: var(--u-ambar-forte)"></span>
          <h2 id="titulo-alertas" class="u-rotulo-secao">Alertas não lidos</h2>
          @if (dados()?.alertas; as alertas) {
            <span class="u-contagem">{{ alertas.totalNaoLidas }}</span>
          }
        </div>
        @if (carregando()) {
          <p class="vazio">Carregando…</p>
        } @else if (falhou('alertas')) {
          <p class="alert alert-warning m-3" role="alert">Não foi possível carregar os alertas.</p>
        } @else if (dados()?.alertas; as alertas) {
          <p class="visually-hidden">{{ alertas.totalNaoLidas }} alerta(s) não lido(s).</p>
          @if (alertas.itens.length === 0) {
            <p class="vazio">Nenhum alerta pendente.</p>
          } @else {
            <ul class="lista-simples">
              @for (a of alertas.itens; track a['idNotificacao']) {
                <li>
                  <strong>{{ texto(a['titulo']) }}</strong>
                  <div>{{ texto(a['mensagem']) }}</div>
                  <div class="meta">
                    {{ data(a['dataHora']) }}
                    @if (a['idExpediente']) {
                      · <a [routerLink]="['/expedientes', a['idExpediente']]">Ver expediente</a>
                    }
                  </div>
                </li>
              }
            </ul>
          }
        }
      </section>

      <section aria-labelledby="titulo-informes" class="u-cartao">
        <div class="u-cartao-cab">
          <span class="u-ponto"></span>
          <h2 id="titulo-informes" class="u-rotulo-secao">Informes</h2>
        </div>
        @if (carregando()) {
          <p class="vazio">Carregando…</p>
        } @else if (falhou('informes')) {
          <p class="alert alert-warning m-3" role="alert">Não foi possível carregar os informes.</p>
        } @else if (dados()?.informes; as informes) {
          @if (informes.length === 0) {
            <p class="vazio">Nenhum informe vigente.</p>
          } @else {
            <ul class="lista-simples" aria-labelledby="titulo-informes">
              @for (n of informes; track n['idNoticia']) {
                <li>
                  <strong>{{ texto(n['titulo']) }}</strong>
                  @if (n['destaque'] === true) {
                    <span class="u-chip ms-1">Destaque</span>
                  }
                  <div class="meta">{{ texto(n['conteudo']) }}</div>
                </li>
              }
            </ul>
          }
        }
      </section>
    </div>
  `,
})
export class InicioPagina implements OnInit {
  private readonly api = inject(ApiExpedientesService);
  protected readonly contexto = inject(ContextoUsuarioService).contexto;

  protected readonly caixas = CAIXAS;
  protected readonly sinais = SINAIS;
  protected readonly carregando = signal(true);
  protected readonly erroGeral = signal(false);
  protected readonly dados = signal<RespostaHome | null>(null);
  private readonly escolhido = signal<string | null>(null);

  protected readonly gerenciadores = computed(() => Object.keys(this.dados()?.contadores?.porGerenciador ?? {}).sort());
  protected readonly todos = computed<Contador | null>(() => this.dados()?.contadores?.todos ?? null);
  protected readonly hoje = computed(() => {
    const ref = this.dados()?.dataReferencia ?? '2026-10-07T17:00:00-03:00';
    const t = DIAS_SEMANA.format(new Date(ref));
    return t.charAt(0).toLocaleUpperCase('pt-BR') + t.slice(1);
  });

  /** Fila de prazos agrupada pela urgência (RN1). */
  protected readonly grupos = computed<Grupo[]>(() => {
    const prazos = this.dados()?.proximosPrazos ?? [];
    const de = (...s: string[]) => prazos.filter((e) => s.includes(String(e['statusPrazo'])));
    const grupos: Grupo[] = [
      { id: 'ja', titulo: 'Vencidos e vencendo hoje', nota: 'resolva primeiro', tom: 'var(--u-vermelho)', itens: de('VENCIDO', 'VENCE_HOJE') },
      { id: 'curto', titulo: 'Próximos 3 dias', nota: 'prazo curto: prepare agora', tom: 'var(--u-ambar-forte)', itens: de('CRITICO') },
      { id: 'depois', titulo: 'Em seguida', nota: 'no radar, sem urgência', tom: 'var(--u-azul)', itens: de('ATENCAO', 'NO_PRAZO') },
    ];
    const conhecidos = new Set(grupos.flatMap((g) => g.itens));
    const outros = prazos.filter((e) => !conhecidos.has(e));
    if (outros.length > 0) grupos[2] = { ...grupos[2]!, itens: [...grupos[2]!.itens, ...outros] };
    return grupos.filter((g) => g.itens.length > 0);
  });

  protected readonly selecionado = computed<Expediente | null>(() => {
    const todos = this.grupos().flatMap((g) => g.itens);
    return todos.find((e) => e.idExpediente === this.escolhido()) ?? todos[0] ?? null;
  });

  protected readonly texto = texto;
  protected readonly data = formatarData;
  protected readonly dias = textoDiasRestantes;
  protected readonly prioridade = rotuloPrioridade;
  protected readonly rotuloSituacao = rotuloSituacaoPrazo;
  protected readonly classeSituacao = classeSituacaoPrazo;
  protected readonly tom = tomSituacaoPrazo;
  protected readonly iniciais = iniciais;

  ngOnInit(): void {
    void this.carregar();
  }

  async carregar(): Promise<void> {
    this.carregando.set(true);
    this.erroGeral.set(false);
    try {
      this.dados.set(await this.api.home());
    } catch {
      this.dados.set(null);
      this.erroGeral.set(true);
    } finally {
      this.carregando.set(false);
    }
  }

  protected selecionar(e: Expediente): void {
    this.escolhido.set(e.idExpediente);
  }

  protected sigiloso(e: Expediente): boolean {
    return Number(e['nivelSigilo'] ?? 0) > 0;
  }

  /** Widget com erro: listado em `widgetsComErro`, nulo na resposta ou falha geral da chamada. */
  protected falhou(widget: keyof RespostaHome): boolean {
    const d = this.dados();
    return !d || d.widgetsComErro?.includes(widget) || d[widget] === null;
  }

  protected nomeGerenciador(g: string): string {
    return NOME_GERENCIADOR[g] ?? g;
  }
}