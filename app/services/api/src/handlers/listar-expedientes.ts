/**
 * `GET /expedientes?gerenciador&caixa&statusPrazo&cursor&limite` — painel do setor
 * (Req. 3.1, 3.3, 3.6 e 4.2). Só ativos (`caixa != BAIXADO`, RN7), via GSI1, com cursor opaco.
 */
import { autorizar } from '@painel/dominio';
import { criarHandlerApi, type HandlerApi } from '../http/api.js';
import { entradaInvalida, semPermissao } from '../http/erros.js';
import { validarFiltrosListagem } from '../http/validacao.js';
import { CursorInvalidoError } from '../repositorio/tipos.js';
import { dependenciasPadrao, listaSegura, preguicoso, type DependenciasConsulta } from './comum.js';

export const ROTA_LISTAR = 'GET /expedientes';

export function criarHandlerListarExpedientes(deps: DependenciasConsulta): HandlerApi {
  return criarHandlerApi(
    ROTA_LISTAR,
    async ({ usuario, evento }) => {
      const filtros = validarFiltrosListagem(evento.queryStringParameters);
      // Decisão no nível do setor do próprio usuário; cada item é conferido de novo em listaSegura.
      const decisao = autorizar(usuario, 'LISTAR', {
        tipo: 'EXPEDIENTE',
        siglaSetor: usuario.siglaSetor,
        nivelSigilo: 0,
      });
      if (!decisao.permitido) throw semPermissao();

      try {
        const pagina = await deps.repositorio.listarAtivosDoSetor(usuario.siglaSetor, filtros);
        return {
          corpo: {
            itens: listaSegura(pagina.itens, usuario),
            cursor: pagina.cursor,
            limite: filtros.limite,
          },
        };
      } catch (erro) {
        if (erro instanceof CursorInvalidoError) throw entradaInvalida({ cursor: 'Cursor inválido' });
        throw erro;
      }
    },
    deps,
  );
}

export const handler: HandlerApi = preguicoso(() => criarHandlerListarExpedientes(dependenciasPadrao()));
