/**
 * Erros padronizados da API (design §4.3 e §11): `{codigo, mensagem, correlationId, campos?}`,
 * sempre sem *stack trace*.
 */
export class ErroApi extends Error {
  constructor(
    public readonly status: number,
    public readonly codigo: string,
    mensagem: string,
    public readonly campos?: Readonly<Record<string, string>>,
  ) {
    super(mensagem);
    this.name = 'ErroApi';
  }
}

export const MENSAGEM_NAO_ENCONTRADO = 'Expediente não encontrado ou sem acesso';

export const naoAutenticado = (): ErroApi =>
  new ErroApi(401, 'NAO_AUTENTICADO', 'Autenticação necessária');

export const entradaInvalida = (campos: Record<string, string>): ErroApi =>
  new ErroApi(400, 'ENTRADA_INVALIDA', 'Parâmetros inválidos', campos);

export const naoEncontrado = (mensagem = MENSAGEM_NAO_ENCONTRADO): ErroApi =>
  new ErroApi(404, 'NAO_ENCONTRADO', mensagem);

export const semPermissao = (): ErroApi => new ErroApi(403, 'SEM_PERMISSAO', 'Sem permissão para esta ação');
