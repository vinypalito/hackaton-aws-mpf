/**
 * Formatos de chave da tabela única (design §3.1). Só a camada de repositório usa este módulo.
 */
import type { CaixaAtiva, Gerenciador } from './tipos.js';

export const INDICE_GSI1 = 'GSI1';
export const INDICE_GSI2 = 'GSI2';

/** Atributos de chave removidos antes de devolver itens aos handlers. */
export const ATRIBUTOS_DE_CHAVE = ['PK', 'SK', 'GSI1PK', 'GSI1SK', 'GSI2PK', 'GSI2SK', 'entidade'] as const;

/** Abreviação do gerenciador no `GSI1SK` (`ATIVO#<JUD|DOC|EXT>#...`). */
export const SIGLA_GERENCIADOR: Readonly<Record<Gerenciador, string>> = {
  JUDICIAL: 'JUD',
  DOCUMENTO: 'DOC',
  EXTRAJUDICIAL: 'EXT',
};

export const pkSetor = (sigla: string): string => `SETOR#${sigla}`;
export const pkUsuario = (idUsuario: string): string => `USR#${idUsuario}`;
export const pkExpediente = (idExpediente: string): string => `EXP#${idExpediente}`;
export const PK_NOTICIA = 'NOTICIA';
export const SK_PERFIL = 'PERFIL';
export const SK_META = 'META';

/** Prefixo do `GSI1SK` dos ativos: `ATIVO#`, `ATIVO#<ger>#` ou `ATIVO#<ger>#<caixa>#`. */
export function prefixoAtivos(gerenciador?: Gerenciador, caixa?: CaixaAtiva): string {
  if (!gerenciador) return 'ATIVO#';
  const base = `ATIVO#${SIGLA_GERENCIADOR[gerenciador]}#`;
  return caixa ? `${base}${caixa}#` : base;
}

/** Copia o item sem os atributos de chave. */
export function semChaves<T extends Record<string, unknown>>(item: Record<string, unknown>): T {
  const copia: Record<string, unknown> = { ...item };
  for (const atributo of ATRIBUTOS_DE_CHAVE) {
    delete copia[atributo];
  }
  return copia as T;
}
