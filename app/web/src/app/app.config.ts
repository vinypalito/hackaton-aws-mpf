import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  type ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { TitleStrategy, provideRouter, withComponentInputBinding } from '@angular/router';
import { routes } from './app.routes';
import { autenticacaoInterceptor } from './auth/auth.interceptor';
import { AuthService } from './auth/auth.service';
import { CONFIGURACAO, type ConfiguracaoApp } from './core/configuracao';
import { TituloPaginaStrategy } from './core/titulo.strategy';

/** Providers da aplicação a partir da configuração de execução (`config.json`). */
export function criarAppConfig(configuracao: ConfiguracaoApp): ApplicationConfig {
  return {
    providers: [
      provideBrowserGlobalErrorListeners(),
      { provide: CONFIGURACAO, useValue: configuracao },
      provideHttpClient(withInterceptors([autenticacaoInterceptor])),
      provideRouter(routes, withComponentInputBinding()),
      { provide: TitleStrategy, useClass: TituloPaginaStrategy },
      // Conclui o retorno do Hosted UI antes da navegação inicial do router.
      provideAppInitializer(() => inject(AuthService).processarRetornoDoLogin()),
    ],
  };
}
