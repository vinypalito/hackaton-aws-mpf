import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiExpedientesService, correlationIdDoErro, type Expediente } from '../../core/api-expedientes.service';
import {
  CAIXAS,
  SITUACOES_PRAZO,
  classeSituacaoPrazo,
  formatarData,
  iniciais,
  numeroDias,
  rotuloPrioridade,
  rotuloSituacaoPrazo,
  texto,
  textoDiasRestantes,
  tomSituacaoPrazo,
  type Caixa,
  type SituacaoPrazo,
} from '../../core/formatos';

const TAMANHO_PAGINA = 50;
const CHAVE_VISAO = 'painel.visao';

export const VISOES = [
  { valor: 'lista', rotulo: 'Lista', descricao: 'Tabela completa, boa para leitura e leitores de tela' },
  { valor: 'quadro', rotulo: 'Quadro', descricao: 'Colunas por situação do prazo' },
  { valor: 'radar', rotulo: 'Radar de prazos', descricao: 'Linha do tempo com o dia de hoje marcado' },
] as const;
export type Visao = (typeof VISOES)[number]['valor'];

/** Janela do radar, em dias relativos à data de referência. */
const RADAR_INICIO = -10;
const RADAR_FIM = 30;

interface LinhaRadar {
  readonly e: Expediente;
  readonly dias: number | null;
  readonly marco: number;
  readonly barraInicio: number;
  readonly barraLargura: number;
}

function posicao(dias: number): number {
  const d = Math.min(RADAR_FIM, Math.max(RADAR_INICIO, dias));
  return ((d - RADAR_INICIO) / (RADAR_FIM - RADAR_INICIO)) * 100;
}

/**
 * Painel do setor (Req. 3, 4 e 27): caixas, filtro de situação de prazo e três
 * visões à escolha do usuário (lista acessível, quadro por situação e radar de
 * prazos), com paginação por cursor. A escolha fica salva no navegador e na URL.
 */
@Component({
  selector: 'app-painel',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './painel.css',
  templateUrl: './painel.html',
})
export class PainelPagina implements OnInit {
  private readonly api = inject(ApiExpedientesService);
  private readonly rota = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly caixas = CAIXAS;
  protected readonly situacoes = SITUACOES_PRAZO;
  protected readonly visoes = VISOES;

  protected readonly caixa = signal<Caixa>('NO_SETOR');
  protected readonly situacao = signal<SituacaoPrazo | ''>('');
  protected readonly visao = signal<Visao>('lista');
  protected readonly itens = signal<Expediente[]>([]);
  protected readonly cursor = signal<string | null>(null);
  protected readonly carregando = signal(false);
  protected readonly erro = signal(false);
  protected readonly correlationId = signal<string | null>(null);

  protected readonly rotuloCaixa = computed(() => CAIXAS.find((c) => c.valor === this.caixa())?.rotulo ?? '');
  protected readonly mensagemStatus = computed(() => {
    if (this.carregando()) return 'Carregando expedientes…';
    if (this.erro()) return '';
    const n = this.itens().length;
    if (n === 0) return 'Nenhum expediente encontrado com os filtros atuais.';
    const mais = this.cursor() ? ' Há mais expedientes para carregar.' : '';
    return `${n} expediente(s) exibido(s).${mais}`;
  });

  /** Resumo da manchete: quantos vencidos e críticos entre os itens carregados. */
  protected readonly resumo = computed(() => {
    const itens = this.itens();
    const conta = (...s: string[]) => itens.filter((e) => s.includes(String(e['statusPrazo']))).length;
    return { vencidos: conta('VENCIDO', 'VENCE_HOJE'), curtos: conta('CRITICO'), total: itens.length };
  });

  /** Quadro: uma coluna por situação do prazo (RN1), na ordem de urgência. */
  protected readonly colunas = computed(() =>
    SITUACOES_PRAZO.map((s) => ({ situacao: s, itens: this.itens().filter((e) => e['statusPrazo'] === s) })),
  );

  /** Radar: itens ordenados pelo prazo, com posição do marco e da barra de tempo no setor. */
  protected readonly linhasRadar = computed<LinhaRadar[]>(() =>
    [...this.itens()]
      .map((e) => {
        const dias = numeroDias(e['diasRestantes']);
        const desde = -(numeroDias(e['diasNoSetor']) ?? 0);
        const marco = posicao(dias ?? RADAR_FIM);
        const inicio = posicao(Math.min(desde, dias ?? 0));
        return { e, dias, marco, barraInicio: inicio, barraLargura: Math.max(1, marco - inicio) };
      })
      .sort((a, b) => (a.dias ?? 9999) - (b.dias ?? 9999)),
  );

