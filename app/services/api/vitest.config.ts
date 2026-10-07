import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // Silencia o Powertools Logger nos testes; os testes de log usam um logger injetado.
    env: { POWERTOOLS_LOG_LEVEL: 'SILENT', DATA_REFERENCIA: '2026-10-07T17:00:00-03:00' },
  },
});
