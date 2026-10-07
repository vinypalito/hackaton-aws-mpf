import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { claimsDeTeste, criarJwtDeTeste } from '../testing/jwt-de-teste';
import { App } from './app';
import { routes } from './app.routes';
import { autenticacaoInterceptor } from './auth/auth.interceptor';
import { CHAVE_SESSAO } from './auth/auth.service';
import { CONFIGURACAO, type ConfiguracaoApp } from './core/configuracao';

const CONFIG: ConfiguracaoApp = {
  apiUrl: 'https://api.exemplo.org/dev',
  cognito: { dominio: 'https://login.exemplo.org', clientId: 'cliente-teste' },
};

async function criarShell() {
  TestBed.configureTestingModule({
    imports: [App],
    providers: [
      { provide: CONFIGURACAO, useValue: CONFIG },
      provideRouter(routes),
      provideHttpClient(withInterceptors([autenticacaoInterceptor])),
      provideHttpClientTesting(),
    ],
  });
  const fixture = TestBed.createComponent(App);
  await fixture.whenStable();
  return { fixture, el: fixture.nativeElement as HTMLElement, http: TestBed.inject(HttpTestingController) };
}

describe('App (shell)', () => {
  beforeEach(() => sessionStorage.clear());

  it('declara lang pt-BR, skip link para o main e aviso de dados em qualquer tela', async () => {
    const { el } = await criarShell();

    expect(document.documentElement.lang).toBe('pt-BR');
    const pular = el.querySelector<HTMLAnchorElement>('a.link-pular');
    expect(pular?.textContent?.trim()).toBe('Ir para o conteúdo principal');
    expect(pular?.getAttribute('href')).toBe('#conteudo');
    const main = el.querySelector('main#conteudo');
    expect(main?.getAttribute('tabindex')).toBe('-1');
    expect(el.querySelector('header')?.textContent).toContain('Dados de 07/10/2026, 17:00');
    expect(el.querySelector('header')?.textContent).toContain('Base 100% sintética');
    // Sem sessão não há dados do usuário nem botão Sair.
    expect(el.querySelector('.btn-sair')).toBeNull();
  });

  it('o skip link leva o foco ao conteúdo principal', async () => {
    const { el } = await criarShell();
    el.querySelector<HTMLAnchorElement>('a.link-pular')!.click();
    expect(document.activeElement?.id).toBe('conteudo');
  });

  it('com sessão, mostra nome, perfil e setor e busca /me com o ID token', async () => {
    const token = criarJwtDeTeste(claimsDeTeste());
    sessionStorage.setItem(CHAVE_SESSAO, JSON.stringify({ idToken: token, expiraEm: Date.now() + 3_600_000 }));
    const { fixture, el, http } = await criarShell();

    const req = http.expectOne(`${CONFIG.apiUrl}/me`);
    expect(req.request.headers.get('Authorization')).toBe(token);
    req.flush({
      idUsuario: 'USR-001',
      nome: 'Usuária Fictícia de Teste',
      siglaSetor: 'GAB-ABC',
      perfil: 'MEMBRO',
      dataReferencia: '2026-10-07T17:00:00-03:00',
    });
    // Deixa a promessa de /me resolver antes de esperar a renderização.
    await new Promise((resolver) => setTimeout(resolver));
    await fixture.whenStable();

    const cabecalho = el.querySelector('header')!.textContent!;
    expect(cabecalho).toContain('Usuária Fictícia de Teste');
    expect(cabecalho).toContain('Membro');
    expect(cabecalho).toContain('GAB-ABC');
    expect(cabecalho).toContain('Dados de 07/10/2026, 17:00');
    expect(el.querySelector('.btn-sair')?.textContent?.trim()).toBe('Sair');
    expect(el.querySelector('nav[aria-label="Navegação principal"]')).not.toBeNull();
    http.verify();
  });
});
