/* Calendário de prazos com indicadores por situação e exportação iCal (RFC 5545). */
'use strict';

(() => {
	const { esc, fmtNum, plural, fmtData, HOJE } = HX;
	HX.iniciar('prazos.html');
	const $ = (id) => document.getElementById(id);

	const STATUS = ['VENCIDO', 'VENCE_HOJE', 'CRITICO', 'ATENCAO', 'NO_PRAZO'];
	const ABREV = { VENCIDO: 'vencido', VENCE_HOJE: 'hoje', CRITICO: '≤ 3 d', ATENCAO: '≤ 7 d', NO_PRAZO: 'no prazo' };
	const SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
	let ano = Number(HOJE.slice(0, 4));
	let mes = Number(HOJE.slice(5, 7));
	let diaSelecionado = HOJE;

	$('gerenciador').innerHTML = `<option value="">Todos</option>${HX.gerenciadoresDoSetor().map((g) => `<option value="${g}">${esc(HX.rotulo('GERENCIADOR', g))}</option>`).join('')}`;
	if (HX.fila('meus').length) $('escopo').value = 'meus';
	$('legenda-prazo').innerHTML = STATUS.map((s) => `<span style="--cor:${HX.cat('STATUS_PRAZO', s).cor}">${esc(HX.rotulo('STATUS_PRAZO', s))}</span>`).join('');

	function prazosAbertos() {
		const g = $('gerenciador').value;
		const meus = $('escopo').value === 'meus';
		return HX.ativos().filter((e) => e.requerAcao && e.dataPrazo && STATUS.includes(e.statusPrazo)
			&& (!g || e.gerenciador === g) && (!meus || e.idResponsavel === HX.usuario.idUsuario));
	}

	function renderizarCalendario() {
		const lista = prazosAbertos();
		const porDia = new Map();
		for (const e of lista) {
			if (!porDia.has(e.dataPrazo)) porDia.set(e.dataPrazo, []);
			porDia.get(e.dataPrazo).push(e);
		}
		const primeiro = `${ano}-${String(mes).padStart(2, '0')}-01`;
		const diaSemanaInicio = new Date(Date.UTC(ano, mes - 1, 1)).getUTCDay();
		const inicioGrade = HX.somarDias(primeiro, -diaSemanaInicio);
		$('titulo-mes').textContent = `${HX.MESES[mes - 1][0].toUpperCase()}${HX.MESES[mes - 1].slice(1)} de ${ano}`;

		let linhas = '';
		for (let semana = 0; semana < 6; semana += 1) {
			let celulas = '';
			for (let d = 0; d < 7; d += 1) {
				const data = HX.somarDias(inicioGrade, semana * 7 + d);
				const itens = porDia.get(data) || [];
				const fora = Number(data.slice(5, 7)) !== mes;
				const contagem = STATUS.map((s) => [s, itens.filter((e) => e.statusPrazo === s).length]).filter(([, n]) => n);
				const descricao = `${Number(data.slice(8, 10))} de ${HX.MESES[Number(data.slice(5, 7)) - 1]}: ${itens.length ? `${plural(itens.length, 'prazo')} (${contagem.map(([s, n]) => `${n} ${HX.rotulo('STATUS_PRAZO', s).toLowerCase()}`).join(', ')})` : 'sem prazos'}${data === HOJE ? ', hoje' : ''}`;
				celulas += `<td role="cell" headers="sem-${d}" class="${fora ? 'fora' : ''}${data === HOJE ? ' hoje' : ''}">
					<button type="button" class="dia" data-dia="${data}" aria-pressed="${data === diaSelecionado}" aria-label="${esc(descricao)}">
						<span class="numero" aria-hidden="true">${Number(data.slice(8, 10))}</span>
						<span class="selos" aria-hidden="true">${contagem.map(([s, n]) => HX.selo('STATUS_PRAZO', s, `${n} ${ABREV[s]}`)).join('')}</span>
					</button></td>`;
			}
			linhas += `<tr role="row">${celulas}</tr>`;
			if (HX.somarDias(inicioGrade, (semana + 1) * 7).slice(5, 7) !== primeiro.slice(5, 7) && semana >= 3) break;
		}
		$('calendario').innerHTML = `<div class="tabela-rolagem"><table class="calendario"><caption class="sr-only">Prazos de ${esc($('titulo-mes').textContent)}; cada dia é um botão que lista os prazos.</caption>
			<thead><tr role="row">${SEMANA.map((s, i) => `<th id="sem-${i}" scope="col"><abbr title="${s}">${s.slice(0, 3)}</abbr></th>`).join('')}</tr></thead><tbody>${linhas}</tbody></table></div>`;
		renderizarDia(porDia.get(diaSelecionado) || []);
		atualizarIcs();
	}

	function renderizarDia(itens) {
		$('titulo-dia').textContent = `Prazos de ${fmtData(diaSelecionado)}${diaSelecionado === HOJE ? ' (hoje)' : ''}`;
		$('resumo-dia').textContent = `${plural(itens.length, 'prazo', 'prazos')} em ${HX.diaSemana(diaSelecionado)}, ${fmtData(diaSelecionado)}.`;
		$('lista-dia').innerHTML = `<ul class="lista">${itens.sort((a, b) => b.pontuacaoPrioridade - a.pontuacaoPrioridade).map((e) => `<li><div class="conteudo">
			<div class="titulo">${HX.linkExp(e)} ${HX.seloGerenciador(e.gerenciador)}</div>
			<div class="meta">${esc(e.acaoPendente)} · ${esc(e.nomeResponsavel)}</div>
			<div>${HX.seloPrazo(e)} ${HX.seloPrioridade(e)} ${HX.flags(e)}</div></div></li>`).join('') || '<li class="vazio">Nenhum prazo neste dia.</li>'}</ul>`;
	}

	function selecaoIcs() {
		const periodo = $('ics-periodo').value;
		const lista = prazosAbertos();
		if (periodo === 'mes') {
			const prefixo = `${ano}-${String(mes).padStart(2, '0')}`;
			return lista.filter((e) => e.dataPrazo.startsWith(prefixo));
		}
		if (periodo === '30') {
			const limite = HX.somarDias(HOJE, 30);
			return lista.filter((e) => e.dataPrazo >= HOJE && e.dataPrazo <= limite);
		}
		return lista;
	}
	function atualizarIcs() {
		const lista = selecaoIcs().sort(HX.ordemFila);
		const antecedencia = Number(HX.preferencias().antecedenciaAlertaPrazoDias) || 0;
		$('ics-info').textContent = `${plural(lista.length, 'evento', 'eventos')} de dia inteiro, com lembrete ${antecedencia} dia(s) antes (preferência antecedenciaAlertaPrazoDias). Assunto de expediente sigiloso não entra no arquivo.`;
		const ics = HX.gerarIcs(lista.slice(0, 2), 'previa', antecedencia);
		$('ics-previa').textContent = `${ics.split('\r\n').slice(0, 40).join('\n')}${lista.length > 2 ? '\n… (demais eventos)' : ''}`;
	}

	$('calendario').addEventListener('click', (ev) => {
		const b = ev.target.closest('[data-dia]');
		if (!b) return;
		diaSelecionado = b.dataset.dia;
		const [a, m] = diaSelecionado.split('-').map(Number);
		const mudouMes = a !== ano || m !== mes;
		ano = a;
		mes = m;
		renderizarCalendario();
		$('calendario').querySelector(`[data-dia="${diaSelecionado}"]`).focus();
		if (mudouMes) HX.avisar(`Exibindo ${$('titulo-mes').textContent}.`);
	});
	const mudarMes = (delta) => {
		mes += delta;
		if (mes < 1) { mes = 12; ano -= 1; }
		if (mes > 12) { mes = 1; ano += 1; }
		diaSelecionado = `${ano}-${String(mes).padStart(2, '0')}-01`;
		renderizarCalendario();
	};
	$('mes-anterior').addEventListener('click', () => mudarMes(-1));
	$('mes-proximo').addEventListener('click', () => mudarMes(1));
	$('mes-hoje').addEventListener('click', () => {
		ano = Number(HOJE.slice(0, 4));
		mes = Number(HOJE.slice(5, 7));
		diaSelecionado = HOJE;
		renderizarCalendario();
	});
	$('escopo').addEventListener('change', renderizarCalendario);
	$('gerenciador').addEventListener('change', renderizarCalendario);
	$('ics-periodo').addEventListener('change', atualizarIcs);
	$('btn-ics').addEventListener('click', () => {
		const lista = selecaoIcs();
		const nome = `Prazos ${HX.setor.siglaSetor}${$('escopo').value === 'meus' ? ` - ${HX.usuario.nome}` : ''}`;
		HX.baixar(`prazos-${HX.setor.siglaSetor.replace(/\W+/g, '-')}.ics`, HX.gerarIcs(lista, nome, Number(HX.preferencias().antecedenciaAlertaPrazoDias) || 0), 'text/calendar;charset=utf-8');
		HX.avisar(`Arquivo .ics com ${plural(lista.length, 'evento', 'eventos')} gerado.`);
	});

	renderizarCalendario();
	document.title = `Prazos (${fmtNum(prazosAbertos().length)}) · Expedientes (protótipo)`;
})();
