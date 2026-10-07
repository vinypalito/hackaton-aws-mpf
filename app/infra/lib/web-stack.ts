import { existsSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Annotations, CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import {
  Distribution,
  HttpVersion,
  ResponseHeadersPolicy,
  SecurityPolicyProtocol,
  ViewerProtocolPolicy,
} from 'aws-cdk-lib/aws-cloudfront';
import { S3BucketOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { BlockPublicAccess, Bucket, BucketEncryption } from 'aws-cdk-lib/aws-s3';
import { BucketDeployment, CacheControl, Source } from 'aws-cdk-lib/aws-s3-deployment';
import type { Construct } from 'constructs';

const DIRETORIO_LIB = path.dirname(fileURLToPath(import.meta.url));
/** Saída do `ng build` (rode `npm run build -w @painel/web` antes do synth/deploy). */
export const DIRETORIO_SPA = path.resolve(DIRETORIO_LIB, '../../web/dist/web/browser');

export interface WebStackProps extends StackProps {
  readonly ambiente: string;
  /** URL base da API, sem barra final (ex.: `https://.../dev/api/v1`). */
  readonly apiUrl: string;
  /** URL do domínio Cognito (Hosted UI). */
  readonly dominioCognito: string;
  readonly clientId: string;
  readonly dataReferencia: string;
  /** Diretório dos estáticos; padrão `DIRETORIO_SPA`. Os testes usam uma pasta vazia. */
  readonly diretorioSpa?: string;
}

/**
 * Hospedagem da SPA (Req. 29.1, 35.4): bucket S3 privado (Block Public Access,
 * SSE-S3, só TLS) servido pelo CloudFront com Origin Access Control.
 * O `config.json` é gerado pela stack com as saídas da AuthStack e da ApiStack.
 */
export class WebStack extends Stack {
  public readonly urlSpa: string;

  constructor(scope: Construct, id: string, props: WebStackProps) {
    super(scope, id, props);

    const bucket = new Bucket(this, 'BucketSpa', {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const distribuicao = new Distribution(this, 'Distribuicao', {
      comment: `Painel de expedientes (${props.ambiente}) - SPA`,
      defaultRootObject: 'index.html',
      httpVersion: HttpVersion.HTTP2_AND_3,
      // Sem domínio próprio o certificado padrão do CloudFront é usado; o valor vale para quando houver.
      minimumProtocolVersion: SecurityPolicyProtocol.TLS_V1_2_2021,
      defaultBehavior: {
        origin: S3BucketOrigin.withOriginAccessControl(bucket),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        responseHeadersPolicy: ResponseHeadersPolicy.SECURITY_HEADERS,
      },
      // Rotas da SPA (/painel, /expedientes/...) caem no index.html.
      errorResponses: [403, 404].map((httpStatus) => ({
        httpStatus,
        responseHttpStatus: 200,
        responsePagePath: '/index.html',
        ttl: Duration.seconds(0),
      })),
    });

    this.urlSpa = `https://${distribuicao.distributionDomainName}/`;
    new CfnOutput(this, 'UrlSpa', { value: this.urlSpa, description: 'URL pública da SPA (CloudFront)' });

    const semCache = [CacheControl.noCache(), CacheControl.noStore(), CacheControl.mustRevalidate()];
    const diretorio = props.diretorioSpa ?? DIRETORIO_SPA;
    if (!existsSync(path.join(diretorio, 'index.html'))) {
      // Sem build da SPA (ex.: testes de outras stacks): o deploy falha com mensagem clara.
      Annotations.of(this).addError(`Build da SPA não encontrado em ${diretorio}. Rode "npm run build -w @painel/web".`);
      return;
    }

    // Estáticos com hash no nome (cache longo); index.html e config.json vão sem cache.
    new BucketDeployment(this, 'ImplantarEstaticos', {
      destinationBucket: bucket,
      sources: [Source.asset(diretorio, { exclude: ['index.html', 'config.json'] })],
      cacheControl: [CacheControl.maxAge(Duration.days(365)), CacheControl.immutable()],
      prune: false,
    });
    new BucketDeployment(this, 'ImplantarIndiceEConfig', {
      destinationBucket: bucket,
      sources: [
        Source.asset(diretorio, { exclude: ['*', '!index.html'] }),
        Source.jsonData('config.json', {
          apiUrl: props.apiUrl,
          cognito: { dominio: props.dominioCognito, clientId: props.clientId, escopos: 'openid email profile' },
          dataReferencia: props.dataReferencia,
        }),
      ],
      cacheControl: semCache,
      prune: false,
      distribution: distribuicao,
      distributionPaths: ['/index.html', '/config.json', '/'],
    });
  }
}
