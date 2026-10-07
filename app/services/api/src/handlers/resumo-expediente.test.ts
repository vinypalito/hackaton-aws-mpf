import type { ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { describe, expect, it } from 'vitest';
import type { Expediente } from '../repositorio/tipos.js';
import { RegistradorMemoria, RepositorioMemoria, claimsDe, eventoApi } from '../teste/apoio.js';
import { criarHandlerResumoExpediente, type ClienteModelo } from './resumo-expediente.js';

const SETOR = 'GABSUB3-DVT';
const CHEFE = claimsDe('GABSUB3-DVT-U02', SETOR, 'CHEFE');

const base = (id: string, extra: Partial<Expediente> = {}): Expediente => ({
  idExpediente: id,
  siglaSetor: SETOR,
  gerenciador: 'JUDICIAL',
  caixa: 'NO_SETOR',
  statusPrazo: 'CRITICO',
  nivelSigilo: 0,
  idResponsavel: 'GABSUB3-DVT-U01',
  assunto: 'Assunto público',
  ...extra,
});

/** Bedrock falso: guarda os comandos recebidos e devolve um texto fixo. */
class BedrockFalso implements ClienteModelo {
  readonly comandos: ConverseCommand[] = [];
  async send(comando: ConverseCommand) {
    this.comandos.push(comando);
    return { output: { message: { content: [{ text: ' Resumo gerado. ' }] } } };
  }
}

function criar() {
  const bedrock = new BedrockFalso();
  const registrador = new RegistradorMemoria();
  const handler = criarHandlerResumoExpediente({
    repositorio: new RepositorioMemoria({
      expedientes: [base('EXP000001'), base('EXP000010', { nivelSigilo: 1, assunto: 'Assunto secreto' })],
    }),
    dataReferencia: '2026-10-07T17:00:00-03:00',
    registrador,
    bedrock,
    modelId: 'us.amazon.nova-lite-v1:0',
    agora: () => new Date('2026-10-07T20:00:00Z'),
  });
  return { bedrock, registrador, handler };
}

describe('POST /expedientes/{id}/resumo', () => {
  it('devolve o resumo do Bedrock com modelo e data de geração', async () => {
    const { bedrock, registrador, handler } = criar();
    const resposta = await handler(eventoApi({ claims: CHEFE, path: { id: 'EXP000001' } }));
    expect(resposta.statusCode).toBe(200);
    expect(JSON.parse(resposta.body)).toEqual({
      resumo: 'Resumo gerado.',
      modelo: 'us.amazon.nova-lite-v1:0',
      geradoEm: '2026-10-07T20:00:00.000Z',
    });
    expect(bedrock.comandos).toHaveLength(1);
    const entrada = bedrock.comandos[0]!.input;
    expect(entrada.modelId).toBe('us.amazon.nova-lite-v1:0');
    expect(entrada.inferenceConfig).toEqual({ maxTokens: 300, temperature: 0.2 });
    expect(JSON.stringify(entrada.messages)).toContain('Assunto público');
    // Nem o resumo nem o conteúdo do expediente vão para o log.
    expect(JSON.stringify(registrador.linhas)).not.toMatch(/Resumo gerado|Assunto público/);
  });

  it('responde 403 para expediente sigiloso sem chamar o Bedrock', async () => {
    const { bedrock, handler } = criar();
    const resposta = await handler(eventoApi({ claims: CHEFE, path: { id: 'EXP000010' } }));
    expect(resposta.statusCode).toBe(403);
    expect(JSON.parse(resposta.body)).toMatchObject({ codigo: 'SIGILOSO', correlationId: 'req-teste-1' });
    expect(resposta.body).not.toContain('secreto');
    expect(bedrock.comandos).toHaveLength(0);
  });
});
