#!/usr/bin/env bash
# Carrega o itens.json do kit na tabela Expedientes (BatchWriteItem, lotes de 25)
# e confere a contagem. Idempotente. Repassa os argumentos (--tabela, --regiao,
# --arquivo, --concorrencia). Exemplo: AWS_PROFILE=hackatongabinete scripts/carregar-seed.sh
set -euo pipefail
export AWS_PROFILE="${AWS_PROFILE:-hackatongabinete}"
cd "$(dirname "$0")"
exec npx tsx src/carregar-seed.ts "$@"
