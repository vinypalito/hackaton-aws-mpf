/* Trilha de ações em lote: lotes locais (com desfazer) e histórico do setor (acoes_lote.csv). */
'use strict';

(() => {
	const { esc, fmtNum, plural, fmtDataHora } = HX;
	HX.iniciar('lotes.html');
	const $ = (id) => document.getElementById(id);
	const CORES_RESULTADO = { SUCESSO: '#2E7D32', PARCIAL: '#EF6C00', FALHA: '#C62828' };

	$('filtro-acao').innerHTML = `<option value="">Todas</option>${Object.entries(HX.ACOES).map(([id, a]) => `<option value="${id}">${esc(a.rotulo)}</option>`).join('')}`;

	function colunasBase(prefixo) {
		return [
			{ id: 'lote', rotulo: 'Lote', html: (l) => `<span class="nowrap">${esc(l.idLote)}</span>` },
			{ id: 'quando', rotulo: 'Quando', html: (l) => `<span class="nowrap">${fmtDataHora(l.dataHora)}</span>` },
			{ id: 'quem', rotulo: 'Usuário', html: (l) => esc(l.nomeUsuario) },
			{ id: 'acao', rotulo: 'Ação', html: (l) => esc(HX.rotulo('TIPO_ACAO_LOTE', l.tipoAcao)) },
			{ id: 'param', rotulo: 'Parâmetros', html: (l) => `<span class="pequeno">${esc(l.parametros || '—')}</span>` },
			{ id: 'qtd', rotulo: 'Itens', classe: 'num', html: (l) => `${fmtNum(l.qtdSucesso)} ok${l.qtdFalhas ? ` · ${fmtNum(l.qtdFalhas)} ignorado${l.qtdFalhas > 1 ? 's' : ''}` : ''}` },
			{ id: 'res', rotulo: 'Resultado', html: (l) => (l.desfeito ? HX.seloCor(`Desfeito ${fmtDataHora(l.dataDesfeito).slice(11)}`, '#757575') : HX.seloCor(l.resultado, CORES_RESULTADO[l.resultado] || '#607D8B')) },
			{ id: 'itens', rotulo: 'Detalhes', html: (l) => `<button type="button" class="btn btn-pequeno" data-ver="${esc(l.idLote)}" data-origem="${prefixo}" aria-label="Ver itens do lote ${esc(l.idLote)}">Ver itens</button>` },
		];
	}

	function renderizarLocais() {
		const lotes = HX.lotesLocais().filter((l) => l.siglaSetor === HX.setor.siglaSetor).reverse();
		$('resumo-locais').textContent = lotes.length ? `${plural(lotes.length, 'lote', 'lotes')} nesta sessão (ficam no localStorage do navegador).` : 'Nenhum lote executado ainda. Selecione expedientes no painel e escolha uma ação.';
		$('locais').innerHTML = lotes.length ? HX.tabelaHtml({
			id: 'tab-locais', legenda: 'Lotes executados nesta sessão',
			colunas: [...colunasBase('local'), {
				id: 'desfazer', rotulo: 'Desfazer',
				html: (l) => `<button type="button" class="btn btn-pequeno" data-desfazer="${esc(l.idLote)}"${l.desfeito ? ' disabled' : ''} aria-label="Desfazer lote ${esc(l.idLote)}">Desfazer</button>`,
			}],
			linhas: lotes,
		}) : '<p><a class="btn" href="painel.html">Ir para o painel</a></p>';
	}

	function renderizarHistorico() {
		const acao = $('filtro-acao').value;
		const lotes = HX.tabela('acoes_lote').filter((l) => l.siglaSetor === HX.setor.siglaSetor && (!acao || l.tipoAcao === acao))
			.sort((a, b) => (a.dataHora < b.dataHora ? 1 : -1));
		$('historico').innerHTML = HX.tabelaHtml({ id: 'tab-hist', legenda: `Histórico de lotes do setor: ${lotes.length}`, colunas: colunasBase('base'), linhas: lotes });
	}

	function verItens(idLote, origem) {
		let itens;
		let titulo;
		if (origem === 'local') {
			const lote = HX.lotesLocais().find((l) => l.idLote === idLote);
			titulo = `Lote ${idLote}: ${HX.rotulo('TIPO_ACAO_LOTE', lote.tipoAcao)}`;
			itens = lote.itens.map((i) => ({ id: i.id, etiqueta: i.etiqueta, ok: i.ok, detalhe: i.ok ? `${i.descricao}. Antes: ${Object.entries(i.antes).map(([k, v]) => `${k}=${v ?? '∅'}`).join(', ')}` : i.motivo }));
		} else {
			const lote = HX.tabela('acoes_lote').find((l) => l.idLote === idLote);
			titulo = `Lote ${idLote}: ${HX.rotulo('TIPO_ACAO_LOTE', lote.tipoAcao)}`;
			itens = lote.idsExpedientes.split(';').map((id, i) => {
				const e = HX.expediente(id);
				// a base registra só as quantidades; as falhas são marcadas nos últimos itens para ilustrar
				const ok = i < lote.qtdSucesso;
				return { id, etiqueta: e ? e.etiqueta : id, ok, detalhe: ok ? 'Processado' : 'Falha registrada no lote' };
			});
		}
		HX.abrirDialogo({
			titulo, largura: 'min(900px, 95vw)',
			corpo: HX.tabelaHtml({
				id: 'tab-itens-lote', legenda: `Itens do lote ${idLote}`,
				colunas: [
					{ id: 'exp', rotulo: 'Expediente', html: (i) => `<a href="expediente.html?id=${encodeURIComponent(i.id)}">${esc(i.etiqueta)}</a>` },
					{ id: 'ok', rotulo: 'Resultado', html: (i) => (i.ok ? HX.seloCor('Sucesso', '#2E7D32') : HX.seloCor('Não aplicado', '#B71C1C')) },
					{ id: 'det', rotulo: 'Detalhe', html: (i) => `<span class="pequeno">${esc(i.detalhe)}</span>` },
				],
				linhas: itens,
			}),
		});
	}

	document.addEventListener('click', (ev) => {
		const ver = ev.target.closest('[data-ver]');
		if (ver) { verItens(ver.dataset.ver, ver.dataset.origem); return; }
		const desfazer = ev.target.closest('[data-desfazer]');
		if (desfazer) {
			const lote = HX.desfazerLote(desfazer.dataset.desfazer);
			renderizarLocais();
			$('t-locais').focus();
			if (lote) HX.avisar(`Lote ${lote.idLote} desfeito: ${plural(lote.qtdSucesso, 'expediente voltou', 'expedientes voltaram')} ao estado anterior.`);
		}
	});
	$('filtro-acao').addEventListener('change', renderizarHistorico);
	$('btn-resetar').addEventListener('click', () => {
		HX.abrirDialogo({
			titulo: 'Apagar dados locais?',
			corpo: '<p>Remove deste navegador os lotes, favoritos, filtros salvos, notificações lidas, preferências e o usuário simulado. A base sintética (dados.js) não muda.</p>',
			botoes: [{ rotulo: 'Apagar', classe: 'btn-perigo', acao: () => { HX.limparTudo(); location.reload(); } }],
		});
	});

	renderizarLocais();
	renderizarHistorico();
})();
