import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  atributosCriacao,
  atributosMutaveis,
  dividirLinhaCsv,
  divergenciasImutaveis,
  interpretarArgumentos,
  interpretarUsuariosCsv,
  problemasSenha,
} from './nucleo.js';

const CSV_KIT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../resources/hackathon-expedientes/seed/saida/csv/usuarios.csv',
);

const CABECALHO = 'idUsuario,nome,siglaSetor,perfil,cargo,email,ativo,dataUltimoAcesso';
const linha = (sobrescrever: Partial<Record<string, string>> = {}): string => {
  const base = {
    idUsuario: 'SET-U01',
    nome: 'Ana Exemplo',
    siglaSetor: 'CIVINT/STIC',
    perfil: 'CHEFE',
    cargo: 'Coordenador(a)',
    email: 'usuario01@exemplo.org',
    ativo: 'true',
    dataUltimoAcesso: '2026-10-04T01:37:00-03:00',
    ...sobrescrever,
  };
  return Object.values(base).join(',');
};

describe('interpretarUsuariosCsv', () => {
  it('lê os 14 usuários do kit (Req. 1.1)', () => {
    const usuarios = interpretarUsuariosCsv(readFileSync(CSV_KIT, 'utf8'));
    expect(usuarios).toHaveLength(14);
    expect(usuarios[1]).toEqual({
      idUsuario: 'GABSUB3-DVT-U02',
      nome: 'Bruno Teste',
      siglaSetor: 'GABSUB3-DVT',
      perfil: 'CHEFE',
      email: 'usuario02@exemplo.org',
      ativo: true,
    });
    expect(new Set(usuarios.map((u) => u.siglaSetor))).toEqual(new Set(['GABSUB3-DVT', 'CIVINT/STIC']));
  });

  it('aceita BOM, CRLF e campo entre aspas com vírgula', () => {
    const csv = `\uFEFF${CABECALHO}\r\n${linha({ nome: '"Silva, Ana"', ativo: 'FALSE' })}\r\n`;
    const [u] = interpretarUsuariosCsv(csv);
    expect(u?.nome).toBe('Silva, Ana');
    expect(u?.ativo).toBe(false);
  });

  it.each([
    [{ perfil: 'ADMIN' }, /perfil inválido/],
    [{ ativo: 'sim' }, /ativo/],
    [{ email: 'sem-arroba' }, /e-mail/],
    [{ idUsuario: 'com espaço' }, /idUsuario inválido/],
    [{ siglaSetor: '' }, /siglaSetor/],
  ])('rejeita linha inválida %o', (campo, erro) => {
    expect(() => interpretarUsuariosCsv(`${CABECALHO}\n${linha(campo)}`)).toThrow(erro);
  });

  it('rejeita idUsuario duplicado (sem diferenciar maiúsculas) e coluna ausente', () => {
    expect(() =>
      interpretarUsuariosCsv(`${CABECALHO}\n${linha()}\n${linha({ idUsuario: 'set-u01' })}`),
    ).toThrow(/duplicado/);
    expect(() => interpretarUsuariosCsv('idUsuario,nome\nX,Y')).toThrow(/Coluna ausente/);
  });
});

describe('atributos', () => {
  const [u] = interpretarUsuariosCsv(`${CABECALHO}\n${linha()}`);
  if (u === undefined) throw new Error('fixture');

  it('criação inclui e-mail verificado, nome e os três custom (Req. 1.2)', () => {
    expect(atributosCriacao(u)).toEqual([
      { Name: 'email', Value: 'usuario01@exemplo.org' },
      { Name: 'email_verified', Value: 'true' },
      { Name: 'name', Value: 'Ana Exemplo' },
      { Name: 'custom:idUsuario', Value: 'SET-U01' },
      { Name: 'custom:siglaSetor', Value: 'CIVINT/STIC' },
      { Name: 'custom:perfil', Value: 'CHEFE' },
    ]);
  });

  it('atualização nunca envia atributos custom (imutáveis)', () => {
    expect(atributosMutaveis(u).some((a) => a.Name.startsWith('custom:'))).toBe(false);
  });

  it('detecta atributos imutáveis divergentes', () => {
    const existentes = atributosCriacao(u).map((a) => (a.Name === 'custom:perfil' ? { ...a, Value: 'SERVIDOR' } : a));
    expect(divergenciasImutaveis(u, existentes)).toEqual(['custom:perfil']);
    expect(divergenciasImutaveis(u, atributosCriacao(u))).toEqual([]);
  });
});

describe('problemasSenha', () => {
  it('aceita senha conforme a política do User Pool', () => {
    expect(problemasSenha('DemoPainel2026')).toEqual([]);
  });

  it('aponta cada regra violada', () => {
    expect(problemasSenha('curta1A')).toContain('mínimo de 12 caracteres');
    expect(problemasSenha('semmaiuscula123')).toContain('ao menos uma letra maiúscula');
    expect(problemasSenha('SEMMINUSCULA123')).toContain('ao menos uma letra minúscula');
    expect(problemasSenha('SemDigitoAlgum')).toContain('ao menos um dígito');
    expect(problemasSenha(' ComEspaco2026')).toContain('sem espaços no início ou no fim');
  });
});

describe('interpretarArgumentos e dividirLinhaCsv', () => {
  it('lê os argumentos conhecidos e rejeita os demais', () => {
    expect(interpretarArgumentos(['--user-pool-id', 'us-east-1_Abc', '--csv', 'x.csv'])).toEqual({
      userPoolId: 'us-east-1_Abc',
      csv: 'x.csv',
      regiao: undefined,
    });
    expect(() => interpretarArgumentos(['--senha', 'x'])).toThrow(/desconhecido/);
    expect(() => interpretarArgumentos(['--csv'])).toThrow(/Falta valor/);
  });

  it('trata aspas escapadas e rejeita aspas abertas', () => {
    expect(dividirLinhaCsv('a,"b ""c""",d')).toEqual(['a', 'b "c"', 'd']);
    expect(() => dividirLinhaCsv('a,"b')).toThrow(/Aspas/);
  });
});
