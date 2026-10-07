/**
 * `GET /home` — widgets da tela inicial (Req. 20.1–20.6), lidos em paralelo.
 *
 * Cada widget é independente: se um falhar, ele volta `null` e entra em `widgetsComErro`,
 * sem derrubar os demais (Req. 20.8). Toda saída passa pela máscara de sigilo (Req. 24.7).
 */
import { TEXTO_SIGILOSO, autorizar, mascararSigilo, type UsuarioAutenticado } from '@painel/dominio';
import { criarHandlerApi, type HandlerApi } from '../http/api.js';
import { semPermissao } from '../http/erros.js';
import type { Contador, Noticia, Notificacao, RepositorioConsulta } from '../repositorio/tipos.js';
import { dependenciasPadrao, listaSegura, preguicoso, type DependenciasConsulta } from './comum.js';

export const ROTA_HOME = 'GET /home';
export const QTD_PROXIMOS_PRAZOS = 10;
export const QTD_ALERTAS = 5;

/** Informes dentro do período de exibição na data de referência; destaque primeiro, depois prioridade (1 = maior). */
export function filtrarInformesVigentes(noticias: readonly Noticia[], dataReferencia: string): Noticia[] {
  const instante = new Date(dataReferencia).getTime();
  // Data civil local da referência (o texto já traz o fuso de Brasília).
  const diaReferencia = dataReferencia.slice(0, 10);
  return noticias
    .filter((n) => {
      const inicio = typeof n.dataInicioExibicao === 'string' ? new Date(n.dataInicioExibicao).getTime() : NaN;
      const fim = typeof n.dataFimExibicao === 'string' ? n.dataFimExibicao.slice(0, 10) : '';
      return !Number.isNaN(inicio) && inicio <= instante && fim >= diaReferencia;
    })
    .sort(
      (a, b) =>
        Number(b.destaque === true) - Number(a.destaque === true) ||
        (a.prioridade ?? Number.MAX_SAFE_INTEGER) - (b.prioridade ?? Number.MAX_SAFE_INTEGER) ||
        String(b.dataInicioExibicao).localeCompare(String(a.dataInicioExibicao)),
    );
}

/** Agrupa `CONT#TODOS` e os contadores por gerenciador. */
export function organizarContadores(contadores: readonly Contador[]) {
  const porGerenciador: Record<string, Contador> = {};
  let todos: Contador | null = null;
  for (const contador of contadores) {
    if (contador.gerenciador === 'TODOS') todos = contador;
    else porGerenciador[contador.gerenciador] = contador;
  }
  return { todos, porGerenciador };
}

/** Alertas com a mensagem mascarada quando o expediente é sigiloso para o usuário. */
async function alertasMascarados(repo: RepositorioConsulta, usuario: UsuarioAutenticado) {
  const { itens, totalNaoLidas } = await repo.listarAlertas(usuario.idUsuario, QTD_ALERTAS);
  const ids = itens.map((n) => n.idExpediente).filter((id): id is string => typeof id === 'string' && id.length > 0);
  const sigilos = ids.length > 0 ? await repo.obterSigiloExpedientes(ids) : new Map();
  const mascarados = itens.map((n): Notificacao => {
    if (!n.idExpediente) return n;
    const sigilo = sigilos.get(n.idExpediente);
    if (!sigilo) {
      // Sem como decidir: nega por padrão e mascara a mensagem.
      return n.mensagem === undefined ? n : { ...n, mensagem: TEXTO_SIGILOSO };
    }
    const saida = mascararSigilo({ ...sigilo, notificacoes: [n] }, usuario);
    return (saida.notificacoes?.[0] as Notificacao | undefined) ?? n;
  });
  return { itens: mascarados, totalNaoLidas };
}

export function criarHandlerHome(deps: DependenciasConsulta): HandlerApi {
  return criarHandlerApi(
    ROTA_HOME,
    async ({ usuario, registrador }) => {
      const repo = deps.repositorio;
      const decisao = autorizar(usuario, 'LER_DADOS_PESSOAIS', {
        tipo: 'DADOS_PESSOAIS',
        siglaSetor: usuario.siglaSetor,
        idUsuario: usuario.idUsuario,
      });
      if (!decisao.permitido) throw semPermissao();

      const [contadores, prazos, alertas, informes] = await Promise.allSettled([
        repo.obterContadores(usuario.siglaSetor).then(organizarContadores),
        repo
          .listarProximosPrazos(usuario.siglaSetor, QTD_PROXIMOS_PRAZOS)
          .then((itens) => listaSegura(itens, usuario)),
        alertasMascarados(repo, usuario),
        repo.listarNoticias().then((noticias) => filtrarInformesVigentes(noticias, deps.dataReferencia)),
      ]);

      const widgetsComErro: string[] = [];
      const valor = <T>(resultado: PromiseSettledResult<T>, nome: string): T | null => {
        if (resultado.status === 'fulfilled') return resultado.value;
        widgetsComErro.push(nome);
        return null;
      };
      const proximosPrazos = valor(prazos, 'proximosPrazos');
      const corpo = {
        dataReferencia: deps.dataReferencia,
        contadores: valor(contadores, 'contadores'),
        proximosPrazos,
        // Primeiro item do modo foco (mesma fila do GSI2) — Req. 20.5.
        proximoExpediente: proximosPrazos ? (proximosPrazos[0] ?? null) : null,
        alertas: valor(alertas, 'alertas'),
        informes: valor(informes, 'informes'),
        widgetsComErro,
      };
      if (widgetsComErro.length > 0) {
        registrador.warn('widget com erro', { rota: ROTA_HOME, codigo: widgetsComErro.join(',') });
      }
      return { corpo };
    },
    deps,
  );
}

export const handler: HandlerApi = preguicoso(() => criarHandlerHome(dependenciasPadrao()));
