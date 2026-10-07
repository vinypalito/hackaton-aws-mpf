# Carrega o itens.json do kit na tabela Expedientes (BatchWriteItem, lotes de 25)
# e confere a contagem. Idempotente. Repassa os argumentos (--tabela, --regiao,
# --arquivo, --concorrencia). Exemplo: .\scripts\carregar-seed.ps1
$ErrorActionPreference = 'Stop'
if (-not $Env:AWS_PROFILE) { $Env:AWS_PROFILE = 'hackatongabinete' }
Push-Location $PSScriptRoot
try {
  npx tsx src/carregar-seed.ts @args
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
