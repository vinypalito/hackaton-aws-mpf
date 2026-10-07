import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, untracked } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from './auth/auth.service';
import { textoDataReferencia } from './core/data-referencia';
import { rotuloPerfil } from './core/perfil';
import { ContextoUsuarioService } from './usuario/contexto-usuario.service';

/**
 * Shell da SPA: skip link, cabeçalho (usuário, perfil, setor, data de
 * referência, aviso de base sintética, Sair), navegação e `<main>`.
 */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
  styleUrl: './app.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  private readonly document = inject(DOCUMENT);
  private readonly auth = inject(AuthService);
  private readonly contextoUsuario = inject(ContextoUsuarioService);

  protected readonly autenticado = this.auth.autenticado;
  protected readonly usuario = this.contextoUsuario.contexto;
  protected readonly perfil = computed(() => rotuloPerfil(this.usuario()?.perfil));
  /** Iniciais do nome para o avatar (ex.: "Bruno Teste" → "BT"). */
  protected readonly iniciais = computed(() => {
    const partes = (this.usuario()?.nome ?? '').trim().split(/\s+/).filter((p) => p.length > 0);
    if (partes.length === 0) return '?';
    const primeira = partes[0]!.charAt(0);
    const ultima = partes.length > 1 ? partes[partes.length - 1]!.charAt(0) : '';
    return (primeira + ultima).toLocaleUpperCase('pt-BR');
  });
  protected readonly textoData = computed(() => textoDataReferencia(this.contextoUsuario.dataReferencia()));

  constructor() {
    // O index.html já declara lang="pt-BR"; reforçado aqui para qualquer host da SPA.
    this.document.documentElement.lang = 'pt-BR';

    // Ao entrar (ou reabrir a aba com sessão válida), busca o contexto em GET /me.
    effect(() => {
      if (this.autenticado()) {
        untracked(() => void this.contextoUsuario.carregar());
      } else {
        untracked(() => this.contextoUsuario.limpar());
      }
    });
  }

  /** Leva o foco ao conteúdo sem alterar a rota (o href "#conteudo" mudaria a URL por causa do <base>). */
  protected irParaConteudo(evento: Event): void {
    evento.preventDefault();
    this.document.getElementById('conteudo')?.focus();
  }

  protected sair(): void {
    this.auth.sair();
  }
}
