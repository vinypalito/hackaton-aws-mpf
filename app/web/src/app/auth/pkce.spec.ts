import { base64Url, gerarCodeChallenge, gerarCodeVerifier, gerarState } from './pkce';

describe('PKCE', () => {
  it('gera o code_challenge S256 do exemplo do RFC 7636 (Apêndice B)', async () => {
    const bytes = new Uint8Array([
      116, 24, 223, 180, 151, 153, 224, 37, 79, 250, 96, 125, 216, 173, 187, 186, 22, 212, 37, 77, 105, 214, 191, 240,
      91, 88, 5, 88, 83, 132, 141, 121,
    ]);
    const verifier = base64Url(bytes);
    expect(verifier).toBe('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk');
    expect(await gerarCodeChallenge(verifier)).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });

  it('gera code_verifier de 43 caracteres no alfabeto base64url', () => {
    const verifier = gerarCodeVerifier();
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('gera valores de state diferentes a cada chamada', () => {
    expect(gerarState()).not.toBe(gerarState());
  });
});
