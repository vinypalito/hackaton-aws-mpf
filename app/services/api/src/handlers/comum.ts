/**
 * Dependências e utilitários compartilhados pelos handlers de consulta.
 */
import {
  DATA_REFERENCIA_PADRAO,
  autorizar,
  mascararSigilo,
  type UsuarioAutenticado,
} from '@painel/dominio';
import type { RegistradorLog } from '../http/logger.js';
import { RepositorioDynamo } from '../repositorio/dynamo.js';
import type { Expediente, RepositorioConsulta } from '../repositorio/tipos.js';

export interface DependenciasConsulta {
  readonly repositorio: RepositorioConsulta;
  /** Data de referência da base (env `DATA_REFERENCIA`, ISO 8601 com fuso). */
  readonly dataReferencia: string;
  readonly registrador?: RegistradorLog;
  readonly origensPermitidas?: readonly string[];
}

/** Dependências reais da Lambda (tabela do env `NOME_TABELA`). */
export function dependenciasPadrao(): DependenciasConsulta {
  return {
    repositorio: new RepositorioDynamo(process.env['NOME_TABELA'] ?? ''),
    dataReferencia: process.env['DATA_REFERENCIA'] || DATA_REFERENCIA_PADRAO,
  };
}

/**
 * Saída segura de uma lista de expedientes: descarta o que o PDP não deixa listar
 * (defesa em profundidade) e aplica a máscara de sigilo antes da serialização (Req. 24.7).
 */
export function listaSegura(itens: readonly Expediente[], usuario: UsuarioAutenticado): Expediente[] {
  return itens
    .filter(
      (exp) =>
        autorizar(usuario, 'LISTAR', {
          tipo: 'EXPEDIENTE',
          siglaSetor: exp.siglaSetor,
          nivelSigilo: exp.nivelSigilo,
          idResponsavel: exp.idResponsavel ?? null,
        }).permitido,
    )
    .map((exp) => mascararSigilo(exp, usuario));
}

/** Cria o handler na primeira invocação (o módulo pode ser importado sem env, ex.: testes). */
export function preguicoso<A, R>(fabrica: () => (arg: A) => Promise<R>): (arg: A) => Promise<R> {
  let instancia: ((arg: A) => Promise<R>) | undefined;
  return (arg) => {
    instancia ??= fabrica();
    return instancia(arg);
  };
}
