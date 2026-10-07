/**
 * Cursor opaco da listagem (Base64 URL de JSON com a chave do último item devolvido).
 *
 * O cursor é validado antes de virar `ExclusiveStartKey`: só as quatro chaves do GSI1,
 * todas texto, do setor do usuário e com o prefixo da consulta corrente. Isso impede usar
 * um cursor para "pular" para outro setor ou para itens fora do painel.
 */
import { CursorInvalidoError } from './tipos.js';

export interface ChaveGsi1 {
  PK: string;
  SK: string;
  GSI1PK: string;
  GSI1SK: string;
}

const TAMANHO_MAXIMO = 1024;
const CAMPOS = ['PK', 'SK', 'GSI1PK', 'GSI1SK'] as const;

export function codificarCursor(chave: ChaveGsi1): string {
  const somenteChaves: ChaveGsi1 = { PK: chave.PK, SK: chave.SK, GSI1PK: chave.GSI1PK, GSI1SK: chave.GSI1SK };
  return Buffer.from(JSON.stringify(somenteChaves), 'utf8').toString('base64url');
}

/** Decodifica e valida o cursor. Lança `CursorInvalidoError` em qualquer divergência. */
export function decodificarCursor(cursor: string, gsi1pkEsperada: string, prefixoGsi1sk: string): ChaveGsi1 {
  if (cursor.length === 0 || cursor.length > TAMANHO_MAXIMO || !/^[A-Za-z0-9_-]+$/.test(cursor)) {
    throw new CursorInvalidoError();
  }
  let valor: unknown;
  try {
    valor = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw new CursorInvalidoError();
  }
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) {
    throw new CursorInvalidoError();
  }
  const registro = valor as Record<string, unknown>;
  const chaves = Object.keys(registro);
  if (chaves.length !== CAMPOS.length || !CAMPOS.every((c) => typeof registro[c] === 'string')) {
    throw new CursorInvalidoError();
  }
  const chave = registro as unknown as ChaveGsi1;
  if (
    chave.GSI1PK !== gsi1pkEsperada ||
    !chave.GSI1SK.startsWith(prefixoGsi1sk) ||
    !chave.PK.startsWith('EXP#') ||
    chave.SK !== 'META'
  ) {
    throw new CursorInvalidoError();
  }
  return chave;
}
