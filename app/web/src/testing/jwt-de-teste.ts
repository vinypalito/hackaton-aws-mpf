/**
 * Monta um JWT não assinado só para testes de exibição (o front não valida
 * assinatura; quem valida é o Cognito Authorizer).
 */
export function criarJwtDeTeste(payload: Record<string, unknown>): string {
  const codificar = (obj: unknown) => {
    const bytes = new TextEncoder().encode(JSON.stringify(obj));
    let binario = '';
    for (const b of bytes) binario += String.fromCharCode(b);
    return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };
  return `${codificar({ alg: 'none', typ: 'JWT' })}.${codificar(payload)}.assinatura`;
}

/** Claims de um usuário fictício (padrão da base sintética, @exemplo.org). */
export function claimsDeTeste(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    'custom:idUsuario': 'USR-001',
    'custom:siglaSetor': 'GAB-ABC',
    'custom:perfil': 'CHEFE',
    name: 'Usuária Fictícia de Teste',
    email: 'usuaria.teste@exemplo.org',
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...extra,
  };
}
