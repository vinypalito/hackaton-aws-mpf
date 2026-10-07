import { formatarDataReferencia, textoDataReferencia } from './data-referencia';
import { rotuloPerfil } from './perfil';

describe('data de referência', () => {
  it('formata o padrão como "Dados de 07/10/2026, 17:00"', () => {
    expect(textoDataReferencia()).toBe('Dados de 07/10/2026, 17:00');
    expect(textoDataReferencia('2026-10-07T17:00:00-03:00')).toBe('Dados de 07/10/2026, 17:00');
  });

  it('converte para o fuso America/Sao_Paulo', () => {
    expect(formatarDataReferencia('2026-10-07T20:00:00Z')).toBe('07/10/2026, 17:00');
    expect(formatarDataReferencia('2026-01-05T11:05:00Z')).toBe('05/01/2026, 08:05');
  });

  it('usa a data padrão quando o valor é inválido', () => {
    expect(formatarDataReferencia('nao-e-data')).toBe('07/10/2026, 17:00');
  });
});

describe('rotuloPerfil', () => {
  it('traduz os perfis para rótulos amigáveis', () => {
    expect(rotuloPerfil('MEMBRO')).toBe('Membro');
    expect(rotuloPerfil('CHEFE')).toBe('Chefe de gabinete');
    expect(rotuloPerfil('SERVIDOR')).toBe('Servidor');
    expect(rotuloPerfil(null)).toBe('Não informado');
  });
});
