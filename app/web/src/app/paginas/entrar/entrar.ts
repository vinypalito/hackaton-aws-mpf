import { ChangeDetectionStrategy, Component, type OnInit, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService, retornoSeguro } from '../../auth/auth.service';

/** Tela de entrada: leva ao Cognito Hosted UI (PKCE) e mostra erros do último login. */
@Component({
  selector: 'app-entrar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="entrar mx-auto" aria-labelledby="titulo-entrar">
      <h1 id="titulo-entrar" class="h3">Entrar no painel de expedientes</h1>
      <p>Use o seu usuário fictício da base sintética. O login é feito na página do Amazon Cognito.</p>
      @if (auth.erro(); as erro) {
        <div class="alert alert-danger" role="alert">{{ erro }}</div>
      }
      <button type="button" class="btn btn-primary btn-lg" [disabled]="redirecionando()" (click)="entrar()">
        {{ redirecionando() ? 'Abrindo o login…' : 'Entrar' }}
      </button>
    </section>
  `,
  styles: `
    .entrar {
      max-width: 36rem;
    }
  `,
})
export class EntrarPagina implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  /** Query param `retorno` (rota pedida antes do login). */
  readonly retorno = input<string | undefined>();
  protected readonly redirecionando = signal(false);

  ngOnInit(): void {
    // Já autenticado (ex.: voltou com "Voltar" do navegador): segue para a rota pedida.
    if (this.auth.estaAutenticado()) {
      void this.router.navigateByUrl(retornoSeguro(this.retorno()));
    }
  }

  protected async entrar(): Promise<void> {
    this.redirecionando.set(true);
    try {
      await this.auth.iniciarLogin(this.retorno());
    } catch {
      this.auth.erro.set('Não foi possível abrir o login. Tente novamente.');
      this.redirecionando.set(false);
    }
  }
}
