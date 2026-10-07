/**
 * `GET /expedientes/{id}` — detalhe e histórico numa única consulta (Req. 13.1, 13.3, 13.4).
 *
 * Expediente inexistente e expediente de outro setor dão a mesma resposta 404
 * ("Expediente não encontrado ou sem acesso"), sem revelar existência (Req. 13.9 e 24.4).
 * A máscara de sigilo cobre detalhe, anotações e descrições do histórico (Req. 13.10).
 */
import { autorizar, mascararSigilo, type RecursoExpediente } from '@painel/dominio';
import { criarHandlerApi, type HandlerApi } from '../http/api.js';
import { naoEncontrado, semPermissao } from '../http/erros.js';
import { validarIdExpediente } from '../http/validacao.js';
import { dependenciasPadrao, preguicoso, type DependenciasConsulta } from './comum.js';

export const ROTA_DETALHE = 'GET /expedientes/{id}';

export function criarHandlerDetalheExpediente(deps: DependenciasConsulta): HandlerApi {
  return criarHandlerApi(
    ROTA_DETALHE,
    async ({ usuario, evento, correlationId, registrador }) => {
      const idExpediente = validarIdExpediente(evento.pathParameters?.['id']);
      const detalhe = await deps.repositorio.obterDetalhe(idExpediente);
      if (!detalhe) throw naoEncontrado();

      const exp = detalhe.expediente;
      const recurso: RecursoExpediente = {
        tipo: 'EXPEDIENTE',
        siglaSetor: exp.siglaSetor,
        nivelSigilo: exp.nivelSigilo,
        idResponsavel: exp.idResponsavel ?? null,
      };
      const decisao = autorizar(usuario, 'VER_DETALHE', recurso);
      if (!decisao.permitido) {
        registrador.warn('acesso negado', {
          evento: 'AcessoNegado',
          rota: ROTA_DETALHE,
          status: decisao.status ?? 404,
          idUsuario: usuario.idUsuario,
          idExpediente,
          correlationId,
        });
        throw decisao.status === 403 ? semPermissao() : naoEncontrado();
      }
      const podeVerHistorico = autorizar(usuario, 'VER_HISTORICO', recurso).permitido;

      const { anotacoes, movimentacoes, ...expediente } = mascararSigilo(
        { ...exp, anotacoes: detalhe.anotacoes, movimentacoes: podeVerHistorico ? detalhe.movimentacoes : [] },
        usuario,
      );
      return {
        idExpediente,
        corpo: {
          expediente,
          movimentacoes,
          prazos: detalhe.prazos,
          designacoes: detalhe.designacoes,
          anotacoes,
          marcadores: detalhe.marcadores,
        },
      };
    },
    deps,
  );
}

export const handler: HandlerApi = preguicoso(() => criarHandlerDetalheExpediente(dependenciasPadrao()));
