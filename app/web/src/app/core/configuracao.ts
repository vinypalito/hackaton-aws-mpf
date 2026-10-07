import { InjectionToken } from '@angular/core';

/**
 * Configuração de execução da SPA, lida de `config.json` antes do bootstrap.
 * Em produção, o deploy (S3 + CloudFront) grava esse arquivo com os valores da
 * stack; assim o mesmo build serve qualquer ambiente. Nenhum valor aqui é
 * segredo: o App Client do Cognito é público (PKCE, sem client secret).
 */
export interface ConfiguracaoApp {
  /** URL base da API (ex.: https://abc.execute-api.us-east-1.amazonaws.com/dev), sem barra final. Vazia = API indisponível. */
  apiUrl: string;
  cognito: {
    /** Domínio do Hosted UI, com https e sem barra final. */
    dominio: string;
    clientId: string;
    /** Padrão: origem atual + "/". Precisa estar cadastrado no App Client. */
    redirectUri?: string;
    /** Padrão: origem atual + "/". Precisa estar cadastrado no App Client. */
    logoutUri?: string;
    /** Padrão: "openid email profile". */
    escopos?: string;
  };
  /** Data de referência dos dados (ISO 8601). Padrão: 2026-10-07T17:00:00-03:00. */
  dataReferencia?: string;
}

export const CONFIGURACAO = new InjectionToken<ConfiguracaoApp>('CONFIGURACAO');

function semBarraFinal(valor: string): string {
  return valor.replace(/\/+$/, '');
}

function exigirHttps(valor: string, campo: string): void {
  const url = new URL(valor);
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) {
    throw new Error(`Configuração inválida: ${campo} deve usar https.`);
  }
}

/** Valida e normaliza o conteúdo bruto de `config.json`. */
export function normalizarConfiguracao(bruto: unknown): ConfiguracaoApp {
  const dados = (bruto ?? {}) as Partial<ConfiguracaoApp>;
  const cognito = dados.cognito;
  if (!cognito || typeof cognito.dominio !== 'string' || typeof cognito.clientId !== 'string' || !cognito.clientId) {
    throw new Error('Configuração inválida: informe cognito.dominio e cognito.clientId.');
  }
  exigirHttps(cognito.dominio, 'cognito.dominio');
  const apiUrl = typeof dados.apiUrl === 'string' ? semBarraFinal(dados.apiUrl.trim()) : '';
  if (apiUrl) {
    exigirHttps(apiUrl, 'apiUrl');
  }
  return {
    apiUrl,
    cognito: { ...cognito, dominio: semBarraFinal(cognito.dominio) },
    ...(typeof dados.dataReferencia === 'string' ? { dataReferencia: dados.dataReferencia } : {}),
  };
}

/** Busca `config.json` (sem cache, para refletir o deploy mais recente). */
export async function carregarConfiguracao(url = 'config.json'): Promise<ConfiguracaoApp> {
  const resposta = await fetch(url, { cache: 'no-store' });
  if (!resposta.ok) {
    throw new Error(`Não foi possível carregar ${url} (HTTP ${resposta.status}).`);
  }
  return normalizarConfiguracao(await resposta.json());
}
