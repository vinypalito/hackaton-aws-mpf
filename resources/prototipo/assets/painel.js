/* Painel unificado: filtros avançados, filtros salvos, priorização, colunas personalizáveis e ações em lote. */
'use strict';

(() => {
	const { esc, fmtNum, plural, fmtData, fmtDataHora, param } = HX;
	HX.iniciar('painel.html');

	const pref = HX.preferencias();
	const $ = (id) => document.getElementById(id);
	const normalizar = (texto) => String(texto ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

	// ---------- colunas disponíveis ----------

	const ORDEM_PRAZO = { VENCIDO: 0, VENCE_HOJE: 1, CRITICO: 2, ATENCAO: 3, NO_PRAZO: 4, CUMPRIDO_COM_ATRASO: 5, CUMPRIDO: 6 };
	const COLUNAS = {
		etiqueta: { rotulo: 'Expediente', html: (e) => `<strong>${HX.linkExp(e)}</strong><br>${HX.seloGerenciador(e.gerenciador)} ${HX.flags(e)}`, valor: (e) => e.etiqueta },
		numeroReferencia: { rotulo: 'Número/referência', html: (e) => esc(e.numeroReferencia), valor: (e) => e.numeroReferencia },
		caixa: { rotulo: 'Caixa', html: (e) => esc(HX.rotulo('CAIXA', e.caixa)), valor: (e) => HX.rotulo('CAIXA', e.caixa) },
		situacao: { rotulo: 'Situação', html: (e) => esc(HX.rotulo('SITUACAO', e.situacao)), valor: (e) => HX.rotulo('SITUACAO', e.situacao) },
		acaoPendente: { rotulo: 'Ação pendente', html: (e) => esc(e.acaoPendente), valor: (e) => e.acaoPendente },
		classe: { rotulo: 'Classe', html: (e) => esc(e.descricaoClasse), valor: (e) => e.descricaoClasse },
		tema: { rotulo: 'Tema', html: (e) => esc(e.tema), valor: (e) => e.tema },
		assunto: { rotulo: 'Assunto', html: (e) => HX.assuntoVisivel(e), valor: (e) => (HX.podeVerConteudo(e) ? e.assunto : 'Sigiloso') },
		resumo: { rotulo: 'Resumo', html: (e) => (HX.podeVerConteudo(e) ? esc(e.resumo) : '<span class="texto-suave">Conteúdo sigiloso</span>'), valor: (e) => (HX.podeVerConteudo(e) ? e.resumo : 'Sigiloso') },
		orgaoOrigem: { rotulo: 'Órgão de origem', html: (e) => esc(e.orgaoOrigem), valor: (e) => e.orgaoOrigem },
		setorOrigem: { rotulo: 'Setor de origem', html: (e) => esc(e.setorOrigem), valor: (e) => e.setorOrigem },
		setorDestino: { rotulo: 'Setor de destino', html: (e) => esc(e.setorDestino), valor: (e) => e.setorDestino },
		dataChegada: { rotulo: 'Chegada', html: (e) => `<span class="nowrap">${fmtDataHora(e.dataChegada)}</span>`, valor: (e) => e.dataChegada },
		dataRecebimento: { rotulo: 'Recebimento', html: (e) => `<span class="nowrap">${fmtDataHora(e.dataRecebimento)}</span>`, valor: (e) => e.dataRecebimento },
		dataUltimaMovimentacao: { rotulo: 'Última movimentação', html: (e) => `<span class="nowrap">${fmtDataHora(e.dataUltimaMovimentacao)}</span>`, valor: (e) => e.dataUltimaMovimentacao },
		diasNoSetor: { rotulo: 'Dias no setor', classe: 'num', html: (e) => fmtNum(e.diasNoSetor), valor: (e) => e.diasNoSetor },
		tempoParadoDias: { rotulo: 'Parado (dias)', classe: 'num', html: (e) => fmtNum(e.tempoParadoDias), valor: (e) => e.tempoParadoDias },
		tipoPrazo: { rotulo: 'Tipo de prazo', html: (e) => esc(HX.rotulo('TIPO_PRAZO', e.tipoPrazo)), valor: (e) => e.tipoPrazo },
		dataPrazo: { rotulo: 'Prazo', html: (e) => `<span class="nowrap">${fmtData(e.dataPrazo)}</span>`, valor: (e) => e.dataPrazo },
		diasRestantes: { rotulo: 'Dias restantes', classe: 'num', html: (e) => fmtNum(e.diasRestantes), valor: (e) => e.diasRestantes },
		statusPrazo: { rotulo: 'Situação do prazo', html: (e) => HX.seloPrazo(e), valor: (e) => HX.textoPrazo(e), ordenar: (e) => ORDEM_PRAZO[e.statusPrazo] * 1000 + (e.diasRestantes ?? 0) },
		prioridade: { rotulo: 'Prioridade', html: (e) => `${HX.seloPrioridade(e)} <span class="pequeno texto-suave">${e.pontuacaoPrioridade} pts</span>`, valor: (e) => e.prioridade, ordenar: (e) => e.pontuacaoPrioridade },
		pontuacaoPrioridade: { rotulo: 'Pontuação', classe: 'num', html: (e) => fmtNum(e.pontuacaoPrioridade), valor: (e) => e.pontuacaoPrioridade },
		risco: { rotulo: 'Risco de vencimento', html: (e) => HX.seloRisco(e), valor: (e) => (HX.risco(e) || { valor: '' }).valor, ordenar: (e) => (HX.risco(e) || { valor: -1 }).valor },
		nomeResponsavel: { rotulo: 'Responsável', html: (e) => `${esc(e.nomeResponsavel)}<br><span class="pequeno texto-suave">${e.tipoResponsabilidade === 'DESIGNADO' ? 'designado' : 'titular'}</span>`, valor: (e) => e.nomeResponsavel },
		marcadores: { rotulo: 'Marcadores', html: (e) => `<span class="icones-flag">${e.listaMarcadores.map((m) => HX.seloMarcador(m, e.gerenciador, e.siglaSetor)).join('')}</span>`, valor: (e) => e.listaMarcadores.join(', ') },
		qtdAnotacoes: { rotulo: 'Anotações', classe: 'num', html: (e) => fmtNum(e.qtdAnotacoes), valor: (e) => e.qtdAnotacoes },
		qtdMinutasPendentes: { rotulo: 'Minutas pendentes', classe: 'num', html: (e) => fmtNum(e.qtdMinutasPendentes), valor: (e) => e.qtdMinutasPendentes },
	};
	const AGRUPAMENTOS = { '': 'Sem agrupamento', gerenciador: 'Gerenciador', prioridade: 'Prioridade', statusPrazo: 'Situação do prazo', caixa: 'Caixa', nomeResponsavel: 'Responsável' };
	const rotuloGrupo = (campo, e) => ({
		gerenciador: () => HX.rotulo('GERENCIADOR', e.gerenciador), prioridade: () => `Prioridade ${HX.rotulo('PRIORIDADE', e.prioridade).toLowerCase()}`,
		statusPrazo: () => HX.rotulo('STATUS_PRAZO', e.statusPrazo), caixa: () => HX.rotulo('CAIXA', e.caixa), nomeResponsavel: () => e.nomeResponsavel,
	}[campo] || (() => ''))();
	const ordemGrupo = (campo, e) => ({ prioridade: 100 - e.pontuacaoPrioridade, statusPrazo: ORDEM_PRAZO[e.statusPrazo] }[campo] ?? rotuloGrupo(campo, e));

	// ---------- estado ----------

	const exibicao = {
		colunas: pref.colunasVisiveis.filter((c) => COLUNAS[c]),
		agruparPor: pref.agruparPor in AGRUPAMENTOS ? pref.agruparPor : '',
		itensPorPagina: Number(pref.itensPorPagina) || 25,
	};
	if (!exibicao.colunas.includes('etiqueta')) exibicao.colunas.unshift('etiqueta');

	function estadoVazio() {
		return {
			busca: '', ger: new Set(), prazo: new Set(), prioridade: new Set(), situacao: new Set(), flags: new Set(),
			responsavel: '', tipoResp: '', assunto: '', classe: '', tema: '', marcador: '',
			chegadaDe: '', chegadaAte: '', prazoDe: '', prazoAte: '', parado: '', preset: '',
		};
	}
	let filtros = estadoVazio();
	let caixa = param('caixa') || pref.caixaInicial || 'NO_SETOR';
	let ordenacao = { campo: COLUNAS[pref.ordenacaoCampo] ? pref.ordenacaoCampo : 'prioridade', direcao: pref.ordenacaoDirecao || 'desc' };
	if (pref.ordenacaoCampo === 'pontuacaoPrioridade') ordenacao.campo = 'prioridade';
	let pagina = 1;
	const selecionados = new Set();

	if (param('ger')) filtros.ger.add(param('ger'));
	if (param('prazo')) filtros.prazo.add(param('prazo'));
	if (param('preset')) filtros.preset = param('preset');

	// ---------- opções dos filtros ----------

	const base = HX.doSetor();
	const distintos = (fn) => [...new Set(base.map(fn).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), 'pt-BR'));
	function caixasDeSelecao(alvoId, grupo, itens) {
		$(alvoId).innerHTML = itens.map(([valor, texto]) => `<label for="f-${grupo}-${valor}"><input type="checkbox" id="f-${grupo}-${valor}" data-grupo="${grupo}" value="${esc(valor)}">${texto}</label>`).join('');
	}
	caixasDeSelecao('f-ger', 'ger', HX.gerenciadoresDoSetor().map((g) => [g, HX.seloGerenciador(g)]));
	caixasDeSelecao('f-prazo', 'prazo', ['VENCIDO', 'VENCE_HOJE', 'CRITICO', 'ATENCAO', 'NO_PRAZO'].map((s) => [s, HX.selo('STATUS_PRAZO', s)]));
	caixasDeSelecao('f-prioridade', 'prioridade', ['CRITICA', 'ALTA', 'MEDIA', 'BAIXA'].map((p) => [p, HX.selo('PRIORIDADE', p)]));
	caixasDeSelecao('f-situacao', 'situacao', distintos((e) => e.situacao).map((s) => [s, esc(HX.rotulo('SITUACAO', s))]));
	const FLAGS = { urgente: 'Urgente', novaIntimacao: 'Nova intimação', reuPreso: 'Réu preso', idoso: 'Idoso', novo: 'Novo (24 h)', favorito: 'Favorito', sigiloso: 'Sigiloso', minuta: 'Com minuta pendente', designado: 'Designado' };
	caixasDeSelecao('f-flags', 'flags', Object.entries(FLAGS).map(([k, v]) => [k, esc(v)]));
	const preencherSelect = (id, itens) => { $(id).innerHTML = `<option value="">Todos</option>${itens.map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join('')}`; };
	preencherSelect('f-responsavel', [[HX.usuario.idUsuario, `Eu (${HX.usuario.nome})`], ...HX.usuariosDoSetor.filter((u) => u.idUsuario !== HX.usuario.idUsuario).map((u) => [u.idUsuario, u.nome])]);
	preencherSelect('f-assunto', distintos((e) => e.assunto).map((a) => [a, a]));
	preencherSelect('f-classe', distintos((e) => e.descricaoClasse).map((a) => [a, a]));
	preencherSelect('f-tema', distintos((e) => e.tema).map((a) => [a, a]));
	preencherSelect('f-marcador', [...new Set(HX.marcadoresDoSetor().map((m) => m.descricao))].sort().map((m) => [m, m]));

	const PRESETS = {
		acao: { rotulo: 'Demandam ação', teste: (e) => e.requerAcao },
		urgentes: { rotulo: 'Urgentes', teste: (e) => e.urgente },
		vencendo: { rotulo: 'Vencem hoje ou em até 3 dias', teste: (e) => e.statusPrazo === 'VENCE_HOJE' || e.statusPrazo === 'CRITICO' },
		vencidos: { rotulo: 'Vencidos', teste: (e) => e.statusPrazo === 'VENCIDO' },
		risco: { rotulo: 'Risco alto', teste: (e) => (HX.risco(e) || {}).nivel === 'ALTO' },
		parados: { rotulo: 'Parados há mais de 30 dias', teste: (e) => e.tempoParadoDias > 30 },
		novos: { rotulo: 'Novos', teste: (e) => e.novo },
		minutas: { rotulo: 'Com minuta pendente', teste: (e) => e.qtdMinutasPendentes > 0 },
	};
	$('presets').innerHTML = Object.entries(PRESETS).map(([id, p]) => `<button type="button" class="btn btn-pequeno" data-preset="${id}" aria-pressed="false">${esc(p.rotulo)}</button>`).join('');

	// ---------- filtros salvos ----------

	const chaveFiltros = `filtros:${HX.usuario.idUsuario}`;
	function filtrosSalvos() {
		const daBase = HX.tabela('filtros_salvos').filter((f) => f.siglaSetor === HX.setor.siglaSetor && (f.idUsuario === HX.usuario.idUsuario || f.compartilhadoComSetor))
			.map((f) => ({ ...f, criterios: JSON.parse(f.criterios), origem: f.idUsuario === HX.usuario.idUsuario ? 'Meus' : 'Compartilhados pelo setor' }));
		const locais = HX.ler(chaveFiltros, []).map((f) => ({ ...f, origem: 'Criados nesta sessão' }));
		return [...daBase, ...locais];
	}
	function preencherFiltrosSalvos(selecionado = '') {
		const lista = filtrosSalvos();
		const grupos = [...new Set(lista.map((f) => f.origem))];
		$('filtro-salvo').innerHTML = `<option value="">Nenhum</option>${grupos.map((g) => `<optgroup label="${esc(g)}">${lista.filter((f) => f.origem === g)
			.map((f) => `<option value="${esc(f.idFiltro)}"${f.idFiltro === selecionado ? ' selected' : ''}>${esc(f.nome)}${f.padrao ? ' (padrão)' : ''}${f.origem === 'Compartilhados pelo setor' ? ` · ${esc(HX.nomeUsuario(f.idUsuario))}` : ''}</option>`).join('')}</optgroup>`).join('')}`;
	}
	/** Converte os critérios (mesmo JSON de filtros_salvos.csv) para o estado da tela. */
	function aplicarCriterios(criterios, ordem) {
		filtros = estadoVazio();
		const lista = (v) => (Array.isArray(v) ? v : v ? [v] : []);
		lista(criterios.gerenciador).forEach((g) => filtros.ger.add(g));
		lista(criterios.statusPrazo).forEach((s) => filtros.prazo.add(s));
		lista(criterios.prioridade).forEach((s) => filtros.prioridade.add(s));
		lista(criterios.situacao).forEach((s) => filtros.situacao.add(s));
		lista(criterios.flags).forEach((s) => filtros.flags.add(s));
		['urgente', 'novo', 'novaIntimacao', 'reuPreso', 'idoso', 'favorito', 'sigiloso'].forEach((f) => { if (criterios[f]) filtros.flags.add(f); });
		filtros.assunto = lista(criterios.assunto)[0] || '';
		filtros.classe = criterios.classe || '';
		filtros.tema = criterios.tema || '';
		filtros.marcador = criterios.marcador || '';
		filtros.responsavel = criterios.idResponsavel || '';
		filtros.tipoResp = criterios.tipoResponsabilidade || '';
		filtros.parado = criterios.tempoParadoDiasMin ?? '';
		filtros.busca = criterios.busca || '';
		filtros.chegadaDe = criterios.dataChegadaDe || '';
		filtros.chegadaAte = criterios.dataChegadaAte || '';
		filtros.prazoDe = criterios.dataPrazoDe || '';
		filtros.prazoAte = criterios.dataPrazoAte || '';
		filtros.preset = criterios.preset || '';
		if (ordem) {
			const [campo, direcao] = ordem.split(':');
			ordenacao = { campo: campo === 'pontuacaoPrioridade' ? 'prioridade' : (COLUNAS[campo] ? campo : 'prioridade'), direcao: direcao || 'asc' };
		}
		sincronizarFormulario();
	}
	function criteriosAtuais() {
		const c = {};
		if (filtros.ger.size) c.gerenciador = [...filtros.ger];
		if (filtros.prazo.size) c.statusPrazo = [...filtros.prazo];
		if (filtros.prioridade.size) c.prioridade = [...filtros.prioridade];
		if (filtros.situacao.size) c.situacao = [...filtros.situacao];
		if (filtros.flags.size) c.flags = [...filtros.flags];
		if (filtros.assunto) c.assunto = [filtros.assunto];
		if (filtros.classe) c.classe = filtros.classe;
		if (filtros.tema) c.tema = filtros.tema;
		if (filtros.marcador) c.marcador = filtros.marcador;
		if (filtros.responsavel) c.idResponsavel = filtros.responsavel;
		if (filtros.tipoResp) c.tipoResponsabilidade = filtros.tipoResp;
		if (filtros.parado !== '') c.tempoParadoDiasMin = Number(filtros.parado);
		if (filtros.busca) c.busca = filtros.busca;
		if (filtros.chegadaDe) c.dataChegadaDe = filtros.chegadaDe;
		if (filtros.chegadaAte) c.dataChegadaAte = filtros.chegadaAte;
		if (filtros.prazoDe) c.dataPrazoDe = filtros.prazoDe;
		if (filtros.prazoAte) c.dataPrazoAte = filtros.prazoAte;
		if (filtros.preset) c.preset = filtros.preset;
		return c;
	}

	// ---------- filtragem ----------

	function passaFiltros(e) {
		const f = filtros;
		if (f.ger.size && !f.ger.has(e.gerenciador)) return false;
		if (f.prazo.size && !f.prazo.has(e.statusPrazo)) return false;
		if (f.prioridade.size && !f.prioridade.has(e.prioridade)) return false;
		if (f.situacao.size && !f.situacao.has(e.situacao)) return false;
		for (const flag of f.flags) {
			if (flag === 'minuta' ? !(e.qtdMinutasPendentes > 0) : !e[flag]) return false;
		}
		if (f.responsavel && e.idResponsavel !== f.responsavel) return false;
		if (f.tipoResp && e.tipoResponsabilidade !== f.tipoResp) return false;
		if (f.assunto && e.assunto !== f.assunto) return false;
		if (f.classe && e.descricaoClasse !== f.classe) return false;
		if (f.tema && e.tema !== f.tema) return false;
		if (f.marcador && !e.listaMarcadores.includes(f.marcador)) return false;
		const chegada = (e.dataChegada || '').slice(0, 10);
		if (f.chegadaDe && chegada < f.chegadaDe) return false;
		if (f.chegadaAte && chegada > f.chegadaAte) return false;
		if (f.prazoDe && (!e.dataPrazo || e.dataPrazo < f.prazoDe)) return false;
		if (f.prazoAte && (!e.dataPrazo || e.dataPrazo > f.prazoAte)) return false;
		if (f.parado !== '' && !(e.tempoParadoDias > Number(f.parado))) return false;
		if (f.preset && PRESETS[f.preset] && !PRESETS[f.preset].teste(e)) return false;
		if (f.busca) {
			const termos = normalizar(f.busca).split(/\s+/).filter(Boolean);
			const alvo = normalizar([e.etiqueta, e.numeroReferencia, e.orgaoOrigem, e.nomeResponsavel, e.setorOrigem, e.setorDestino, e.descricaoClasse,
				e.marcadores, HX.podeVerConteudo(e) ? `${e.assunto} ${e.resumo} ${e.tema}` : ''].join(' '));
			if (!termos.every((t) => alvo.includes(t))) return false;
		}
		return true;
	}
	function listaDaCaixa(c) {
		const lista = c === 'BAIXADO' ? HX.doSetor().filter((e) => e.caixa === 'BAIXADO') : HX.ativos();
		return c === 'ATIVOS' || c === 'BAIXADO' ? lista : lista.filter((e) => e.caixa === c);
	}
	function comparar(a, b) {
		const coluna = COLUNAS[ordenacao.campo];
		const valor = coluna.ordenar || coluna.valor;
		const va = valor(a);
		const vb = valor(b);
		let r;
		if (va === vb) r = 0;
		else if (va === null || va === undefined || va === '') r = 1;
		else if (vb === null || vb === undefined || vb === '') r = -1;
		else r = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'pt-BR');
		if (ordenacao.direcao === 'desc' && va !== null && vb !== null && va !== '' && vb !== '') r = -r;
		return r || HX.ordemFila(a, b);
	}

	// ---------- renderização ----------

	const CAIXAS = [['A_RECEBER', 'A receber'], ['NO_SETOR', 'No setor'], ['ENVIADO_NAO_RECEBIDO', 'Enviados não recebidos'], ['ATIVOS', 'Todos ativos'], ['BAIXADO', 'Baixados (histórico)']];
	let resultadoAtual = [];

	function renderizarCaixas() {
		$('caixas').innerHTML = CAIXAS.map(([id, texto]) => `<button type="button" class="btn btn-pequeno" data-caixa="${id}" aria-pressed="${caixa === id}">${esc(texto)} <span class="selo selo-contorno">${fmtNum(listaDaCaixa(id).filter(passaFiltros).length)}</span></button>`).join('');
	}

	function contarFiltrosAtivos() {
		const c = criteriosAtuais();
		delete c.busca;
		delete c.preset;
		return Object.keys(c).length;
	}

	function renderizar({ anunciar = true } = {}) {
		resultadoAtual = listaDaCaixa(caixa).filter(passaFiltros);
		if (exibicao.agruparPor) {
			const campo = exibicao.agruparPor;
			resultadoAtual.sort((a, b) => {
				const ga = ordemGrupo(campo, a);
				const gb = ordemGrupo(campo, b);
				return ga === gb ? comparar(a, b) : (ga < gb ? -1 : 1);
			});
		} else {
			resultadoAtual.sort(comparar);
		}
		const totalPaginas = Math.max(1, Math.ceil(resultadoAtual.length / exibicao.itensPorPagina));
		pagina = Math.min(pagina, totalPaginas);
		const inicio = (pagina - 1) * exibicao.itensPorPagina;
		const itensPagina = resultadoAtual.slice(inicio, inicio + exibicao.itensPorPagina);

		renderizarCaixas();
		document.querySelectorAll('[data-preset]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.preset === filtros.preset)));
		const qtdFiltros = contarFiltrosAtivos();
		$('qtd-filtros').textContent = qtdFiltros ? `(${plural(qtdFiltros, 'critério ativo', 'critérios ativos')})` : '';
		const rotuloCaixa = CAIXAS.find(([id]) => id === caixa)?.[1] || caixa;
		if (anunciar) {
			$('resumo').textContent = `${plural(resultadoAtual.length, 'expediente encontrado', 'expedientes encontrados')} em "${rotuloCaixa}"`
				+ `${filtros.preset ? ` · priorização: ${PRESETS[filtros.preset].rotulo.toLowerCase()}` : ''}. Página ${pagina} de ${totalPaginas}.`;
		}

		const cols = exibicao.colunas.map((id) => ({ id, ...COLUNAS[id] }));
		const idsPagina = itensPagina.map((e) => e.idExpediente);
		const todosMarcados = idsPagina.length > 0 && idsPagina.every((id) => selecionados.has(id));
		const cabecalho = `<th id="col-sel" scope="col"><input type="checkbox" id="sel-todos"${todosMarcados ? ' checked' : ''}><label for="sel-todos" class="sr-only">Selecionar todos da página</label></th>
			${cols.map((c) => {
				const ativo = ordenacao.campo === c.id;
				const aria = ativo ? (ordenacao.direcao === 'asc' ? 'ascending' : 'descending') : 'none';
				const seta = ativo ? (ordenacao.direcao === 'asc' ? '▲' : '▼') : '';
				return `<th id="col-${c.id}" scope="col" aria-sort="${aria}" class="${c.classe || ''}"><button type="button" class="ordenavel" data-ordenar="${c.id}">${esc(c.rotulo)}<span aria-hidden="true">${seta}</span><span class="sr-only">, ordenar</span></button></th>`;
			}).join('')}
			<th id="col-fav" scope="col"><span class="sr-only">Favorito</span></th>`;

		let grupoAtual = null;
		let indiceGrupo = 0;
		const linhas = itensPagina.map((e) => {
			let prefixo = '';
			let headersGrupo = '';
			if (exibicao.agruparPor) {
				const g = rotuloGrupo(exibicao.agruparPor, e);
				if (g !== grupoAtual) {
					grupoAtual = g;
					indiceGrupo += 1;
					const total = resultadoAtual.filter((x) => rotuloGrupo(exibicao.agruparPor, x) === g).length;
					prefixo = `<tr role="row" class="linha-grupo"><th id="grp-${indiceGrupo}" colspan="${cols.length + 2}" scope="colgroup">${esc(g)} <span class="texto-suave">(${fmtNum(total)})</span></th></tr>`;
				}
				headersGrupo = ` grp-${indiceGrupo}`;
			}
			const cor = HX.cat('STATUS_PRAZO', e.statusPrazo).cor;
			const marcado = selecionados.has(e.idExpediente);
			const idSel = `sel-${e.idExpediente}`;
			return `${prefixo}<tr role="row"${marcado ? ' class="selecionada"' : ''}>
				<td role="cell" headers="col-sel${headersGrupo}" class="faixa-prazo" style="--cor:${cor}"><input type="checkbox" id="${idSel}" data-sel="${e.idExpediente}"${marcado ? ' checked' : ''}><label for="${idSel}" class="sr-only">Selecionar ${esc(e.etiqueta)}</label></td>
				${cols.map((c) => `<td role="cell" headers="col-${c.id}${headersGrupo}" class="${c.classe || ''}">${c.html(e)}</td>`).join('')}
				<td role="cell" headers="col-fav${headersGrupo}"><button type="button" class="btn-icone" data-fav="${e.idExpediente}" aria-pressed="${!!e.favorito}"
					title="${e.favorito ? 'Remover dos favoritos' : 'Favoritar'} ${esc(e.etiqueta)}" aria-label="${e.favorito ? 'Remover dos favoritos' : 'Favoritar'} ${esc(e.etiqueta)}"><span aria-hidden="true">${e.favorito ? '★' : '☆'}</span></button></td></tr>`;
		}).join('') || `<tr role="row"><td role="cell" headers="col-sel" colspan="${cols.length + 2}" class="vazio">Nenhum expediente com esses critérios.</td></tr>`;

		$('tabela').innerHTML = `<div class="tabela-rolagem"><table><caption class="sr-only">Expedientes: ${fmtNum(resultadoAtual.length)} itens, página ${pagina} de ${totalPaginas}. Cabeçalhos das colunas ordenam a lista.</caption>
			<thead><tr role="row">${cabecalho}</tr></thead><tbody>${linhas}</tbody></table></div>`;

		$('paginacao').innerHTML = totalPaginas > 1 ? `
			<button type="button" class="btn btn-pequeno" data-pagina="${pagina - 1}"${pagina === 1 ? ' disabled' : ''}>Anterior</button>
			<span class="pequeno">Página ${pagina} de ${totalPaginas}</span>
			<button type="button" class="btn btn-pequeno" data-pagina="${pagina + 1}"${pagina === totalPaginas ? ' disabled' : ''}>Próxima</button>` : '';
		renderizarBarraLote();
	}

	function renderizarBarraLote() {
		// descarta seleção de itens que saíram do resultado (ex.: após arquivar)
		const visiveis = new Set(resultadoAtual.map((e) => e.idExpediente));
		[...selecionados].forEach((id) => { if (!visiveis.has(id)) selecionados.delete(id); });
		$('barra-lote').hidden = selecionados.size === 0;
		$('qtd-selecionados').textContent = plural(selecionados.size, 'selecionado', 'selecionados');
	}
	$('acoes-lote').innerHTML = Object.entries(HX.ACOES).map(([id, a]) => `<button type="button" class="btn btn-pequeno" data-acao="${id}">${esc(a.rotulo)}${['DESIGNAR', 'INCLUIR_MARCADOR', 'MOVIMENTAR'].includes(id) ? '…' : ''}</button>`).join('');

	// ---------- sincronização formulário ↔ estado ----------

	function sincronizarFormulario() {
		$('busca').value = filtros.busca;
		document.querySelectorAll('[data-grupo]').forEach((cb) => { cb.checked = filtros[cb.dataset.grupo].has(cb.value); });
		$('f-responsavel').value = filtros.responsavel;
		$('f-tipo-resp').value = filtros.tipoResp;
		$('f-assunto').value = filtros.assunto;
		$('f-classe').value = filtros.classe;
		$('f-tema').value = filtros.tema;
		$('f-marcador').value = filtros.marcador;
		$('f-chegada-de').value = filtros.chegadaDe;
		$('f-chegada-ate').value = filtros.chegadaAte;
		$('f-prazo-de').value = filtros.prazoDe;
		$('f-prazo-ate').value = filtros.prazoAte;
		$('f-parado').value = filtros.parado;
		if (contarFiltrosAtivos()) $('filtros-avancados').open = true;
	}
	const CAMPOS = { 'f-responsavel': 'responsavel', 'f-tipo-resp': 'tipoResp', 'f-assunto': 'assunto', 'f-classe': 'classe', 'f-tema': 'tema', 'f-marcador': 'marcador', 'f-chegada-de': 'chegadaDe', 'f-chegada-ate': 'chegadaAte', 'f-prazo-de': 'prazoDe', 'f-prazo-ate': 'prazoAte', 'f-parado': 'parado' };
	$('filtros-avancados').addEventListener('change', (ev) => {
		const alvo = ev.target;
		if (alvo.dataset.grupo) {
			const conjunto = filtros[alvo.dataset.grupo];
			if (alvo.checked) conjunto.add(alvo.value); else conjunto.delete(alvo.value);
		} else if (CAMPOS[alvo.id]) {
			filtros[CAMPOS[alvo.id]] = alvo.value;
		}
		pagina = 1;
		renderizar();
	});
	let tempoBusca;
	$('busca').addEventListener('input', (ev) => {
		clearTimeout(tempoBusca);
		tempoBusca = setTimeout(() => { filtros.busca = ev.target.value.trim(); pagina = 1; renderizar(); }, 250);
	});
	$('caixas').addEventListener('click', (ev) => {
		const b = ev.target.closest('[data-caixa]');
		if (!b) return;
		caixa = b.dataset.caixa;
		pagina = 1;
		selecionados.clear();
		renderizar();
		$('caixas').querySelector(`[data-caixa="${caixa}"]`).focus();
	});
	$('presets').addEventListener('click', (ev) => {
		const b = ev.target.closest('[data-preset]');
		if (!b) return;
		filtros.preset = filtros.preset === b.dataset.preset ? '' : b.dataset.preset;
		if (filtros.preset === 'risco' || filtros.preset === 'vencendo' || filtros.preset === 'vencidos') ordenacao = { campo: filtros.preset === 'risco' ? 'risco' : 'statusPrazo', direcao: filtros.preset === 'risco' ? 'desc' : 'asc' };
		if (filtros.preset === 'risco' && !exibicao.colunas.includes('risco')) exibicao.colunas.push('risco');
		pagina = 1;
		renderizar();
	});
	$('btn-limpar').addEventListener('click', () => {
		filtros = estadoVazio();
		$('filtro-salvo').value = '';
		sincronizarFormulario();
		pagina = 1;
		renderizar();
		HX.avisar('Filtros limpos.');
	});
	$('filtro-salvo').addEventListener('change', (ev) => {
		const f = filtrosSalvos().find((x) => x.idFiltro === ev.target.value);
		if (!f) return;
		if (caixa !== 'ATIVOS' && caixa !== 'BAIXADO') caixa = 'ATIVOS';
		aplicarCriterios(f.criterios, f.ordenacao);
		pagina = 1;
		renderizar();
	});
	$('tabela').addEventListener('click', (ev) => {
		const ordenar = ev.target.closest('[data-ordenar]');
		if (ordenar) {
			const campo = ordenar.dataset.ordenar;
			ordenacao = { campo, direcao: ordenacao.campo === campo && ordenacao.direcao === 'asc' ? 'desc' : 'asc' };
			renderizar();
			$('tabela').querySelector(`[data-ordenar="${campo}"]`).focus();
			return;
		}
		const fav = ev.target.closest('[data-fav]');
		if (fav) {
			const id = fav.dataset.fav;
			const agora = HX.alternarFavorito(id);
			renderizar({ anunciar: false });
			$('tabela').querySelector(`[data-fav="${id}"]`)?.focus();
			HX.avisar(agora ? `${HX.expediente(id).etiqueta} favoritado.` : `${HX.expediente(id).etiqueta} removido dos favoritos.`);
		}
	});
	$('tabela').addEventListener('change', (ev) => {
		if (ev.target.id === 'sel-todos') {
			const ids = resultadoAtual.slice((pagina - 1) * exibicao.itensPorPagina, pagina * exibicao.itensPorPagina).map((e) => e.idExpediente);
			ids.forEach((id) => (ev.target.checked ? selecionados.add(id) : selecionados.delete(id)));
			renderizar({ anunciar: false });
			$('sel-todos').focus();
		} else if (ev.target.dataset.sel) {
			const id = ev.target.dataset.sel;
			if (ev.target.checked) selecionados.add(id); else selecionados.delete(id);
			ev.target.closest('tr').classList.toggle('selecionada', ev.target.checked);
			renderizarBarraLote();
		}
	});
	$('paginacao').addEventListener('click', (ev) => {
		const b = ev.target.closest('[data-pagina]');
		if (!b || b.disabled) return;
		pagina = Number(b.dataset.pagina);
		renderizar();
		$('conteudo').querySelector('#tabela table').scrollIntoView({ block: 'start' });
		$('paginacao').querySelector(`[data-pagina]:not([disabled])`)?.focus();
	});
	$('acoes-lote').addEventListener('click', (ev) => {
		const b = ev.target.closest('[data-acao]');
		if (!b) return;
		HX.iniciarAcaoLote(b.dataset.acao, [...selecionados], () => { selecionados.clear(); renderizar(); $('conteudo').focus(); }, b);
	});
	$('btn-limpar-selecao').addEventListener('click', () => {
		selecionados.clear();
		renderizar({ anunciar: false });
		$('busca').focus();
	});

	// ---------- salvar filtro ----------

	$('btn-salvar-filtro').addEventListener('click', () => {
		const criterios = criteriosAtuais();
		const dialogo = HX.abrirDialogo({
			titulo: 'Salvar filtro',
			corpo: `<div class="campo"><label for="nome-filtro">Nome do filtro <span style="color:var(--perigo)" aria-hidden="true">*</span></label>
				<input type="text" id="nome-filtro" aria-required="true" maxlength="60">
				<span id="nome-filtro-erro" role="alert" class="pequeno" style="color:var(--perigo)"></span></div>
				<p><input type="checkbox" id="compartilhar-filtro"> <label for="compartilhar-filtro">Compartilhar com o setor</label></p>
				<p><input type="checkbox" id="padrao-filtro"> <label for="padrao-filtro">Usar como padrão ao abrir o painel</label></p>
				<p class="pequeno">Critérios gravados (mesmo formato da coluna <code>criterios</code> de filtros_salvos.csv):</p>
				<pre class="pequeno" style="white-space:pre-wrap;background:var(--superficie-2);padding:.5rem;border-radius:6px">${esc(JSON.stringify(criterios, null, 1))}</pre>
				<p class="pequeno">Ordenação: <code>${esc(ordenacao.campo)}:${esc(ordenacao.direcao)}</code></p>`,
			botoes: [{
				rotulo: 'Salvar', classe: 'btn-primario',
				acao: (dlg) => {
					const nome = dlg.querySelector('#nome-filtro').value.trim();
					if (!nome) {
						const campo = dlg.querySelector('#nome-filtro');
						campo.setAttribute('aria-invalid', 'true');
						campo.setAttribute('aria-describedby', 'nome-filtro-erro');
						dlg.querySelector('#nome-filtro-erro').textContent = 'Informe um nome.';
						campo.focus();
						return false;
					}
					const novo = {
						idFiltro: `LOCAL-${Date.now().toString(36).toUpperCase()}`, idUsuario: HX.usuario.idUsuario, siglaSetor: HX.setor.siglaSetor,
						nome, criterios, ordenacao: `${ordenacao.campo}:${ordenacao.direcao}`, padrao: dlg.querySelector('#padrao-filtro').checked,
						compartilhadoComSetor: dlg.querySelector('#compartilhar-filtro').checked, dataCriacao: HX.agoraIso(),
					};
					const locais = HX.ler(chaveFiltros, []).map((f) => (novo.padrao ? { ...f, padrao: false } : f));
					HX.gravar(chaveFiltros, [...locais, novo]);
					if (novo.padrao) HX.gravar(`filtroPadrao:${HX.usuario.idUsuario}`, novo.idFiltro);
					preencherFiltrosSalvos(novo.idFiltro);
					HX.avisar(`Filtro "${nome}" salvo.`);
					return true;
				},
			}],
		});
		dialogo.querySelector('#nome-filtro').focus();
	});

	// ---------- colunas e exibição ----------

	$('btn-colunas').addEventListener('click', () => {
		const rascunho = [...exibicao.colunas, ...Object.keys(COLUNAS).filter((c) => !exibicao.colunas.includes(c))]
			.map((id) => ({ id, visivel: exibicao.colunas.includes(id) }));
		const atual = HX.preferencias();
		const listaColunas = () => `<ul class="ordem-widgets">${rascunho.map((c, i) => `<li>
			<input type="checkbox" id="col-cfg-${c.id}" data-col="${c.id}"${c.visivel ? ' checked' : ''}${c.id === 'etiqueta' ? ' disabled' : ''}>
			<label for="col-cfg-${c.id}">${esc(COLUNAS[c.id].rotulo)}${c.id === 'etiqueta' ? ' (obrigatória)' : ''}</label>
			<button type="button" class="btn btn-pequeno" data-mover="-1" data-indice="${i}" title="Mover ${esc(COLUNAS[c.id].rotulo)} para cima" aria-label="Mover ${esc(COLUNAS[c.id].rotulo)} para cima"${i === 0 ? ' disabled' : ''}><span aria-hidden="true">↑</span></button>
			<button type="button" class="btn btn-pequeno" data-mover="1" data-indice="${i}" title="Mover ${esc(COLUNAS[c.id].rotulo)} para baixo" aria-label="Mover ${esc(COLUNAS[c.id].rotulo)} para baixo"${i === rascunho.length - 1 ? ' disabled' : ''}><span aria-hidden="true">↓</span></button></li>`).join('')}</ul>`;
		const opcoes = (lista, valor) => lista.map(([v, t]) => `<option value="${esc(v)}"${String(v) === String(valor) ? ' selected' : ''}>${esc(t)}</option>`).join('');
		const dialogo = HX.abrirDialogo({
			titulo: 'Colunas e exibição',
			corpo: `<p class="pequeno">Padrão vindo de <code>preferencias_usuario.csv</code> (contexto PAINEL_UNIFICADO). As mudanças ficam salvas neste navegador.</p>
				<div class="grade grade-3">
					<div class="campo"><label for="cfg-agrupar">Agrupar por</label><select id="cfg-agrupar">${opcoes(Object.entries(AGRUPAMENTOS), exibicao.agruparPor)}</select></div>
					<div class="campo"><label for="cfg-itens">Itens por página</label><select id="cfg-itens">${opcoes([[10, '10'], [25, '25'], [50, '50'], [100, '100']], exibicao.itensPorPagina)}</select></div>
					<div class="campo"><label for="cfg-densidade">Densidade</label><select id="cfg-densidade">${opcoes([['CONFORTAVEL', 'Confortável'], ['COMPACTA', 'Compacta']], atual.densidade)}</select></div>
					<div class="campo"><label for="cfg-ordem">Ordenar por</label><select id="cfg-ordem">${opcoes(Object.entries(COLUNAS).map(([id, c]) => [id, c.rotulo]), ordenacao.campo)}</select></div>
					<div class="campo"><label for="cfg-direcao">Direção</label><select id="cfg-direcao">${opcoes([['asc', 'Crescente'], ['desc', 'Decrescente']], ordenacao.direcao)}</select></div>
					<div class="campo"><label for="cfg-caixa">Caixa inicial</label><select id="cfg-caixa">${opcoes(CAIXAS.filter(([id]) => id !== 'BAIXADO'), atual.caixaInicial)}</select></div>
				</div>
				<h5 style="margin:1rem 0 .25rem;font-size:1rem">Colunas visíveis e ordem</h5><div id="cfg-colunas">${listaColunas()}</div>`,
			botoes: [
				{ rotulo: 'Restaurar padrão', acao: () => { HX.restaurarPreferencias(); location.reload(); } },
				{
					rotulo: 'Aplicar e salvar', classe: 'btn-primario',
					acao: (dlg) => {
						exibicao.colunas = rascunho.filter((c) => c.visivel || c.id === 'etiqueta').map((c) => c.id);
						exibicao.agruparPor = dlg.querySelector('#cfg-agrupar').value;
						exibicao.itensPorPagina = Number(dlg.querySelector('#cfg-itens').value);
						ordenacao = { campo: dlg.querySelector('#cfg-ordem').value, direcao: dlg.querySelector('#cfg-direcao').value };
						HX.salvarPreferencias({
							colunasVisiveis: exibicao.colunas, agruparPor: exibicao.agruparPor, itensPorPagina: exibicao.itensPorPagina,
							ordenacaoCampo: ordenacao.campo, ordenacaoDirecao: ordenacao.direcao,
							densidade: dlg.querySelector('#cfg-densidade').value, caixaInicial: dlg.querySelector('#cfg-caixa').value,
						});
						HX.aplicarTema();
						pagina = 1;
						renderizar();
						HX.avisar('Preferências de exibição salvas.');
					},
				},
			],
		});
		const container = dialogo.querySelector('#cfg-colunas');
		container.addEventListener('change', (ev) => {
			const item = rascunho.find((c) => c.id === ev.target.dataset.col);
			if (item) item.visivel = ev.target.checked;
		});
		container.addEventListener('click', (ev) => {
			const b = ev.target.closest('[data-mover]');
			if (!b) return;
			const i = Number(b.dataset.indice);
			const j = i + Number(b.dataset.mover);
			[rascunho[i], rascunho[j]] = [rascunho[j], rascunho[i]];
			container.innerHTML = listaColunas();
			(container.querySelector(`[data-indice="${j}"][data-mover="${b.dataset.mover}"]:not([disabled])`)
				|| container.querySelector(`[data-indice="${j}"][data-mover]:not([disabled])`))?.focus();
		});
	});

	// ---------- exportar ----------

	$('btn-exportar').addEventListener('click', () => {
		const cols = [{ rotulo: 'Gerenciador', valor: (e) => HX.rotulo('GERENCIADOR', e.gerenciador) },
			...exibicao.colunas.map((id) => ({ rotulo: COLUNAS[id].rotulo, valor: COLUNAS[id].valor }))];
		HX.baixar(`expedientes-${HX.setor.siglaSetor.replace(/\W+/g, '-')}-${HX.HOJE}.csv`, `\uFEFF${HX.csvDe(cols, resultadoAtual)}`, 'text/csv;charset=utf-8');
		HX.avisar(`${plural(resultadoAtual.length, 'linha exportada', 'linhas exportadas')}.`);
	});

	// ---------- início ----------

	const idFiltroUrl = param('filtro');
	const idPadrao = HX.ler(`filtroPadrao:${HX.usuario.idUsuario}`, null)
		|| (filtrosSalvos().find((f) => f.padrao && f.idUsuario === HX.usuario.idUsuario) || {}).idFiltro;
	const filtroInicial = filtrosSalvos().find((f) => f.idFiltro === (idFiltroUrl || (!location.search ? idPadrao : null)));
	preencherFiltrosSalvos(filtroInicial ? filtroInicial.idFiltro : '');
	if (filtroInicial) {
		if (caixa !== 'BAIXADO') caixa = 'ATIVOS';
		aplicarCriterios(filtroInicial.criterios, filtroInicial.ordenacao);
		HX.avisar(`Filtro "${filtroInicial.nome}" aplicado${idFiltroUrl ? '' : ' (seu padrão)'}.`);
	} else {
		sincronizarFormulario();
	}
	renderizar();
})();
