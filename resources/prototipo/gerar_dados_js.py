#!/usr/bin/env python3
"""Converte os CSVs sintéticos em dados/dados.js para o protótipo estático.

As páginas do protótipo leem ``window.DADOS`` por meio de uma tag <script>, então
funcionam abrindo o HTML direto do disco (file://), sem servidor.

Uso:
	python3 gerar_dados_js.py
	python3 gerar_dados_js.py --csv ../seed/saida/csv --data-referencia 2026-10-07T17:00:00-03:00
"""

import argparse
import csv
import json
import re
from datetime import datetime
from pathlib import Path

AQUI = Path(__file__).resolve().parent
CSV_PADRAO = AQUI.parent / "seed" / "saida" / "csv"
SAIDA_PADRAO = AQUI / "dados" / "dados.js"
# Mesmo padrão do gerador (DATA_EVENTO às 17h). Ajuste se gerar a base com outra --data-referencia.
DATA_REFERENCIA_PADRAO = "2026-10-07T17:00:00-03:00"

INTEIRO = re.compile(r"^-?\d+$")
BOOLEANOS = {"true", "false"}


def tipar_coluna(valores):
	"""Descobre o tipo da coluna olhando todos os valores não vazios."""
	preenchidos = [valor for valor in valores if valor != ""]
	if preenchidos and all(valor in BOOLEANOS for valor in preenchidos):
		return lambda valor: None if valor == "" else valor == "true"
	if preenchidos and all(INTEIRO.match(valor) for valor in preenchidos):
		return lambda valor: None if valor == "" else int(valor)
	return lambda valor: None if valor == "" else valor


def ler_tabela(caminho):
	with caminho.open(encoding="utf-8", newline="") as arquivo:
		leitor = csv.reader(arquivo)
		colunas = next(leitor)
		linhas = list(leitor)
	conversores = [tipar_coluna([linha[indice] for linha in linhas]) for indice in range(len(colunas))]
	return {"c": colunas, "l": [[conversor(valor) for conversor, valor in zip(conversores, linha)] for linha in linhas]}


def main():
	parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
	parser.add_argument("--csv", type=Path, default=CSV_PADRAO, help="pasta com os CSVs gerados pelo gerar_seed.py")
	parser.add_argument("--saida", type=Path, default=SAIDA_PADRAO, help="arquivo .js de saída")
	parser.add_argument("--data-referencia", default=DATA_REFERENCIA_PADRAO,
		help="'hoje' do protótipo (ISO 8601 com fuso); deve ser a mesma usada no gerador")
	args = parser.parse_args()

	datetime.fromisoformat(args.data_referencia)  # valida o formato
	arquivos = sorted(args.csv.glob("*.csv"))
	if not arquivos:
		raise SystemExit(f"Nenhum CSV encontrado em {args.csv}. Rode antes: python3 ../seed/gerar_seed.py")

	tabelas = {arquivo.stem: ler_tabela(arquivo) for arquivo in arquivos}
	dados = {"meta": {"dataReferencia": args.data_referencia, "origem": "base 100% sintética (gerar_seed.py)",
		"contagens": {nome: len(tabela["l"]) for nome, tabela in tabelas.items()}}, "tabelas": tabelas}

	args.saida.parent.mkdir(parents=True, exist_ok=True)
	conteudo = json.dumps(dados, ensure_ascii=False, separators=(",", ":"))
	args.saida.write_text(f"window.DADOS = {conteudo};\n", encoding="utf-8")
	tamanho = args.saida.stat().st_size / 1024 / 1024
	print(f"{args.saida} gerado ({tamanho:.1f} MB, {len(tabelas)} tabelas, referência {args.data_referencia})")


if __name__ == "__main__":
	main()
