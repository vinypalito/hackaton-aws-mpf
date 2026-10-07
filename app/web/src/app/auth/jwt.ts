/**
 * Decodifica o payload de um JWT **apenas para exibição** (nome, setor, perfil,
 * expiração). A assinatura não é verificada aqui: quem valida o token é o
 * Cognito Authorizer do API Gateway.
 */
export function decodificarJwt(token: string | null | undefined): Record<string, unknown> | null {
  const partes = token?.split('.');
  if (!partes || partes.length !== 3 || !partes[1]) {
    return null;
  }
  try {
    const base64 = partes[1].replace(/-/g, '+').replace(/_/g, '/');
    const binario = atob(base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '='));
    const texto = new TextDecoder().decode(Uint8Array.from(binario, (c) => c.charCodeAt(0)));
    const payload: unknown = JSON.parse(texto);
    return payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
