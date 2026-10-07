/**
 * Lógica pura da criação dos usuários do Cognito (tarefa 3.1, Req. 1.1, 1.2 e 1.6).
 * Sem dependência de AWS: parse do `usuarios.csv`, atributos e validação da senha.
 */

export const PERFIS = ['MEMBRO', 'CHEFE', 'SERVIDOR'] as const;
export type Perfil = (typeof PERFIS)[number];

export interface UsuarioCsv {
  readonly idUsuario: string;
  readonly nome: string;
  readonly siglaSetor: string;
  readonly perfil: Perfil;
  readonly email: string;
  readonly ativo: boolean;
}

export interface AtributoCognito {
  readonly Name: string;
  readonly Value: string;
}

const COLUNAS_OBRIGATORIAS = ['idUsuario', 'nome', 'siglaSetor', 'perfil', 'email', 'ativo'] as const;

/** Divide uma linha CSV (RFC 4180: aspas duplas e `""` escapado). */
export function dividirLinhaCsv(linha: string): string[] {
  const campos: string[] = [];
  let atual = '';
  let entreAspas = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (entreAspas) {
      if (c === '"' && linha[i + 1] === '"') {
        atual += '"';
        i++;
      } else if (c === '"') {
        entreAspas = false;
      } else {
        atual += c;
      }
    } else if (c === '"') {
      entreAspas = true;
    } else if (c === ',') {
      campos.push(atual);
      atual = '';
    } else {
      atual += c;
    }
  }
  if (entreAspas) throw new Error('Aspas não fechadas na linha CSV');
  campos.push(atual);
  return campos;
}

/** Interpreta o conteúdo de `usuarios.csv` e valida cada linha. */
export function interpretarUsuariosCsv(conteudo: string): UsuarioCsv[] {
  const linhas = conteudo
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0);
  const [cabecalho, ...dados] = linhas;
  if (cabecalho === undefined) throw new Error('usuarios.csv vazio');

  const colunas = dividirLinhaCsv(cabecalho).map((c) => c.trim());
  for (const obrigatoria of COLUNAS_OBRIGATORIAS) {
    if (!colunas.includes(obrigatoria)) throw new Error(`Coluna ausente em usuarios.csv: ${obrigatoria}`);
  }

  const vistos = new Set<string>();
  return dados.map((linha, indice) => {
    const numero = indice + 2;
    const valores = dividirLinhaCsv(linha);
    if (valores.length !== colunas.length) {
      throw new Error(`Linha ${numero}: esperava ${colunas.length} colunas, veio ${valores.length}`);
    }
    const campo = (nome: string): string => (valores[colunas.indexOf(nome)] ?? '').trim();

    const idUsuario = campo('idUsuario');
    if (!/^[A-Za-z0-9._-]{1,64}$/.test(idUsuario)) throw new Error(`Linha ${numero}: idUsuario inválido`);
    if (vistos.has(idUsuario.toLowerCase())) throw new Error(`Linha ${numero}: idUsuario duplicado ${idUsuario}`);
    vistos.add(idUsuario.toLowerCase());

    const perfil = campo('perfil');
    if (!(PERFIS as readonly string[]).includes(perfil)) {
      throw new Error(`Linha ${numero}: perfil inválido (${perfil})`);
    }
    const ativo = campo('ativo').toLowerCase();
    if (ativo !== 'true' && ativo !== 'false') throw new Error(`Linha ${numero}: ativo deve ser true/false`);

    const email = campo('email');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error(`Linha ${numero}: e-mail inválido`);
    const siglaSetor = campo('siglaSetor');
    if (siglaSetor.length === 0) throw new Error(`Linha ${numero}: siglaSetor vazio`);

    return { idUsuario, nome: campo('nome'), siglaSetor, perfil: perfil as Perfil, email, ativo: ativo === 'true' };
  });
}

/** Atributos imutáveis (`custom:*`): só podem ser definidos na criação do usuário. */
export function atributosImutaveis(u: UsuarioCsv): AtributoCognito[] {
  return [
    { Name: 'custom:idUsuario', Value: u.idUsuario },
    { Name: 'custom:siglaSetor', Value: u.siglaSetor },
    { Name: 'custom:perfil', Value: u.perfil },
  ];
}

/** Atributos mutáveis, reaplicados a cada execução (idempotência). */
export function atributosMutaveis(u: UsuarioCsv): AtributoCognito[] {
  return [
    { Name: 'email', Value: u.email },
    { Name: 'email_verified', Value: 'true' },
    { Name: 'name', Value: u.nome },
  ];
}

/** Todos os atributos do `AdminCreateUser`. */
export function atributosCriacao(u: UsuarioCsv): AtributoCognito[] {
  return [...atributosMutaveis(u), ...atributosImutaveis(u)];
}

/**
 * Compara os atributos imutáveis já gravados no Cognito com os do CSV.
 * Retorna os nomes divergentes (não podem ser corrigidos sem recriar o usuário).
 */
export function divergenciasImutaveis(
  u: UsuarioCsv,
  existentes: readonly { Name?: string | undefined; Value?: string | undefined }[],
): string[] {
  return atributosImutaveis(u)
    .filter((esperado) => existentes.find((e) => e.Name === esperado.Name)?.Value !== esperado.Value)
    .map((a) => a.Name);
}

/**
 * Valida a senha de demo contra a política do User Pool (AuthStack): mínimo de 12
 * caracteres, com minúscula, maiúscula e dígito. Retorna os problemas (vazio = ok).
 */
export function problemasSenha(senha: string): string[] {
  const problemas: string[] = [];
  if (senha.length < 12) problemas.push('mínimo de 12 caracteres');
  if (!/[a-z]/.test(senha)) problemas.push('ao menos uma letra minúscula');
  if (!/[A-Z]/.test(senha)) problemas.push('ao menos uma letra maiúscula');
  if (!/[0-9]/.test(senha)) problemas.push('ao menos um dígito');
  if (/^\s|\s$/.test(senha)) problemas.push('sem espaços no início ou no fim');
  return problemas;
}

export interface ArgumentosCriarUsuarios {
  readonly userPoolId: string | undefined;
  readonly csv: string | undefined;
  readonly regiao: string | undefined;
}

/** Interpreta `--user-pool-id <id>`, `--csv <caminho>` e `--regiao <regiao>`. */
export function interpretarArgumentos(argv: readonly string[]): ArgumentosCriarUsuarios {
  const valores: Record<string, string> = {};
  const conhecidos = new Set(['--user-pool-id', '--csv', '--regiao']);
  for (let i = 0; i < argv.length; i++) {
    const nome = argv[i] ?? '';
    if (!conhecidos.has(nome)) throw new Error(`Argumento desconhecido: ${nome}`);
    const valor = argv[i + 1];
    if (valor === undefined || valor.startsWith('--')) throw new Error(`Falta valor para ${nome}`);
    valores[nome] = valor;
    i++;
  }
  return {
    userPoolId: valores['--user-pool-id'],
    csv: valores['--csv'],
    regiao: valores['--regiao'],
  };
}
