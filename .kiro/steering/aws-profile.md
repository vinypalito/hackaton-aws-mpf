---
inclusion: always
---

# AWS profile

- Todo comando da AWS (AWS CLI, SAM, CDK, SDK scripts, etc.) deve usar o profile `hackatongabinete`.
- AWS CLI: sempre passe `--profile hackatongabinete` explicitamente (ex.: `aws s3 ls --profile hackatongabinete`), mesmo com `AWS_PROFILE` já definido no ambiente.
- CDK/SAM: use `--profile hackatongabinete`.
- Scripts/SDK: defina `$Env:AWS_PROFILE="hackatongabinete"` antes de executar, ou configure o profile no client (ex.: `boto3.Session(profile_name="hackatongabinete")`).
- Região padrão: `us-east-1`.
- O AWS CLI v2 está instalado em `C:\Users\pedrohenriques\AppData\Local\Programs\Amazon\AWSCLIV2\aws.exe`. Se `aws` não for reconhecido no terminal, recarregue o PATH antes:
  `$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')`
- As variáveis de usuário `AWS_PROFILE=hackatongabinete` e `AWS_DEFAULT_REGION=us-east-1` estão definidas no Windows.
- Para conferir a identidade: `aws sts get-caller-identity --profile hackatongabinete`.
- As credenciais são temporárias (session token de workshop). Se aparecer `ExpiredToken`, peça ao usuário credenciais novas e atualize a seção `[hackatongabinete]` em `~/.aws/credentials` (ex.: `aws configure set aws_session_token <token> --profile hackatongabinete`).
- Nunca grave essas credenciais em arquivos do repositório.
