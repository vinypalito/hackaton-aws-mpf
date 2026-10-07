# Destrói todas as stacks do painel (apaga a tabela Expedientes e os dados,
# o Cognito, a API e o site). Irreversível. Pede confirmação antes.
$ErrorActionPreference = 'Stop'
$resposta = Read-Host 'Isto apaga TODAS as stacks, a tabela e os dados. Digite "destruir" para confirmar'
if ($resposta -ne 'destruir') {
  Write-Host 'Cancelado.'
  exit 1
}
Push-Location (Join-Path $PSScriptRoot '..\infra')
try {
  npx cdk destroy --all --force --profile hackatongabinete --region us-east-1
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
