/**
 * Cria no Cognito os usuários fictícios de `usuarios.csv` (tarefa 3.1, Req. 1.1, 1.2 e 1.6).
 *
 * - `AdminCreateUser` com `MessageAction=SUPPRESS` (nenhum e-mail é enviado), e-mail
 *   verificado e os atributos imutáveis `custom:idUsuario`, `custom:siglaSetor`, `custom:perfil`.
 * - `AdminSetUserPassword` permanente com a senha de demo lida em tempo de execução
 *   (variável `SENHA_DEMO` ou prompt oculto). A senha nunca é gravada nem registrada em log.
 * - `ativo=false` → `AdminDisableUser`; `ativo=true` → `AdminEnableUser`.
 * - Idempotente: usuário existente tem e-mail/nome e senha reaplicados. Atributos
 *   imutáveis divergentes são reportados (exigem recriar o usuário) e a saída é ≠ 0.
 *
 * Uso (PowerShell):
 *   $Env:AWS_PROFILE="hackatongabinete"
 *   $id = aws cloudformation describe-stacks --stack-name AuthStack --profile hackatongabinete --region us-east-1 `
 *     --query "Stacks[0].Outputs[?OutputKey=='UserPoolId'].OutputValue" --output text
 *   npm run criar-usuarios -w scripts -- --user-pool-id $id
 */
import { readFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AdminCreateUserCommand,
  AdminDisableUserCommand,
  AdminEnableUserCommand,
  AdminGetUserCommand,
  AdminSetUserPasswordCommand,
  AdminUpdateUserAttributesCommand,
  CognitoIdentityProviderClient,
  UserNotFoundException,
} from '@aws-sdk/client-cognito-identity-provider';
import {
  atributosCriacao,
  atributosMutaveis,
  divergenciasImutaveis,
  interpretarArgumentos,
  interpretarUsuariosCsv,
  problemasSenha,
  type UsuarioCsv,
} from './criar-usuarios/nucleo.js';

/** Raiz do repositório: app/scripts/src → ../../.. */
const RAIZ_REPOSITORIO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const CSV_PADRAO = resolve(RAIZ_REPOSITORIO, 'resources/hackathon-expedientes/seed/saida/csv/usuarios.csv');

/** Lê uma linha do terminal sem ecoar os caracteres. */
async function lerSenhaOculta(pergunta: string): Promise<string> {
  const entrada = process.stdin;
  if (!entrada.isTTY) throw new Error('Sem terminal interativo: defina a variável SENHA_DEMO');
  process.stdout.write(pergunta);
  entrada.setRawMode(true);
  entrada.resume();
  entrada.setEncoding('utf8');
  return new Promise((resolver, rejeitar) => {
    let senha = '';
    const aoDigitar = (dados: string): void => {
      for (const c of dados) {
        if (c === '\r' || c === '\n') {
          finalizar();
          process.stdout.write('\n');
          resolver(senha);
          return;
        }
        if (c === '\u0003') {
          finalizar();
          process.stdout.write('\n');
          rejeitar(new Error('Cancelado pelo usuário'));
          return;
        }
        if (c === '\u007f' || c === '\b') senha = senha.slice(0, -1);
        else senha += c;
      }
    };
    const finalizar = (): void => {
      entrada.off('data', aoDigitar);
      entrada.setRawMode(false);
      entrada.pause();
    };
    entrada.on('data', aoDigitar);
  });
}

async function obterSenha(): Promise<string> {
  const doAmbiente = process.env['SENHA_DEMO'];
  if (doAmbiente !== undefined && doAmbiente.length > 0) return doAmbiente;
  const senha = await lerSenhaOculta('Senha de demo para os usuários: ');
  const confirmacao = await lerSenhaOculta('Confirme a senha: ');
  if (senha !== confirmacao) throw new Error('As senhas não conferem');
  return senha;
}

type Resultado = 'criado' | 'atualizado' | 'divergente';

async function provisionar(
  cliente: CognitoIdentityProviderClient,
  userPoolId: string,
  u: UsuarioCsv,
  senha: string,
): Promise<Resultado> {
  const Username = u.idUsuario;
  let resultado: Resultado;
  try {
    const existente = await cliente.send(new AdminGetUserCommand({ UserPoolId: userPoolId, Username }));
    const divergentes = divergenciasImutaveis(u, existente.UserAttributes ?? []);
    if (divergentes.length > 0) {
      console.error(`  ${u.idUsuario}: atributos imutáveis divergentes (${divergentes.join(', ')}); recrie o usuário`);
      resultado = 'divergente';
    } else {
      resultado = 'atualizado';
    }
    await cliente.send(
      new AdminUpdateUserAttributesCommand({ UserPoolId: userPoolId, Username, UserAttributes: atributosMutaveis(u) }),
    );
  } catch (erro) {
    if (!(erro instanceof UserNotFoundException)) throw erro;
    await cliente.send(
      new AdminCreateUserCommand({
        UserPoolId: userPoolId,
        Username,
        MessageAction: 'SUPPRESS',
        UserAttributes: atributosCriacao(u),
      }),
    );
    resultado = 'criado';
  }

  await cliente.send(
    new AdminSetUserPasswordCommand({ UserPoolId: userPoolId, Username, Password: senha, Permanent: true }),
  );
  // Req. 1.6: ativo=false nega o login.
  await cliente.send(
    u.ativo
      ? new AdminEnableUserCommand({ UserPoolId: userPoolId, Username })
      : new AdminDisableUserCommand({ UserPoolId: userPoolId, Username }),
  );
  return resultado;
}

async function principal(): Promise<number> {
  const args = interpretarArgumentos(process.argv.slice(2));
  const userPoolId = args.userPoolId ?? process.env['USER_POOL_ID'];
  if (userPoolId === undefined || !/^[\w-]+_[0-9a-zA-Z]+$/.test(userPoolId)) {
    throw new Error('Informe --user-pool-id <id> (ou USER_POOL_ID) com o output UserPoolId da AuthStack');
  }
  const caminhoCsv = args.csv === undefined ? CSV_PADRAO : isAbsolute(args.csv) ? args.csv : resolve(args.csv);
  const usuarios = interpretarUsuariosCsv(await readFile(caminhoCsv, 'utf8'));

  const senha = await obterSenha();
  const problemas = problemasSenha(senha);
  if (problemas.length > 0) throw new Error(`Senha não atende à política: ${problemas.join('; ')}`);

  const cliente = new CognitoIdentityProviderClient({
    region: args.regiao ?? process.env['AWS_REGION'] ?? 'us-east-1',
  });

  console.log(`Provisionando ${usuarios.length} usuários no pool ${userPoolId}...`);
  const contagem: Record<Resultado, number> = { criado: 0, atualizado: 0, divergente: 0 };
  for (const u of usuarios) {
    const resultado = await provisionar(cliente, userPoolId, u, senha);
    contagem[resultado]++;
    // Log só com identificador e situação (sem nome, e-mail ou senha).
    console.log(`  ${u.idUsuario}: ${resultado}${u.ativo ? '' : ' (desabilitado)'}`);
  }
  console.log(
    `Concluído: ${contagem.criado} criados, ${contagem.atualizado} atualizados, ${contagem.divergente} divergentes.`,
  );
  return contagem.divergente > 0 ? 1 : 0;
}

principal().then(
  (codigo) => {
    process.exitCode = codigo;
  },
  (erro: unknown) => {
    // Só a mensagem (sem stack trace nem dados sensíveis).
    console.error(`Erro: ${erro instanceof Error ? erro.message : String(erro)}`);
    process.exitCode = 1;
  },
);
