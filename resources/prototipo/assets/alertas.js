/* Alertas: central de notificações (lidas/não lidas, filtros, simulação em tempo real) e resumo diário por e-mail. */
'use strict';

(() => {
	const { esc, fmtNum, plural, fmtData, fmtDataHora, HOJE } = HX;
	HX.iniciar('alertas.html');
	const $ = (id) => document.getElementById(id);

	// ---------- abas (padrão ARIA tabs: conteúdo muda sem trocar a URL) ----------

	const abas = [...document.querySelectorAll('[role="tab"]')];
	function ativarAba(aba, focar = true) {
		abas.forEach((a) => {
			const ativa = a === aba;
			a.setAttribute('aria-selected', String(ativa));
			a.tabIndex = ativa ? 0 : -1;
			$(a.getAttribute('aria-controls')).hidden = !ativa;
		});
		if (focar) aba.focus();
		if (aba.id === 'aba-resumo') renderizarEmail();
	}
	abas.forEach((aba, i) => {
		aba.addEventListener('click', () => ativarAba(aba));
		aba.addEventListener('keydown', (ev) => {
			const destino = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: abas.length - 1 }[ev.key];
			if (destino === undefined) return;
			ev.preventDefault();
			ativarAba(abas[(destino + abas.length) % abas.length]);
		});
	});
	// ---------- notificações ----------

	const tipos = HX.tabela('catalogos').filter((c) => c.dominio === 'TIPO_NOTIFICACAO');
	$('n-tipo').innerHTML = `<option value="">Todos</option>${tipos.map((t) => `<option value="${t.codigo}">${esc(t.descricao)}</option>`).join('')}`;
	$('n-severidade').innerHTML = `<option value="">Todas</option>${['CRITICO', 'ATENCAO', 'INFO'].map((s) => `<option value="${s}">${esc(HX.rotulo('SEVERIDADE', s))}</option>`).join('')}`;
	let limite = 40;
	const simuladas = [];

	function listaFiltrada() {
		const situacao = $('n-situacao').value;
		const tipo = $('n-tipo').value;
		const severidade = $('n-severidade').value;
		const periodo = $('n-periodo').value;
		const inicio = periodo ? HX.somarDias(HOJE, -Number(periodo)) : '';
		return [...simuladas, ...HX.notificacoesDoUsuario()].filter((n) => (!situacao || (situacao === 'lidas') === n.lida)
			&& (!tipo || n.tipoNotificacao === tipo) && (!severidade || n.severidade === severidade)
			&& (!inicio || n.dataHora.slice(0, 10) >= inicio));
	}

	function renderizarNotificacoes({ anunciar = true } = {}) {
		const lista = listaFiltrada();
		const exibidas = lista.slice(0, limite);
		let diaAtual = '';
		let html = '';
		for (const n of exibidas) {
			const dia = n.dataHora.slice(0, 10);
			if (dia !== diaAtual) {
				if (diaAtual) html += '</ul>';
				diaAtual = dia;
				const rotuloDia = dia === HOJE ? 'Hoje' : dia === HX.somarDias(HOJE, -1) ? 'Ontem' : `${HX.diaSemana(dia)}, ${fmtData(dia)}`;
				html += `<h3 style="margin-top:.75rem">${esc(rotuloDia)}</h3><ul class="lista">`;
			}
			html += `<li class="${n.lida ? '' : 'nao-lida'}">${HX.selo('SEVERIDADE', n.severidade)}
				<div class="conteudo"><div class="titulo">${esc(n.titulo)}${n.simulada ? ` ${HX.seloCor('Tempo real (simulado)', '#0B4F8A')}` : ''}</div>
					<div>${esc(n.mensagem)}</div>
					<div class="meta">${esc(HX.rotulo('TIPO_NOTIFICACAO', n.tipoNotificacao))} · ${n.dataHora.slice(11, 16)} · ${HX.seloGerenciador(n.gerenciador)}
						· <a href="expediente.html?id=${encodeURIComponent(n.idExpediente)}">${esc(n.etiqueta)}</a></div></div>
				${n.lida ? '<span class="pequeno texto-suave">Lida</span>' : `<button type="button" class="btn btn-pequeno" data-ler="${esc(n.idNotificacao)}" aria-label="Marcar como lida: ${esc(n.titulo)} (${esc(n.etiqueta)})">Marcar como lida</button>`}</li>`;
		}
		if (diaAtual) html += '</ul>';
		$('n-lista').innerHTML = html || '<p class="vazio">Nenhuma notificação com esses filtros.</p>';
		$('btn-mais').hidden = lista.length <= limite;
		if (anunciar) $('n-resumo').textContent = `${plural(lista.length, 'notificação', 'notificações')}${lista.length > limite ? `, exibindo ${fmtNum(limite)}` : ''}.`;

		const naoLidas = [...simuladas, ...HX.alertasRecentes()].filter((n) => !n.lida);
		$('n-por-tipo').innerHTML = `${HX.barrasHorizontais(tipos.map((t) => ({ rotulo: t.descricao, valor: naoLidas.filter((n) => n.tipoNotificacao === t.codigo).length }))
			.filter((i) => i.valor).sort((a, b) => b.valor - a.valor))}<p class="pequeno texto-suave">Últimos ${HX.JANELA_ALERTAS_DIAS} dias: ${plural(naoLidas.length, 'não lida', 'não lidas')}.</p>`;
		HX.montarTopo('alertas.html');
	}

	['n-situacao', 'n-tipo', 'n-severidade', 'n-periodo'].forEach((id) => $(id).addEventListener('change', () => { limite = 40; renderizarNotificacoes(); }));
	$('btn-mais').addEventListener('click', () => { limite += 40; renderizarNotificacoes(); });
	$('n-lista').addEventListener('click', (ev) => {
		const b = ev.target.closest('[data-ler]');
		if (!b) return;
		const id = b.dataset.ler;
		const simulada = simuladas.find((n) => n.idNotificacao === id);
		if (simulada) simulada.lida = true; else HX.marcarLidas([id]);
		const proximo = b.closest('li').nextElementSibling?.querySelector('[data-ler]');
		renderizarNotificacoes({ anunciar: false });
		HX.avisar('Notificação marcada como lida.');
		(proximo && $('n-lista').querySelector(`[data-ler="${proximo.dataset.ler}"]`) || $('t-lista-notif')).focus?.();
	});
	$('btn-ler-todas').addEventListener('click', () => {
		const exibidas = listaFiltrada().slice(0, limite).filter((n) => !n.lida);
		exibidas.filter((n) => n.simulada).forEach((n) => { n.lida = true; });
		HX.marcarLidas(exibidas.filter((n) => !n.simulada).map((n) => n.idNotificacao));
		renderizarNotificacoes();
		HX.avisar(`${plural(exibidas.length, 'notificação marcada', 'notificações marcadas')} como lida${exibidas.length === 1 ? '' : 's'}.`);
	});
	$('btn-simular').addEventListener('click', () => {
		const candidatos = HX.ativos().filter((e) => e.caixa === 'A_RECEBER' || e.statusPrazo === 'VENCE_HOJE');
		const e = candidatos[Math.floor(Math.random() * candidatos.length)];
		if (!e) return;
		const novo = e.caixa === 'A_RECEBER';
		simuladas.unshift({
			idNotificacao: `SIM-${Date.now()}`, idExpediente: e.idExpediente, etiqueta: e.etiqueta, gerenciador: e.gerenciador,
			tipoNotificacao: novo ? 'NOVO_EXPEDIENTE' : 'PRAZO_VENCE_HOJE', severidade: novo ? (e.urgente ? 'ATENCAO' : 'INFO') : 'CRITICO',
			titulo: novo ? 'Novo expediente a receber' : 'Prazo vence hoje', mensagem: novo ? `${e.etiqueta} (${e.descricaoClasse}) chegou de ${e.setorOrigem}.` : `O prazo de ${e.etiqueta} vence hoje.`,
			dataHora: HX.agoraIso(), lida: false, simulada: true,
		});
		$('n-situacao').value = 'nao-lidas';
		renderizarNotificacoes({ anunciar: false });
		HX.avisar(`Novo alerta: ${simuladas[0].titulo} (${e.etiqueta}).`);
	});

	// ---------- resumo diário (SES) ----------

	const pref = HX.preferencias();
	$('cfg-email').checked = !!pref.notificarPorEmail;
	$('cfg-antecedencia').value = String(pref.antecedenciaAlertaPrazoDias || 3);
	if (!$('cfg-antecedencia').value) $('cfg-antecedencia').value = '3';
	$('cfg-email').addEventListener('change', (ev) => {
		HX.salvarPreferencias({ notificarPorEmail: ev.target.checked });
		renderizarEmail();
		HX.avisar(ev.target.checked ? 'Resumo diário ativado.' : 'Resumo diário desativado.');
	});
	$('cfg-antecedencia').addEventListener('change', (ev) => {
		HX.salvarPreferencias({ antecedenciaAlertaPrazoDias: Number(ev.target.value) });
		renderizarEmail();
		HX.avisar('Antecedência atualizada.');
	});

	let emailAtual = { assunto: '', html: '', texto: '' };
	function montarEmail() {
		const u = HX.usuario;
		const antecedencia = Number(HX.preferencias().antecedenciaAlertaPrazoDias) || 3;
		const meus = HX.ativos().filter((e) => e.requerAcao && e.idResponsavel === u.idUsuario);
		const vencidos = meus.filter((e) => e.statusPrazo === 'VENCIDO').sort(HX.ordemFila);
		const hoje = meus.filter((e) => e.statusPrazo === 'VENCE_HOJE').sort(HX.ordemFila);
		const limiteProx = HX.somarDias(HOJE, antecedencia);
		const proximos = meus.filter((e) => e.dataPrazo > HOJE && e.dataPrazo <= limiteProx && HX.STATUS_ABERTOS.includes(e.statusPrazo)).sort(HX.ordemFila);
		const novos = HX.ativos().filter((e) => e.novo && (e.idResponsavel === u.idUsuario || u.perfil !== 'SERVIDOR')).sort(HX.ordemFila);
		const designacoes = HX.tabela('designacoes').filter((d) => d.siglaSetor === HX.setor.siglaSetor && d.situacao === 'ATIVA' && d.statusDevolucao === 'VENCIDA');
		const devolverEu = designacoes.filter((d) => d.idUsuarioDesignado === u.idUsuario);
		const aguardandoEu = designacoes.filter((d) => d.idUsuarioDesignador === u.idUsuario && d.idUsuarioDesignado !== u.idUsuario);
		const c = HX.contadores('TODOS');

		const cor = { VENCIDO: '#C62828', VENCE_HOJE: '#E65100', PROX: '#F9A825', NOVO: '#1565C0', DEV: '#6A1B9A' };
		const linhaExp = (e) => `<li style="margin:2px 0"><a href="expediente.html?id=${encodeURIComponent(e.idExpediente)}" style="color:#0b4f8a">${esc(e.etiqueta)}</a> · ${esc(HX.rotulo('GERENCIADOR', e.gerenciador))} · ${esc(e.acaoPendente)}${e.dataPrazo ? ` · prazo ${fmtData(e.dataPrazo)}` : ''}${e.urgente ? ' · <strong>urgente</strong>' : ''}</li>`;
		const linhaDes = (d, papel) => `<li style="margin:2px 0"><a href="expediente.html?id=${encodeURIComponent(d.idExpediente)}" style="color:#0b4f8a">${esc(d.etiqueta)}</a> · ${papel === 'eu' ? `designado por ${esc(d.nomeDesignador)}` : `com ${esc(d.nomeDesignado)}`} · devolução era até ${fmtData(d.prazoDevolucao)} (${plural(-d.diasParaDevolucao, 'dia')} de atraso)</li>`;
		const bloco = (titulo, corBloco, itens, render, max = 8) => (itens.length ? `<h3 style="font-size:15px;margin:16px 0 4px;border-left:4px solid ${corBloco};padding-left:8px">${esc(titulo)} (${fmtNum(itens.length)})</h3>
			<ul style="margin:0;padding-left:18px;font-size:13px">${itens.slice(0, max).map(render).join('')}${itens.length > max ? `<li style="list-style:none;color:#555">… e mais ${fmtNum(itens.length - max)}</li>` : ''}</ul>` : '');

		const assunto = `[Único] Resumo de ${fmtData(HOJE)}: ${plural(vencidos.length, 'vencido')}, ${fmtNum(hoje.length)} vence${hoje.length === 1 ? '' : 'm'} hoje, ${plural(novos.length, 'novo')}`;
		const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#1b2430;line-height:1.4">
			<p style="margin:0 0 8px">Olá, ${esc(u.nome.split(' ')[0])}. Este é o seu resumo de ${HX.diaSemana(HOJE)}, ${fmtData(HOJE)}.</p>
			<table role="presentation" style="border-collapse:collapse;width:100%;font-size:13px;margin:8px 0"><tr>
				${[['Vencidos (seus)', vencidos.length, cor.VENCIDO], ['Vencem hoje (seus)', hoje.length, cor.VENCE_HOJE], [`Próximos ${antecedencia} dias`, proximos.length, cor.PROX], ['Novos 24 h', novos.length, cor.NOVO], ['Devoluções vencidas', devolverEu.length + aguardandoEu.length, cor.DEV]]
					.map(([t, v, k]) => `<td style="border:1px solid #d5dbe3;border-top:4px solid ${k};padding:6px;text-align:center"><div style="font-size:20px;font-weight:bold">${fmtNum(v)}</div><div>${esc(t)}</div></td>`).join('')}
			</tr></table>
			${bloco('Prazos vencidos', cor.VENCIDO, vencidos, linhaExp)}
			${bloco('Vencem hoje', cor.VENCE_HOJE, hoje, linhaExp)}
			${bloco(`Vencem nos próximos ${antecedencia} dias`, cor.PROX, proximos, linhaExp, 5)}
			${bloco('Novos nas últimas 24 horas', cor.NOVO, novos, linhaExp, 5)}
			${bloco('Devoluções vencidas: você precisa devolver', cor.DEV, devolverEu, (d) => linhaDes(d, 'eu'))}
			${bloco('Devoluções vencidas: aguardando retorno', cor.DEV, aguardandoEu, (d) => linhaDes(d, 'outro'))}
			${u.perfil !== 'SERVIDOR' ? `<p style="font-size:13px;margin-top:16px">Setor ${esc(HX.setor.siglaSetor)}: ${fmtNum(c.aReceber)} a receber, ${fmtNum(c.noSetor)} no setor, ${fmtNum(c.vencidos)} vencidos, ${fmtNum(c.venceHoje)} vencem hoje.</p>` : ''}
			<p style="font-size:13px;margin-top:16px"><a href="foco.html" style="color:#0b4f8a">Abrir o modo foco</a> · <a href="painel.html" style="color:#0b4f8a">Abrir o painel</a></p>
			<p style="font-size:11px;color:#666;margin-top:16px">Você recebe este e-mail porque ativou o resumo diário. Para parar, desative em Alertas &gt; Resumo diário. Dados sintéticos do hackathon.</p></div>`;
		const texto = [assunto, '', `Vencidos: ${vencidos.length}`, ...vencidos.slice(0, 8).map((e) => `- ${e.etiqueta} (${e.acaoPendente})`),
			`Vencem hoje: ${hoje.length}`, ...hoje.slice(0, 8).map((e) => `- ${e.etiqueta} (${e.acaoPendente})`),
			`Novos 24h: ${novos.length}`, `Devoluções vencidas: ${devolverEu.length + aguardandoEu.length}`].join('\n');
		return { assunto, html, texto, para: u.email };
	}
	function renderizarEmail() {
		emailAtual = montarEmail();
		const ativo = !!HX.preferencias().notificarPorEmail;
		$('email').innerHTML = `${ativo ? '' : '<p role="alert" class="pequeno" style="color:var(--perigo)">O resumo está desativado para este usuário: nada seria enviado. A prévia abaixo mostra o conteúdo caso seja ativado.</p>'}
			<div class="email"><div class="cab"><div><strong>De:</strong> nao-responda@expedientes.exemplo.org (Amazon SES)</div>
				<div><strong>Para:</strong> ${esc(emailAtual.para)}</div><div><strong>Assunto:</strong> ${esc(emailAtual.assunto)}</div></div>
				<div class="corpo-email">${emailAtual.html}</div></div>`;
	}
	$('btn-baixar-email').addEventListener('click', () => {
		HX.baixar(`resumo-${HX.usuario.idUsuario}-${HOJE}.html`, `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(emailAtual.assunto)}</title></head><body>${emailAtual.html}</body></html>`, 'text/html;charset=utf-8');
		HX.avisar('HTML do e-mail baixado.');
	});
	$('btn-copiar-email').addEventListener('click', async () => {
		try {
			await navigator.clipboard.writeText(emailAtual.texto);
			HX.avisar('Texto do e-mail copiado.');
		} catch {
			HX.avisar('Não foi possível copiar (o navegador bloqueou a área de transferência).');
		}
	});

	renderizarNotificacoes();
	// só depois de tudo declarado: a aba "resumo" monta o e-mail na hora
	ativarAba(abas[HX.param('aba') === 'resumo' ? 1 : 0], false);
})();
