import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  ApiExpedientesService,
  correlationIdDoErro,
  statusDoErro,
  type RespostaDetalhe,
} from '../../core/api-expedientes.service';
import {
  classeSituacaoPrazo,
  formatarData,
  rotuloPrioridade,
  rotuloSituacaoPrazo,
  texto,
  textoDiasRestantes,
  tomSituacaoPrazo,
} from '../../core/formatos';
import { ResumoIa } from './resumo-ia';

type Estado = 'carregando' | 'pronto' | 'nao-encontrado' | 'erro';

/** Campos principais exibidos na lista de definição (rótulo → coluna do CSV). */
const CAMPOS_PRINCIPAIS: readonly { rotulo: string; campo: string; data?: boolean }[] = [
  { rotulo: 'Etiqueta', campo: 'etiqueta' },
  { rotulo: 'Gerenciador', campo: 'gerenciador' },
  { rotulo: 'Classe', campo: 'descricaoClasse' },
  { rotulo: 'Tema', campo: 'tema' },
  { rotulo: 'Assunto', campo: 'assunto' },
  { rotulo: 'Resumo', campo: 'resumo' },
  { rotulo: 'Órgão de origem', campo: 'orgaoOrigem' },
  { rotulo: 'Caixa', campo: 'caixa' },
  { rotulo: 'Situação', campo: 'situacao' },
  { rotulo: 'Ação pendente', campo: 'acaoPendente' },
  { rotulo: 'Responsável', campo: 'nomeResponsavel' },
  { rotulo: 'Ofício', campo: 'oficioResponsavel' },
  { rotulo: 'Data de chegada', campo: 'dataChegada', data: true },
  { rotulo: 'Última movimentação', campo: 'dataUltimaMovimentacao', data: true },
];

