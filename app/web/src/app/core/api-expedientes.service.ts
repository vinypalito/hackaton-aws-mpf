import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { CONFIGURACAO } from './configuracao';
import type { Caixa, SituacaoPrazo } from './formatos';

/** Item com os nomes de coluna dos CSVs do kit (expedientes, movimentacoes, prazos...). */
export type Item = Record<string, unknown>;

/** Expediente como vem da API (campos de `expedientes.csv`, já mascarados pelo backend). */
export interface Expediente extends Item {
  idExpediente: string;
}

export interface Contador extends Item {
  gerenciador: string;
}

export interface RespostaHome {
  dataReferencia: string;
  contadores: { todos: Contador | null; porGerenciador: Record<string, Contador> } | null;
  proximosPrazos: Expediente[] | null;
  proximoExpediente: Expediente | null;
  alertas: { itens: Item[]; totalNaoLidas: number } | null;
  informes: Item[] | null;
  widgetsComErro: string[];
}

export interface PaginaExpedientes {
  itens: Expediente[];
  cursor: string | null;
}

export interface FiltrosListagem {
  caixa?: Caixa;
  statusPrazo?: readonly SituacaoPrazo[];
  cursor?: string | null;
  limite?: number;
}

export interface RespostaDetalhe {
  expediente: Expediente;
  movimentacoes: Item[];
  prazos: Item[];
  designacoes: Item[];
  anotacoes: Item[];
  marcadores: Item[];
}

export interface RespostaResumo {
  resumo: string;
  modelo: string;
  geradoEm: string;
}

/** Acesso às rotas de consulta da API (o interceptor anexa o ID token). */
@Injectable({ providedIn: 'root' })
export class ApiExpedientesService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(CONFIGURACAO);

  home(): Promise<RespostaHome> {
    return firstValueFrom(this.http.get<RespostaHome>(`${this.config.apiUrl}/home`));
  }

  listar(filtros: FiltrosListagem): Promise<PaginaExpedientes> {
    let params = new HttpParams().set('limite', String(filtros.limite ?? 25));
    if (filtros.caixa) params = params.set('caixa', filtros.caixa);
    if (filtros.statusPrazo?.length) params = params.set('statusPrazo', filtros.statusPrazo.join(','));
    if (filtros.cursor) params = params.set('cursor', filtros.cursor);
    return firstValueFrom(this.http.get<PaginaExpedientes>(`${this.config.apiUrl}/expedientes`, { params }));
  }

  /** Resumo do expediente gerado por IA (Amazon Bedrock). 403 para sigilosos. */
  resumo(id: string): Promise<RespostaResumo> {
    return firstValueFrom(
      this.http.post<RespostaResumo>(`${this.config.apiUrl}/expedientes/${encodeURIComponent(id)}/resumo`, {}),
    );
  }

  detalhe(id: string): Promise<RespostaDetalhe> {
    return firstValueFrom(
      this.http.get<RespostaDetalhe>(`${this.config.apiUrl}/expedientes/${encodeURIComponent(id)}`),
    );
  }
}

/** Status HTTP de um erro do HttpClient (0 quando não é erro HTTP). */
export function statusDoErro(erro: unknown): number {
  return erro instanceof HttpErrorResponse ? erro.status : 0;
}

/** `correlationId` do corpo de erro padronizado da API, quando houver. */
export function correlationIdDoErro(erro: unknown): string | null {
  if (!(erro instanceof HttpErrorResponse)) return null;
  const corpo = erro.error as { correlationId?: unknown } | null;
  return corpo && typeof corpo.correlationId === 'string' ? corpo.correlationId : null;
}
