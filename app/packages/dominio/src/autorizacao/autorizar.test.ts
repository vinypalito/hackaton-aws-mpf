import { describe, expect, it } from 'vitest';
import { autorizar } from './autorizar.js';
import type { RecursoExpediente, RecursoFiltro, UsuarioAutenticado } from './tipos.js';

// Usuários fictícios de usuarios.csv.
const membro: UsuarioAutenticado = { idUsuario: 'GABSUB3-DVT-U01', siglaSetor: 'GABSUB3-DVT', perfil: 'MEMBRO' };
const chefe: UsuarioAutenticado = { idUsuario: 'GABSUB3-DVT-U02', siglaSetor: 'GABSUB3-DVT', perfil: 'CHEFE' };
const servidor: UsuarioAutenticado = { idUsuario: 'GABSUB3-DVT-U03', siglaSetor: 'GABSUB3-DVT', perfil: 'SERVIDOR' };
const servidorStic: UsuarioAutenticado = { idUsuario: 'CIVINT-STIC-U02', siglaSetor: 'CIVINT/STIC', perfil: 'SERVIDOR' };

const SETOR = 'GABSUB3-DVT';
const expPublico: RecursoExpediente = { tipo: 'EXPEDIENTE', siglaSetor: SETOR, nivelSigilo: 0, idResponsavel: membro.idUsuario };
const expSigiloso: RecursoExpediente = { ...expPublico, nivelSigilo: 1 };
const expDoServidor: RecursoExpediente = { ...expPublico, idResponsavel: servidor.idUsuario };
// FIL000001: autor GABSUB3-DVT-U01, compartilhado; FIL000002: não compartilhado.
const fil1: RecursoFiltro = { tipo: 'FILTRO', siglaSetor: SETOR, idUsuario: membro.idUsuario, compartilhadoComSetor: true };
const fil2: RecursoFiltro = { ...fil1, compartilhadoComSetor: false };

const permitido = (d: ReturnType<typeof autorizar>) => expect(d).toMatchObject({ permitido: true });
const negado403 = (d: ReturnType<typeof autorizar>) =>
  expect(d).toEqual({ permitido: false, status: 403, motivo: 'Sem permissão para esta ação' });
const negado404 = (d: ReturnType<typeof autorizar>) => expect(d).toMatchObject({ permitido: false, status: 404 });

describe('autorizar — setor e negação por padrão', () => {
  it('CIVINT-STIC-U02 abre expediente do GABSUB3-DVT → 404', () => {
    negado404(autorizar(servidorStic, 'VER_DETALHE', expPublico));
  });

  it('outro setor → 404 para qualquer recurso e perfil', () => {
    const chefeStic: UsuarioAutenticado = { ...servidorStic, idUsuario: 'CIVINT-STIC-U01', perfil: 'CHEFE' };
    negado404(autorizar(chefeStic, 'LER_FILTRO', fil1));
    negado404(autorizar(chefeStic, 'DESFAZER_LOTE', { tipo: 'LOTE', siglaSetor: SETOR, idUsuario: membro.idUsuario }));
  });

  it('usuário ou recurso inválido → 404', () => {
    negado404(autorizar(null, 'LISTAR', expPublico));
    negado404(autorizar({ ...membro, perfil: 'ADMIN' as never }, 'LISTAR', expPublico));
    negado404(autorizar(membro, 'LISTAR', undefined));
  });

  it('ação fora da matriz → 403', () => {
    negado403(autorizar(chefe, 'APAGAR_TUDO', expPublico));
    negado403(autorizar(chefe, 'EDITAR_FILTRO', expPublico)); // ação de outro tipo de recurso
    negado403(autorizar(chefe, 'toString', expPublico)); // propriedade herdada não conta
  });
});