/** Detalhe do expediente com prazos, designações e histórico (Req. 13). */
@Component({
  selector: 'app-detalhe',
  imports: [RouterLink, ResumoIa],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .voltar { display: inline-flex; gap: 6px; margin-bottom: 12px; font-size: 0.875rem; font-weight: 600; text-decoration: none; }
    .cab { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 12px 20px; margin-bottom: 20px; }
    .cab > div { flex: 1 1 420px; }
    .grade { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr); gap: 20px; align-items: start; }
    .bloco { padding: 20px 22px; margin-bottom: 20px; }
    .bloco > h2 { margin: 0 0 14px; }
    .dados { margin: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px 24px; }
    .dados dt { font-size: 0.75rem; font-weight: 400; color: var(--u-tinta-3); }
    .dados dd { margin: 2px 0 0; font-size: 0.875rem; font-weight: 500; }
    .dados .largo { grid-column: 1 / -1; }
    .prazo-destaque { border-radius: 14px; padding: 18px; background: var(--u-azul-sel); margin-bottom: 20px; }
    .prazo-destaque .grande { font-family: var(--u-serif); font-size: 2rem; font-weight: 500; line-height: 1.1; margin: 6px 0; }
    .historico { margin: 0; padding: 0; list-style: none; position: relative; }
    .historico li { display: grid; grid-template-columns: 128px 14px minmax(0, 1fr); gap: 10px; padding-bottom: 16px; font-size: 0.875rem; }
    .historico time { font-family: var(--u-mono); font-size: 0.75rem; color: var(--u-tinta-3); padding-top: 2px; }
    .historico .no { width: 9px; height: 9px; margin-top: 6px; border-radius: 50%; background: #b9c3da; box-shadow: 0 0 0 3px #fff; }
    .historico li:last-child .no { background: var(--u-azul); }
    .historico .meta { font-size: 0.75rem; color: var(--u-tinta-3); }
    .lista-simples { margin: 0; padding: 0; list-style: none; }
    .lista-simples li { padding: 10px 0; border-bottom: 1px solid var(--u-linha-fraca); font-size: 0.875rem; }
    .lista-simples li:last-child { border-bottom: 0; }
    table { font-size: 0.8125rem; }
    @media (max-width: 991.98px) { .grade { grid-template-columns: 1fr; } }
    @media (max-width: 575.98px) { .dados { grid-template-columns: 1fr; } .historico li { grid-template-columns: 1fr; gap: 2px; } .historico .no { display: none; } }
  `,
  template: `
    <a class="voltar" routerLink="/painel">← Voltar ao painel</a>

    @switch (estado()) {
      @case ('carregando') {
        <h1 class="u-manchete">Detalhe do expediente</h1>
        <p aria-live="polite" class="mt-3">Carregando expediente…</p>
      }
      @case ('nao-encontrado') {
        <h1 class="u-manchete">Detalhe do expediente</h1>
        <div class="alert alert-warning mt-3" role="alert">Expediente não encontrado.</div>
      }
      @case ('erro') {
        <h1 class="u-manchete">Detalhe do expediente</h1>
        <div class="alert alert-danger mt-3" role="alert">
          Não foi possível carregar o expediente.
          @if (correlationId()) {
            <span>Código para suporte: {{ correlationId() }}.</span>
          }
          <button type="button" class="btn btn-sm btn-outline-danger ms-2" (click)="carregar(id())">Tentar novamente</button>
        </div>
      }
      @case ('pronto') {
        @if (dados(); as d) {
          <div class="cab">
            <div>
              <p class="u-sobretitulo u-mono mb-1">
                {{ texto(d.expediente['etiqueta']) }}
                @if (sigiloso()) {
                  <span class="u-chip u-chip-sigilo ms-1">Restrito</span>
                }
                @if (d.expediente['urgente'] === true) {
                  <span class="u-chip u-chip-urgente ms-1">Urgente</span>
                }
              </p>
              <h1 class="u-manchete">
                {{ texto(d.expediente['numeroReferencia'] ?? d.expediente.idExpediente) }}
                <span class="badge align-middle {{ classeSituacao(d.expediente['statusPrazo']) }}">
                  {{ rotuloSituacao(d.expediente['statusPrazo']) }}
                </span>
              </h1>
              <p class="mt-2 mb-0 fs-6">{{ texto(d.expediente['assunto']) }}</p>
            </div>
          </div>

          <div class="grade">
            <div>
              <section aria-labelledby="titulo-dados" class="u-cartao bloco">
                <h2 id="titulo-dados" class="u-rotulo-secao">Dados principais</h2>
                <dl class="dados">
                  @for (c of campos; track c.campo) {
                    <div [class.largo]="c.campo === 'resumo'">
                      <dt>{{ c.rotulo }}</dt>
                      <dd>{{ c.data ? data(d.expediente[c.campo]) : texto(d.expediente[c.campo]) }}</dd>
                    </div>
                  }
                  <div>
                    <dt>Prazo</dt>
                    <dd>{{ data(d.expediente['dataPrazo']) }} {{ dias(d.expediente['diasRestantes']) }}</dd>
                  </div>
                  <div>
                    <dt>Prioridade</dt>
                    <dd>{{ prioridade(d.expediente['prioridade']) }}</dd>
                  </div>
                </dl>
              </section>

              <section aria-labelledby="titulo-historico" class="u-cartao bloco">
                <h2 id="titulo-historico" class="u-rotulo-secao">Histórico de movimentações</h2>
                @if (historico().length === 0) {
                  <p class="mb-0">Nenhuma movimentação disponível.</p>
                } @else {
                  <ol class="historico">
                    @for (m of historico(); track m['idMovimentacao']) {
                      <li>
                        <time [attr.datetime]="m['dataHora']">{{ data(m['dataHora']) }}</time>
                        <span class="no" aria-hidden="true"></span>
                        <div>
                          <strong>{{ texto(m['tipoMovimentacao']) }}</strong> — {{ texto(m['descricao']) }}
                          <div class="meta">
                            {{ texto(m['nomeUsuario']) }} · {{ texto(m['setorOrigem']) }} → {{ texto(m['setorDestino']) }}
                          </div>
                        </div>
                      </li>
                    }
                  </ol>
                }
              </section>
            </div>

            <div>
              <app-resumo-ia [idExpediente]="d.expediente.idExpediente" />

              <div class="prazo-destaque {{ tom(d.expediente['statusPrazo']) }}">
                <span class="u-rotulo-secao" style="color: var(--u-azul)">Prazo</span>
                <p class="grande">{{ data(d.expediente['dataPrazo']) }}</p>
                <span class="badge {{ classeSituacao(d.expediente['statusPrazo']) }}">{{ dias(d.expediente['diasRestantes']) || rotuloSituacao(d.expediente['statusPrazo']) }}</span>
                @if (d.expediente['acaoPendente']) {
                  <p class="mt-3 mb-0"><strong>Próximo passo:</strong> {{ texto(d.expediente['acaoPendente']) }}</p>
                }
              </div>

              <section aria-labelledby="titulo-prazos" class="u-cartao bloco">
                <h2 id="titulo-prazos" class="u-rotulo-secao">Prazos</h2>
                @if (d.prazos.length === 0) {
                  <p class="mb-0">Nenhum prazo registrado.</p>
                } @else {
                  <div class="table-responsive">
                    <table class="table table-sm mb-0">
                      <caption class="visually-hidden">Prazos do expediente</caption>
                      <thead>
                        <tr>
                          <th scope="col">Tipo</th>
                          <th scope="col">Início</th>
                          <th scope="col">Prazo</th>
                          <th scope="col">Situação</th>
                          <th scope="col">Encerramento</th>
                        </tr>
                      </thead>
                      <tbody>
                        @for (p of d.prazos; track p['idPrazo']) {
                          <tr>
                            <td>{{ texto(p['tipoPrazo']) }}</td>
                            <td>{{ data(p['dataInicio']) }}</td>
                            <td>{{ data(p['dataPrazo']) }}</td>
                            <td>{{ texto(p['situacao']) }}</td>
                            <td>{{ data(p['dataEncerramento']) }}</td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  </div>
                }
              </section>

              <section aria-labelledby="titulo-designacoes" class="u-cartao bloco">
                <h2 id="titulo-designacoes" class="u-rotulo-secao">Designações</h2>
                @if (d.designacoes.length === 0) {
                  <p class="mb-0">Nenhuma designação.</p>
                } @else {
                  <ul class="lista-simples">
                    @for (g of d.designacoes; track g['idDesignacao']) {
                      <li>
                        <strong>{{ texto(g['nomeDesignado']) }}</strong>, designado por {{ texto(g['nomeDesignador']) }} em
                        {{ data(g['dataDesignacao']) }}; devolução até {{ data(g['prazoDevolucao']) }}
                        ({{ texto(g['situacao']) }})
                      </li>
                    }
                  </ul>
                }
              </section>
            </div>
          </div>
        }
      }
    }
  `,
})
export class DetalhePagina {
  private readonly api = inject(ApiExpedientesService);

  /** Parâmetro de rota `:id`. */
  readonly id = input.required<string>();

  protected readonly campos = CAMPOS_PRINCIPAIS;
  protected readonly estado = signal<Estado>('carregando');
  protected readonly dados = signal<RespostaDetalhe | null>(null);
  protected readonly correlationId = signal<string | null>(null);
  /** Ordem cronológica (a API já ordena; reforçado aqui por `dataHora`). */
  protected readonly historico = computed(() =>
    [...(this.dados()?.movimentacoes ?? [])].sort((a, b) =>
      String(a['dataHora'] ?? '').localeCompare(String(b['dataHora'] ?? '')),
    ),
  );

  protected readonly texto = texto;
  protected readonly data = formatarData;
  protected readonly dias = textoDiasRestantes;
  protected readonly prioridade = rotuloPrioridade;
  protected readonly rotuloSituacao = rotuloSituacaoPrazo;
  protected readonly classeSituacao = classeSituacaoPrazo;
  protected readonly tom = tomSituacaoPrazo;
  protected readonly sigiloso = computed(() => Number(this.dados()?.expediente['nivelSigilo'] ?? 0) > 0);

  private geracao = 0;

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => void this.carregar(id));
    });
  }

  protected async carregar(id: string): Promise<void> {
    const geracao = ++this.geracao;
    this.estado.set('carregando');
    this.correlationId.set(null);
    try {
      const dados = await this.api.detalhe(id);
      if (geracao !== this.geracao) return;
      this.dados.set(dados);
      this.estado.set('pronto');
    } catch (e) {
      if (geracao !== this.geracao) return;
      this.dados.set(null);
      this.estado.set(statusDoErro(e) === 404 ? 'nao-encontrado' : 'erro');
      this.correlationId.set(correlationIdDoErro(e));
    }
  }
}
