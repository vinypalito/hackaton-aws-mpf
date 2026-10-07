---
inclusion: always
---

# AWS profile

- Todo comando da AWS (AWS CLI, SAM, CDK, SDK scripts, etc.) deve usar o profile `hackatongabinete`.
- AWS CLI: sempre passe `--profile hackatongabinete` (ex.: `aws s3 ls --profile hackatongabinete`).
- CDK/SAM: use `--profile hackatongabinete`.
- Scripts/SDK: defina `$Env:AWS_PROFILE="hackatongabinete"` antes de executar, ou configure o profile no client (ex.: `boto3.Session(profile_name="hackatongabinete")`).
- Região padrão: `us-east-1`.
- As credenciais são temporárias (session token de workshop). Se aparecer `ExpiredToken`, peça ao usuário credenciais novas e atualize a seção `[hackatongabinete]` em `~/.aws/credentials`.
- Nunca grave essas credenciais em arquivos do repositório.
