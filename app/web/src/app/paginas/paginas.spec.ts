import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { type Type } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CONFIGURACAO, type ConfiguracaoApp } from '../core/configuracao';
import { formatarData } from '../core/formatos';
import { DetalhePagina } from './detalhe/detalhe';
import { InicioPagina } from './inicio/inicio';
import { PainelPagina } from './painel/painel';

const API = 'https://api.exemplo.org/dev';
const CONFIG: ConfiguracaoApp = { apiUrl: API, cognito: { dominio: 'https://login.exemplo.org', clientId: 'c' } };

function montar<T>(componente: Type<T>) {
  TestBed.configureTestingModule({
    imports: [componente],
    providers: [
      { provide: CONFIGURACAO, useValue: CONFIG },
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
    ],
  });
  const fixture = TestBed.createComponent(componente);
  return { fixture, el: fixture.nativeElement as HTMLElement, http: TestBed.inject(HttpTestingController) };
}

/** Deixa as promessas do HttpClient resolverem e renderiza. */
async function estabilizar(fixture: ComponentFixture<unknown>) {
  await new Promise((r) => setTimeout(r));
  await fixture.whenStable();
}

const EXPEDIENTE = {
  idExpediente: 'EXP000001',
  numeroReferencia: 'Memorando nº 1/2026',
  etiqueta: 'PGR-00000001/2026',
  assunto: 'Integração de sistemas',
  dataPrazo: '2026-10-06',
  diasRestantes: -1,
  statusPrazo: 'VENCIDO',
  prioridade: 'ALTA',
  nomeResponsavel: 'Ana Exemplo',
};

describe('formatarData', () => {
  it('formata data civil e data-hora em pt-BR no fuso de Brasília', () => {
    expect(formatarData('2026-10-06')).toBe('06/10/2026');
    expect(formatarData('2026-10-05T06:58:00Z')).toBe('05/10/2026, 03:58');
    expect(formatarData('')).toBe('—');
  });
});

describe('InicioPagina', () => {
  it('exibe contadores por caixa e mantém os outros widgets quando um falha', async () => {
    const { fixture, el, http } = montar(InicioPagina);
    await fixture.whenStable();
    http.expectOne(`${API}/home`).flush({
      dataReferencia: '2026-10-07T17:00:00-03:00',
      contadores: {
        todos: { gerenciador: 'TODOS', aReceber: 17, noSetor: 38, enviadosNaoRecebidos: 1 },
        porGerenciador: { JUDICIAL: { gerenciador: 'JUDICIAL', aReceber: 17, noSetor: 38, enviadosNaoRecebidos: 1 } },
      },
      proximosPrazos: [EXPEDIENTE],
      proximoExpediente: EXPEDIENTE,
      alertas: null,
      informes: [{ idNoticia: 1, titulo: 'Nova versão do painel', destaque: true }],
      widgetsComErro: ['alertas'],
    });
    await estabilizar(fixture);

    const cartoes = [...el.querySelectorAll('.cartao-contador')].map((c) => c.textContent ?? '');
    expect(cartoes).toHaveLength(3);
    expect(cartoes[0]).toContain('A receber');
    expect(cartoes[0]).toContain('17');
    expect(cartoes[1]).toContain('38');
    expect(el.querySelector('a[href="/expedientes/EXP000001"]')?.textContent).toContain('Memorando nº 1/2026');
    expect(el.textContent).toContain('Nova versão do painel');
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('alertas');
    http.verify();
  });
});

