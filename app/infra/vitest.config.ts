import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Montar o App inteiro (várias stacks) passa de 10 s quando os arquivos rodam em paralelo no Windows.
    hookTimeout: 60_000,
    env: {
      // Testes de assertions não empacotam as Lambdas (esbuild); o `cdk synth` confere o pacote real.
      CDK_CONTEXT_JSON: JSON.stringify({ 'aws:cdk:bundling-stacks': [] }),
    },
  },
});
