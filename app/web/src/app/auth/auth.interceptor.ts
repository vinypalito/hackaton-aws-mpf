import { HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { CONFIGURACAO } from '../core/configuracao';
import { AuthService } from './auth.service';

/** Verdadeiro só para a própria API (evita vazar o token para outros hosts com o mesmo prefixo). */
export function ehUrlDaApi(url: string, apiUrl: string): boolean {
  return !!apiUrl && (url === apiUrl || url.startsWith(`${apiUrl}/`) || url.startsWith(`${apiUrl}?`));
}

/**
 * Anexa o ID token no header Authorization (formato esperado pelo Cognito
 * Authorizer) apenas às chamadas à API. Em 401, encerra a sessão local e
 * volta para a tela de entrada.
 */
export const autenticacaoInterceptor: HttpInterceptorFn = (requisicao, proximo) => {
  const { apiUrl } = inject(CONFIGURACAO);
  if (!ehUrlDaApi(requisicao.url, apiUrl)) {
    return proximo(requisicao);
  }
  const auth = inject(AuthService);
  const router = inject(Router);
  const token = auth.idToken();
  const comToken = token ? requisicao.clone({ setHeaders: { Authorization: token } }) : requisicao;
  return proximo(comToken).pipe(
    catchError((erro: unknown) => {
      if (erro instanceof HttpErrorResponse && erro.status === 401) {
        auth.encerrarSessaoLocal();
        void router.navigate(['/entrar']);
      }
      return throwError(() => erro);
    }),
  );
};