describe('autorizar — linhas da matriz (Req. 24.3)', () => {
  it('expediente público: listar/detalhe/histórico permitido; ação inexistente negada', () => {
    for (const u of [membro, chefe, servidor]) {
      permitido(autorizar(u, 'LISTAR', expPublico));
      permitido(autorizar(u, 'VER_DETALHE', expPublico));
      permitido(autorizar(u, 'VER_HISTORICO', expPublico));
    }
    negado404(autorizar(servidorStic, 'LISTAR', expPublico));
  });

  it('ver conteúdo sigiloso: MEMBRO/CHEFE sim; SERVIDOR só se responsável', () => {
    permitido(autorizar(membro, 'VER_CONTEUDO_SIGILOSO', expSigiloso));
    permitido(autorizar(chefe, 'VER_CONTEUDO_SIGILOSO', { ...expSigiloso, nivelSigilo: 2 }));
    permitido(autorizar(servidor, 'VER_CONTEUDO_SIGILOSO', { ...expDoServidor, nivelSigilo: 2 }));
    permitido(autorizar(servidor, 'VER_CONTEUDO_SIGILOSO', expPublico));
    negado403(autorizar(servidor, 'VER_CONTEUDO_SIGILOSO', expSigiloso));
  });

  it('RECEBER, INCLUIR_MARCADOR, DAR_CIENCIA, ANOTAR: todos do setor', () => {
    for (const acao of ['RECEBER', 'INCLUIR_MARCADOR', 'DAR_CIENCIA', 'ANOTAR'] as const) {
      permitido(autorizar(servidor, acao, expPublico));
      negado404(autorizar(servidorStic, acao, expPublico));
    }
  });

  it('DESIGNAR: SERVIDOR só para si mesmo; MEMBRO/CHEFE para qualquer um', () => {
    permitido(autorizar(servidor, 'DESIGNAR', expPublico, { idDestino: servidor.idUsuario }));
    permitido(autorizar(chefe, 'DESIGNAR', expPublico, { idDestino: servidor.idUsuario }));
    negado403(autorizar(servidor, 'DESIGNAR', expPublico, { idDestino: 'GABSUB3-DVT-U04' }));
    negado403(autorizar(servidor, 'DESIGNAR', expPublico));
  });

  it('DISTRIBUIR e ASSINAR: SERVIDOR não', () => {
    for (const acao of ['DISTRIBUIR', 'ASSINAR'] as const) {
      permitido(autorizar(membro, acao, expPublico));
      permitido(autorizar(chefe, acao, expPublico));
      negado403(autorizar(servidor, acao, expDoServidor));
    }
  });

  it('MOVIMENTAR e ARQUIVAR: SERVIDOR só se responsável', () => {
    for (const acao of ['MOVIMENTAR', 'ARQUIVAR'] as const) {
      permitido(autorizar(servidor, acao, expDoServidor));
      permitido(autorizar(chefe, acao, expDoServidor));
      negado403(autorizar(servidor, acao, expPublico));
    }
  });

  it('lote: executar e ver trilha no setor; outro setor negado', () => {
    const lote = { tipo: 'LOTE', siglaSetor: SETOR, idUsuario: membro.idUsuario } as const;
    permitido(autorizar(servidor, 'EXECUTAR_LOTE', lote));
    permitido(autorizar(servidor, 'VER_TRILHA_LOTE', lote));
    negado404(autorizar(servidorStic, 'VER_TRILHA_LOTE', lote));
  });

  it('desfazer lote: GABSUB3-DVT-U02 (CHEFE) desfaz lote do setor; demais só o próprio', () => {
    const loteDoMembro = { tipo: 'LOTE', siglaSetor: SETOR, idUsuario: membro.idUsuario } as const;
    permitido(autorizar(chefe, 'DESFAZER_LOTE', loteDoMembro));
    permitido(autorizar(membro, 'DESFAZER_LOTE', loteDoMembro));
    negado403(autorizar(servidor, 'DESFAZER_LOTE', loteDoMembro));
  });

  it('filtro próprio: autor lê, edita, exclui e compartilha; outros não', () => {
    for (const acao of ['LER_FILTRO', 'EDITAR_FILTRO', 'EXCLUIR_FILTRO', 'COMPARTILHAR_FILTRO'] as const) {
      permitido(autorizar(membro, acao, fil2));
      negado403(autorizar(chefe, acao, fil2));
    }
  });

  it('filtro compartilhado: GABSUB3-DVT-U03 aplica FIL000001, mas não edita nem exclui', () => {
    permitido(autorizar(servidor, 'APLICAR_FILTRO', fil1));
    permitido(autorizar(servidor, 'LER_FILTRO', fil1));
    negado403(autorizar(servidor, 'EDITAR_FILTRO', fil1));
    negado403(autorizar(servidor, 'EXCLUIR_FILTRO', fil1));
  });

  it('dados pessoais: só o próprio usuário', () => {
    const prefsServidor = { tipo: 'DADOS_PESSOAIS', siglaSetor: SETOR, idUsuario: servidor.idUsuario } as const;
    permitido(autorizar(servidor, 'LER_DADOS_PESSOAIS', prefsServidor));
    permitido(autorizar(servidor, 'ALTERAR_DADOS_PESSOAIS', prefsServidor));
    negado403(autorizar(chefe, 'LER_DADOS_PESSOAIS', prefsServidor));
    negado403(autorizar(membro, 'ALTERAR_DADOS_PESSOAIS', prefsServidor));
  });

  it('produtividade de outra pessoa: MEMBRO/CHEFE sim; SERVIDOR só a própria', () => {
    const prodOutro = { tipo: 'PRODUTIVIDADE', siglaSetor: SETOR, idUsuario: 'GABSUB3-DVT-U04' } as const;
    permitido(autorizar(chefe, 'VER_PRODUTIVIDADE', prodOutro));
    permitido(autorizar(membro, 'VER_PRODUTIVIDADE', prodOutro));
    permitido(autorizar(servidor, 'VER_PRODUTIVIDADE', { ...prodOutro, idUsuario: servidor.idUsuario }));
    negado403(autorizar(servidor, 'VER_PRODUTIVIDADE', prodOutro));
  });

  it('exportação: todos do setor; outro setor negado', () => {
    const exportacao = { tipo: 'EXPORTACAO', siglaSetor: SETOR } as const;
    permitido(autorizar(servidor, 'GERAR_EXPORTACAO', exportacao));
    negado404(autorizar(servidorStic, 'GERAR_EXPORTACAO', exportacao));
  });
});
