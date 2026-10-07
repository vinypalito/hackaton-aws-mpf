/**
 * `GET /me` — usuário, setor, perfil e data de referência (Req. 1.3, 1.4 e 1.8).
 * Identificação, setor e perfil vêm só das claims; o nome vem de `USR#<id>/PERFIL`.
 */
import { autorizar } from '@painel/dominio';
import { criarHandlerApi, type HandlerApi } from '../http/api.js';
import { naoEncontrado } from '../http/erros.js';
import { dependenciasPadrao, preguicoso, type DependenciasConsulta } from './comum.js';

export const ROTA_ME = 'GET /me';

export function criarHandlerMe(deps: DependenciasConsulta): HandlerApi {
  return criarHandlerApi(
    ROTA_ME,
    async ({ usuario }) => {
      const decisao = autorizar(usuario, 'LER_DADOS_PESSOAIS', {
        tipo: 'DADOS_PESSOAIS',
        siglaSetor: usuario.siglaSetor,
        idUsuario: usuario.idUsuario,
      });
      if (!decisao.permitido) throw naoEncontrado('Usuário não encontrado');

      const [perfil, setor] = await Promise.all([
        deps.repositorio.obterPerfilUsuario(usuario.idUsuario),
        deps.repositorio.obterSetor(usuario.siglaSetor),
      ]);
      return {
        corpo: {
          idUsuario: usuario.idUsuario,
          nome: perfil?.nome ?? null,
          cargo: perfil?.cargo ?? null,
          siglaSetor: usuario.siglaSetor,
          nomeSetor: setor?.nome ?? null,
          perfil: usuario.perfil,
          gerenciadores: setor?.gerenciadores ?? [],
          dataReferencia: deps.dataReferencia,
          baseSintetica: true,
        },
      };
    },
    deps,
  );
}

export const handler: HandlerApi = preguicoso(() => criarHandlerMe(dependenciasPadrao()));
