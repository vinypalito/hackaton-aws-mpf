import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-nao-encontrada',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="h3">Página não encontrada</h1>
    <p>O endereço acessado não existe. <a routerLink="/inicio">Voltar para o início</a>.</p>
  `,
})
export class NaoEncontradaPagina {}
