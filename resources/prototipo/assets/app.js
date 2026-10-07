/*
 * Núcleo do protótipo: acesso aos dados sintéticos (window.DADOS), contexto do
 * usuário simulado, preferências, ações em lote com desfazer e utilitários de UI.
 * Tudo roda no navegador; alterações ficam no localStorage (prefixo "hx:").
 */
'use strict';

const HX = (() => {
	const D = window.DADOS;
	if (!D) {
		document.addEventListener('DOMContentLoaded', () => {
			document.body.innerHTML = '<main id="conteudo"><div class="cartao" role="alert"><h1>Dados não encontrados</h1>'
				+ '<p>Gere o arquivo <code>dados/dados.js</code> com <code>python3 gerar_dados_js.py</code> na pasta '
				+ '<code>prototipo/</code> e recarregue a página.</p></div></main>';
		});
		throw new Error('window.DADOS ausente: rode gerar_dados_js.py');
	}

	// ---------- armazenamento local ----------

	const PREFIXO = 'hx:';
	function ler(chave, padrao) {
		try {
			const valor = localStorage.getItem(PREFIXO + chave);
			return valor === null ? padrao : JSON.parse(valor);
		} catch {
			return padrao;
		}
	}
	function gravar(chave, valor) {
		try {
			localStorage.setItem(PREFIXO + chave, JSON.stringify(valor));
		} catch {
			/* armazenamento indisponível: segue só em memória */
		}
	}
	function limparTudo() {
		Object.keys(localStorage).filter((chave) => chave.startsWith(PREFIXO)).forEach((chave) => localStorage.removeItem(chave));
	}

	// ---------- tabelas ----------

	const cacheTabelas = {};
	function tabela(nome) {
		if (!cacheTabelas[nome]) {
			const bruta = D.tabelas[nome];
			if (!bruta) throw new Error(`Tabela ${nome} não existe em dados.js`);
			cacheTabelas[nome] = bruta.l.map((linha) => Object.fromEntries(bruta.c.map((coluna, i) => [coluna, linha[i]])));
		}
		return cacheTabelas[nome];
	}
	const indices = {};
	function agruparPor(nome, campo) {
		const chave = `${nome}.${campo}`;
		if (!indices[chave]) {
			const mapa = new Map();
			for (const linha of tabela(nome)) {
				const valor = linha[campo];
				if (!mapa.has(valor)) mapa.set(valor, []);
				mapa.get(valor).push(linha);
			}
			indices[chave] = mapa;
		}
		return indices[chave];
	}

	// ---------- datas (todas as datas da base estão em -03:00) ----------

	const DATA_REFERENCIA = D.meta.dataReferencia;
	const HOJE = DATA_REFERENCIA.slice(0, 10);
	const pad = (n) => String(n).padStart(2, '0');
	function paraUtc(dataIso) {
		const [a, m, d] = dataIso.slice(0, 10).split('-').map(Number);
		return Date.UTC(a, m - 1, d);
	}
	function diffDias(de, ate) {
		return Math.round((paraUtc(ate) - paraUtc(de)) / 86400000);
	}
	function somarDias(dataIso, dias) {
		const data = new Date(paraUtc(dataIso) + dias * 86400000);
		return `${data.getUTCFullYear()}-${pad(data.getUTCMonth() + 1)}-${pad(data.getUTCDate())}`;
	}
	function fmtData(valor) {
		if (!valor) return '—';
		return `${valor.slice(8, 10)}/${valor.slice(5, 7)}/${valor.slice(0, 4)}`;
	}
	function fmtDataHora(valor) {
		if (!valor) return '—';
		return valor.length > 10 ? `${fmtData(valor)} ${valor.slice(11, 16)}` : fmtData(valor);
	}
	/** "Agora" do protótipo: data de referência com a hora atual do relógio. */
	function agoraIso() {
		const d = new Date();
		return `${HOJE}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}-03:00`;
	}
	const DIAS_SEMANA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
	const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
	function diaSemana(dataIso) {
		return DIAS_SEMANA[new Date(paraUtc(dataIso)).getUTCDay()];
	}

	// ---------- texto e HTML ----------

	function esc(valor) {
		return String(valor ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
	}
	function fmtNum(valor) {
		return Number(valor || 0).toLocaleString('pt-BR');
	}
	function plural(qtd, singular, pluralTexto) {
		return `${fmtNum(qtd)} ${qtd === 1 ? singular : (pluralTexto || `${singular}s`)}`;
	}
	function param(nome) {
		return new URLSearchParams(location.search).get(nome);
	}
	function baixar(nomeArquivo, conteudo, tipo) {
		const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
		const link = Object.assign(document.createElement('a'), { href: url, download: nomeArquivo });
		document.body.appendChild(link);
		link.click();
		link.remove();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	}
	function csvDe(colunas, linhas) {
		const celula = (v) => {
			const texto = String(v ?? '');
			return /[",;\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
		};
		return [colunas.map((c) => celula(c.rotulo)).join(';'), ...linhas.map((l) => colunas.map((c) => celula(c.valor(l))).join(';'))].join('\n');
	}

	// ---------- catálogos e selos ----------

	let mapaCatalogo;
	function cat(dominio, codigo) {
		if (!mapaCatalogo) {
			mapaCatalogo = new Map(tabela('catalogos').map((c) => [`${c.dominio}|${c.codigo}`, c]));
		}
		return mapaCatalogo.get(`${dominio}|${codigo}`) || { descricao: codigo ?? '—', cor: '#607D8B' };
	}
	const rotulo = (dominio, codigo) => cat(dominio, codigo).descricao;
	function luminancia(hex) {
		const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
			.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
		return 0.2126 * r + 0.7152 * g + 0.0722 * b;
	}
	/** Preto ou branco, o que tiver maior contraste com a cor de fundo. */
	function corTexto(hex) {
		const l = luminancia(hex);
		return (l + 0.05) / 0.05 > 1.05 / (l + 0.05) ? '#000000' : '#FFFFFF';
	}
	function seloCor(texto, cor, extra = '') {
		return `<span class="selo" style="background:${cor};color:${corTexto(cor)}"${extra}>${esc(texto)}</span>`;
	}
	function selo(dominio, codigo, texto) {
		const item = cat(dominio, codigo);
		return seloCor(texto || item.descricao, item.cor);
	}
	const seloGerenciador = (g) => selo('GERENCIADOR', g);
	function textoPrazo(e) {
		if (!e.dataPrazo) return 'Sem prazo';
		const d = e.diasRestantes;
		switch (e.statusPrazo) {
			case 'VENCIDO': return `Vencido há ${plural(-d, 'dia')}`;
			case 'VENCE_HOJE': return 'Vence hoje';
			case 'CUMPRIDO': case 'CUMPRIDO_COM_ATRASO': return rotulo('STATUS_PRAZO', e.statusPrazo);
			default: return `Vence em ${plural(d, 'dia')}`;
		}
	}
	const seloPrazo = (e) => selo('STATUS_PRAZO', e.statusPrazo, textoPrazo(e));
	const seloPrioridade = (e) => selo('PRIORIDADE', e.prioridade, `Prioridade ${rotulo('PRIORIDADE', e.prioridade).toLowerCase()}`);
	function flags(e) {
		const itens = [];
		if (e.urgente) itens.push(['Urgente', '#B71C1C']);
		if (e.reuPreso) itens.push(['Réu preso', '#4A148C']);
		if (e.idoso) itens.push(['Idoso', '#4E342E']);
		if (e.novaIntimacao) itens.push(['Nova intimação', '#0D47A1']);
		if (e.novo) itens.push(['Novo', '#1565C0']);
		if (e.sigiloso) itens.push([`Sigilo nível ${e.nivelSigilo}`, '#37474F']);
		if (e.favorito) itens.push(['Favorito', '#8D6E00']);
		return itens.length ? `<span class="icones-flag">${itens.map(([t, c]) => seloCor(t, c)).join('')}</span>` : '';
	}
	let mapaMarcadores;
	function seloMarcador(descricao, gerenciador, sigla) {
		if (!mapaMarcadores) mapaMarcadores = new Map(tabela('marcadores').map((m) => [`${m.siglaSetor}|${m.gerenciador}|${m.descricao}`, m]));
		const m = mapaMarcadores.get(`${sigla}|${gerenciador}|${descricao}`);
		return seloCor(descricao, m ? m.cor : '#90A4AE', ' data-marcador="1"');
	}

	// ---------- contexto (usuário simulado) ----------

	const usuarios = tabela('usuarios');
	const USUARIO_PADRAO = 'GABSUB3-DVT-U02';
	const usuario = usuarios.find((u) => u.idUsuario === ler('usuario')) || usuarios.find((u) => u.idUsuario === USUARIO_PADRAO);
	const setor = tabela('setores').find((s) => s.siglaSetor === usuario.siglaSetor);
	const usuariosDoSetor = usuarios.filter((u) => u.siglaSetor === setor.siglaSetor && u.ativo);
	const nomeUsuario = (id) => (usuarios.find((u) => u.idUsuario === id) || { nome: id }).nome;
	function trocarUsuario(id) {
		gravar('usuario', id);
		location.reload();
	}
	/** Regra ilustrativa: servidor só vê o conteúdo de sigiloso se for o responsável. */
	function podeVerConteudo(e) {
		return !e.sigiloso || usuario.perfil !== 'SERVIDOR' || e.idResponsavel === usuario.idUsuario;
	}

	// ---------- preferências ----------

	const PREF_PADRAO = {
		colunasVisiveis: ['etiqueta', 'caixa', 'situacao', 'acaoPendente', 'assunto', 'dataChegada', 'dataPrazo', 'statusPrazo', 'prioridade', 'nomeResponsavel', 'tempoParadoDias'],
		ordenacaoCampo: 'pontuacaoPrioridade', ordenacaoDirecao: 'desc', itensPorPagina: 25, caixaInicial: 'NO_SETOR',
		agruparPor: '', densidade: 'CONFORTAVEL', tema: 'CLARO', notificarPorEmail: true, antecedenciaAlertaPrazoDias: 3,
	};
	function preferenciasBase() {
		const linha = tabela('preferencias_usuario').find((p) => p.idUsuario === usuario.idUsuario && p.contexto === 'PAINEL_UNIFICADO');
		if (!linha) return { ...PREF_PADRAO };
		return {
			...PREF_PADRAO, ...linha,
			colunasVisiveis: linha.colunasVisiveis.split(';'),
			agruparPor: linha.agruparPor === 'NENHUM' ? '' : (linha.agruparPor || ''),
		};
	}
	function preferencias() {
		return { ...preferenciasBase(), ...ler(`pref:${usuario.idUsuario}`, {}) };
	}
	function salvarPreferencias(parcial) {
		gravar(`pref:${usuario.idUsuario}`, { ...ler(`pref:${usuario.idUsuario}`, {}), ...parcial });
	}
	function restaurarPreferencias() {
		gravar(`pref:${usuario.idUsuario}`, {});
	}
	function aplicarTema() {
		const pref = preferencias();
		const escuro = pref.tema === 'ESCURO' || (pref.tema === 'AUTO' && matchMedia('(prefers-color-scheme: dark)').matches);
		document.documentElement.dataset.tema = escuro ? 'escuro' : 'claro';
		document.documentElement.dataset.densidade = pref.densidade === 'COMPACTA' ? 'compacta' : 'confortavel';
		return escuro;
	}

	// ---------- expedientes (base + alterações locais) ----------

	let cacheExpedientes = null;
	function lotesLocais() {
		return ler('lotes', []);
	}
	function expedientesTodos() {
		if (!cacheExpedientes) {
			const favoritos = ler(`favoritos:${usuario.idUsuario}`, {});
			const copia = tabela('expedientes').map((e) => ({ ...e }));
			const porId = new Map(copia.map((e) => [e.idExpediente, e]));
			for (const lote of lotesLocais()) {
				if (lote.desfeito) continue;
				for (const item of lote.itens) {
					if (item.ok && porId.has(item.id)) Object.assign(porId.get(item.id), item.depois);
				}
			}
			for (const e of copia) {
				if (e.idExpediente in favoritos) e.favorito = favoritos[e.idExpediente];
				e.listaMarcadores = e.marcadores ? e.marcadores.split(';') : [];
			}
			cacheExpedientes = { lista: copia, porId };
		}
		return cacheExpedientes;
	}
	const expediente = (id) => expedientesTodos().porId.get(id);
	/** Expedientes ativos (sem BAIXADO) do setor do usuário. */
	function ativos() {
		return expedientesTodos().lista.filter((e) => e.siglaSetor === setor.siglaSetor && e.caixa !== 'BAIXADO');
	}
	function doSetor() {
		return expedientesTodos().lista.filter((e) => e.siglaSetor === setor.siglaSetor);
	}
	function invalidar() {
		cacheExpedientes = null;
	}
	function alternarFavorito(id) {
		const chave = `favoritos:${usuario.idUsuario}`;
		const favoritos = ler(chave, {});
		const atual = expediente(id).favorito;
		favoritos[id] = !atual;
		gravar(chave, favoritos);
		invalidar();
		return !atual;
	}

	/**
	 * Contadores do setor (mesmas regras do item CONTADOR de contadores.csv), recalculados sobre o estado
	 * atual para refletir as ações em lote locais. designados/favoritos/baixados30dias vêm do item materializado.
	 */
	function contadores(gerenciador = 'TODOS') {
		const lista = ativos().filter((e) => gerenciador === 'TODOS' || e.gerenciador === gerenciador);
		const comAcao = lista.filter((e) => e.requerAcao);
		const conta = (fn, base = comAcao) => base.filter(fn).length;
		const materializado = tabela('contadores').find((c) => c.siglaSetor === setor.siglaSetor && c.gerenciador === gerenciador) || {};
		return {
			...materializado,
			aReceber: conta((e) => e.caixa === 'A_RECEBER', lista), noSetor: conta((e) => e.caixa === 'NO_SETOR', lista),
			enviadosNaoRecebidos: conta((e) => e.caixa === 'ENVIADO_NAO_RECEBIDO', lista),
			vencidos: conta((e) => e.statusPrazo === 'VENCIDO'), venceHoje: conta((e) => e.statusPrazo === 'VENCE_HOJE'),
			criticos: conta((e) => e.statusPrazo === 'CRITICO'), atencao: conta((e) => e.statusPrazo === 'ATENCAO'),
			urgentes: conta((e) => e.urgente), prioridadeCritica: conta((e) => e.prioridade === 'CRITICA'),
			novos24h: conta((e) => e.novo, lista), parados30dias: conta((e) => e.tempoParadoDias > 30),
			minutasPendentes: lista.reduce((soma, e) => soma + (e.qtdMinutasPendentes || 0), 0),
			materializado,
		};
	}
	const gerenciadoresDoSetor = () => setor.gerenciadores.split(';');

	// ---------- priorização e risco ----------

	const STATUS_ABERTOS = ['VENCIDO', 'VENCE_HOJE', 'CRITICO', 'ATENCAO', 'NO_PRAZO'];
	const PONTOS_PRAZO = { VENCIDO: 50, VENCE_HOJE: 45, CRITICO: 35, ATENCAO: 20, NO_PRAZO: 5 };
	/** Decomposição da pontuacaoPrioridade (mesma regra do gerador). */
	function explicarPrioridade(e) {
		const partes = [];
		if (PONTOS_PRAZO[e.statusPrazo]) partes.push([`Prazo: ${rotulo('STATUS_PRAZO', e.statusPrazo).toLowerCase()}`, PONTOS_PRAZO[e.statusPrazo]]);
		if (e.urgente) partes.push([`Urgente (${e.motivoUrgencia})`, 30]);
		if (e.novaIntimacao) partes.push(['Nova intimação', 10]);
		if (e.tempoParadoDias > 30) partes.push([`Parado há ${e.tempoParadoDias} dias`, 10]);
		if (e.situacao === 'AGUARDANDO_ASSINATURA') partes.push(['Aguardando assinatura', 5]);
		return partes;
	}
	/**
	 * Risco de vencimento (0–100): cresce com o tempo parado e com a proximidade do prazo.
	 * risco = min(100, 20 × (tempoParadoDias + 1) / (diasRestantes + 1)). Só para prazos ainda não vencidos.
	 */
	function risco(e) {
		if (!e.requerAcao || !['VENCE_HOJE', 'CRITICO', 'ATENCAO', 'NO_PRAZO'].includes(e.statusPrazo)) return null;
		const valor = Math.min(100, Math.round((20 * (e.tempoParadoDias + 1)) / (Math.max(e.diasRestantes, 0) + 1)));
		return { valor, nivel: valor >= 60 ? 'ALTO' : valor >= 30 ? 'MEDIO' : 'BAIXO' };
	}
	const CORES_RISCO = { ALTO: '#C62828', MEDIO: '#EF6C00', BAIXO: '#2E7D32' };
	function seloRisco(e) {
		const r = risco(e);
		if (!r) return '<span class="texto-suave">—</span>';
		return seloCor(`Risco ${r.nivel === 'MEDIO' ? 'médio' : r.nivel.toLowerCase()} (${r.valor})`, CORES_RISCO[r.nivel]);
	}
	/** Ordem da fila "próximo expediente": igual ao GSI2SK (dataPrazo asc, pontuação desc). */
	function ordemFila(a, b) {
		const pa = a.dataPrazo || '9999';
		const pb = b.dataPrazo || '9999';
		return pa === pb ? b.pontuacaoPrioridade - a.pontuacaoPrioridade : pa < pb ? -1 : 1;
	}

	/** Fila "próximo expediente": itens que demandam ação, do usuário ou do setor, na ordem do GSI2. */
	function fila(escopo = 'meus') {
		return ativos()
			.filter((e) => e.requerAcao && (e.caixa === 'A_RECEBER' || e.caixa === 'NO_SETOR'))
			.filter((e) => escopo === 'setor' || e.idResponsavel === usuario.idUsuario)
			.sort(ordemFila);
	}

	// ---------- ações em lote (pré-visualizar, executar, desfazer) ----------

	let mapaMarcadoresSetor;
	function marcadoresDoSetor() {
		if (!mapaMarcadoresSetor) mapaMarcadoresSetor = tabela('marcadores').filter((m) => m.siglaSetor === setor.siglaSetor);
		return mapaMarcadoresSetor;
	}
	const ACOES = {
		RECEBER: {
			rotulo: 'Receber', movimentacao: 'RECEBIMENTO',
			validar: (e) => (e.caixa === 'A_RECEBER' ? null : 'Só é possível receber itens da caixa "A receber".'),
			aplicar: () => ({ caixa: 'NO_SETOR', situacao: 'EM_ANALISE', acaoPendente: 'Analisar documento', requerAcao: true, novo: false, dataRecebimento: agoraIso(), dataUltimaMovimentacao: agoraIso(), tempoParadoDias: 0 }),
			descrever: () => `Recebido em ${setor.siglaSetor}`,
		},
		DESIGNAR: {
			rotulo: 'Designar', movimentacao: 'DESIGNACAO',
			validar: (e, p) => {
				if (e.caixa !== 'NO_SETOR') return 'Designação só para itens na caixa "No setor".';
				if (e.idResponsavel === p.idUsuario && e.tipoResponsabilidade === 'DESIGNADO') return `Já está designado a ${p.nome}.`;
				return null;
			},
			aplicar: (e, p) => ({ idResponsavel: p.idUsuario, nomeResponsavel: p.nome, tipoResponsabilidade: 'DESIGNADO', designado: true, dataUltimaMovimentacao: agoraIso() }),
			descrever: (e, p) => `Designado a ${p.nome}`,
		},
		INCLUIR_MARCADOR: {
			rotulo: 'Incluir marcador', movimentacao: 'MARCADOR_INCLUIDO',
			validar: (e, p) => {
				if (e.caixa === 'ENVIADO_NAO_RECEBIDO') return 'Item já enviado a outro setor.';
				if (!marcadoresDoSetor().some((m) => m.gerenciador === e.gerenciador && m.descricao === p.marcador)) return `Marcador "${p.marcador}" não existe no gerenciador ${rotulo('GERENCIADOR', e.gerenciador)}.`;
				if (e.listaMarcadores.includes(p.marcador)) return 'Já possui este marcador.';
				return null;
			},
			aplicar: (e, p) => ({ marcadores: [...e.listaMarcadores, p.marcador].join(';'), qtdMarcadores: e.qtdMarcadores + 1 }),
			descrever: (e, p) => `Marcador "${p.marcador}" incluído`,
		},
		DAR_CIENCIA: {
			rotulo: 'Dar ciência', movimentacao: 'RECEBIMENTO',
			validar: (e) => (e.novaIntimacao || e.situacao === 'AGUARDANDO_CIENCIA' ? null : 'Não há intimação pendente de ciência.'),
			aplicar: (e) => ({ novaIntimacao: false, situacao: e.situacao === 'AGUARDANDO_CIENCIA' ? 'EM_ANALISE' : e.situacao }),
			descrever: () => 'Ciência registrada',
		},
		ASSINAR: {
			rotulo: 'Assinar', movimentacao: 'ASSINATURA',
			validar: (e) => (e.situacao === 'AGUARDANDO_ASSINATURA' ? null : 'Não há minuta aguardando assinatura.'),
			aplicar: () => ({ situacao: 'PRONTO_PARA_ENVIO', acaoPendente: 'Encaminhar', qtdMinutasPendentes: 0, dataUltimaMovimentacao: agoraIso() }),
			descrever: () => 'Minuta assinada (certificado simulado)',
		},
		MOVIMENTAR: {
			rotulo: 'Movimentar', movimentacao: 'ENVIO_PELO_SETOR',
			validar: (e) => {
				if (e.caixa !== 'NO_SETOR') return 'Só é possível movimentar itens da caixa "No setor".';
				if (e.situacao === 'AGUARDANDO_ASSINATURA') return 'Há minuta aguardando assinatura.';
				return null;
			},
			aplicar: (e, p) => ({ caixa: 'ENVIADO_NAO_RECEBIDO', situacao: 'ENVIADO', acaoPendente: 'Aguardar recebimento pelo destino', requerAcao: false, setorOrigem: setor.siglaSetor, setorDestino: p.destino, dataUltimaMovimentacao: agoraIso() }),
			descrever: (e, p) => `Enviado de ${setor.siglaSetor} para ${p.destino}`,
		},
		ARQUIVAR: {
			rotulo: 'Arquivar', movimentacao: 'ARQUIVAMENTO',
			validar: (e) => {
				if (e.caixa !== 'NO_SETOR') return 'Só é possível arquivar itens da caixa "No setor".';
				if (e.qtdMinutasPendentes > 0) return `Possui ${plural(e.qtdMinutasPendentes, 'minuta pendente', 'minutas pendentes')}.`;
				return null;
			},
			avisar: (e) => (STATUS_ABERTOS.includes(e.statusPrazo) ? 'O prazo em aberto será encerrado.' : null),
			aplicar: () => ({ caixa: 'BAIXADO', situacao: 'CONCLUIDO_ARQUIVADO', acaoPendente: 'Nenhuma', requerAcao: false, dataUltimaMovimentacao: agoraIso() }),
			descrever: () => 'Arquivado',
		},
	};
	/** Calcula o que aconteceria, sem alterar nada. `parametros` pode ser uma função (e) => parâmetros. */
	function preverLote(tipoAcao, ids, parametros) {
		const acao = ACOES[tipoAcao];
		const itens = ids.map((id) => {
			const e = expediente(id);
			const p = typeof parametros === 'function' ? parametros(e) : parametros;
			const motivo = acao.validar(e, p);
			const depois = motivo ? {} : acao.aplicar(e, p);
			const antes = Object.fromEntries(Object.keys(depois).map((campo) => [campo, e[campo] ?? null]));
			return {
				id, etiqueta: e.etiqueta, gerenciador: e.gerenciador, ok: !motivo, motivo,
				aviso: !motivo && acao.avisar ? acao.avisar(e) : null, antes, depois,
				descricao: motivo ? null : acao.descrever(e, p),
			};
		});
		return { tipoAcao, itens, qtdSucesso: itens.filter((i) => i.ok).length, qtdFalhas: itens.filter((i) => !i.ok).length };
	}
	function executarLote(previa, textoParametros) {
		const lote = {
			idLote: `LOCAL-${Date.now().toString(36).toUpperCase()}`, siglaSetor: setor.siglaSetor,
			idUsuario: usuario.idUsuario, nomeUsuario: usuario.nome, tipoAcao: previa.tipoAcao,
			parametros: textoParametros || '', dataHora: agoraIso(), qtdExpedientes: previa.itens.length,
			qtdSucesso: previa.qtdSucesso, qtdFalhas: previa.qtdFalhas,
			resultado: previa.qtdFalhas === 0 ? 'SUCESSO' : previa.qtdSucesso === 0 ? 'FALHA' : 'PARCIAL',
			itens: previa.itens, desfeito: false,
		};
		gravar('lotes', [...lotesLocais(), lote]);
		invalidar();
		return lote;
	}
	function desfazerLote(idLote) {
		const lotes = lotesLocais();
		const lote = lotes.find((l) => l.idLote === idLote);
		if (!lote || lote.desfeito) return null;
		lote.desfeito = true;
		lote.dataDesfeito = agoraIso();
		gravar('lotes', lotes);
		invalidar();
		return lote;
	}
	/** Movimentações geradas pelas ações locais (entram no histórico do expediente). */
	function movimentacoesLocais(idExpediente) {
		const lista = [];
		for (const lote of lotesLocais()) {
			for (const item of lote.itens) {
				if (item.id !== idExpediente || !item.ok) continue;
				lista.push({
					idMovimentacao: `${lote.idLote}-${item.id}`, dataHora: lote.dataHora, tipoMovimentacao: ACOES[lote.tipoAcao].movimentacao,
					nomeUsuario: lote.nomeUsuario, descricao: `${item.descricao} (lote ${lote.idLote})`, local: true, desfeito: lote.desfeito,
				});
			}
		}
		return lista;
	}

	// ---------- notificações ----------

	function notificacoesDoUsuario() {
		const lidas = new Set(ler(`lidas:${usuario.idUsuario}`, []));
		return (agruparPor('notificacoes', 'idUsuario').get(usuario.idUsuario) || [])
			.map((n) => ({ ...n, lida: n.lida || lidas.has(n.idNotificacao) }))
			.sort((a, b) => (a.dataHora < b.dataHora ? 1 : -1));
	}
	function marcarLidas(ids) {
		const chave = `lidas:${usuario.idUsuario}`;
		gravar(chave, [...new Set([...ler(chave, []), ...ids])]);
	}
	const JANELA_ALERTAS_DIAS = 30;
	function alertasRecentes() {
		const limite = somarDias(HOJE, -JANELA_ALERTAS_DIAS);
		return notificacoesDoUsuario().filter((n) => n.dataHora.slice(0, 10) >= limite);
	}

	// ---------- componentes de interface ----------

	const PAGINAS = [
		['index.html', 'Início'], ['painel.html', 'Painel unificado'], ['foco.html', 'Modo foco'], ['prazos.html', 'Prazos'],
		['alertas.html', 'Alertas'], ['indicadores.html', 'Indicadores'], ['designacao.html', 'Designação'], ['lotes.html', 'Lotes'],
	];
	function montarTopo(paginaAtiva) {
		const naoLidas = alertasRecentes().filter((n) => !n.lida).length;
		const grupos = tabela('setores').map((s) => `<optgroup label="${esc(s.siglaSetor)}">${usuarios.filter((u) => u.siglaSetor === s.siglaSetor)
			.map((u) => `<option value="${esc(u.idUsuario)}"${u.idUsuario === usuario.idUsuario ? ' selected' : ''}>${esc(u.nome)} (${esc(u.perfil.toLowerCase())})</option>`).join('')}</optgroup>`).join('');
		const escuro = document.documentElement.dataset.tema === 'escuro';
		const alvo = document.getElementById('topo');
		alvo.innerHTML = `
			<a class="pular" href="#conteudo">Pular para o conteúdo</a>
			<header class="topo">
				<a class="marca" href="index.html">Único <small>Expedientes</small></a>
				<nav class="nav-principal" aria-label="Navegação principal">
					<ul role="none">${PAGINAS.map(([href, texto]) => `<li role="none"><a href="${href}"${href === paginaAtiva ? ' aria-current="page"' : ''}>${esc(texto)}${href === 'alertas.html' && naoLidas ? ` ${seloCor(fmtNum(naoLidas), '#FFD54F')}<span class="sr-only"> não lidos</span>` : ''}</a></li>`).join('')}</ul>
				</nav>
				<div class="contexto">
					<label for="sel-usuario">Usuário simulado</label>
					<select id="sel-usuario">${grupos}</select>
					<button type="button" class="btn btn-pequeno" id="btn-tema" aria-pressed="${escuro}">Tema escuro</button>
				</div>
			</header>
			<p class="faixa-demo">Protótipo com dados 100% sintéticos · referência ${fmtDataHora(DATA_REFERENCIA)} ·
				setor <strong>${esc(setor.nome)}</strong> · ${esc(usuario.cargo)}</p>`;
		alvo.querySelector('#sel-usuario').addEventListener('change', (ev) => trocarUsuario(ev.target.value));
		alvo.querySelector('#btn-tema').addEventListener('click', () => {
			salvarPreferencias({ tema: document.documentElement.dataset.tema === 'escuro' ? 'CLARO' : 'ESCURO' });
			alvo.querySelector('#btn-tema').setAttribute('aria-pressed', String(aplicarTema()));
		});
	}

	/** Aviso temporário anunciado por aria-live (região #avisos). Pode ter um botão de ação (ex.: Desfazer). */
	function avisar(mensagem, acao) {
		const regiao = document.getElementById('avisos');
		const aviso = document.createElement('div');
		aviso.className = 'aviso';
		aviso.innerHTML = `<span>${esc(mensagem)}</span>`;
		let tempo;
		const fechar = () => aviso.remove();
		const agendar = () => { tempo = setTimeout(fechar, acao ? 15000 : 6000); };
		if (acao) {
			const botao = Object.assign(document.createElement('button'), { type: 'button', className: 'btn btn-pequeno', textContent: acao.rotulo });
			botao.addEventListener('click', () => { fechar(); acao.executar(); });
			aviso.appendChild(botao);
		}
		const fecharBotao = Object.assign(document.createElement('button'), { type: 'button', className: 'btn-icone', title: 'Fechar aviso' });
		fecharBotao.setAttribute('aria-label', 'Fechar');
		fecharBotao.innerHTML = '<span aria-hidden="true">×</span>';
		fecharBotao.style.color = '#fff';
		fecharBotao.addEventListener('click', fechar);
		aviso.appendChild(fecharBotao);
		aviso.addEventListener('mouseenter', () => clearTimeout(tempo));
		aviso.addEventListener('focusin', () => clearTimeout(tempo));
		aviso.addEventListener('mouseleave', agendar);
		regiao.appendChild(aviso);
		agendar();
	}

	/**
	 * Diálogo modal nativo (<dialog>): prende o foco, fecha com Esc e devolve o foco ao elemento de origem.
	 * botoes: [{ rotulo, classe, acao(dialogo) → false para manter aberto }]
	 */
	let contadorDialogo = 0;
	function abrirDialogo({ titulo, corpo, botoes = [], largura, origem: origemInformada, aoFechar }) {
		const origem = origemInformada || document.activeElement;
		const id = `dlg-${++contadorDialogo}`;
		const dialogo = document.createElement('dialog');
		dialogo.setAttribute('aria-labelledby', `${id}-titulo`);
		if (largura) dialogo.style.width = largura;
		dialogo.innerHTML = `<div>
			<div class="barra" style="margin:0"><h4 class="modal-title" id="${id}-titulo" style="margin:0;font-size:1.1rem">${esc(titulo)}</h4>
				<span class="espaco"></span>
				<button type="button" class="btn-icone" data-fechar title="Fechar" aria-label="Fechar"><span aria-hidden="true">×</span></button></div>
			<div class="corpo">${corpo}</div>
			<div class="rodape"></div></div>`;
		const rodape = dialogo.querySelector('.rodape');
		for (const botao of [...botoes, { rotulo: botoes.length ? 'Cancelar' : 'Fechar', classe: '' }]) {
			const el = Object.assign(document.createElement('button'), { type: 'button', className: `btn ${botao.classe || ''}`, textContent: botao.rotulo });
			el.addEventListener('click', () => {
				if (botao.acao && botao.acao(dialogo) === false) return;
				dialogo.close();
			});
			rodape.appendChild(el);
		}
		dialogo.querySelector('[data-fechar]').addEventListener('click', () => dialogo.close());
		dialogo.addEventListener('close', () => {
			dialogo.remove();
			if (origem && document.contains(origem)) origem.focus();
			if (aoFechar) aoFechar();
		});
		document.body.appendChild(dialogo);
		dialogo.showModal();
		return dialogo;
	}

	/**
	 * Tabela acessível: <caption>, <th id> e <td headers>.
	 * colunas: [{ id, rotulo, classe, html(linha) }]
	 */
	function tabelaHtml({ id, legenda, legendaVisivel = false, colunas, linhas, vazio = 'Nenhum registro.' }) {
		const cab = colunas.map((c) => `<th id="${id}-${c.id}" scope="col" class="${c.classe || ''}">${c.rotuloHtml || esc(c.rotulo)}</th>`).join('');
		const corpo = linhas.length
			? linhas.map((l) => `<tr role="row">${colunas.map((c) => `<td role="cell" headers="${id}-${c.id}" class="${c.classe || ''}">${c.html(l)}</td>`).join('')}</tr>`).join('')
			: `<tr role="row"><td role="cell" headers="${id}-${colunas[0].id}" colspan="${colunas.length}" class="vazio">${esc(vazio)}</td></tr>`;
		return `<div class="tabela-rolagem"><table id="${id}"><caption class="${legendaVisivel ? '' : 'sr-only'}">${esc(legenda)}</caption>
			<thead><tr role="row">${cab}</tr></thead><tbody>${corpo}</tbody></table></div>`;
	}

	const linkExp = (e) => `<a href="expediente.html?id=${encodeURIComponent(e.idExpediente)}">${esc(e.etiqueta)}</a>`;
	function assuntoVisivel(e) {
		return podeVerConteudo(e) ? esc(e.assunto) : '<span class="texto-suave">Conteúdo sigiloso</span>';
	}

	/** Pré-visualização de ação em lote em diálogo; ao confirmar executa e oferece "Desfazer". */
	function confirmarLote({ tipoAcao, ids, parametros, textoParametros, aoConcluir, aoDesfazer, origem }) {
		const previa = preverLote(tipoAcao, ids, parametros);
		const acao = ACOES[tipoAcao];
		const corpo = `<p>${esc(acao.rotulo)}: <strong>${plural(previa.qtdSucesso, 'expediente será alterado', 'expedientes serão alterados')}</strong>${previa.qtdFalhas ? `; ${plural(previa.qtdFalhas, 'será ignorado', 'serão ignorados')}` : ''}.
			${textoParametros ? `<br><span class="texto-suave pequeno">Parâmetros: ${esc(textoParametros)}</span>` : ''}</p>
			${previa.qtdFalhas ? `<div role="alert" class="pequeno" style="color:var(--perigo)">${plural(previa.qtdFalhas, 'item não atende', 'itens não atendem')} à regra da ação e não ${previa.qtdFalhas === 1 ? 'será alterado' : 'serão alterados'}.</div>` : ''}
			${tabelaHtml({
				id: 'previa-lote', legenda: `Pré-visualização da ação ${acao.rotulo} em ${previa.itens.length} expedientes`,
				colunas: [
					{ id: 'etiqueta', rotulo: 'Expediente', html: (i) => `${esc(i.etiqueta)} ${seloGerenciador(i.gerenciador)}` },
					{ id: 'resultado', rotulo: 'Resultado previsto', html: (i) => (i.ok ? seloCor('Será alterado', '#2E7D32') : seloCor('Ignorado', '#B71C1C')) },
					{ id: 'detalhe', rotulo: 'Detalhe', html: (i) => esc(i.ok ? [i.descricao, i.aviso].filter(Boolean).join(' · ') : i.motivo) },
				],
				linhas: previa.itens,
			})}`;
		let executado = false;
		abrirDialogo({
			titulo: `Pré-visualizar ação em lote: ${acao.rotulo}`, corpo, largura: 'min(900px, 95vw)', origem,
			// o retorno à tela roda depois de o diálogo fechar, para o foco não se perder
			aoFechar: () => { if (executado && aoConcluir) aoConcluir(); },
			botoes: [{
				rotulo: `Confirmar (${previa.qtdSucesso})`, classe: 'btn-primario',
				acao: () => {
					if (!previa.qtdSucesso) return true;
					const lote = executarLote(previa, textoParametros);
					executado = true;
					avisar(`${acao.rotulo}: ${plural(lote.qtdSucesso, 'expediente alterado', 'expedientes alterados')} (lote ${lote.idLote}).`, {
						rotulo: 'Desfazer',
						executar: () => {
							desfazerLote(lote.idLote);
							avisar(`Lote ${lote.idLote} desfeito.`);
							const retorno = aoDesfazer || aoConcluir;
							if (retorno) retorno();
						},
					});
					return true;
				},
			}],
		});
	}

	let destinosCache;
	function destinosPossiveis() {
		if (!destinosCache) {
			const nomes = new Set();
			for (const e of tabela('expedientes')) {
				if (e.caixa === 'ENVIADO_NAO_RECEBIDO' || e.caixa === 'BAIXADO') nomes.add(e.setorDestino);
				nomes.add(e.setorOrigem);
			}
			tabela('setores').forEach((s) => nomes.add(s.siglaSetor));
			nomes.delete(setor.siglaSetor);
			nomes.delete(null);
			destinosCache = [...nomes].sort((a, b) => a.localeCompare(b, 'pt-BR'));
		}
		return destinosCache;
	}

	/** Pede os parâmetros da ação (quando houver) e abre a pré-visualização. */
	function iniciarAcaoLote(tipoAcao, ids, aoConcluir, origem = document.activeElement, aoDesfazer = null) {
		const seguir = (parametros, textoParametros) => setTimeout(() => confirmarLote({ tipoAcao, ids, parametros, textoParametros, aoConcluir, aoDesfazer, origem }), 0);
		const opcoes = (lista) => lista.map(([valor, texto]) => `<option value="${esc(valor)}">${esc(texto)}</option>`).join('');
		let campo;
		if (tipoAcao === 'DESIGNAR') {
			campo = `<label for="par-lote">Designar a <span style="color:var(--perigo)" aria-hidden="true">*</span></label>
				<select id="par-lote" aria-required="true"><option value="">Selecione</option>${opcoes(usuariosDoSetor.map((u) => [u.idUsuario, `${u.nome} (${u.cargo})`]))}</select>
				<p class="pequeno texto-suave">Dica: a página <a href="designacao.html">Designação</a> sugere o servidor com menor carga.</p>`;
		} else if (tipoAcao === 'INCLUIR_MARCADOR') {
			const descricoes = [...new Set(marcadoresDoSetor().map((m) => m.descricao))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
			campo = `<label for="par-lote">Marcador <span style="color:var(--perigo)" aria-hidden="true">*</span></label>
				<select id="par-lote" aria-required="true"><option value="">Selecione</option>${opcoes(descricoes.map((d) => [d, `${d} (${marcadoresDoSetor().filter((m) => m.descricao === d).map((m) => rotulo('GERENCIADOR', m.gerenciador)).join(', ')})`]))}</select>
				<p class="pequeno texto-suave">Marcadores são do gerenciador: itens de outro gerenciador serão ignorados.</p>`;
		} else if (tipoAcao === 'MOVIMENTAR') {
			campo = `<label for="par-lote">Setor de destino <span style="color:var(--perigo)" aria-hidden="true">*</span></label>
				<select id="par-lote" aria-required="true"><option value="">Selecione</option>${opcoes(destinosPossiveis().map((d) => [d, d]))}</select>`;
		} else {
			seguir({}, '');
			return;
		}
		const dialogo = abrirDialogo({
			titulo: `${ACOES[tipoAcao].rotulo}: ${plural(ids.length, 'expediente selecionado', 'expedientes selecionados')}`, origem,
			corpo: `<div class="campo">${campo}<span id="par-lote-erro" role="alert" class="pequeno" style="color:var(--perigo)"></span></div>`,
			botoes: [{
				rotulo: 'Pré-visualizar', classe: 'btn-primario',
				acao: (dlg) => {
					const select = dlg.querySelector('#par-lote');
					if (!select.value) {
						select.setAttribute('aria-invalid', 'true');
						select.setAttribute('aria-describedby', 'par-lote-erro');
						dlg.querySelector('#par-lote-erro').textContent = 'Campo obrigatório.';
						select.focus();
						return false;
					}
					if (tipoAcao === 'DESIGNAR') {
						const u = usuarios.find((x) => x.idUsuario === select.value);
						seguir({ idUsuario: u.idUsuario, nome: u.nome }, `designado=${u.idUsuario}`);
					} else if (tipoAcao === 'INCLUIR_MARCADOR') {
						seguir({ marcador: select.value }, `marcador=${select.value}`);
					} else {
						seguir({ destino: select.value }, `destino=${select.value}`);
					}
					return true;
				},
			}],
		});
		dialogo.querySelector('#par-lote').focus();
	}

	// ---------- iCalendar (RFC 5545) ----------

	function textoIcs(texto) {
		return String(texto ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
	}
	const codificador = new TextEncoder();
	/** Dobra linhas em até 75 octetos (UTF-8), como pede a RFC 5545. */
	function dobrarLinha(linha) {
		const partes = [];
		let atual = '';
		let octetos = 0;
		for (const caractere of linha) {
			const tamanho = codificador.encode(caractere).length;
			if (octetos + tamanho > 74) {
				partes.push(atual);
				atual = ' ';
				octetos = 1;
			}
			atual += caractere;
			octetos += tamanho;
		}
		partes.push(atual);
		return partes.join('\r\n');
	}
	/**
	 * Gera um .ics com um evento de dia inteiro por prazo. Conteúdo de expediente sigiloso não sai no arquivo.
	 * antecedenciaDias: alarme configurado em preferencias_usuario (antecedenciaAlertaPrazoDias).
	 */
	function gerarIcs(lista, nomeCalendario, antecedenciaDias) {
		const carimbo = new Date(DATA_REFERENCIA).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
		const linhas = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Hackathon Unico//Prototipo Expedientes//PT-BR', 'CALSCALE:GREGORIAN',
			'METHOD:PUBLISH', `X-WR-CALNAME:${textoIcs(nomeCalendario)}`, 'X-WR-TIMEZONE:America/Sao_Paulo'];
		for (const e of lista) {
			if (!e.dataPrazo) continue;
			const inicio = e.dataPrazo.replace(/-/g, '');
			const fim = somarDias(e.dataPrazo, 1).replace(/-/g, '');
			const conteudo = podeVerConteudo(e) && !e.sigiloso ? ` · ${e.assunto}` : '';
			linhas.push('BEGIN:VEVENT', `UID:${e.idExpediente}-${e.dataPrazo}@expedientes.exemplo.org`, `DTSTAMP:${carimbo}`,
				`DTSTART;VALUE=DATE:${inicio}`, `DTEND;VALUE=DATE:${fim}`,
				`SUMMARY:${textoIcs(`Prazo ${rotulo('TIPO_PRAZO', e.tipoPrazo).toLowerCase()}: ${e.etiqueta} (${rotulo('GERENCIADOR', e.gerenciador)})`)}`,
				`DESCRIPTION:${textoIcs(`${e.acaoPendente}${conteudo}\nResponsável: ${e.nomeResponsavel}\nPrioridade: ${rotulo('PRIORIDADE', e.prioridade)}\nDados sintéticos (hackathon).`)}`,
				`CATEGORIES:${textoIcs(e.gerenciador)},${textoIcs(e.statusPrazo)}`, 'TRANSP:TRANSPARENT');
			if (antecedenciaDias > 0) {
				linhas.push('BEGIN:VALARM', 'ACTION:DISPLAY', `TRIGGER:-P${antecedenciaDias}D`,
					`DESCRIPTION:${textoIcs(`Prazo de ${e.etiqueta} em ${antecedenciaDias} dia(s)`)}`, 'END:VALARM');
			}
			linhas.push('END:VEVENT');
		}
		linhas.push('END:VCALENDAR');
		return `${linhas.map(dobrarLinha).join('\r\n')}\r\n`;
	}

	// ---------- gráficos SVG (com tabela alternativa) ----------

	/** Gráfico de linhas. series: [{ nome, cor, valores: [n] }], rotulosX: [texto]. */
	function graficoLinhas({ titulo, rotulosX, series, altura = 220 }) {
		const largura = 640;
		const m = { e: 40, d: 10, t: 10, b: 28 };
		const max = Math.max(1, ...series.flatMap((s) => s.valores));
		const x = (i) => m.e + (i * (largura - m.e - m.d)) / Math.max(1, rotulosX.length - 1);
		const y = (v) => altura - m.b - (v * (altura - m.t - m.b)) / max;
		const passosY = 4;
		const grade = Array.from({ length: passosY + 1 }, (_, i) => Math.round((max * i) / passosY))
			.map((v) => `<line class="eixo" x1="${m.e}" x2="${largura - m.d}" y1="${y(v)}" y2="${y(v)}"/><text x="${m.e - 6}" y="${y(v) + 4}" text-anchor="end">${fmtNum(v)}</text>`).join('');
		const passoX = Math.ceil(rotulosX.length / 8);
		const eixoX = rotulosX.map((r, i) => (i % passoX === 0 ? `<text x="${x(i)}" y="${altura - 8}" text-anchor="middle">${esc(r)}</text>` : '')).join('');
		const linhas = series.map((s) => `<polyline fill="none" stroke="${s.cor}" stroke-width="2.5" points="${s.valores.map((v, i) => `${x(i)},${y(v)}`).join(' ')}"/>`).join('');
		return `<svg viewBox="0 0 ${largura} ${altura}" role="img" aria-label="${esc(titulo)}. Dados detalhados na tabela a seguir.">${grade}${eixoX}${linhas}</svg>
			<div class="legenda" aria-hidden="true">${series.map((s) => `<span style="--cor:${s.cor}">${esc(s.nome)}</span>`).join('')}</div>`;
	}
	/** Barras verticais agrupadas. */
	function graficoBarras({ titulo, rotulosX, series, altura = 220 }) {
		const largura = 640;
		const m = { e: 40, d: 10, t: 10, b: 28 };
		const max = Math.max(1, ...series.flatMap((s) => s.valores));
		const larguraGrupo = (largura - m.e - m.d) / rotulosX.length;
		const larguraBarra = Math.max(2, (larguraGrupo * 0.8) / series.length);
		const y = (v) => altura - m.b - (v * (altura - m.t - m.b)) / max;
		const grade = [0, 0.5, 1].map((f) => Math.round(max * f))
			.map((v) => `<line class="eixo" x1="${m.e}" x2="${largura - m.d}" y1="${y(v)}" y2="${y(v)}"/><text x="${m.e - 6}" y="${y(v) + 4}" text-anchor="end">${fmtNum(v)}</text>`).join('');
		const passoX = Math.ceil(rotulosX.length / 10);
		const barras = rotulosX.map((r, i) => {
			const x0 = m.e + i * larguraGrupo + larguraGrupo * 0.1;
			return series.map((s, j) => `<rect x="${x0 + j * larguraBarra}" y="${y(s.valores[i])}" width="${larguraBarra - 1}" height="${altura - m.b - y(s.valores[i])}" fill="${s.cor}"/>`).join('')
				+ (i % passoX === 0 ? `<text x="${x0 + (larguraGrupo * 0.4)}" y="${altura - 8}" text-anchor="middle">${esc(r)}</text>` : '');
		}).join('');
		return `<svg viewBox="0 0 ${largura} ${altura}" role="img" aria-label="${esc(titulo)}. Dados detalhados na tabela a seguir.">${grade}${barras}</svg>
			<div class="legenda" aria-hidden="true">${series.map((s) => `<span style="--cor:${s.cor}">${esc(s.nome)}</span>`).join('')}</div>`;
	}
	/** Tabela de dados do gráfico, recolhida em <details>. */
	function tabelaDoGrafico(id, legenda, rotulosX, series, rotuloX = 'Período') {
		return `<details class="pequeno"><summary>Ver dados em tabela</summary>${tabelaHtml({
			id, legenda,
			colunas: [{ id: 'x', rotulo: rotuloX, html: (i) => esc(rotulosX[i]) },
				...series.map((s, j) => ({ id: `s${j}`, rotulo: s.nome, classe: 'num', html: (i) => fmtNum(s.valores[i]) }))],
			linhas: rotulosX.map((_, i) => i),
		})}</details>`;
	}
	function barrasHorizontais(itens, total) {
		const max = total || Math.max(1, ...itens.map((i) => i.valor));
		return itens.map((i) => `<div class="barra-h"><span>${esc(i.rotulo)}</span>
			<span class="trilho" aria-hidden="true"><span style="width:${(100 * i.valor) / max}%;--cor:${i.cor || 'var(--primaria)'}"></span></span>
			<span class="num">${fmtNum(i.valor)}</span></div>`).join('');
	}

	/** Inicialização comum a todas as páginas. */
	function iniciar(paginaAtiva) {
		aplicarTema();
		montarTopo(paginaAtiva);
	}

	return {
		D, ler, gravar, limparTudo, tabela, agruparPor, HOJE, DATA_REFERENCIA, diffDias, somarDias, fmtData, fmtDataHora, agoraIso,
		diaSemana, MESES, esc, fmtNum, plural, param, baixar, csvDe, cat, rotulo, corTexto, seloCor, selo, seloGerenciador,
		textoPrazo, seloPrazo, seloPrioridade, flags, seloMarcador, usuario, setor, usuarios, usuariosDoSetor, nomeUsuario,
		podeVerConteudo, preferencias, preferenciasBase, salvarPreferencias, restaurarPreferencias, aplicarTema,
		expedientesTodos, expediente, ativos, doSetor, invalidar, alternarFavorito, contadores, gerenciadoresDoSetor, STATUS_ABERTOS, explicarPrioridade,
		risco, seloRisco, CORES_RISCO, ordemFila, fila, ACOES, marcadoresDoSetor, preverLote, executarLote, desfazerLote, lotesLocais,
		movimentacoesLocais, notificacoesDoUsuario, marcarLidas, alertasRecentes, JANELA_ALERTAS_DIAS, montarTopo, avisar,
		abrirDialogo, tabelaHtml, linkExp, assuntoVisivel, confirmarLote, iniciarAcaoLote, destinosPossiveis, gerarIcs, graficoLinhas, graficoBarras, tabelaDoGrafico,
		barrasHorizontais, iniciar,
	};
})();
