"""Inicia o Number Ops localmente.

Uso:
    python server.py                 # http://127.0.0.1:8000
    python server.py --port 8080
    python server.py --seed-demo     # insere dados fictícios (só se a base estiver vazia)
    python server.py --backup        # cria uma cópia do banco em data/backups/ e sai

Não há dependências externas: só a biblioteca padrão do Python 3.10+.
"""
from __future__ import annotations

import argparse
import sys
import webbrowser
from datetime import datetime

if sys.version_info < (3, 10):
    sys.exit("O Number Ops precisa do Python 3.10 ou mais recente.")

from backend import accounts, config, database, demo, security  # noqa: E402
from backend.http_app import create_server  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description="Servidor local do Number Ops")
    parser.add_argument("--host", default="127.0.0.1", help="Endereço de escuta (padrão: 127.0.0.1, só este computador)")
    parser.add_argument("--port", type=int, default=8000, help="Porta HTTP (padrão: 8000)")
    parser.add_argument("--seed-demo", action="store_true", help="Insere dados fictícios de demonstração se a base estiver vazia")
    parser.add_argument("--backup", action="store_true", help="Cria uma cópia do banco em data/backups/ e encerra")
    parser.add_argument("--open", action="store_true", help="Abre o navegador automaticamente")
    args = parser.parse_args()

    database.initialize()
    config.load_secret()

    if args.backup:
        target = database.backup_to(config.BACKUP_DIR / f"number_ops-{datetime.now():%Y%m%d-%H%M%S}.db")
        print(f"Backup criado em {target}")
        return

    conn = database.connect()
    try:
        accounts.prune_sessions(conn)
        security.throttle_prune(conn)
        if args.seed_demo:
            print("Dados de demonstração inseridos." if demo.seed(conn) else "A base já possui dados; demonstração não inserida.")
        needs_setup = not accounts.has_any_profile(conn)
    finally:
        conn.close()

    if args.host not in ("127.0.0.1", "localhost"):
        print("ATENÇÃO: o servidor ficará acessível por outros computadores da rede via HTTP sem criptografia.")

    server = create_server(args.host, args.port)
    url = f"http://{'127.0.0.1' if args.host == '0.0.0.0' else args.host}:{args.port}/"
    print(f"Number Ops rodando em {url}")
    print(f"Banco de dados: {config.DB_PATH}")
    if needs_setup:
        print("Primeiro acesso: abra o endereço acima para criar a conta MASTER.")
    print("Pressione Ctrl+C para encerrar.")
    if args.open:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nEncerrando...")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
