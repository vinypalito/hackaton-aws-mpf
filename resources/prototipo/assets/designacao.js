/* Balanceamento de carga na designação: índice = carga ÷ capacidade; distribuição gulosa com pré-visualização. */
'use strict';

(() => {
	const { esc, fmtNum, plural, fmtData, HOJE } = HX;
	HX.iniciar('designacao.html');
	const $ = (id) => document.getElementById(id);
	const selecionados = new Set();
	let limite = 50;
	const idUrl = HX.param('id');
	if (idUrl) selecionados.add(idUrl);

	if (HX.usuario.perfil === 'SERVIDOR') {
		$('aviso-perfil').innerHTML = '<p role="alert" class="cartao pequeno" style="margin-bottom:1rem">Seu perfil simulado é SERVIDOR. Na regra real, só membro e chefia designam; aqui a ação fica liberada para a demonstração.</p>';
	}

	function cargas() {
		const inicio = HX.somarDias(HOJE, -29);
		const desig = HX.tabela('designacoes').filter((d) => d.siglaSetor === HX.setor.siglaSetor && d.situacao === 'ATIVA');
		const locais = HX.lotesLocais().filter((l) => !l.desfeito && l.tipoAcao === 'DESIGNAR').flatMap((l) => l.itens.filter((i) => i.ok));
		const ativos = HX.ativos();
		return HX.usuariosDoSetor.map((u) => {
			const ativas = desig.filter((d) => d.idUsuarioDesignado === u.idUsuario).length + locais.filter((i) => i.depois.idResponsavel === u.idUsuario).length;
			const atrasadas = desig.filter((d) => d.idUsuarioDesignado === u.idUsuario && d.statusDevolucao === 'VENCIDA').length;
			const vencidos = ativos.filter((e) => e.requerAcao && e.idResponsavel === u.idUsuario && e.statusPrazo === 'VENCIDO').length;
			const prod = HX.tabela('produtividade_diaria').filter((p) => p.idUsuario === u.idUsuario && p.data >= inicio);
			const acoes = prod.reduce((s, p) => s + p.totalAcoes, 0);
			const capacidade = Math.max(1, acoes / 30);
			const carga = ativas + 2 * atrasadas + vencidos;
			return { u, ativas, atrasadas, vencidos, acoes, capacidade, carga, indice: carga / capacidade, elegivel: $('incluir-chefia').checked || u.perfil === 'SERVIDOR' };
		}).sort((a, b) => a.indice - b.indice);
	}

	function sugerir(qtdItens) {
		const pool = cargas().filter((c) => c.elegivel).map((c) => ({ ...c }));
		const resultado = [];
		for (let i = 0; i < qtdItens; i += 1) {
			pool.sort((a, b) => a.carga / a.capacidade - b.carga / b.capacidade);
			const escolhido = pool[0];
			if (!escolhido) break;
			resultado.push(escolhido.u);
			escolhido.carga += 1;
		}
		return resultado;
	}

	function semDesignacao() {
		return HX.ativos().filter((e) => e.caixa === 'NO_SETOR' && e.requerAcao && e.tipoResponsabilidade !== 'DESIGNADO').sort(HX.ordemFila);
	}

	function renderizarCarga() {
		const lista = cargas();
		const melhor = lista.find((c) => c.elegivel);
		const maxIndice = Math.max(1, ...lista.map((c) => c.indice));
		$('carga').innerHTML = HX.tabelaHtml({
			id: 'tab-carga', legenda: 'Carga, capacidade e índice por pessoa (menor índice primeiro)',
			colunas: [
				{ id: 'pessoa', rotulo: 'Pessoa', html: (c) => `${esc(c.u.nome)}<br><span class="pequeno texto-suave">${esc(c.u.cargo)}</span>${c === melhor ? `<br>${HX.seloCor('Sugestão', '#2E7D32')}` : ''}${c.elegivel ? '' : `<br>${HX.seloCor('Fora da sugestão', '#757575')}`}` },
				{ id: 'ativas', rotulo: 'Designações ativas', classe: 'num', html: (c) => fmtNum(c.ativas) },
				{ id: 'atrasadas', rotulo: 'Devoluções atrasadas', classe: 'num', html: (c) => fmtNum(c.atrasadas) },
				{ id: 'vencidos', rotulo: 'Vencidos sob responsabilidade', classe: 'num', html: (c) => fmtNum(c.vencidos) },
				{ id: 'carga', rotulo: 'Carga', classe: 'num', html: (c) => fmtNum(c.carga) },
				{ id: 'cap', rotulo: 'Ações/dia (30 d)', classe: 'num', html: (c) => c.capacidade.toFixed(1).replace('.', ',') },
				{ id: 'indice', rotulo: 'Índice', html: (c) => `<div class="barra-h" style="grid-template-columns:1fr 3.5rem;margin:0"><span class="trilho" aria-hidden="true"><span style="width:${(100 * c.indice) / maxIndice}%;--cor:${c.indice / maxIndice > 0.66 ? '#C62828' : c.indice / maxIndice > 0.33 ? '#EF6C00' : '#2E7D32'}"></span></span><span class="num">${c.indice.toFixed(1).replace('.', ',')}</span></div>` },
			],
			linhas: lista,
		});
	}

	function renderizarLista({ anunciar = true } = {}) {
		const lista = semDesignacao();
		const ids = new Set(lista.map((e) => e.idExpediente));
		[...selecionados].forEach((id) => { if (!ids.has(id)) selecionados.delete(id); });
		const exibidos = lista.slice(0, limite);
		if (idUrl && ids.has(idUrl) && !exibidos.some((e) => e.idExpediente === idUrl)) exibidos.unshift(HX.expediente(idUrl));
		const sugestao = sugerir(1)[0];
		$('lista').innerHTML = `<div class="tabela-rolagem"><table><caption class="sr-only">Expedientes sem designação: ${fmtNum(lista.length)}</caption>
			<thead><tr role="row"><th id="d-sel" scope="col"><span class="sr-only">Selecionar</span></th><th id="d-exp" scope="col">Expediente</th><th id="d-acao" scope="col">Ação pendente</th>
				<th id="d-prazo" scope="col">Prazo</th><th id="d-prio" scope="col">Prioridade</th><th id="d-titular" scope="col">Titular</th></tr></thead>
			<tbody>${exibidos.map((e) => `<tr role="row"${selecionados.has(e.idExpediente) ? ' class="selecionada"' : ''}>
				<td role="cell" headers="d-sel"><input type="checkbox" id="d-${e.idExpediente}" data-sel="${e.idExpediente}"${selecionados.has(e.idExpediente) ? ' checked' : ''}><label for="d-${e.idExpediente}" class="sr-only">Selecionar ${esc(e.etiqueta)}</label></td>
				<td role="cell" headers="d-exp"><strong>${HX.linkExp(e)}</strong> ${HX.seloGerenciador(e.gerenciador)} ${HX.flags(e)}</td>
				<td role="cell" headers="d-acao">${esc(e.acaoPendente)}</td>
				<td role="cell" headers="d-prazo">${HX.seloPrazo(e)}<br><span class="pequeno">${fmtData(e.dataPrazo)}</span></td>
				<td role="cell" headers="d-prio">${HX.seloPrioridade(e)}</td>
				<td role="cell" headers="d-titular">${esc(e.nomeResponsavel)}</td></tr>`).join('') || '<tr role="row"><td role="cell" headers="d-sel" colspan="6" class="vazio">Nenhum expediente sem designação.</td></tr>'}</tbody></table></div>`;
		$('btn-mais').hidden = lista.length <= limite;
		$('btn-distribuir').disabled = selecionados.size === 0;
		$('btn-distribuir').textContent = selecionados.size ? `Distribuir ${plural(selecionados.size, 'selecionado', 'selecionados')}` : 'Distribuir selecionados';
		if (anunciar) $('resumo').textContent = `${plural(lista.length, 'expediente sem designação', 'expedientes sem designação')}, na ordem da fila (prazo e prioridade).${sugestao ? ` Próxima sugestão: ${sugestao.nome}.` : ''}`;
	}

	$('lista').addEventListener('change', (ev) => {
		const id = ev.target.dataset.sel;
		if (!id) return;
		if (ev.target.checked) selecionados.add(id); else selecionados.delete(id);
		ev.target.closest('tr').classList.toggle('selecionada', ev.target.checked);
		$('btn-distribuir').disabled = selecionados.size === 0;
		$('btn-distribuir').textContent = selecionados.size ? `Distribuir ${plural(selecionados.size, 'selecionado', 'selecionados')}` : 'Distribuir selecionados';
	});
	$('btn-mais').addEventListener('click', () => { limite += 50; renderizarLista(); });
	$('incluir-chefia').addEventListener('change', () => { renderizarCarga(); renderizarLista(); });
	$('btn-distribuir').addEventListener('click', (ev) => {
		const ids = semDesignacao().map((e) => e.idExpediente).filter((id) => selecionados.has(id));
		const pessoas = sugerir(ids.length);
		const mapa = new Map(ids.map((id, i) => [id, pessoas[i]]));
		const contagem = new Map();
		pessoas.forEach((p) => contagem.set(p.nome, (contagem.get(p.nome) || 0) + 1));
		HX.confirmarLote({
			tipoAcao: 'DESIGNAR', ids, origem: ev.currentTarget,
			parametros: (e) => ({ idUsuario: mapa.get(e.idExpediente).idUsuario, nome: mapa.get(e.idExpediente).nome }),
			textoParametros: `balanceamento automático: ${[...contagem.entries()].map(([n, q]) => `${n} (${q})`).join(', ')}`,
			aoConcluir: () => { selecionados.clear(); renderizarCarga(); renderizarLista(); $('t-carga').focus(); },
		});
	});
	$('t-carga').tabIndex = -1;

	renderizarCarga();
	renderizarLista();
})();
