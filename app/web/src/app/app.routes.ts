import type { Routes } from '@angular/router';
import { autenticacaoGuard } from './auth/auth.guard';
import { DetalhePagina } from './paginas/detalhe/detalhe';
import { EntrarPagina } from './paginas/entrar/entrar';
import { InicioPagina } from './paginas/inicio/inicio';
import { NaoEncontradaPagina } from './paginas/nao-encontrada/nao-encontrada';
import { PainelPagina } from './paginas/painel/painel';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'inicio' },
  { path: 'entrar', title: 'Entrar', component: EntrarPagina },
  {
    path: '',
    canActivateChild: [autenticacaoGuard],
    children: [
      { path: 'inicio', title: 'Início', component: InicioPagina },
      { path: 'painel', title: 'Painel', component: PainelPagina },
      { path: 'expedientes/:id', title: 'Detalhe do expediente', component: DetalhePagina },
    ],
  },
  { path: '**', title: 'Página não encontrada', component: NaoEncontradaPagina },
];