describe('PainelPagina', () => {
  it('lista em tabela com caption e th, selo com texto e carrega mais pelo cursor', async () => {
    const { fixture, el, http } = montar(PainelPagina);
    await fixture.whenStable();
    const req = http.expectOne((r) => r.url === `${API}/expedientes`);
    expect(req.request.params.get('caixa')).toBe('NO_SETOR');
    req.flush({ itens: [EXPEDIENTE], cursor: 'abc' });
    await estabilizar(fixture);

    expect(el.querySelector('table caption')?.textContent).toContain('No setor');
    const cabecalhos = [...el.querySelectorAll('thead th[scope="col"]')].map((t) => t.textContent?.trim());
    expect(cabecalhos).toEqual(['Número', 'Assunto', 'Prazo', 'Situação do prazo', 'Prioridade', 'Responsável']);
    expect(el.querySelector('tbody .badge')?.textContent?.trim()).toBe('Vencido');
    expect(el.querySelector('[aria-live="polite"]')?.textContent).toContain('1 expediente(s)');
    expect(el.querySelector('label[for="filtro-situacao"]')).not.toBeNull();

    const botaoMais = [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.includes('Carregar mais'))!;
    botaoMais.click();
    await fixture.whenStable();
    const req2 = http.expectOne((r) => r.url === `${API}/expedientes`);
    expect(req2.request.params.get('cursor')).toBe('abc');
    req2.flush({ itens: [{ ...EXPEDIENTE, idExpediente: 'EXP000002' }], cursor: null });
    await estabilizar(fixture);
    expect(el.querySelectorAll('tbody tr')).toHaveLength(2);
    http.verify();
  });

  it('troca de caixa pelos botões com aria-pressed e filtra por situação', async () => {
    const { fixture, el, http } = montar(PainelPagina);
    await fixture.whenStable();
    http.expectOne((r) => r.url === `${API}/expedientes`).flush({ itens: [], cursor: null });
    await estabilizar(fixture);
    expect(el.textContent).toContain('Nenhum expediente encontrado');

    const aReceber = [...el.querySelectorAll<HTMLButtonElement>('button[aria-pressed]')].find((b) => b.textContent?.includes('A receber'))!;
    aReceber.click();
    await fixture.whenStable();
    expect(aReceber.getAttribute('aria-pressed')).toBe('true');
    http.expectOne((r) => r.params.get('caixa') === 'A_RECEBER').flush({ itens: [], cursor: null });
    await estabilizar(fixture);

    const select = el.querySelector<HTMLSelectElement>('#filtro-situacao')!;
    select.value = 'VENCE_HOJE';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    http.expectOne((r) => r.params.get('statusPrazo') === 'VENCE_HOJE').flush({ itens: [], cursor: null });
    http.verify();
  });

  it('mostra erro com role="alert"', async () => {
    const { fixture, el, http } = montar(PainelPagina);
    await fixture.whenStable();
    http
      .expectOne((r) => r.url === `${API}/expedientes`)
      .flush({ codigo: 'ERRO', correlationId: 'corr-1' }, { status: 500, statusText: 'Erro' });
    await estabilizar(fixture);
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('corr-1');
  });
});

describe('DetalhePagina', () => {
  it('exibe dados, prazos e histórico em ordem cronológica', async () => {
    const { fixture, el, http } = montar(DetalhePagina);
    fixture.componentRef.setInput('id', 'EXP000001');
    await fixture.whenStable();
    http.expectOne(`${API}/expedientes/EXP000001`).flush({
      expediente: { ...EXPEDIENTE, resumo: 'Conteúdo sigiloso' },
      movimentacoes: [
        { idMovimentacao: 'MOV2', dataHora: '2026-10-05T03:58:00-03:00', tipoMovimentacao: 'ENVIO', descricao: 'Enviado' },
        { idMovimentacao: 'MOV1', dataHora: '2026-10-01T04:52:00-03:00', tipoMovimentacao: 'CADASTRO', descricao: 'Cadastrado' },
      ],
      prazos: [{ idPrazo: 'PRZ1', tipoPrazo: 'RESPOSTA', dataInicio: '2026-10-05', dataPrazo: '2026-10-06', situacao: 'ABERTO' }],
      designacoes: [],
      anotacoes: [],
      marcadores: [],
    });
    await estabilizar(fixture);

    expect(el.querySelector('h1')?.textContent).toContain('Memorando nº 1/2026');
    expect(el.textContent).toContain('Conteúdo sigiloso');
    const historico = [...el.querySelectorAll('.historico li')].map((l) => l.textContent ?? '');
    expect(historico[0]).toContain('CADASTRO');
    expect(historico[0]).toContain('01/10/2026, 04:52');
    expect(historico[1]).toContain('ENVIO');
    expect(el.textContent).toContain('RESPOSTA');
    expect(el.querySelector('a[href="/painel"]')).not.toBeNull();
    http.verify();
  });

  it('404 mostra "Expediente não encontrado"', async () => {
    const { fixture, el, http } = montar(DetalhePagina);
    fixture.componentRef.setInput('id', 'EXP999999');
    await fixture.whenStable();
    http
      .expectOne(`${API}/expedientes/EXP999999`)
      .flush({ codigo: 'NAO_ENCONTRADO', mensagem: 'x' }, { status: 404, statusText: 'Not Found' });
    await estabilizar(fixture);
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Expediente não encontrado.');
  });
});
