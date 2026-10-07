/* Nova tela inicial: widgets configuráveis (visibilidade e ordem salvas por usuário). */
'use strict';

(() => {
	const { esc, fmtNum, plural, fmtData, fmtDataHora, HOJE, DATA_REFERENCIA } = HX;
	HX.iniciar('index.html');

	const hora = Number(DATA_REFERENCIA.slice(11, 13));
	const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
	document.getElementById('saudacao').textContent = `${saudacao}, ${HX.usuario.nome.split(' ')[0]}`;
	document.getElementById('data-hoje').textContent = `${HX.diaSemana(HOJE)}, ${Number(HOJE.slice(8, 10))} de ${HX.MESES[Number(HOJE.slice(5, 7)) - 1]} de ${HOJE.slice(0, 4)} · ${HX.setor.nome}`;

	// ---------- widgets ----------

	function kpi(valor, rotuloTexto, href, cor, detalhe = '') {
		return `<a class="kpi" href="${href}" style="--cor:${cor}"><span class="valor">${fmtNum(valor)}</span>
			<span class="rotulo">${esc(rotuloTexto)}</span>${detalhe ? `<span class="detalhe">${esc(detalhe)}</span>` : ''}</a>`;
	}

	function widgetContadores() {
		const c = HX.contadores('TODOS');
		const cor = (dominio, codigo) => HX.cat(dominio, codigo).cor;
		const kpis = [
			kpi(c.aReceber, 'A receber', 'painel.html?caixa=A_RECEBER', '#1565C0'),
			kpi(c.noSetor, 'No setor', 'painel.html?caixa=NO_SETOR', '#0B4F8A'),
			kpi(c.vencidos, 'Prazos vencidos', 'painel.html?caixa=ATIVOS&prazo=VENCIDO', cor('STATUS_PRAZO', 'VENCIDO')),
			kpi(c.venceHoje, 'Vencem hoje', 'painel.html?caixa=ATIVOS&prazo=VENCE_HOJE', cor('STATUS_PRAZO', 'VENCE_HOJE')),
			kpi(c.criticos, 'Vencem em até 3 dias', 'painel.html?caixa=ATIVOS&prazo=CRITICO', cor('STATUS_PRAZO', 'CRITICO')),
			kpi(c.urgentes, 'Urgentes', 'painel.html?caixa=ATIVOS&preset=urgentes', '#B71C1C'),
			kpi(c.novos24h, 'Novos (24 h)', 'painel.html?caixa=ATIVOS&preset=novos', '#1565C0'),
			kpi(c.parados30dias, 'Parados há mais de 30 dias', 'painel.html?caixa=ATIVOS&preset=parados', '#6D4C41'),
			kpi(c.minutasPendentes, 'Minutas pendentes', 'painel.html?caixa=ATIVOS&preset=minutas', '#5E35B1'),
			kpi(c.enviadosNaoRecebidos, 'Enviados não recebidos', 'painel.html?caixa=ENVIADO_NAO_RECEBIDO', '#607D8B'),
		].join('');
		const linhas = HX.gerenciadoresDoSetor().map((g) => ({ g, ...HX.contadores(g) }));
		const link = (valor, href) => `<a href="${href}">${fmtNum(valor)}</a>`;
		const tabelaPorGerenciador = HX.tabelaHtml({
			id: 'tab-contadores', legenda: 'Contadores por gerenciador',
			colunas: [
				{ id: 'g', rotulo: 'Gerenciador', html: (l) => HX.seloGerenciador(l.g) },
				{ id: 'ar', rotulo: 'A receber', classe: 'num', html: (l) => link(l.aReceber, `painel.html?caixa=A_RECEBER&ger=${l.g}`) },
				{ id: 'ns', rotulo: 'No setor', classe: 'num', html: (l) => link(l.noSetor, `painel.html?caixa=NO_SETOR&ger=${l.g}`) },
				{ id: 'vc', rotulo: 'Vencidos', classe: 'num', html: (l) => link(l.vencidos, `painel.html?caixa=ATIVOS&prazo=VENCIDO&ger=${l.g}`) },
				{ id: 'vh', rotulo: 'Vencem hoje', classe: 'num', html: (l) => link(l.venceHoje, `painel.html?caixa=ATIVOS&prazo=VENCE_HOJE&ger=${l.g}`) },
				{ id: 'ur', rotulo: 'Urgentes', classe: 'num', html: (l) => fmtNum(l.urgentes) },
				{ id: 'de', rotulo: 'Designados', classe: 'num', html: (l) => fmtNum(l.designados) },
			],
			linhas,
		});
		const alterado = HX.lotesLocais().some((l) => !l.desfeito);
		return `<div class="grade grade-kpi">${kpis}</div>
			<h3 style="margin-top:1rem">Por gerenciador</h3>${tabelaPorGerenciador}
			<p class="pequeno texto-suave">Fonte: item <code>CONTADOR#${esc(HX.setor.siglaSetor)}</code> (contadores.csv)${alterado ? ', recalculado no navegador após as ações em lote desta sessão' : ''}.</p>`;
	}

	function widgetFila() {
		const itens = HX.fila('meus');
		if (!itens.length) return '<p class="vazio">Nenhum expediente seu demandando ação. Veja a fila do setor no modo foco.</p>';
		const e = itens[0];
		return `<p>${plural(itens.length, 'expediente', 'expedientes')} na sua fila, ordenada por prazo e prioridade.</p>
			<div class="cartao" style="border-left:6px solid ${HX.cat('STATUS_PRAZO', e.statusPrazo).cor}">
				<p style="margin:0 0 .25rem"><strong>${HX.linkExp(e)}</strong> ${HX.seloGerenciador(e.gerenciador)}</p>
				<p style="margin:0 0 .25rem">${esc(e.acaoPendente)} · ${HX.assuntoVisivel(e)}</p>
				<p style="margin:0">${HX.seloPrazo(e)} ${HX.seloPrioridade(e)} ${HX.flags(e)}</p>
			</div>
			<p><a class="btn btn-primario" href="foco.html">Abrir modo foco</a></p>`;
	}

	function widgetPrazos() {
		const limite = HX.somarDias(HOJE, 7);
		const itens = HX.ativos().filter((e) => e.requerAcao && e.dataPrazo && e.dataPrazo >= HOJE && e.dataPrazo <= limite)
			.sort(HX.ordemFila);
		const meus = itens.filter((e) => e.idResponsavel === HX.usuario.idUsuario).length;
		return `<p class="pequeno">${plural(itens.length, 'prazo', 'prazos')} até ${fmtData(limite)} (${plural(meus, 'seu', 'seus')}).
			<a href="prazos.html">Abrir calendário</a></p>
			<ul class="lista">${itens.slice(0, 8).map((e) => `<li><div class="conteudo">
				<div class="titulo">${HX.linkExp(e)} ${HX.seloGerenciador(e.gerenciador)}</div>
				<div class="meta">${esc(e.acaoPendente)} · ${esc(e.nomeResponsavel)} · prazo ${fmtData(e.dataPrazo)}</div></div>
				${HX.seloPrazo(e)}</li>`).join('') || '<li class="vazio">Sem prazos nos próximos 7 dias.</li>'}</ul>`;
	}

	function widgetAlertas() {
		const naoLidas = HX.alertasRecentes().filter((n) => !n.lida);
		const ordemSev = { CRITICO: 0, ATENCAO: 1, INFO: 2 };
		const destaque = [...naoLidas].sort((a, b) => ordemSev[a.severidade] - ordemSev[b.severidade] || (a.dataHora < b.dataHora ? 1 : -1)).slice(0, 6);
		return `<p class="pequeno">${plural(naoLidas.length, 'alerta não lido', 'alertas não lidos')} nos últimos ${HX.JANELA_ALERTAS_DIAS} dias.
			<a href="alertas.html">Ver todos</a></p>
			<ul class="lista">${destaque.map((n) => `<li class="nao-lida">${HX.selo('SEVERIDADE', n.severidade)}<div class="conteudo">
				<div class="titulo">${esc(n.titulo)}</div><div class="meta">${esc(n.mensagem)} · ${fmtDataHora(n.dataHora)}</div></div>
				<a href="expediente.html?id=${encodeURIComponent(n.idExpediente)}" class="pequeno">Abrir<span class="sr-only"> ${esc(n.etiqueta)}</span></a></li>`).join('') || '<li class="vazio">Nenhum alerta pendente.</li>'}</ul>`;
	}

	function widgetRisco() {
		const itens = HX.ativos().map((e) => ({ e, r: HX.risco(e) })).filter((x) => x.r).sort((a, b) => b.r.valor - a.r.valor);
		const altos = itens.filter((x) => x.r.nivel === 'ALTO').length;
		return `<p class="pequeno">${plural(altos, 'expediente', 'expedientes')} com risco alto (tempo parado × dias restantes).
			<a href="painel.html?caixa=ATIVOS&preset=risco">Ver no painel</a></p>
			<ul class="lista">${itens.slice(0, 5).map(({ e }) => `<li><div class="conteudo">
				<div class="titulo">${HX.linkExp(e)} ${HX.seloGerenciador(e.gerenciador)}</div>
				<div class="meta">Parado há ${plural(e.tempoParadoDias, 'dia')} · ${esc(HX.textoPrazo(e))} · ${esc(e.nomeResponsavel)}</div></div>
				${HX.seloRisco(e)}</li>`).join('') || '<li class="vazio">Nenhum risco identificado.</li>'}</ul>`;
	}

	function widgetInformes() {
		const ref = DATA_REFERENCIA;
		const itens = HX.tabela('noticias').filter((n) => n.dataInicioExibicao <= ref && n.dataFimExibicao >= HOJE)
			.sort((a, b) => Number(b.destaque) - Number(a.destaque) || a.prioridade - b.prioridade);
		return `<ul class="lista">${itens.map((n) => `<li><div class="conteudo">
			<div class="titulo">${n.destaque ? `${HX.seloCor('Destaque', '#0B4F8A')} ` : ''}${esc(n.titulo)}</div>
			<div class="meta">${esc(n.categoria.toLowerCase())} · desde ${fmtData(n.dataInicioExibicao)}</div>
			<div class="pequeno">${esc(n.conteudo)}</div></div></li>`).join('') || '<li class="vazio">Nenhum informe vigente.</li>'}</ul>`;
	}

	function widgetFiltros() {
		const filtros = HX.tabela('filtros_salvos').filter((f) => f.siglaSetor === HX.setor.siglaSetor
			&& (f.idUsuario === HX.usuario.idUsuario || f.compartilhadoComSetor));
		const locais = HX.ler(`filtros:${HX.usuario.idUsuario}`, []);
		const todos = [...filtros.map((f) => ({ ...f, dono: f.idUsuario === HX.usuario.idUsuario ? 'meu' : `compartilhado por ${HX.nomeUsuario(f.idUsuario)}` })),
			...locais.map((f) => ({ ...f, dono: 'criado nesta sessão' }))];
		return `<ul class="lista">${todos.map((f) => `<li><div class="conteudo"><div class="titulo">
			<a href="painel.html?caixa=ATIVOS&filtro=${encodeURIComponent(f.idFiltro)}">${esc(f.nome)}</a>${f.padrao ? ` ${HX.seloCor('Padrão', '#455A64')}` : ''}</div>
			<div class="meta">${esc(f.dono)}</div></div></li>`).join('') || '<li class="vazio">Nenhum filtro salvo.</li>'}</ul>`;
	}

	function widgetEstoque() {
		const inicio = HX.somarDias(HOJE, -29);
		const porDia = new Map();
		for (const l of HX.tabela('estoque_diario')) {
			if (l.siglaSetor !== HX.setor.siglaSetor || l.data < inicio) continue;
			const d = porDia.get(l.data) || { noSetor: 0, vencidos: 0, entradas: 0, saidas: 0 };
			d.noSetor += l.noSetor; d.vencidos += l.vencidos; d.entradas += l.entradas; d.saidas += l.saidas;
			porDia.set(l.data, d);
		}
		const dias = [...porDia.keys()].sort();
		const rotulos = dias.map((d) => fmtData(d).slice(0, 5));
		const series = [
			{ nome: 'No setor', cor: '#0B4F8A', valores: dias.map((d) => porDia.get(d).noSetor) },
			{ nome: 'Vencidos', cor: '#C62828', valores: dias.map((d) => porDia.get(d).vencidos) },
		];
		return `<div class="grafico">${HX.graficoLinhas({ titulo: 'Estoque no setor e vencidos nos últimos 30 dias', rotulosX: rotulos, series })}</div>
			${HX.tabelaDoGrafico('tab-estoque-inicio', 'Estoque diário dos últimos 30 dias', rotulos, series, 'Dia')}
			<p class="pequeno"><a href="indicadores.html">Mais indicadores</a></p>`;
	}

	const WIDGETS = [
		{ id: 'contadores', titulo: 'Meus números em todos os gerenciadores', largo: true, render: widgetContadores },
		{ id: 'fila', titulo: 'Próximo expediente', render: widgetFila },
		{ id: 'prazos', titulo: 'Próximos prazos', render: widgetPrazos },
		{ id: 'alertas', titulo: 'Alertas não lidos', render: widgetAlertas },
		{ id: 'risco', titulo: 'Risco de vencimento', render: widgetRisco },
		{ id: 'informes', titulo: 'Informes', render: widgetInformes },
		{ id: 'filtros', titulo: 'Filtros salvos', render: widgetFiltros },
		{ id: 'estoque', titulo: 'Estoque recente', render: widgetEstoque },
	];
	const chaveConfig = `inicio:${HX.usuario.idUsuario}`;

	function configuracao() {
		const salva = HX.ler(chaveConfig, null);
		if (!salva) return WIDGETS.map((w) => ({ id: w.id, visivel: true }));
		const conhecidos = salva.filter((c) => WIDGETS.some((w) => w.id === c.id));
		return [...conhecidos, ...WIDGETS.filter((w) => !conhecidos.some((c) => c.id === w.id)).map((w) => ({ id: w.id, visivel: true }))];
	}

	function renderizar() {
		const alvo = document.getElementById('widgets');
		alvo.innerHTML = configuracao().filter((c) => c.visivel).map((c) => {
			const w = WIDGETS.find((x) => x.id === c.id);
			return `<section class="cartao${w.largo ? ' widget-largo' : ''}" aria-labelledby="w-${w.id}">
				<h2 id="w-${w.id}">${esc(w.titulo)}</h2>${w.render()}</section>`;
		}).join('') || '<p class="vazio">Todos os widgets estão ocultos. Use "Personalizar tela inicial".</p>';
	}

	// ---------- personalização ----------

	document.getElementById('btn-personalizar').addEventListener('click', () => {
		const rascunho = configuracao();
		const lista = () => `<p class="pequeno">Marque os widgets visíveis e use os botões para mudar a ordem.</p>
			<ul class="ordem-widgets">${rascunho.map((c, i) => {
				const w = WIDGETS.find((x) => x.id === c.id);
				return `<li><input type="checkbox" id="cfg-${c.id}" data-id="${c.id}"${c.visivel ? ' checked' : ''}>
					<label for="cfg-${c.id}">${esc(w.titulo)}</label>
					<button type="button" class="btn btn-pequeno" data-mover="-1" data-indice="${i}" title="Mover ${esc(w.titulo)} para cima" aria-label="Mover ${esc(w.titulo)} para cima"${i === 0 ? ' disabled' : ''}><span aria-hidden="true">↑</span></button>
					<button type="button" class="btn btn-pequeno" data-mover="1" data-indice="${i}" title="Mover ${esc(w.titulo)} para baixo" aria-label="Mover ${esc(w.titulo)} para baixo"${i === rascunho.length - 1 ? ' disabled' : ''}><span aria-hidden="true">↓</span></button></li>`;
			}).join('')}</ul>`;
		const dialogo = HX.abrirDialogo({
			titulo: 'Personalizar tela inicial', corpo: `<div id="cfg-lista">${lista()}</div>`,
			botoes: [
				{ rotulo: 'Restaurar padrão', acao: () => { HX.gravar(chaveConfig, null); renderizar(); HX.avisar('Tela inicial restaurada.'); } },
				{ rotulo: 'Salvar', classe: 'btn-primario', acao: () => { HX.gravar(chaveConfig, rascunho); renderizar(); HX.avisar('Preferências da tela inicial salvas.'); } },
			],
		});
		const container = dialogo.querySelector('#cfg-lista');
		container.addEventListener('change', (ev) => {
			const item = rascunho.find((c) => c.id === ev.target.dataset.id);
			if (item) item.visivel = ev.target.checked;
		});
		container.addEventListener('click', (ev) => {
			const botao = ev.target.closest('[data-mover]');
			if (!botao) return;
			const i = Number(botao.dataset.indice);
			const j = i + Number(botao.dataset.mover);
			[rascunho[i], rascunho[j]] = [rascunho[j], rascunho[i]];
			const direcao = botao.dataset.mover;
			container.innerHTML = lista();
			// mantém o foco no mesmo widget após reordenar
			const alvo = container.querySelector(`[data-indice="${j}"][data-mover="${direcao}"]:not([disabled])`)
				|| container.querySelector(`[data-indice="${j}"][data-mover]:not([disabled])`);
			if (alvo) alvo.focus();
		});
	});

	renderizar();
})();
