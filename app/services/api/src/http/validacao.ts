/**
 * Validação de entrada por listas brancas (Req. 25.1). Parâmetros desconhecidos são
 * ignorados; setor, perfil e usuário nunca são lidos da requisição (Req. 1.4).
 */
import type { CaixaAtiva, Gerenciador, StatusPrazoFiltro } from '../repositorio/tipos.js';
import { entradaInvalida } from './erros.js';

export const GERENCIADORES: readonly Gerenciador[] = ['JUDICIAL', 'DOCUMENTO', 'EXTRAJUDICIAL'];
/** Caixas do painel. `BAIXADO` é histórico (RN7) e não entra nesta rota. */
export const CAIXAS_ATIVAS: readonly CaixaAtiva[] = ['A_RECEBER', 'NO_SETOR', 'ENVIADO_NAO_RECEBIDO'];
export const STATUS_PRAZO: readonly StatusPrazoFiltro[] = ['VENCIDO', 'VENCE_HOJE', 'CRITICO', 'ATENCAO', 'NO_PRAZO'];

export const LIMITE_PADRAO = 50;
export const LIMITE_MAXIMO = 100;
const ID_EXPEDIENTE = /^EXP\d{1,12}$/;

export interface FiltrosListagem {
  gerenciador?: Gerenciador;
  caixa?: CaixaAtiva;
  statusPrazo?: StatusPrazoFiltro[];
  cursor?: string;
  limite: number;
}

function daLista<T extends string>(valor: string, lista: readonly T[]): T | undefined {
  return (lista as readonly string[]).includes(valor) ? (valor as T) : undefined;
}

/** Valida a query string de `GET /expedientes`. Lança 400 com os campos inválidos. */
export function validarFiltrosListagem(
  parametros: Readonly<Record<string, string | undefined>> | null | undefined,
): FiltrosListagem {
  const p = parametros ?? {};
  const erros: Record<string, string> = {};
  const filtros: FiltrosListagem = { limite: LIMITE_PADRAO };

  if (p['gerenciador'] !== undefined) {
    const gerenciador = daLista(p['gerenciador'], GERENCIADORES);
    if (gerenciador) filtros.gerenciador = gerenciador;
    else erros['gerenciador'] = `Use um de: ${GERENCIADORES.join(', ')}`;
  }
  if (p['caixa'] !== undefined) {
    const caixa = daLista(p['caixa'], CAIXAS_ATIVAS);
    if (caixa) filtros.caixa = caixa;
    else erros['caixa'] = `Use um de: ${CAIXAS_ATIVAS.join(', ')}`;
  }
  if (p['statusPrazo'] !== undefined) {
    const valores = p['statusPrazo'].split(',').map((v) => v.trim());
    const validos = valores.map((v) => daLista(v, STATUS_PRAZO));
    if (valores.length > 0 && valores.length <= STATUS_PRAZO.length && validos.every((v) => v !== undefined)) {
      filtros.statusPrazo = [...new Set(validos as StatusPrazoFiltro[])];
    } else {
      erros['statusPrazo'] = `Use um ou mais (separados por vírgula) de: ${STATUS_PRAZO.join(', ')}`;
    }
  }
  if (p['limite'] !== undefined) {
    const limite = /^\d{1,3}$/.test(p['limite']) ? Number(p['limite']) : NaN;
    if (Number.isInteger(limite) && limite >= 1 && limite <= LIMITE_MAXIMO) filtros.limite = limite;
    else erros['limite'] = `Inteiro de 1 a ${LIMITE_MAXIMO}`;
  }
  if (p['cursor'] !== undefined) {
    if (p['cursor'].length > 0 && p['cursor'].length <= 1024) filtros.cursor = p['cursor'];
    else erros['cursor'] = 'Cursor inválido';
  }
  if (Object.keys(erros).length > 0) {
    throw entradaInvalida(erros);
  }
  return filtros;
}

/** Valida o `{id}` do caminho (`EXP` + dígitos). */
export function validarIdExpediente(id: string | undefined): string {
  if (!id || !ID_EXPEDIENTE.test(id)) {
    throw entradaInvalida({ id: 'Identificador de expediente inválido' });
  }
  return id;
}
