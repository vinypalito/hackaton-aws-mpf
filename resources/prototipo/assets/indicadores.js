/* Indicadores: KPIs, séries de estoque/fluxo, prazos e produtividade, sempre com tabela alternativa. */
'use strict';

(() => {
	const { esc, fmtNum, plural, fmtData, HOJE } = HX;
	HX.iniciar('indicadores.html');
	const $ = (id) => document.getElementById(id);
	const sigla = HX.setor.siglaSetor;

	$('gerenciador').innerHTML = `<option value="">Todos</option>${HX.gerenciadoresDoSetor().map((g) => `<option value="${g}">${esc(HX.rotulo('GERENCIADOR', g))}</option>`).join('')}`;
	const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);
	const cor = (dominio, codigo) => HX.cat(dominio, codigo).cor;

	function kpi(valor, rotulo, detalhe, corKpi) {
		return `<div class="kpi" style="--cor:${corKpi}"><span class="valor">${valor}</span><span class="rotulo">${esc(rotulo)}</span>${detalhe ? `<span class="detalhe">${esc(detalhe)}</span>` : ''}</div>`;
	}

	function renderizar() {
		const dias = Number($('periodo').value);
		const g = $('gerenciador').value;
		const inicio = HX.somarDias(HOJE, -(dias - 1));
		const doGer = (l) => !g || l.gerenciador === g;

		// estoque diário (soma dos gerenciadores)
		const porDia = new Map();
		for (const l of HX.tabela('estoque_diario')) {
			if (l.siglaSetor !== sigla || !doGer(l) || l.data < inicio) continue;
			const d = porDia.get(l.data) || { entradas: 0, saidas: 0, recebimentos: 0, aReceber: 0, noSetor: 0, vencidos: 0 };
			for (const k of Object.keys(d)) d[k] += l[k];
			porDia.set(l.data, d);
		}
		const datas = [...porDia.keys()].sort();
		const serie = (campo) => datas.map((d) => porDia.get(d)[campo]);
		const rotulosDia = datas.map((d) => fmtData(d).slice(0, 5));
		const seriesEstoque = [
			{ nome: 'No setor', cor: '#0B4F8A', valores: serie('noSetor') },
			{ nome: 'A receber', cor: '#00838F', valores: serie('aReceber') },
			{ nome: 'Vencidos', cor: cor('STATUS_PRAZO', 'VENCIDO'), valores: serie('vencidos') },
		];
		$('g-estoque').innerHTML = HX.graficoLinhas({ titulo: `Estoque diário de ${fmtData(inicio)} a ${fmtData(HOJE)}`, rotulosX: rotulosDia, series: seriesEstoque })
			+ HX.tabelaDoGrafico('tab-estoque', 'Estoque diário', rotulosDia, seriesEstoque, 'Dia');

		// fluxo semanal (semana iniciando na segunda-feira)
		const semanas = new Map();
		for (const d of datas) {
			const dow = (new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7;
			const chave = HX.somarDias(d, -dow);
			const s = semanas.get(chave) || { entradas: 0, saidas: 0 };
			s.entradas += porDia.get(d).entradas;
			s.saidas += porDia.get(d).saidas;
			semanas.set(chave, s);
		}
		const chavesSemana = [...semanas.keys()].sort();
		const rotulosSemana = chavesSemana.map((s) => fmtData(s).slice(0, 5));
		const seriesFluxo = [
			{ nome: 'Entradas', cor: '#1565C0', valores: chavesSemana.map((s) => semanas.get(s).entradas) },
			{ nome: 'Saídas', cor: '#2E7D32', valores: chavesSemana.map((s) => semanas.get(s).saidas) },
		];
		$('g-fluxo').innerHTML = HX.graficoBarras({ titulo: 'Entradas e saídas por semana', rotulosX: rotulosSemana, series: seriesFluxo })
			+ HX.tabelaDoGrafico('tab-fluxo', 'Entradas e saídas por semana', rotulosSemana, seriesFluxo, 'Semana iniciada em');

		// pendências atuais
		const ativos = HX.ativos().filter(doGer);
		const comAcao = ativos.filter((e) => e.requerAcao);
		const porStatus = HX.STATUS_ABERTOS.map((s) => ({ rotulo: HX.rotulo('STATUS_PRAZO', s), valor: comAcao.filter((e) => e.statusPrazo === s).length, cor: cor('STATUS_PRAZO', s) }));
		$('g-pendencias').innerHTML = `${HX.barrasHorizontais(porStatus)}
			<p class="pequeno texto-suave">${plural(comAcao.length, 'expediente demandando ação', 'expedientes demandando ação')}; ${plural(comAcao.filter((e) => e.tempoParadoDias > 30).length, 'parado', 'parados')} há mais de 30 dias.</p>
			${HX.tabelaHtml({ id: 'tab-pendencias', legenda: 'Pendências por situação do prazo', colunas: [
				{ id: 's', rotulo: 'Situação do prazo', html: (i) => esc(i.rotulo) }, { id: 'n', rotulo: 'Quantidade', classe: 'num', html: (i) => fmtNum(i.valor) },
				{ id: 'p', rotulo: '%', classe: 'num', html: (i) => `${pct(i.valor, comAcao.length)}%` }], linhas: porStatus })}`;

		// cumprimento de prazos por mês
		const porMes = new Map();
		let noPrazo = 0;
		let comAtraso = 0;
		for (const p of HX.tabela('prazos')) {
			if (p.siglaSetor !== sigla || !doGer(p) || !p.dataEncerramento) continue;
			const mes = p.dataEncerramento.slice(0, 7);
			const m = porMes.get(mes) || { noPrazo: 0, atraso: 0 };
			if (p.situacao === 'CUMPRIDO_NO_PRAZO') m.noPrazo += 1;
			if (p.situacao === 'CUMPRIDO_COM_ATRASO') m.atraso += 1;
			porMes.set(mes, m);
			if (p.dataEncerramento.slice(0, 10) >= inicio) {
				if (p.situacao === 'CUMPRIDO_NO_PRAZO') noPrazo += 1;
				if (p.situacao === 'CUMPRIDO_COM_ATRASO') comAtraso += 1;
			}
		}
		const meses = [...porMes.keys()].sort().slice(-6);
		const rotulosMes = meses.map((m) => `${HX.MESES[Number(m.slice(5, 7)) - 1].slice(0, 3)}/${m.slice(2, 4)}`);
		const seriesCumprimento = [
			{ nome: 'No prazo', cor: '#2E7D32', valores: meses.map((m) => porMes.get(m).noPrazo) },
			{ nome: 'Com atraso', cor: '#8D6E63', valores: meses.map((m) => porMes.get(m).atraso) },
		];
		$('g-cumprimento').innerHTML = HX.graficoBarras({ titulo: 'Prazos cumpridos no prazo e com atraso nos últimos 6 meses', rotulosX: rotulosMes, series: seriesCumprimento })
			+ HX.tabelaDoGrafico('tab-cumprimento', 'Cumprimento de prazos por mês', rotulosMes, seriesCumprimento, 'Mês');

		// assuntos
		const assuntos = new Map();
		comAcao.forEach((e) => assuntos.set(e.assunto, (assuntos.get(e.assunto) || 0) + 1));
		const topAssuntos = [...assuntos.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([rotulo, valor]) => ({ rotulo, valor }));
		$('g-assuntos').innerHTML = HX.barrasHorizontais(topAssuntos)
			+ `<details class="pequeno"><summary>Ver dados em tabela</summary>${HX.tabelaHtml({ id: 'tab-assuntos', legenda: 'Assuntos com mais pendências',
				colunas: [{ id: 'a', rotulo: 'Assunto', html: (i) => esc(i.rotulo) }, { id: 'n', rotulo: 'Pendências', classe: 'num', html: (i) => fmtNum(i.valor) }], linhas: topAssuntos })}</details>`;

		// gerenciador × caixa
		const caixas = ['A_RECEBER', 'NO_SETOR', 'ENVIADO_NAO_RECEBIDO'];
		const gers = HX.gerenciadoresDoSetor().filter((x) => !g || x === g);
		$('g-caixas').innerHTML = HX.tabelaHtml({
			id: 'tab-caixas', legenda: 'Expedientes ativos por gerenciador e caixa',
			colunas: [{ id: 'g', rotulo: 'Gerenciador', html: (x) => HX.seloGerenciador(x) },
				...caixas.map((c) => ({ id: c, rotulo: HX.rotulo('CAIXA', c), classe: 'num', html: (x) => fmtNum(ativos.filter((e) => e.gerenciador === x && e.caixa === c).length) })),
				{ id: 'tot', rotulo: 'Total', classe: 'num', html: (x) => `<strong>${fmtNum(ativos.filter((e) => e.gerenciador === x).length)}</strong>` }],
			linhas: gers,
		});

		// produtividade
		const porPessoa = new Map();
		for (const l of HX.tabela('produtividade_diaria')) {
			if (l.siglaSetor !== sigla || !doGer(l) || l.data < inicio) continue;
			const p = porPessoa.get(l.idUsuario) || { idUsuario: l.idUsuario, nome: l.nomeUsuario, totalAcoes: 0, recebimentos: 0, designacoes: 0, minutas: 0, assinaturas: 0, envios: 0, arquivamentos: 0, anotacoes: 0, noPrazo: 0, atraso: 0, diasAtivos: 0 };
			for (const k of ['totalAcoes', 'recebimentos', 'designacoes', 'minutas', 'assinaturas', 'envios', 'arquivamentos', 'anotacoes']) p[k] += l[k];
			p.noPrazo += l.prazosCumpridosNoPrazo;
			p.atraso += l.prazosCumpridosComAtraso;
			p.diasAtivos += l.totalAcoes > 0 ? 1 : 0;
			porPessoa.set(l.idUsuario, p);
		}
		const pessoas = [...porPessoa.values()].sort((a, b) => b.totalAcoes - a.totalAcoes);
		$('g-produtividade').innerHTML = `${HX.barrasHorizontais(pessoas.map((p) => ({ rotulo: p.nome, valor: p.totalAcoes })))}
			${HX.tabelaHtml({ id: 'tab-produtividade', legenda: `Produtividade por pessoa nos últimos ${dias} dias`, legendaVisivel: true, colunas: [
				{ id: 'nome', rotulo: 'Pessoa', html: (p) => esc(p.nome) },
				{ id: 'total', rotulo: 'Ações', classe: 'num', html: (p) => fmtNum(p.totalAcoes) },
				{ id: 'media', rotulo: 'Média/dia ativo', classe: 'num', html: (p) => (p.diasAtivos ? (p.totalAcoes / p.diasAtivos).toFixed(1).replace('.', ',') : '0') },
				{ id: 'rec', rotulo: 'Recebimentos', classe: 'num', html: (p) => fmtNum(p.recebimentos) },
				{ id: 'des', rotulo: 'Designações', classe: 'num', html: (p) => fmtNum(p.designacoes) },
				{ id: 'min', rotulo: 'Minutas', classe: 'num', html: (p) => fmtNum(p.minutas) },
				{ id: 'ass', rotulo: 'Assinaturas', classe: 'num', html: (p) => fmtNum(p.assinaturas) },
				{ id: 'env', rotulo: 'Envios', classe: 'num', html: (p) => fmtNum(p.envios) },
				{ id: 'arq', rotulo: 'Arquivamentos', classe: 'num', html: (p) => fmtNum(p.arquivamentos) },
				{ id: 'pz', rotulo: 'Prazos no prazo', classe: 'num', html: (p) => `${fmtNum(p.noPrazo)} (${pct(p.noPrazo, p.noPrazo + p.atraso)}%)` },
			], linhas: pessoas, vazio: 'Sem registros no período.' })}`;

		// KPIs
		const entradas = serie('entradas').reduce((a, b) => a + b, 0);
		const saidas = serie('saidas').reduce((a, b) => a + b, 0);
		const estoqueInicial = datas.length ? porDia.get(datas[0]).noSetor + porDia.get(datas[0]).aReceber : 0;
		const estoqueFinal = datas.length ? porDia.get(datas.at(-1)).noSetor + porDia.get(datas.at(-1)).aReceber : 0;
		const variacao = estoqueFinal - estoqueInicial;
		const paradoMedio = comAcao.length ? Math.round(comAcao.reduce((s, e) => s + e.tempoParadoDias, 0) / comAcao.length) : 0;
		$('kpis').innerHTML = [
			kpi(fmtNum(ativos.length), 'Ativos (sem baixados)', `${fmtNum(comAcao.length)} demandam ação`, '#0B4F8A'),
			kpi(fmtNum(comAcao.filter((e) => e.statusPrazo === 'VENCIDO').length), 'Prazos vencidos', `${fmtNum(comAcao.filter((e) => e.statusPrazo === 'VENCE_HOJE').length)} vencem hoje`, cor('STATUS_PRAZO', 'VENCIDO')),
			kpi(`${pct(noPrazo, noPrazo + comAtraso)}%`, 'Prazos cumpridos no prazo', `${fmtNum(noPrazo)} de ${fmtNum(noPrazo + comAtraso)} no período`, '#2E7D32'),
			kpi(fmtNum(entradas), 'Entradas no período', `${fmtNum(saidas)} saídas`, '#1565C0'),
			kpi(`${variacao > 0 ? '+' : ''}${fmtNum(variacao)}`, 'Variação do estoque', `${fmtNum(estoqueInicial)} → ${fmtNum(estoqueFinal)}`, variacao > 0 ? '#E65100' : '#2E7D32'),
			kpi(`${fmtNum(paradoMedio)} d`, 'Tempo parado médio', 'itens que demandam ação', '#6D4C41'),
		].join('');
		$('resumo').textContent = `Indicadores atualizados: últimos ${dias} dias${g ? `, gerenciador ${HX.rotulo('GERENCIADOR', g)}` : ''}.`;
	}

	$('periodo').addEventListener('change', renderizar);
	$('gerenciador').addEventListener('change', renderizar);
	renderizar();
})();