  /** Histograma de vencimentos por dia na janela do radar. */
  protected readonly diasRadar = computed(() => {
    const contagem = new Map<number, number>();
    for (const l of this.linhasRadar()) {
      if (l.dias !== null && l.dias >= RADAR_INICIO && l.dias <= RADAR_FIM) contagem.set(l.dias, (contagem.get(l.dias) ?? 0) + 1);
    }
    const maximo = Math.max(1, ...contagem.values());
    const dias = [];
    for (let d = RADAR_INICIO; d <= RADAR_FIM; d++) {
      const n = contagem.get(d) ?? 0;
      dias.push({ d, n, altura: (n / maximo) * 100, marcado: d === 0 || d % 5 === 0 });
    }
    return dias;
  });
  protected readonly posicaoHoje = posicao(0);

  protected readonly texto = texto;
  protected readonly data = formatarData;
  protected readonly dias = textoDiasRestantes;
  protected readonly prioridade = rotuloPrioridade;
  protected readonly rotuloSituacao = rotuloSituacaoPrazo;
  protected readonly classeSituacao = classeSituacaoPrazo;
  protected readonly tom = tomSituacaoPrazo;
  protected readonly iniciais = iniciais;

  /** Descarta respostas de consultas já substituídas por outra (troca rápida de aba/filtro). */
  private geracao = 0;

  ngOnInit(): void {
    const consulta = this.rota.snapshot.queryParamMap;
    const caixa = consulta.get('caixa');
    if (CAIXAS.some((c) => c.valor === caixa)) this.caixa.set(caixa as Caixa);
    const situacao = consulta.get('statusPrazo');
    if ((SITUACOES_PRAZO as readonly string[]).includes(situacao ?? '')) this.situacao.set(situacao as SituacaoPrazo);
    const visao = consulta.get('visao') ?? this.visaoSalva();
    if (VISOES.some((v) => v.valor === visao)) this.visao.set(visao as Visao);
    // A URL muda sem recriar o componente (ex.: link "Prazos" do trilho).
    this.rota.queryParamMap.subscribe((q) => {
      const v = q.get('visao');
      if (v && v !== this.visao() && VISOES.some((x) => x.valor === v)) this.visao.set(v as Visao);
    });
    void this.buscar(false);
  }

  protected selecionarVisao(visao: Visao): void {
    this.visao.set(visao);
    try {
      localStorage.setItem(CHAVE_VISAO, visao);
    } catch {
      /* armazenamento indisponível: só a URL guarda a escolha */
    }
    this.atualizarUrl();
  }

  protected selecionarCaixa(caixa: Caixa): void {
    if (caixa === this.caixa()) return;
    this.caixa.set(caixa);
    this.aplicarFiltros();
  }

  protected selecionarSituacao(valor: string): void {
    this.situacao.set((SITUACOES_PRAZO as readonly string[]).includes(valor) ? (valor as SituacaoPrazo) : '');
    this.aplicarFiltros();
  }

  protected recarregar(): void {
    void this.buscar(false);
  }

  protected carregarMais(): void {
    void this.buscar(true);
  }

  protected sigiloso(e: Expediente): boolean {
    return Number(e['nivelSigilo'] ?? 0) > 0;
  }

  private visaoSalva(): string | null {
    try {
      return localStorage.getItem(CHAVE_VISAO);
    } catch {
      return null;
    }
  }

  private atualizarUrl(): void {
    void this.router.navigate([], {
      relativeTo: this.rota,
      queryParams: { caixa: this.caixa(), statusPrazo: this.situacao() || null, visao: this.visao() === 'lista' ? null : this.visao() },
      replaceUrl: true,
    });
  }

  /** Reflete os filtros na URL (link compartilhável) e recomeça a listagem. */
  private aplicarFiltros(): void {
    this.atualizarUrl();
    void this.buscar(false);
  }

  private async buscar(continuar: boolean): Promise<void> {
    const geracao = ++this.geracao;
    this.carregando.set(true);
    this.erro.set(false);
    this.correlationId.set(null);
    if (!continuar) {
      this.itens.set([]);
      this.cursor.set(null);
    }
    try {
      const situacao = this.situacao();
      const pagina = await this.api.listar({
        caixa: this.caixa(),
        statusPrazo: situacao ? [situacao] : undefined,
        cursor: continuar ? this.cursor() : null,
        limite: TAMANHO_PAGINA,
      });
      if (geracao !== this.geracao) return;
      this.itens.update((atuais) => (continuar ? [...atuais, ...pagina.itens] : pagina.itens));
      this.cursor.set(pagina.cursor ?? null);
    } catch (e) {
      if (geracao !== this.geracao) return;
      this.erro.set(true);
      this.correlationId.set(correlationIdDoErro(e));
    } finally {
      if (geracao === this.geracao) this.carregando.set(false);
    }
  }
}