import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { criarApp } from '../lib/app.js';

describe('WebStack', () => {
  let template: Template;
  let diretorio: string;

  beforeAll(() => {
    // Build falso da SPA, só para o synth.
    diretorio = mkdtempSync(path.join(tmpdir(), 'spa-'));
    writeFileSync(path.join(diretorio, 'index.html'), '<!doctype html>');
    const { web } = criarApp({ context: { ambiente: 'teste', diretorioSpa: diretorio } });
    template = Template.fromStack(web);
  });
  afterAll(() => rmSync(diretorio, { recursive: true, force: true }));

  it('bucket privado, SSE-S3 e só TLS (Req. 29.1)', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
      BucketEncryption: {
        ServerSideEncryptionConfiguration: [{ ServerSideEncryptionByDefault: { SSEAlgorithm: 'AES256' } }],
      },
    });
    template.hasResourceProperties('AWS::S3::BucketPolicy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({ Effect: 'Deny', Condition: { Bool: { 'aws:SecureTransport': 'false' } } }),
        ]),
      },
    });
  });

  it('CloudFront com OAC, HTTPS e fallback da SPA (Req. 35.4)', () => {
    template.resourceCountIs('AWS::CloudFront::OriginAccessControl', 1);
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        DefaultRootObject: 'index.html',
        DefaultCacheBehavior: Match.objectLike({ ViewerProtocolPolicy: 'redirect-to-https' }),
        CustomErrorResponses: [
          Match.objectLike({ ErrorCode: 403, ResponseCode: 200, ResponsePagePath: '/index.html' }),
          Match.objectLike({ ErrorCode: 404, ResponseCode: 200, ResponsePagePath: '/index.html' }),
        ],
      }),
    });
    template.hasOutput('UrlSpa', {});
  });
});
