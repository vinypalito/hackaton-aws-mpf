/* Detalhe do expediente: dados, prazos, designações, anotações e histórico (rastreabilidade). */
'use strict';

(() => {
	const { esc, fmtNum, plural, fmtData, fmtDataHora } = HX;
	HX.iniciar('painel.html');
	const $ = (id) => document.getElementById(id);
	const id = HX.param('id');

	const CORES_MOV = {
		CADASTRO: '#607D8B', ENVIO_AO_SETOR: '#1565C0', RECEBIMENTO: '#2E7D32', DESIGNACAO: '#6A1B9A', MARCADOR_INCLUIDO: '#00838F',
		ANOTACAO_INCLUIDA: '#8D6E63', MINUTA_CRIADA: '#5E35B1', ASSINATURA: '#283593', PRAZO_PRORROGADO: '#E65100',
		ENVIO_PELO_SETOR: '#0277BD', ARQUIVAMENTO: '#37474F',
	};
	let filtroTipo = '';
	let somenteInternos = false;

	function historico(e) {
		const base = (HX.agruparPor('movimentacoes', 'idExpediente').get(e.idExpediente) || []).map((m) => ({ ...m, local: false }));
		return [...base, ...HX.movimentacoesLocais(e.idExpediente)].sort((a, b) => (a.dataHora < b.dataHora ? 1 : -1));
	}

	function renderizarHistorico(e) {
		const todos = historico(e);
		const lista = todos.filter((m) => (!filtroTipo || m.tipoMovimentacao === filtroTipo) && (!somenteInternos || m.idUsuario !== 'EXTERNO'));
		$('historico-lista').innerHTML = lista.map((m) => `<li style="--cor:${CORES_MOV[m.tipoMovimentacao] || '#607D8B'}">
			<div><strong>${esc(HX.rotulo('TIPO_MOVIMENTACAO', m.tipoMovimentacao))}</strong>${m.local ? ` ${HX.seloCor(m.desfeito ? 'Desfeito nesta sessão' : 'Nesta sessão', m.desfeito ? '#757575' : '#0B4F8A')}` : ''}</div>
			<div${m.desfeito ? ' style="text-decoration:line-through"' : ''}>${esc(m.descricao)}</div>
			<div class="quando">${fmtDataHora(m.dataHora)} · ${esc(m.nomeUsuario)}${m.setorOrigem && m.setorDestino && m.setorOrigem !== m.setorDestino ? ` · ${esc(m.setorOrigem)} → ${esc(m.setorDestino)}` : ''}</div></li>`).join('')
			|| '<li class="vazio">Nenhuma movimentação com esses filtros.</li>';
		$('historico-resumo').textContent = `${plural(lista.length, 'movimentação exibida', 'movimentações exibidas')} de ${fmtNum(todos.length)}.`;
	}

	function renderizar() {
		const e = HX.expediente(id);
		if (!e) {
			$('detalhe').innerHTML = '<div class="cartao" role="alert"><h1>Expediente não encontrado</h1><p><a href="painel.html">Voltar ao painel</a></p></div>';
			return;
		}
		$('migalha').textContent = e.etiqueta;
		document.title = `${e.etiqueta} · Expedientes (protótipo)`;
		if (e.siglaSetor !== HX.setor.siglaSetor) {
			$('detalhe').innerHTML = `<div class="cartao" role="alert"><h1>Acesso negado</h1>
				<p>O expediente ${esc(e.etiqueta)} pertence ao setor ${esc(e.siglaSetor)}. O usuário simulado (${esc(HX.usuario.nome)}, ${esc(HX.setor.siglaSetor)}) não tem acesso.</p>
				<p class="pequeno texto-suave">No backend real a regra deve ser aplicada no endpoint (autorização por setor), não só na tela.</p></div>`;
			return;
		}
		const visivel = HX.podeVerConteudo(e);
		const prazos = HX.agruparPor('prazos', 'idExpediente').get(e.idExpediente) || [];
		const designacoes = HX.agruparPor('designacoes', 'idExpediente').get(e.idExpediente) || [];
		const anotacoes = (HX.agruparPor('anotacoes', 'idExpediente').get(e.idExpediente) || []).slice().sort((a, b) => (a.dataHora < b.dataHora ? 1 : -1));
		const marcadores = HX.agruparPor('marcadores_expedientes', 'idExpediente').get(e.idExpediente) || [];
		const notificacoes = HX.notificacoesDoUsuario().filter((n) => n.idExpediente === e.idExpediente);
		const partes = HX.explicarPrioridade(e);
		const r = HX.risco(e);
		const acoesPossiveis = Object.entries(HX.ACOES).filter(([tipo]) => HX.preverLote(tipo, [e.idExpediente], tipo === 'DESIGNAR' ? { idUsuario: '', nome: '' } : tipo === 'INCLUIR_MARCADOR' ? { marcador: '__qualquer__' } : { destino: 'X' }).qtdSucesso > 0 || tipo === 'INCLUIR_MARCADOR');
		const tiposMov = [...new Set(historico(e).map((m) => m.tipoMovimentacao))];

		$('detalhe').innerHTML = `
			<div class="cabecalho-pagina">
				<div>
					<h1>${esc(e.etiqueta)} ${HX.seloGerenciador(e.gerenciador)}</h1>
					<p>${esc(e.descricaoClasse)} · ${esc(e.numeroReferencia)} · ${esc(HX.rotulo('CAIXA', e.caixa))} · ${esc(HX.rotulo('SITUACAO', e.situacao))}</p>
					<p style="margin-top:.35rem">${HX.seloPrazo(e)} ${HX.seloPrioridade(e)} ${HX.seloRisco(e)} ${HX.flags(e)}</p>
				</div>
				<div class="grupo-botoes">
					<button type="button" class="btn" id="btn-fav" aria-pressed="${!!e.favorito}"><span aria-hidden="true">${e.favorito ? '★' : '☆'}</span> ${e.favorito ? 'Favorito' : 'Favoritar'}</button>
					${e.dataPrazo && HX.STATUS_ABERTOS.includes(e.statusPrazo) ? '<button type="button" class="btn" id="btn-ics">Adicionar prazo ao calendário (.ics)</button>' : ''}
					${e.caixa === 'NO_SETOR' ? `<a class="btn" href="designacao.html?id=${encodeURIComponent(e.idExpediente)}">Sugerir designação</a>` : ''}
				</div>
			</div>
			${e.requerAcao ? `<section class="cartao" aria-labelledby="t-acao" style="margin-bottom:1rem;border-left:6px solid ${HX.cat('STATUS_PRAZO', e.statusPrazo).cor}">
				<h2 id="t-acao">Ação pendente: ${esc(e.acaoPendente)}</h2>
				<div class="grupo-botoes" id="acoes">${acoesPossiveis.map(([tipo, a]) => `<button type="button" class="btn btn-pequeno" data-acao="${tipo}">${esc(a.rotulo)}${['DESIGNAR', 'INCLUIR_MARCADOR', 'MOVIMENTAR'].includes(tipo) ? '…' : ''}</button>`).join('')}</div>
				<p class="pequeno texto-suave" style="margin-bottom:0">As ações usam o mesmo fluxo do lote: pré-visualização, registro em trilha e opção de desfazer.</p></section>` : ''}
			<div class="grade grade-2">
				<section class="cartao" aria-labelledby="t-dados">
					<h2 id="t-dados">Dados gerais</h2>
					<dl class="dados">
						<dt>Assunto</dt><dd>${HX.assuntoVisivel(e)}</dd>
						<dt>Tema</dt><dd>${esc(e.tema)}</dd>
						<dt>Resumo</dt><dd>${visivel ? esc(e.resumo) : '<span class="texto-suave">Conteúdo sigiloso: visível para o responsável e a chefia.</span>'}</dd>
						<dt>Órgão de origem</dt><dd>${esc(e.orgaoOrigem)}</dd>
						<dt>Tipo de entrada</dt><dd>${esc(e.tipoEntrada)}</dd>
						<dt>Trâmite</dt><dd>${esc(e.setorOrigem)} → ${esc(e.setorDestino)}</dd>
						<dt>Autuação</dt><dd>${fmtDataHora(e.dataAutuacao)}</dd>
						<dt>Chegada</dt><dd>${fmtDataHora(e.dataChegada)}</dd>
						<dt>Recebimento</dt><dd>${fmtDataHora(e.dataRecebimento)}</dd>
						<dt>Última movimentação</dt><dd>${fmtDataHora(e.dataUltimaMovimentacao)} (parado há ${plural(e.tempoParadoDias, 'dia')})</dd>
						<dt>Responsável</dt><dd>${esc(e.nomeResponsavel)} (${e.tipoResponsabilidade === 'DESIGNADO' ? 'designado' : 'titular'}) · ${esc(e.oficioResponsavel)}</dd>
						<dt>Meio</dt><dd>${e.eletronico ? 'Eletrônico' : 'Físico'} · sigilo nível ${e.nivelSigilo}</dd>
						<dt>Marcadores</dt><dd><span class="icones-flag">${e.listaMarcadores.map((m) => HX.seloMarcador(m, e.gerenciador, e.siglaSetor)).join('') || '—'}</span></dd>
						<dt>Minutas pendentes</dt><dd>${fmtNum(e.qtdMinutasPendentes)}</dd>
					</dl>
				</section>
				<section class="cartao" aria-labelledby="t-prioridade">
					<h2 id="t-prioridade">Por que esta prioridade?</h2>
					${HX.tabelaHtml({
						id: 'tab-pontos', legenda: 'Composição da pontuação de prioridade',
						colunas: [{ id: 'criterio', rotulo: 'Critério', html: (p) => esc(p[0]) }, { id: 'pontos', rotulo: 'Pontos', classe: 'num', html: (p) => fmtNum(p[1]) }],
						linhas: partes, vazio: 'Nenhum critério pontuado.',
					})}
					<p class="pequeno">Total: <strong>${fmtNum(e.pontuacaoPrioridade)} pontos</strong> (${esc(HX.rotulo('PRIORIDADE', e.prioridade))}).
						${e.caixa === 'ENVIADO_NAO_RECEBIDO' ? 'Itens enviados e ainda não recebidos contam metade.' : ''} Faixas: crítica ≥ 60, alta ≥ 35, média ≥ 20.</p>
					<h3>Risco de vencimento</h3>
					<p class="pequeno">${r ? `Valor <strong>${r.valor}</strong> = 20 × (${e.tempoParadoDias} dias parado + 1) ÷ (${Math.max(e.diasRestantes, 0)} dias restantes + 1), limitado a 100.` : 'Não se aplica (prazo vencido, cumprido ou sem ação pendente).'}</p>
					<h3>Prazos</h3>
					${HX.tabelaHtml({
						id: 'tab-prazos', legenda: 'Prazos do expediente',
						colunas: [
							{ id: 'tipo', rotulo: 'Tipo', html: (p) => esc(HX.rotulo('TIPO_PRAZO', p.tipoPrazo)) },
							{ id: 'inicio', rotulo: 'Início', html: (p) => fmtData(p.dataInicio) },
							{ id: 'fim', rotulo: 'Prazo', html: (p) => fmtData(p.dataPrazo) },
							{ id: 'duracao', rotulo: 'Dias', classe: 'num', html: (p) => fmtNum(p.duracaoDias) },
							{ id: 'situacao', rotulo: 'Situação', html: (p) => esc(p.situacao.replace(/_/g, ' ').toLowerCase()) },
							{ id: 'atraso', rotulo: 'Atraso', classe: 'num', html: (p) => (p.diasAtraso ? plural(p.diasAtraso, 'dia') : '—') },
						],
						linhas: prazos, vazio: 'Sem prazos.',
					})}
				</section>
				<section class="cartao" aria-labelledby="t-designacoes">
					<h2 id="t-designacoes">Designações</h2>
					${HX.tabelaHtml({
						id: 'tab-designacoes', legenda: 'Designações do expediente',
						colunas: [
							{ id: 'designado', rotulo: 'Designado', html: (d) => esc(d.nomeDesignado) },
							{ id: 'por', rotulo: 'Por', html: (d) => esc(d.nomeDesignador) },
							{ id: 'data', rotulo: 'Em', html: (d) => fmtDataHora(d.dataDesignacao) },
							{ id: 'devolucao', rotulo: 'Devolução até', html: (d) => fmtData(d.prazoDevolucao) },
							{ id: 'status', rotulo: 'Situação', html: (d) => esc(`${d.situacao === 'ATIVA' ? 'Ativa' : 'Encerrada'} · ${d.statusDevolucao.replace(/_/g, ' ').toLowerCase()}`) },
						],
						linhas: designacoes, vazio: 'Sem designações.',
					})}
					<h3 style="margin-top:1rem">Marcadores incluídos</h3>
					<ul class="lista">${marcadores.map((m) => `<li>${HX.seloCor(m.descricao, m.cor)}<div class="conteudo meta">${esc(HX.nomeUsuario(m.idUsuario))} · ${fmtDataHora(m.dataInclusao)}</div></li>`).join('') || '<li class="vazio">Nenhum.</li>'}</ul>
				</section>
				<section class="cartao" aria-labelledby="t-anotacoes">
					<h2 id="t-anotacoes">Anotações (${fmtNum(anotacoes.length)})</h2>
					<ul class="lista">${anotacoes.map((a) => `<li><div class="conteudo"><div>${visivel ? esc(a.texto) : '<span class="texto-suave">Anotação de expediente sigiloso</span>'}</div>
						<div class="meta">${esc(a.nomeUsuario)} · ${fmtDataHora(a.dataHora)}</div></div></li>`).join('') || '<li class="vazio">Sem anotações.</li>'}</ul>
					<h3 style="margin-top:1rem">Alertas deste expediente para você</h3>
					<ul class="lista">${notificacoes.slice(0, 6).map((n) => `<li>${HX.selo('SEVERIDADE', n.severidade)}<div class="conteudo"><div class="titulo">${esc(n.titulo)}</div>
						<div class="meta">${fmtDataHora(n.dataHora)} · ${n.lida ? 'lida' : 'não lida'}</div></div></li>`).join('') || '<li class="vazio">Nenhum.</li>'}</ul>
				</section>
			</div>
			<section class="cartao" aria-labelledby="t-historico" style="margin-top:1rem">
				<header><h2 id="t-historico">Histórico e rastreabilidade</h2><button type="button" class="btn btn-pequeno" id="btn-exp-hist">Exportar histórico (CSV)</button></header>
				<div class="barra">
					<div class="campo"><label for="hist-tipo">Tipo de movimentação</label>
						<select id="hist-tipo"><option value="">Todos</option>${tiposMov.map((t) => `<option value="${t}"${t === filtroTipo ? ' selected' : ''}>${esc(HX.rotulo('TIPO_MOVIMENTACAO', t))}</option>`).join('')}</select></div>
					<p style="align-self:flex-end;margin:0"><input type="checkbox" id="hist-internos"${somenteInternos ? ' checked' : ''}> <label for="hist-internos">Somente ações de usuários do setor</label></p>
				</div>
				<p id="historico-resumo" class="pequeno texto-suave" aria-live="polite"></p>
				<ol class="linha-tempo" id="historico-lista" aria-describedby="historico-resumo"></ol>
			</section>`;

		renderizarHistorico(e);
		$('hist-tipo').addEventListener('change', (ev) => { filtroTipo = ev.target.value; renderizarHistorico(e); });
		$('hist-internos').addEventListener('change', (ev) => { somenteInternos = ev.target.checked; renderizarHistorico(e); });
		$('btn-exp-hist').addEventListener('click', () => {
			const cols = [
				{ rotulo: 'dataHora', valor: (m) => m.dataHora }, { rotulo: 'tipo', valor: (m) => m.tipoMovimentacao },
				{ rotulo: 'usuario', valor: (m) => m.nomeUsuario }, { rotulo: 'origem', valor: (m) => m.setorOrigem },
				{ rotulo: 'destino', valor: (m) => m.setorDestino }, { rotulo: 'descricao', valor: (m) => m.descricao },
				{ rotulo: 'sessaoLocal', valor: (m) => (m.local ? (m.desfeito ? 'desfeito' : 'sim') : '') },
			];
			HX.baixar(`historico-${e.etiqueta.replace(/\W+/g, '-')}.csv`, `\uFEFF${HX.csvDe(cols, historico(e))}`, 'text/csv;charset=utf-8');
		});
		$('btn-fav').addEventListener('click', () => {
			const agora = HX.alternarFavorito(e.idExpediente);
			renderizar();
			$('btn-fav').focus();
			HX.avisar(agora ? 'Favoritado com sucesso.' : 'Removido dos favoritos.');
		});
		$('btn-ics')?.addEventListener('click', () => {
			const pref = HX.preferencias();
			HX.baixar(`prazo-${e.etiqueta.replace(/\W+/g, '-')}.ics`, HX.gerarIcs([e], `Prazo ${e.etiqueta}`, Number(pref.antecedenciaAlertaPrazoDias) || 0), 'text/calendar;charset=utf-8');
			HX.avisar('Arquivo .ics gerado.');
		});
		$('acoes')?.addEventListener('click', (ev) => {
			const b = ev.target.closest('[data-acao]');
			if (b) HX.iniciarAcaoLote(b.dataset.acao, [e.idExpediente], () => { renderizar(); $('conteudo').focus(); }, b);
		});
	}

	renderizar();
})();
