import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import {
  ApiExpedientesService,
  correlationIdDoErro,
  statusDoErro,
  type RespostaResumo,
} from '../../core/api-expedientes.service';

type EstadoResumo = 'ocioso' | 'carregando' | 'sucesso' | 'erro';

/** Cartão "Resumo com IA" do detalhe: pede ao backend um resumo gerado pelo Amazon Bedrock. */
@Component({
  selector: 'app-resumo-ia',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="u-cartao resumo-ia" aria-labelledby="titulo-resumo-ia" [attr.aria-busy]="estado() === 'carregando'">
      <div>
        <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
          <h2 id="titulo-resumo-ia" class="u-rotulo-secao d-flex align-items-center gap-2">
            <svg class="brilho" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path
                fill="currentColor"
                d="M12 2l1.9 5.6L19.5 9.5l-5.6 1.9L12 17l-1.9-5.6L4.5 9.5l5.6-1.9L12 2zm7 11l.9 2.6 2.6.9-2.6.9L19 20l-.9-2.6-2.6-.9 2.6-.9L19 13zM5 15l.7 1.8 1.8.7-1.8.7L5 20l-.7-1.8-1.8-.7 1.8-.7L5 15z"
              />
            </svg>
            Resumo com IA
          </h2>
          @if (estado() !== 'sucesso') {
            <button
              type="button"
              class="btn btn-primary btn-sm d-inline-flex align-items-center gap-2"
              [disabled]="estado() === 'carregando'"
              (click)="gerar()"
            >
              @if (estado() === 'carregando') {
                <span class="spinner-border spinner-border-sm" aria-hidden="true"></span>
                Gerando resumo…
              } @else {
                <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path fill="currentColor" d="M12 2l1.9 5.6L19.5 9.5l-5.6 1.9L12 17l-1.9-5.6L4.5 9.5l5.6-1.9L12 2z" />
                </svg>
                Resumir com IA
              }
            </button>
          }
        </div>

        <div aria-live="polite">
          @switch (estado()) {
            @case ('ocioso') {
              <p class="text-body-secondary small mb-0">
                Gere um resumo curto do expediente e a próxima ação recomendada.
              </p>
            }
            @case ('sucesso') {
              @if (resultado(); as r) {
                <div class="resumo-ia__texto">
                  <p class="mb-2">{{ r.resumo }}</p>
                  <div class="d-flex flex-wrap align-items-center justify-content-between gap-2">
                    <small class="text-body-secondary">Gerado por IA (Amazon Nova Lite) — confira antes de usar</small>
                    <button type="button" class="btn btn-outline-primary btn-sm" (click)="gerar()">Gerar novamente</button>
                  </div>
                </div>
              }
            }
            @case ('erro') {
              <div class="alert alert-danger mb-0" role="alert">
                {{ mensagemErro() }}
                @if (correlationId()) {
                  <span class="d-block small">Código para suporte: {{ correlationId() }}.</span>
                }
              </div>
            }
          }
        </div>
      </div>
    </section>
  `,
  styles: `
    :host {
      display: block;
      margin-bottom: 20px;
    }
    .resumo-ia {
      padding: 20px 22px;
    }
    .brilho {
      color: var(--u-azul);
    }
    .resumo-ia__texto {
      border-left: 4px solid var(--u-azul);
      border-radius: 0 10px 10px 0;
      padding: 0.875rem 1rem;
      background: linear-gradient(135deg, var(--u-azul-claro) 0%, #ffffff 100%);
      color: var(--u-tinta);
      overflow-wrap: anywhere;
    }
    .btn {
      min-height: 32px;
    }
  `,
})
export class ResumoIa {
  private readonly api = inject(ApiExpedientesService);

  readonly idExpediente = input.required<string>();

  protected readonly estado = signal<EstadoResumo>('ocioso');
  protected readonly resultado = signal<RespostaResumo | null>(null);
  protected readonly mensagemErro = signal('');
  protected readonly correlationId = signal<string | null>(null);

  protected async gerar(): Promise<void> {
    this.estado.set('carregando');
    this.correlationId.set(null);
    try {
      this.resultado.set(await this.api.resumo(this.idExpediente()));
      this.estado.set('sucesso');
    } catch (e) {
      this.mensagemErro.set(
        statusDoErro(e) === 403
          ? 'Resumo indisponível para expedientes sigilosos'
          : 'Não foi possível gerar o resumo agora. Tente novamente.',
      );
      this.correlationId.set(correlationIdDoErro(e));
      this.estado.set('erro');
    }
  }
}
