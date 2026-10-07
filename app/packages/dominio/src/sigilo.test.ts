import { describe, expect, it } from 'vitest';
import type { UsuarioAutenticado } from './autorizacao/tipos.js';
import { mascararSigilo, TEXTO_SIGILOSO } from './sigilo.js';

const membro: UsuarioAutenticado = { idUsuario: 'GABSUB3-DVT-U01', siglaSetor: 'GABSUB3-DVT', perfil: 'MEMBRO' };
const chefe: UsuarioAutenticado = { idUsuario: 'GABSUB3-DVT-U02', siglaSetor: 'GABSUB3-DVT', perfil: 'CHEFE' };
const servidor: UsuarioAutenticado = { idUsuario: 'GABSUB3-DVT-U03', siglaSetor: 'GABSUB3-DVT', perfil: 'SERVIDOR' };
const servidorResponsavel: UsuarioAutenticado = { ...servidor, idUsuario: 'GABSUB3-DVT-U04' };

const sigiloso = {
  idExpediente: 'EXP000123',
  etiqueta: 'PGR-00012345/2026',
  siglaSetor: 'GABSUB3-DVT',
  caixa: 'NO_SETOR',
  dataPrazo: '2026-10-09',
  statusPrazo: 'CRITICO',
  nivelSigilo: 1,
  idResponsavel: 'GABSUB3-DVT-U04',
  assunto: 'Assunto real',
  resumo: 'Resumo real',
  tema: 'Tema real',
  anotacoes: [{ idAnotacao: 'ANO1', texto: 'Texto real' }],
  movimentacoes: [{ idMovimentacao: 'MOV1', descricao: 'Descrição real' }],
  notificacoes: [{ idNotificacao: 'NOT1', mensagem: 'Mensagem real' }],
};

describe('mascararSigilo (RN6)', () => {
  it('SERVIDOR não responsável recebe a máscara, com identificação, prazo e caixa preservados', () => {
    const saida = mascararSigilo(sigiloso, servidor);
    expect(saida).toMatchObject({
      idExpediente: 'EXP000123',
      etiqueta: 'PGR-00012345/2026',
      caixa: 'NO_SETOR',
      dataPrazo: '2026-10-09',
      statusPrazo: 'CRITICO',
      assunto: TEXTO_SIGILOSO,
      resumo: TEXTO_SIGILOSO,
      tema: TEXTO_SIGILOSO,
    });
    expect(saida.anotacoes).toEqual([{ idAnotacao: 'ANO1', texto: TEXTO_SIGILOSO }]);
    expect(saida.movimentacoes).toEqual([{ idMovimentacao: 'MOV1', descricao: TEXTO_SIGILOSO }]);
    expect(saida.notificacoes).toEqual([{ idNotificacao: 'NOT1', mensagem: TEXTO_SIGILOSO }]);
  });

  it('não altera o objeto de entrada', () => {
    mascararSigilo(sigiloso, servidor);
    expect(sigiloso.assunto).toBe('Assunto real');
    expect(sigiloso.anotacoes[0]?.texto).toBe('Texto real');
  });

  it('MEMBRO, CHEFE e SERVIDOR responsável veem o conteúdo (níveis 1 e 2)', () => {
    for (const u of [membro, chefe, servidorResponsavel]) {
      expect(mascararSigilo(sigiloso, u).assunto).toBe('Assunto real');
      expect(mascararSigilo({ ...sigiloso, nivelSigilo: 2 }, u).resumo).toBe('Resumo real');
    }
  });

  it('expediente público não é mascarado', () => {
    expect(mascararSigilo({ ...sigiloso, nivelSigilo: 0 }, servidor).assunto).toBe('Assunto real');
  });

  it('usuário de outro setor recebe a máscara (negação por padrão)', () => {
    const chefeStic: UsuarioAutenticado = { idUsuario: 'CIVINT-STIC-U01', siglaSetor: 'CIVINT/STIC', perfil: 'CHEFE' };
    expect(mascararSigilo(sigiloso, chefeStic).assunto).toBe(TEXTO_SIGILOSO);
  });

  it('não cria campos ausentes', () => {
    const { resumo: _r, anotacoes: _a, ...semResumo } = sigiloso;
    const saida = mascararSigilo(semResumo, servidor);
    expect('resumo' in saida).toBe(false);
    expect('anotacoes' in saida).toBe(false);
  });
});
