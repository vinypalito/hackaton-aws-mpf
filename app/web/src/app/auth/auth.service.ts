import { DOCUMENT } from '@angular/common';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { CONFIGURACAO } from '../core/configuracao';
import { decodificarJwt } from './jwt';
import { gerarCodeChallenge, gerarCodeVerifier, gerarState } from './pkce';

/** Chaves no sessionStorage (escopo da aba; some ao fechar o navegador). */
export const CHAVE_SESSAO = 'painel.sessao';
export const CHAVE_PKCE = 'painel.pkce';

/** Margem para considerar o token expirado antes do horário exato. */
const MARGEM_EXPIRACAO_MS = 30_000;
const ROTA_PADRAO = '/inicio';

/** Sessão local: só o ID token (enviado à API) e a expiração. */
export interface Sessao {
  idToken: string;
  expiraEm: number;
}

interface PkcePendente {
  codeVerifier: string;
  state: string;
  retorno: string;
}

interface RespostaToken {
  id_token?: string;
  expires_in?: number;
}

/** Claims do ID token exibidas no cabeçalho (o backend usa as claims do token validado). */
export interface ClaimsUsuario {
  idUsuario: string | null;
  nome: string | null;
  email: string | null;
  siglaSetor: string | null;
  perfil: string | null;
}

function texto(valor: unknown): string | null {
  return typeof valor === 'string' && valor ? valor : null;
}

/** Aceita só caminhos internos ("/x"), evitando redirecionamento aberto. */
export function retornoSeguro(retorno: string | null | undefined): string {
  if (!retorno || !retorno.startsWith('/') || retorno.startsWith('//') || retorno.startsWith('/\\')) {
    return ROTA_PADRAO;
  }
  return retorno.startsWith('/entrar') ? ROTA_PADRAO : retorno;
}

function sessaoValida(sessao: Sessao | null, agora = Date.now()): boolean {
  if (!sessao) {
    return false;
  }
  const exp = decodificarJwt(sessao.idToken)?.['exp'];
  const expiraPorClaim = typeof exp === 'number' ? exp * 1000 : Number.POSITIVE_INFINITY;
  return Math.min(sessao.expiraEm, expiraPorClaim) - MARGEM_EXPIRACAO_MS > agora;
}

