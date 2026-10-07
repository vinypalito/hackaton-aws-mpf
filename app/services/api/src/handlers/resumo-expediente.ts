/**
 * `POST /expedientes/{id}/resumo` — resumo do expediente gerado por IA (Amazon Bedrock,
 * Amazon Nova Lite via Converse API).
 *
 * Fluxo: valida o id → usuário só das claims → `autorizar` (mesma regra do detalhe:
 * outro setor ou inexistente dá 404) → expediente sigiloso dá 403 **sem chamar o modelo**
 * → `mascararSigilo` → contexto só com campos não sensíveis → Bedrock.
 *
 * A autenticação no Bedrock é feita só pela role IAM da Lambda (sem API key).
 * Nem o conteúdo do expediente nem o resumo vão para o log (lista branca do registrador).
 */
import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { autorizar, mascararSigilo, type RecursoExpediente } from '@painel/dominio';
import { criarHandlerApi, type HandlerApi } from '../http/api.js';
import { ErroApi, naoEncontrado } from '../http/erros.js';
import { validarIdExpediente } from '../http/validacao.js';
import type { ItemSeed } from '../repositorio/tipos.js';
import { dependenciasPadrao, preguicoso, type DependenciasConsulta } from './comum.js';

export const ROTA_RESUMO = 'POST /expedientes/{id}/resumo';
export const MODELO_PADRAO = 'us.amazon.nova-lite-v1:0';

/** Prompt de sistema fixo (não aceita instruções do usuário). */
export const PROMPT_SISTEMA =
  'Você é um assistente de gabinete do Ministério Público Federal. Com base apenas nos dados ' +
  'fornecidos, resuma em até 3 frases, em português do Brasil, o que é o expediente e qual a ' +
  'próxima ação recomendada. Não invente dados, nomes, números ou datas que não estejam no contexto.';

/** Porta mínima para o cliente do Bedrock (permite mock nos testes). */
export interface ClienteModelo {
  send(comando: ConverseCommand): Promise<{ output?: { message?: { content?: { text?: string }[] } } }>;
}

export interface DependenciasResumo extends DependenciasConsulta {
  readonly bedrock: ClienteModelo;
  readonly modelId: string;
  readonly agora?: () => Date;
}

export const resumoIndisponivelSigiloso = (): ErroApi =>
  new ErroApi(403, 'SIGILOSO', 'Resumo indisponível para expedientes sigilosos');

const falhaModelo = (): ErroApi =>
  new ErroApi(502, 'IA_INDISPONIVEL', 'Não foi possível gerar o resumo agora. Tente novamente.');

/** Monta o contexto enviado ao modelo só com campos não sensíveis (sem nomes, sem anotações). */
export function montarContexto(expediente: Record<string, unknown>, movimentacoes: readonly ItemSeed[]): string {
  const campo = (rotulo: string, valor: unknown) =>
    valor === undefined || valor === null || valor === '' ? null : `${rotulo}: ${String(valor)}`;
  const andamentos = [...movimentacoes]
    .sort((a, b) => String(b['dataHora'] ?? '').localeCompare(String(a['dataHora'] ?? '')))
    .slice(0, 3)
    .map((m) => `- ${String(m['dataHora'] ?? '').slice(0, 10)} ${String(m['tipoMovimentacao'] ?? '')}: ${String(m['descricao'] ?? '')}`);
  return [
    campo('Assunto', expediente['assunto']),
    campo('Tipo', expediente['descricaoClasse'] ?? expediente['gerenciador']),
    campo('Tema', expediente['tema']),
    campo('Situação do prazo', expediente['statusPrazo']),
    campo('Dias restantes', expediente['diasRestantes']),
    campo('Caixa', expediente['caixa']),
    campo('Ação pendente', expediente['acaoPendente']),
    andamentos.length ? `Últimos andamentos:\n${andamentos.join('\n')}` : null,
  ]
    .filter((linha): linha is string => linha !== null)
    .join('\n');
}

export function criarHandlerResumoExpediente(deps: DependenciasResumo): HandlerApi {
  const agora = deps.agora ?? (() => new Date());
  return criarHandlerApi(
    ROTA_RESUMO,
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
          rota: ROTA_RESUMO,
          status: 404,
          idUsuario: usuario.idUsuario,
          idExpediente,
          correlationId,
        });
        throw naoEncontrado();
      }
      // Conteúdo sigiloso nunca vai para prompt de IA, nem para quem pode vê-lo.
      if (exp.nivelSigilo > 0) throw resumoIndisponivelSigiloso();

      const podeVerHistorico = autorizar(usuario, 'VER_HISTORICO', recurso).permitido;
      const { movimentacoes, ...expediente } = mascararSigilo(
        { ...exp, movimentacoes: podeVerHistorico ? detalhe.movimentacoes : [] },
        usuario,
      );

      let resumo: string;
      try {
        const resposta = await deps.bedrock.send(
          new ConverseCommand({
            modelId: deps.modelId,
            system: [{ text: PROMPT_SISTEMA }],
            messages: [{ role: 'user', content: [{ text: montarContexto(expediente, movimentacoes) }] }],
            inferenceConfig: { maxTokens: 300, temperature: 0.2 },
          }),
        );
        resumo = (resposta.output?.message?.content ?? [])
          .map((c) => c.text ?? '')
          .join('')
          .trim();
      } catch (erro) {
        registrador.error('falha no Bedrock', {
          rota: ROTA_RESUMO,
          idExpediente,
          correlationId,
          erro: erro instanceof Error ? erro.name : 'desconhecido',
        });
        throw falhaModelo();
      }
      if (!resumo) throw falhaModelo();

      return { idExpediente, corpo: { resumo, modelo: deps.modelId, geradoEm: agora().toISOString() } };
    },
    deps,
  );
}

export const handler: HandlerApi = preguicoso(() =>
  criarHandlerResumoExpediente({
    ...dependenciasPadrao(),
    bedrock: new BedrockRuntimeClient({ region: process.env['AWS_REGION'] || 'us-east-1' }),
    modelId: process.env['BEDROCK_MODEL_ID'] || MODELO_PADRAO,
  }),
);
