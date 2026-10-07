import { Injectable, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { type RouterStateSnapshot, TitleStrategy } from '@angular/router';

export const NOME_APLICACAO = 'Painel de expedientes';

/** Gera um `title` único por página: "<título da rota> · Painel de expedientes" (Req. 27.9). */
@Injectable({ providedIn: 'root' })
export class TituloPaginaStrategy extends TitleStrategy {
  private readonly title = inject(Title);

  override updateTitle(snapshot: RouterStateSnapshot): void {
    const titulo = this.buildTitle(snapshot);
    this.title.setTitle(titulo ? `${titulo} · ${NOME_APLICACAO}` : NOME_APLICACAO);
  }
}
