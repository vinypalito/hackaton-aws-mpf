import { provideHttpClient, withInterceptors, HttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, type UrlTree } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { claimsDeTeste, criarJwtDeTeste } from '../../testing/jwt-de-teste';
import { CONFIGURACAO, type ConfiguracaoApp } from '../core/configuracao';
import { autenticacaoGuard } from './auth.guard';
import { autenticacaoInterceptor, ehUrlDaApi } from './auth.interceptor';
import { AuthService, CHAVE_PKCE, CHAVE_SESSAO, retornoSeguro } from './auth.service';
import { gerarCodeChallenge } from './pkce';

const CONFIG: ConfiguracaoApp = {
  apiUrl: 'https://api.exemplo.org/dev',
  cognito: {
    dominio: 'https://login.exemplo.org',
    clientId: 'cliente-teste',
    redirectUri: 'http://localhost:4200/',
    logoutUri: 'http://localhost:4200/',
  },
};

function configurar(): { auth: AuthService; http: HttpTestingController } {
  TestBed.configureTestingModule({
    providers: [
      { provide: CONFIGURACAO, useValue: CONFIG },
      provideRouter([]),
      provideHttpClient(withInterceptors([autenticacaoInterceptor])),
      provideHttpClientTesting(),
    ],
  });
  return { auth: TestBed.inject(AuthService), http: TestBed.inject(HttpTestingController) };
}

describe('AuthService', () => {
  beforeEach(() => sessionStorage.clear());
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('inicia o login no Hosted UI com PKCE S256 e state', async () => {
    const { auth } = configurar();
    const redirecionar = vi.spyOn(auth, 'redirecionar').mockImplementation(() => undefined);

    await auth.iniciarLogin('/painel');

    const url = new URL(redirecionar.mock.calls[0]![0]);
    const pendente = JSON.parse(sessionStorage.getItem(CHAVE_PKCE)!) as { codeVerifier: string; state: string; retorno: string };
    expect(url.origin + url.pathname).toBe('https://login.exemplo.org/oauth2/authorize');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('client_id')).toBe('cliente-teste');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toBe(await gerarCodeChallenge(pendente.codeVerifier));
    expect(url.searchParams.get('state')).toBe(pendente.state);
    expect(pendente.retorno).toBe('/painel');
  });

  it('troca o code no /oauth2/token e grava a sessão', async () => {
    const { auth, http } = configurar();
    sessionStorage.setItem(CHAVE_PKCE, JSON.stringify({ codeVerifier: 'verificador', state: 'abc', retorno: '/painel' }));

    const resultado = auth.concluirLogin(new URLSearchParams({ code: 'codigo-1', state: 'abc' }));
    const req = http.expectOne('https://login.exemplo.org/oauth2/token');
    const corpo = new URLSearchParams(req.request.body as string);
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.has('Authorization')).toBe(false);
    expect(corpo.get('grant_type')).toBe('authorization_code');
    expect(corpo.get('code')).toBe('codigo-1');
    expect(corpo.get('code_verifier')).toBe('verificador');
    req.flush({ id_token: criarJwtDeTeste(claimsDeTeste()), expires_in: 3600 });

    expect(await resultado).toBe('/painel');
    expect(auth.autenticado()).toBe(true);
    expect(auth.claims()?.perfil).toBe('CHEFE');
    expect(sessionStorage.getItem(CHAVE_SESSAO)).not.toBeNull();
    expect(sessionStorage.getItem(CHAVE_PKCE)).toBeNull();
  });

  it('recusa retorno com state diferente (CSRF) sem chamar o token endpoint', async () => {
    const { auth } = configurar();
    sessionStorage.setItem(CHAVE_PKCE, JSON.stringify({ codeVerifier: 'v', state: 'esperado', retorno: '/inicio' }));

    await expect(auth.concluirLogin(new URLSearchParams({ code: 'c', state: 'forjado' }))).rejects.toThrow(
      'não confere',
    );
    expect(auth.autenticado()).toBe(false);
  });

  it('sair apaga a sessão local e chama o /logout do Cognito', () => {
    sessionStorage.setItem(CHAVE_SESSAO, JSON.stringify({ idToken: criarJwtDeTeste(claimsDeTeste()), expiraEm: Date.now() + 3_600_000 }));
    const { auth } = configurar();
    const redirecionar = vi.spyOn(auth, 'redirecionar').mockImplementation(() => undefined);

    auth.sair();

    expect(auth.autenticado()).toBe(false);
    expect(sessionStorage.getItem(CHAVE_SESSAO)).toBeNull();
    const url = new URL(redirecionar.mock.calls[0]![0]);
    expect(url.pathname).toBe('/logout');
    expect(url.searchParams.get('logout_uri')).toBe('http://localhost:4200/');
  });

});

describe('retornoSeguro', () => {
  it('só aceita retornos internos', () => {
    expect(retornoSeguro('/painel?caixa=ENTRADA')).toBe('/painel?caixa=ENTRADA');
    expect(retornoSeguro('https://malicioso.exemplo.org')).toBe('/inicio');
    expect(retornoSeguro('//malicioso.exemplo.org')).toBe('/inicio');
  });
});

describe('guarda e interceptor', () => {
  beforeEach(() => sessionStorage.clear());

  it('sem sessão, a guarda leva a /entrar com a rota pedida', () => {
    configurar();
    const resultado = TestBed.runInInjectionContext(() =>
      autenticacaoGuard({} as never, { url: '/painel' } as never),
    ) as UrlTree;
    expect(TestBed.inject(Router).serializeUrl(resultado)).toBe('/entrar?retorno=%2Fpainel');
  });

  it('anexa o ID token só às chamadas à API', async () => {
    const token = criarJwtDeTeste(claimsDeTeste());
    sessionStorage.setItem(CHAVE_SESSAO, JSON.stringify({ idToken: token, expiraEm: Date.now() + 3_600_000 }));
    const { http } = configurar();
    const cliente = TestBed.inject(HttpClient);

    const daApi = firstValueFrom(cliente.get(`${CONFIG.apiUrl}/me`));
    const externa = firstValueFrom(cliente.get('https://api.exemplo.org/devmalicioso/me'));
    const reqApi = http.expectOne(`${CONFIG.apiUrl}/me`);
    const reqExterna = http.expectOne('https://api.exemplo.org/devmalicioso/me');
    expect(reqApi.request.headers.get('Authorization')).toBe(token);
    expect(reqExterna.request.headers.has('Authorization')).toBe(false);
    reqApi.flush({});
    reqExterna.flush({});
    await Promise.all([daApi, externa]);

    expect(ehUrlDaApi('https://api.exemplo.org/dev', '')).toBe(false);
  });
});
