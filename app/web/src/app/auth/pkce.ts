/**
 * Utilitários de PKCE (RFC 7636) e `state` com Web Crypto, sem bibliotecas.
 */

/** Codifica bytes em base64url sem preenchimento ("="). */
export function base64Url(bytes: Uint8Array): string {
  let binario = '';
  for (const byte of bytes) {
    binario += String.fromCharCode(byte);
  }
  return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Valor aleatório criptograficamente seguro, em base64url. */
export function gerarAleatorio(quantidadeBytes = 32, cripto: Crypto = globalThis.crypto): string {
  const bytes = new Uint8Array(quantidadeBytes);
  cripto.getRandomValues(bytes);
  return base64Url(bytes);
}

/** `code_verifier` com 43 caracteres do alfabeto não reservado (32 bytes aleatórios). */
export function gerarCodeVerifier(cripto: Crypto = globalThis.crypto): string {
  return gerarAleatorio(32, cripto);
}

/** `state` contra CSRF no retorno do Hosted UI. */
export function gerarState(cripto: Crypto = globalThis.crypto): string {
  return gerarAleatorio(32, cripto);
}

/** `code_challenge` S256: base64url(SHA-256(ASCII(code_verifier))). */
export async function gerarCodeChallenge(codeVerifier: string, cripto: Crypto = globalThis.crypto): Promise<string> {
  const bytes = Uint8Array.from(codeVerifier, (c) => c.charCodeAt(0));
  const resumo = await cripto.subtle.digest('SHA-256', bytes);
  return base64Url(new Uint8Array(resumo));
}