/**
 * Login no Cognito Hosted UI com authorization code + PKCE (S256), sem
 * bibliotecas. Tokens ficam no sessionStorage; o refresh token não é guardado
 * (ao expirar, o Hosted UI reaproveita a própria sessão para emitir outro).
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly config = inject(CONFIGURACAO);
  private readonly http = inject(HttpClient);
  private readonly document = inject(DOCUMENT);

  private readonly sessao = signal<Sessao | null>(this.lerSessao());

  /** Mensagem de erro do último login (exibida na tela de entrada). */
  readonly erro = signal<string | null>(null);

  readonly autenticado = computed(() => sessaoValida(this.sessao()));

  readonly claims = computed<ClaimsUsuario | null>(() => {
    const payload = decodificarJwt(this.sessao()?.idToken);
    if (!payload) {
      return null;
    }
    return {
      idUsuario: texto(payload['custom:idUsuario']),
      nome: texto(payload['name']),
      email: texto(payload['email']),
      siglaSetor: texto(payload['custom:siglaSetor']),
      perfil: texto(payload['custom:perfil']),
    };
  });

  private get origem(): string {
    return this.document.location.origin;
  }

  private get redirectUri(): string {
    return this.config.cognito.redirectUri ?? `${this.origem}/`;
  }

  private get logoutUri(): string {
    return this.config.cognito.logoutUri ?? `${this.origem}/`;
  }

  /** Verifica a validade no instante da chamada (usado pela guarda de rota). */
  estaAutenticado(): boolean {
    const valida = sessaoValida(this.sessao());
    if (!valida && this.sessao()) {
      this.encerrarSessaoLocal();
    }
    return valida;
  }

  /** ID token vigente para o header Authorization, ou null. */
  idToken(): string | null {
    return this.estaAutenticado() ? (this.sessao()?.idToken ?? null) : null;
  }

  /** Gera verifier/challenge/state e redireciona ao Hosted UI. */
  async iniciarLogin(retorno?: string | null): Promise<void> {
    const codeVerifier = gerarCodeVerifier();
    const state = gerarState();
    const pendente: PkcePendente = { codeVerifier, state, retorno: retornoSeguro(retorno) };
    sessionStorage.setItem(CHAVE_PKCE, JSON.stringify(pendente));

    const parametros = new URLSearchParams({
      response_type: 'code',
      client_id: this.config.cognito.clientId,
      redirect_uri: this.redirectUri,
      scope: this.config.cognito.escopos ?? 'openid email profile',
      state,
      code_challenge_method: 'S256',
      code_challenge: await gerarCodeChallenge(codeVerifier),
    });
    this.redirecionar(`${this.config.cognito.dominio}/oauth2/authorize?${parametros.toString()}`);
  }

  /**
   * Conclui o retorno do Hosted UI: confere o `state`, troca o code no
   * `/oauth2/token` e grava a sessão. Retorna o caminho a abrir em seguida.
   */
  async concluirLogin(parametros: URLSearchParams): Promise<string> {
    const pendenteBruto = sessionStorage.getItem(CHAVE_PKCE);
    sessionStorage.removeItem(CHAVE_PKCE);
    const pendente = pendenteBruto ? (JSON.parse(pendenteBruto) as PkcePendente) : null;

    if (parametros.get('error')) {
      throw new Error('O login foi cancelado ou recusado. Tente entrar novamente.');
    }
    const code = parametros.get('code');
    const state = parametros.get('state');
    if (!pendente || !code || !state || state !== pendente.state) {
      throw new Error('A resposta do login não confere com a solicitação. Tente entrar novamente.');
    }

    const corpo = new HttpParams({
      fromObject: {
        grant_type: 'authorization_code',
        client_id: this.config.cognito.clientId,
        code,
        redirect_uri: this.redirectUri,
        code_verifier: pendente.codeVerifier,
      },
    });
    let resposta: RespostaToken;
    try {
      resposta = await firstValueFrom(
        this.http.post<RespostaToken>(`${this.config.cognito.dominio}/oauth2/token`, corpo.toString(), {
          headers: new HttpHeaders({ 'Content-Type': 'application/x-www-form-urlencoded' }),
        }),
      );
    } catch {
      throw new Error('Não foi possível concluir o login. Tente entrar novamente.');
    }
    if (!resposta.id_token) {
      throw new Error('Não foi possível concluir o login. Tente entrar novamente.');
    }
    const sessao: Sessao = {
      idToken: resposta.id_token,
      expiraEm: Date.now() + (resposta.expires_in ?? 3600) * 1000,
    };
    sessionStorage.setItem(CHAVE_SESSAO, JSON.stringify(sessao));
    this.sessao.set(sessao);
    this.erro.set(null);
    return pendente.retorno;
  }

  /**
   * Executado no APP_INITIALIZER, antes da navegação inicial do router: se a
   * URL traz `code`/`error` do Hosted UI, conclui o login e limpa a URL.
   */
  async processarRetornoDoLogin(): Promise<void> {
    const parametros = new URLSearchParams(this.document.location.search);
    if (!parametros.has('code') && !parametros.has('error')) {
      return;
    }
    let destino: string;
    try {
      destino = await this.concluirLogin(parametros);
    } catch (e) {
      this.erro.set(e instanceof Error ? e.message : 'Não foi possível concluir o login.');
      destino = '/entrar';
    }
    // Remove code/state da barra de endereço e do histórico.
    this.document.defaultView?.history.replaceState(null, '', destino);
  }

  /** Sai: revoga a sessão local e encerra a sessão do Hosted UI, que volta para a tela de login. */
  sair(): void {
    this.encerrarSessaoLocal();
    const parametros = new URLSearchParams({ client_id: this.config.cognito.clientId, logout_uri: this.logoutUri });
    this.redirecionar(`${this.config.cognito.dominio}/logout?${parametros.toString()}`);
  }

  /** Apaga tokens e dados de login pendente desta aba. */
  encerrarSessaoLocal(): void {
    sessionStorage.removeItem(CHAVE_SESSAO);
    sessionStorage.removeItem(CHAVE_PKCE);
    this.sessao.set(null);
  }

  /** Navegação para fora da SPA (Hosted UI). Isolado para facilitar os testes. */
  redirecionar(url: string): void {
    this.document.location.assign(url);
  }

  private lerSessao(): Sessao | null {
    try {
      const bruto = sessionStorage.getItem(CHAVE_SESSAO);
      const sessao = bruto ? (JSON.parse(bruto) as Partial<Sessao>) : null;
      return sessao && typeof sessao.idToken === 'string' && typeof sessao.expiraEm === 'number'
        ? { idToken: sessao.idToken, expiraEm: sessao.expiraEm }
        : null;
    } catch {
      return null;
    }
  }
}
