import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Indicador de carregamento com o tsuru da marca Único: o traço é desenhado,
 * a figura é preenchida e depois flutua batendo a asa. É a mesma animação do
 * splash de abertura (src/index.html). Com movimento reduzido, fica estático.
 */
@Component({
  selector: 'app-carregando-tsuru',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="carregando" role="status" aria-live="polite">
      <svg class="tsuru" viewBox="0 0 232 177" aria-hidden="true" focusable="false">
        <path class="asa" pathLength="1" d="M96 1 L96 56 L1 2 Z" />
        <path pathLength="1" d="M103 1 L199 83 L103 165 Z" />
        <path pathLength="1" d="M203 17 L203 78 L169 50 Z" />
        <path pathLength="1" d="M209 16 L230 23 L208 31 Z" />
        <path pathLength="1" d="M58 143 L97 143 L96 165 Z" />
        <path pathLength="1" d="M55 147 L70 157 L55 175 Z" />
      </svg>
      <p class="texto">{{ mensagem() }}</p>
    </div>
  `,
  styles: `
    .carregando {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.75rem;
      padding: 1.5rem 1rem;
      color: var(--u-tinta-3);
    }
    .tsuru {
      width: 72px;
      height: auto;
      overflow: visible;
      animation: flutuar 2.4s ease-in-out 1.6s infinite;
    }
    .tsuru path {
      fill: var(--painel-cor-primaria);
      fill-opacity: 0;
      stroke: var(--painel-cor-primaria);
      stroke-width: 2;
      stroke-linejoin: round;
      stroke-dasharray: 1;
      stroke-dashoffset: 1;
      animation: tracar 0.9s ease-out forwards, preencher 0.5s ease-out forwards;
    }
    .tsuru path:nth-child(2) { animation-delay: 0.1s, 1s; }
    .tsuru path:nth-child(3) { animation-delay: 0.2s, 1.1s; }
    .tsuru path:nth-child(4) { animation-delay: 0.3s, 1.2s; }
    .tsuru path:nth-child(5) { animation-delay: 0.4s, 1.3s; }
    .tsuru path:nth-child(6) { animation-delay: 0.5s, 1.4s; }
    .tsuru path.asa {
      transform-box: view-box;
      transform-origin: 96px 56px;
      animation: tracar 0.9s ease-out forwards, preencher 0.5s ease-out 0.9s forwards,
        bater 1.2s ease-in-out 1.6s infinite;
    }
    .texto { margin: 0; }
    @keyframes tracar { to { stroke-dashoffset: 0; } }
    @keyframes preencher { to { fill-opacity: 1; } }
    @keyframes flutuar { 50% { transform: translateY(-6px); } }
    @keyframes bater { 50% { transform: rotate(-14deg); } }
    @media (prefers-reduced-motion: reduce) {
      .tsuru, .tsuru path, .tsuru path.asa { animation: none; }
      .tsuru path { fill-opacity: 1; stroke-dashoffset: 0; }
    }
  `,
})
export class CarregandoTsuru {
  /** Texto visível e anunciado por leitores de tela. */
  readonly mensagem = input('Carregando…');
}
