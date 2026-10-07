import { CfnOutput, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import {
  AttributeType,
  BillingMode,
  ProjectionType,
  Table,
  TableEncryption,
  type ITable,
} from 'aws-cdk-lib/aws-dynamodb';
import type { Construct } from 'constructs';

/** Nome físico da tabela única. Os scripts de carga e migração usam este nome. */
export const NOME_TABELA_PADRAO = 'Expedientes';

export interface DadosStackProps extends StackProps {
  /** Ambiente lógico (ex.: `dev`). Usado em tags e saídas. */
  readonly ambiente: string;
  /** Nome físico da tabela. Padrão: `Expedientes`. */
  readonly nomeTabela?: string;
}

/**
 * Camada de dados: tabela única `Expedientes` no formato exato do `itens.json` do kit
 * (PK/SK + GSI1 e GSI2, todos String, projeção ALL).
 *
 * - Capacidade sob demanda e PITR (Req. 29.2).
 * - TTL no atributo `expiraEm` (idempotência, lotes temporários).
 * - Criptografia padrão gerenciada pela AWS (sem chave KMS dedicada no MVP).
 * - `RemovalPolicy.DESTROY`: `cdk destroy --all` remove a tabela ao fim do evento (Req. 26.7).
 */
export class DadosStack extends Stack {
  /** Tabela exposta para as demais stacks (ApiStack, AgendamentosStack...). */
  public readonly tabela: ITable;
  public readonly nomeTabela: string;
  public readonly arnTabela: string;

  constructor(scope: Construct, id: string, props: DadosStackProps) {
    super(scope, id, props);

    const tabela = new Table(this, 'TabelaExpedientes', {
      tableName: props.nomeTabela ?? NOME_TABELA_PADRAO,
      partitionKey: { name: 'PK', type: AttributeType.STRING },
      sortKey: { name: 'SK', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      timeToLiveAttribute: 'expiraEm',
      encryption: TableEncryption.DEFAULT,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // GSI1: fila do painel por setor (SETOR#<sigla> / ATIVO#..., HIST#...).
    tabela.addGlobalSecondaryIndex({
      indexName: 'GSI1',
      partitionKey: { name: 'GSI1PK', type: AttributeType.STRING },
      sortKey: { name: 'GSI1SK', type: AttributeType.STRING },
      projectionType: ProjectionType.ALL,
    });

    // GSI2: agenda de prazos por setor (SETOR#<sigla> / PRAZO#<data>#...).
    tabela.addGlobalSecondaryIndex({
      indexName: 'GSI2',
      partitionKey: { name: 'GSI2PK', type: AttributeType.STRING },
      sortKey: { name: 'GSI2SK', type: AttributeType.STRING },
      projectionType: ProjectionType.ALL,
    });

    this.tabela = tabela;
    this.nomeTabela = tabela.tableName;
    this.arnTabela = tabela.tableArn;

    new CfnOutput(this, 'NomeTabela', {
      value: tabela.tableName,
      description: `Tabela única do painel (ambiente ${props.ambiente})`,
    });
    new CfnOutput(this, 'ArnTabela', { value: tabela.tableArn });
  }
}
