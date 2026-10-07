import { Match, Template } from 'aws-cdk-lib/assertions';
import { beforeAll, describe, expect, it } from 'vitest';
import { criarApp } from '../lib/app.js';

describe('DadosStack', () => {
  let template: Template;

  beforeAll(() => {
    const { dados } = criarApp({ context: { ambiente: 'teste' } });
    template = Template.fromStack(dados);
  });

  it('cria só uma tabela, Expedientes, com PK/SK String', () => {
    template.resourceCountIs('AWS::DynamoDB::Table', 1);
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      TableName: 'Expedientes',
      KeySchema: [
        { AttributeName: 'PK', KeyType: 'HASH' },
        { AttributeName: 'SK', KeyType: 'RANGE' },
      ],
      AttributeDefinitions: Match.arrayWith(
        ['PK', 'SK', 'GSI1PK', 'GSI1SK', 'GSI2PK', 'GSI2SK'].map((nome) => ({
          AttributeName: nome,
          AttributeType: 'S',
        })),
      ),
    });
  });

  it('usa on-demand, PITR, TTL expiraEm e criptografia padrão da AWS', () => {
    const tabela = template.findResources('AWS::DynamoDB::Table');
    const props = Object.values(tabela)[0]?.Properties;
    expect(props.BillingMode).toBe('PAY_PER_REQUEST');
    expect(props.PointInTimeRecoverySpecification).toEqual({ PointInTimeRecoveryEnabled: true });
    expect(props.TimeToLiveSpecification).toEqual({ AttributeName: 'expiraEm', Enabled: true });
    // Sem chave KMS dedicada (fora do MVP).
    expect(props.SSESpecification?.KMSMasterKeyId).toBeUndefined();
    expect(props.SSESpecification?.SSEType).toBeUndefined();
  });

  it('cria GSI1 e GSI2 com projeção ALL', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      GlobalSecondaryIndexes: [1, 2].map((n) => ({
        IndexName: `GSI${n}`,
        KeySchema: [
          { AttributeName: `GSI${n}PK`, KeyType: 'HASH' },
          { AttributeName: `GSI${n}SK`, KeyType: 'RANGE' },
        ],
        Projection: { ProjectionType: 'ALL' },
      })),
    });
  });

  it('remove a tabela no destroy (Req. 26.7)', () => {
    template.hasResource('AWS::DynamoDB::Table', {
      DeletionPolicy: 'Delete',
      UpdateReplacePolicy: 'Delete',
    });
  });

  it('aplica as tags projeto e ambiente', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      Tags: Match.arrayWith([
        { Key: 'ambiente', Value: 'teste' },
        { Key: 'projeto', Value: 'painel-expedientes' },
      ]),
    });
  });

  it('rejeita ambiente inválido', () => {
    expect(() => criarApp({ context: { ambiente: 'Prod Inválido' } })).toThrow(/ambiente/);
  });
});
