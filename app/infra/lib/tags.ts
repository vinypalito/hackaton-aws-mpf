import { Tags } from 'aws-cdk-lib';
import type { IConstruct } from 'constructs';

export const NOME_PROJETO = 'painel-expedientes';

/** Aplica as tags obrigatórias a todos os recursos abaixo de `escopo` (Req. 32.3). */
export function aplicarTags(escopo: IConstruct, ambiente: string): void {
  Tags.of(escopo).add('projeto', NOME_PROJETO);
  Tags.of(escopo).add('ambiente', ambiente);
}
