import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { CONFIGURACAO } from '../core/configuracao';
import { DATA_REFERENCIA_PADRAO } from '../core/data-referencia';

/** Contexto do usuário exibido no cabeçalho e na tela inicial. */
export interface ContextoUsuario {
  idUsuario: string | null;
  nome: string | null;
  siglaSetor: string | null;
  perfil: string | null;
}

function texto(valor: unknown): string | null {
  return typeof valor === 'string' && valor ? valor : null;
}

/**
 * Carrega o contexto de `GET /me` (fonte de verdade do backend, incluindo a
 * `dataReferencia`). Enquanto a API não responde, ou se ela estiver
 * indisponível, usa as claims do ID token só para exibição.
 */
@Injectable({ providedIn: 'root' })
export class ContextoUsuarioService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly config = inject(CONFIGURACAO);

  private readonly doMe = signal<(ContextoUsuario & { dataReferencia: string | null }) | null>(null);

  readonly contexto = computed<ContextoUsuario | null>(() => {
    const claims = this.auth.claims();
    if (!this.auth.autenticado() || !claims) {
      return null;
    }
    const me = this.doMe();
    return {
      idUsuario: me?.idUsuario ?? claims.idUsuario,
      nome: me?.nome ?? claims.nome ?? claims.email,
      siglaSetor: me?.siglaSetor ?? claims.siglaSetor,
      perfil: me?.perfil ?? claims.perfil,
    };
  });

  readonly dataReferencia = computed(
    () => this.doMe()?.dataReferencia ?? this.config.dataReferencia ?? DATA_REFERENCIA_PADRAO,
  );

  /** Busca `/me`; falhas mantêm as claims do token (o interceptor trata 401). */
  async carregar(): Promise<void> {
    if (!this.config.apiUrl || !this.auth.autenticado()) {
      return;
    }
    try {
      const me = await firstValueFrom(this.http.get<Record<string, unknown>>(`${this.config.apiUrl}/me`));
      this.doMe.set({
        idUsuario: texto(me['idUsuario']),
        nome: texto(me['nome']),
        siglaSetor: texto(me['siglaSetor']) ?? texto(me['setor']),
        perfil: texto(me['perfil']),
        dataReferencia: texto(me['dataReferencia']),
      });
    } catch {
      // Mantém o contexto das claims; as telas tratam erros da API por conta própria.
    }
  }

  limpar(): void {
    this.doMe.set(null);
  }
}
