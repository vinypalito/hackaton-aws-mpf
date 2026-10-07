/* Modo foco: percorre a fila "próximo expediente" um item por vez, com atalhos de teclado. */
'use strict';

(() => {
	const { esc, fmtNum, plural, fmtData, fmtDataHora } = HX;
	HX.iniciar('foco.html');
	const $ = (id) => document.getElementById(id);

	/** Ação do lote que resolve cada "acaoPendente" (as demais exigem trabalho fora do painel). */
	const ACAO_POR_PENDENCIA = {
		Receber: 'RECEBER', 'Assinar documento': 'ASSINAR', 'Assinar manifestação': 'ASSINAR', 'Dar ciência': 'DAR_CIENCIA',
		Encaminhar: 'MOVIMENTAR', Movimentar: 'MOVIMENTAR', 'Analisar intimação': 'DAR_CIENCIA',
	};
	let escopo = HX.fila('meus').length ? 'meus' : 'setor';
	let atualId = null;
	let concluidos = 0;
	const chaveAdiados = `adiados:${HX.usuario.idUsuario}:${HX.HOJE}`;

	function filaAtual() {
		const adiados = new Set(HX.ler(chaveAdiados, []));
		return HX.fila(escopo).filter((e) => !adiados.has(e.idExpediente));
	}

	function renderizar({ focar = false } = {}) {
		document.querySelectorAll('[data-escopo]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.escopo === escopo)));
		const fila = filaAtual();
		const adiados = HX.ler(chaveAdiados, []).length;
		let indice = fila.findIndex((e) => e.idExpediente === atualId);
		if (indice < 0) indice = 0;
		const e = fila[indice];
		atualId = e ? e.idExpediente : null;
		$('posicao').textContent = e ? `Item ${fmtNum(indice + 1)} de ${fmtNum(fila.length)} na ${escopo === 'meus' ? 'sua fila' : 'fila do setor'}` : 'Fila vazia';
		$('sessao').textContent = `${plural(concluidos, 'ação executada', 'ações executadas')} nesta sessão${adiados ? ` · ${plural(adiados, 'adiado', 'adiados')}` : ''}`;
		$('barra-progresso').style.width = fila.length ? `${((indice + 1) / fila.length) * 100}%` : '0';

		if (!e) {
			$('cartao-foco').innerHTML = `<h2 id="foco-etiqueta">Nada pendente por aqui</h2>
				<p>${escopo === 'meus' ? 'Sua fila está vazia. Experimente a fila do setor.' : 'A fila do setor está vazia.'}</p>
				${adiados ? '<button type="button" class="btn" id="btn-restaurar">Restaurar adiados</button>' : ''}`;
			$('btn-restaurar')?.addEventListener('click', () => { HX.gravar(chaveAdiados, []); renderizar({ focar: true }); });
			return;
		}
		const tipoAcao = ACAO_POR_PENDENCIA[e.acaoPendente];
		const podeExecutar = tipoAcao && HX.preverLote(tipoAcao, [e.idExpediente], { destino: 'X' }).qtdSucesso > 0;
		const anotacoes = (HX.agruparPor('anotacoes', 'idExpediente').get(e.idExpediente) || []).slice().sort((a, b) => (a.dataHora < b.dataHora ? 1 : -1)).slice(0, 3);
		const proximo = fila[indice + 1];
		const cor = HX.cat('STATUS_PRAZO', e.statusPrazo).cor;
		const partes = HX.explicarPrioridade(e);
		const visivel = HX.podeVerConteudo(e);
		$('cartao-foco').style.setProperty('--cor', cor);
		$('cartao-foco').innerHTML = `
			<p style="margin:0">${HX.seloGerenciador(e.gerenciador)} ${esc(e.descricaoClasse)} · ${esc(HX.rotulo('CAIXA', e.caixa))}</p>
			<h2 id="foco-etiqueta" class="etiqueta" tabindex="-1">${esc(e.etiqueta)}</h2>
			<p class="acao"><strong>${esc(e.acaoPendente)}</strong></p>
			<p>${HX.seloPrazo(e)} ${HX.seloPrioridade(e)} ${HX.seloRisco(e)} ${HX.flags(e)}</p>
			<dl class="dados">
				<dt>Prazo</dt><dd>${fmtData(e.dataPrazo)} (${esc(HX.rotulo('TIPO_PRAZO', e.tipoPrazo).toLowerCase())})</dd>
				<dt>Assunto</dt><dd>${HX.assuntoVisivel(e)}</dd>
				<dt>Resumo</dt><dd>${visivel ? esc(e.resumo) : '<span class="texto-suave">Conteúdo sigiloso</span>'}</dd>
				<dt>Origem</dt><dd>${esc(e.orgaoOrigem)} · chegou em ${fmtDataHora(e.dataChegada)}</dd>
				<dt>Responsável</dt><dd>${esc(e.nomeResponsavel)} (${e.tipoResponsabilidade === 'DESIGNADO' ? 'designado' : 'titular'})</dd>
				<dt>Parado há</dt><dd>${plural(e.tempoParadoDias, 'dia')}</dd>
			</dl>
			<details style="margin-top:.75rem"><summary>Por que este é o próximo?</summary>
				<p class="pequeno">A fila ordena por data de prazo e, no empate, pela pontuação de prioridade (${fmtNum(e.pontuacaoPrioridade)} pts):</p>
				<ul class="pequeno">${partes.map(([t, p]) => `<li>${esc(t)}: +${p}</li>`).join('') || '<li>Sem critérios pontuados.</li>'}</ul>
				${proximo ? `<p class="pequeno">Depois dele: ${esc(proximo.etiqueta)} (prazo ${fmtData(proximo.dataPrazo)}, ${proximo.pontuacaoPrioridade} pts).</p>` : ''}
			</details>
			${anotacoes.length && visivel ? `<h3 style="margin-top:.75rem">Últimas anotações</h3><ul class="lista pequeno">${anotacoes.map((a) => `<li><div class="conteudo">${esc(a.texto)}<div class="meta">${esc(a.nomeUsuario)} · ${fmtDataHora(a.dataHora)}</div></div></li>`).join('')}</ul>` : ''}
			<div class="barra" style="margin-top:1rem">
				<button type="button" class="btn" id="btn-anterior" aria-keyshortcuts="P"${indice === 0 ? ' disabled' : ''}>Anterior</button>
				<button type="button" class="btn btn-primario" id="btn-executar" aria-keyshortcuts="X"${podeExecutar ? '' : ' disabled'}>${podeExecutar ? `Executar: ${esc(HX.ACOES[tipoAcao].rotulo)}` : 'Ação exige trabalho no expediente'}</button>
				<a class="btn" id="btn-abrir" aria-keyshortcuts="A" href="expediente.html?id=${encodeURIComponent(e.idExpediente)}">Abrir expediente</a>
				<button type="button" class="btn" id="btn-adiar" aria-keyshortcuts="D">Adiar para amanhã</button>
				<span class="espaco"></span>
				<button type="button" class="btn" id="btn-proximo" aria-keyshortcuts="N"${indice >= fila.length - 1 ? ' disabled' : ''}>Próximo</button>
			</div>`;

		const irPara = (novo) => {
			const alvo = fila[novo];
			if (!alvo) return;
			atualId = alvo.idExpediente;
			renderizar({ focar: true });
		};
		$('btn-anterior').addEventListener('click', () => irPara(indice - 1));
		$('btn-proximo').addEventListener('click', () => irPara(indice + 1));
		$('btn-adiar').addEventListener('click', () => {
			HX.gravar(chaveAdiados, [...HX.ler(chaveAdiados, []), e.idExpediente]);
			atualId = proximo ? proximo.idExpediente : null;
			HX.avisar(`${e.etiqueta} adiado para amanhã.`);
			renderizar({ focar: true });
		});
		$('btn-executar').addEventListener('click', (ev) => {
			HX.iniciarAcaoLote(tipoAcao, [e.idExpediente], () => {
				concluidos += 1;
				atualId = proximo ? proximo.idExpediente : null;
				renderizar({ focar: true });
			}, ev.currentTarget, () => {
				concluidos = Math.max(0, concluidos - 1);
				atualId = e.idExpediente;
				renderizar({ focar: true });
			});
		});
		if (focar) $('foco-etiqueta').focus();
	}

	document.querySelectorAll('[data-escopo]').forEach((b) => b.addEventListener('click', () => {
		escopo = b.dataset.escopo;
		atualId = null;
		renderizar();
	}));
	document.addEventListener('keydown', (ev) => {
		if (ev.ctrlKey || ev.metaKey || ev.altKey || document.querySelector('dialog[open]')) return;
		if (/^(INPUT|SELECT|TEXTAREA)$/.test(ev.target.tagName)) return;
		const mapa = { n: 'btn-proximo', p: 'btn-anterior', x: 'btn-executar', a: 'btn-abrir', d: 'btn-adiar' };
		const alvo = $(mapa[ev.key.toLowerCase()]);
		if (alvo && !alvo.disabled) {
			ev.preventDefault();
			alvo.click();
		}
	});
	renderizar();
})();
