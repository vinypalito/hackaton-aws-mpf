/**
 * Situação do prazo (RN1) e status de cumprimento dos baixados (Req. 9.1, 9.2).
 * Mesma regra de `classificar_prazo` do gerador do seed.
 */

/** Caixas do painel (catálogo `CAIXA`). */
export type Caixa = 'A_RECEBER' | 'NO_SETOR' | 'ENVIADO_NAO_RECEBIDO' | 'BAIXADO';

/** Situações de prazo dos ativos (RN1). */
export type StatusPrazoAtivo = 'VENCIDO' | 'VENCE_HOJE' | 'CRITICO' | 'ATENCAO' | 'NO_PRAZO';

/** Status de cumprimento dos baixados. */
export type StatusCumprimento = 'CUMPRIDO' | 'CUMPRIDO_COM_ATRASO';

/** Catálogo `STATUS_PRAZO` completo. */
export type StatusPrazo = StatusPrazoAtivo | StatusCumprimento;

/** Datas usadas para o status de cumprimento de um expediente baixado. */
export interface DatasCumprimento {
  /** Data do prazo (`AAAA-MM-DD` ou ISO 8601). */
  dataPrazo: string;
  /** Data de encerramento do prazo (`AAAA-MM-DD` ou ISO 8601 com fuso). */
  dataEncerramento: string;
}

const MS_POR_DIA = 86_400_000;

/** Extrai a data civil (`AAAA-MM-DD`) do texto, sem converter fuso (igual a `datetime.date()` do gerador). */
function dataCivil(valor: string): number {
  const correspondencia = /^(\d{4})-(\d{2})-(\d{2})/.exec(valor);
  if (!correspondencia) {
    throw new Error(`Data inválida: ${valor}`);
  }
  const [, ano, mes, dia] = correspondencia;
  return Date.UTC(Number(ano), Number(mes) - 1, Number(dia));
}

/** Diferença em dias civis `dataPrazo − dataEncerramento` (regra do gerador para baixados). */
export function diasEntre(dataPrazo: string, dataEncerramento: string): number {
  return Math.round((dataCivil(dataPrazo) - dataCivil(dataEncerramento)) / MS_POR_DIA);
}

/** RN1: classifica os dias restantes de um expediente ativo. */
export function classificarPrazo(diasRestantes: number): StatusPrazoAtivo {
  if (!Number.isInteger(diasRestantes)) {
    throw new Error(`diasRestantes deve ser inteiro: ${diasRestantes}`);
  }
  if (diasRestantes < 0) return 'VENCIDO';
  if (diasRestantes === 0) return 'VENCE_HOJE';
  if (diasRestantes <= 3) return 'CRITICO';
  if (diasRestantes <= 7) return 'ATENCAO';
  return 'NO_PRAZO';
}

/**
 * Calcula o `statusPrazo` do expediente.
 *
 * - Ativos (`caixa != BAIXADO`): RN1 sobre `diasRestantes`.
 * - Baixados: `CUMPRIDO` se `dataPrazo` ≥ data de encerramento, senão `CUMPRIDO_COM_ATRASO`.
 *   Com `datas`, a diferença vem das datas; sem elas, usa `diasRestantes`, que nos baixados
 *   já é `dataPrazo − dataEncerramento` (regra do gerador).
 */
export function calcularStatusPrazo(
  diasRestantes: number,
  caixa: Caixa,
  datas?: DatasCumprimento,
): StatusPrazo {
  if (caixa !== 'BAIXADO') {
    return classificarPrazo(diasRestantes);
  }
  const dias = datas ? diasEntre(datas.dataPrazo, datas.dataEncerramento) : diasRestantes;
  return dias >= 0 ? 'CUMPRIDO' : 'CUMPRIDO_COM_ATRASO';
}
