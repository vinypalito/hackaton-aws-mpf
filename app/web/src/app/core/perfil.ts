/** Perfis do Único usados no MVP (claim `custom:perfil`). */
export type Perfil = 'MEMBRO' | 'CHEFE' | 'SERVIDOR';

const ROTULOS: Record<Perfil, string> = {
  MEMBRO: 'Membro',
  CHEFE: 'Chefe de gabinete',
  SERVIDOR: 'Servidor',
};

/** Rótulo amigável do perfil; valor desconhecido é exibido como veio. */
export function rotuloPerfil(perfil: string | null | undefined): string {
  if (!perfil) {
    return 'Não informado';
  }
  return ROTULOS[perfil as Perfil] ?? perfil;
}
