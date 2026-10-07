#!/usr/bin/env bash
# Destrói todas as stacks do painel (apaga a tabela Expedientes e os dados,
# o Cognito, a API e o site). Irreversível. Pede confirmação antes.
set -euo pipefail
read -r -p 'Isto apaga TODAS as stacks, a tabela e os dados. Digite "destruir" para confirmar: ' resposta
if [ "$resposta" != "destruir" ]; then
  echo "Cancelado."
  exit 1
fi
cd "$(dirname "$0")/../infra"
exec npx cdk destroy --all --force --profile hackatongabinete --region us-east-1
