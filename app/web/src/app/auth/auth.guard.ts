import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/** Sem sessão válida, leva à tela de entrada guardando a rota pedida. */
export const autenticacaoGuard: CanActivateFn = (_rota, estado) => {
  if (inject(AuthService).estaAutenticado()) {
    return true;
  }
  return inject(Router).createUrlTree(['/entrar'], { queryParams: { retorno: estado.url } });
};
