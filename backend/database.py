"""Conexão e esquema do banco SQLite local (data/number_ops.db).

As regras que antes viviam no Postgres (CHECKs, FKs, índices únicos parciais)
continuam aqui no próprio banco: mesmo que alguém pule o backend e escreva
direto no arquivo, o SQLite recusa dados incoerentes.
"""
from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterator

from . import config

SCHEMA_VERSION = 1

SCHEMA = """
CREATE TABLE IF NOT EXISTS app_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS squads (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (trim(name) <> ''),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (trim(name) <> ''),
  email TEXT NOT NULL,
  cpf_hash TEXT NOT NULL,
  cpf_masked TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  must_change_password INTEGER NOT NULL DEFAULT 0 CHECK (must_change_password IN (0, 1)),
  job_title TEXT NOT NULL CHECK (job_title IN ('ANALYST', 'ACCOUNT_MANAGER', 'OTHER')),
  squad_id TEXT REFERENCES squads(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  access_level TEXT NOT NULL DEFAULT 'USER' CHECK (access_level IN ('MASTER', 'ADMIN', 'USER', 'VIEWER')),
  last_login_at TEXT,
  password_changed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_uidx ON profiles (lower(email));
CREATE UNIQUE INDEX IF NOT EXISTS profiles_cpf_uidx ON profiles (cpf_hash);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  csrf_token TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  ip TEXT,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS sessions_profile_idx ON sessions (profile_id);

-- Solicitações de acesso: qualquer pessoa envia, só o MASTER aprova/recusa.
-- O CPF nunca é guardado em texto puro: só o HMAC (para checar duplicidade)
-- e uma versão mascarada (para exibição).
CREATE TABLE IF NOT EXISTS signup_requests (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (trim(name) <> ''),
  email TEXT NOT NULL,
  cpf_hash TEXT NOT NULL,
  cpf_masked TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  job_title TEXT NOT NULL CHECK (job_title IN ('ANALYST', 'ACCOUNT_MANAGER', 'OTHER')),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  access_level TEXT CHECK (access_level IS NULL OR access_level IN ('MASTER', 'ADMIN', 'USER', 'VIEWER')),
  squad_id TEXT REFERENCES squads(id) ON DELETE SET NULL,
  profile_id TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_by TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at TEXT,
  review_note TEXT NOT NULL DEFAULT '',
  request_ip TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS signup_requests_cpf_pending_uidx ON signup_requests (cpf_hash) WHERE status = 'PENDING';
CREATE UNIQUE INDEX IF NOT EXISTS signup_requests_email_pending_uidx ON signup_requests (lower(email)) WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS signup_requests_status_idx ON signup_requests (status);

-- Tentativas (login falho, solicitações de acesso) para limitar força bruta/spam.
CREATE TABLE IF NOT EXISTS throttle_events (
  key TEXT NOT NULL,
  at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS throttle_events_key_idx ON throttle_events (key, at);

CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (trim(name) <> ''),
  squad_id TEXT REFERENCES squads(id) ON DELETE SET NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS clients_squad_idx ON clients (squad_id);

CREATE TABLE IF NOT EXISTS responsibles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (trim(name) <> ''),
  team TEXT NOT NULL DEFAULT '',
  squad_id TEXT REFERENCES squads(id) ON DELETE SET NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS locations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (trim(name) <> ''),
  responsible_id TEXT REFERENCES responsibles(id) ON DELETE SET NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS numbers (
  id TEXT PRIMARY KEY,
  phone TEXT NOT NULL UNIQUE CHECK (length(phone) IN (12, 13) AND phone GLOB '55*' AND phone NOT GLOB '*[^0-9]*'),
  identification TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'WARMING', 'UNDER_REVIEW', 'BLOCKED', 'INACTIVE')),
  location_id TEXT REFERENCES locations(id) ON DELETE SET NULL,
  responsible_id TEXT REFERENCES responsibles(id) ON DELETE SET NULL,
  group_count INTEGER NOT NULL DEFAULT 0 CHECK (group_count >= 0),
  notes TEXT NOT NULL DEFAULT '',
  archived_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  -- Chip inativo é sempre arquivado (regra de negócio garantida pelo próprio banco).
  CHECK (status <> 'INACTIVE' OR archived_at IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS numbers_status_idx ON numbers (status);
CREATE INDEX IF NOT EXISTS numbers_location_idx ON numbers (location_id);
CREATE INDEX IF NOT EXISTS numbers_responsible_idx ON numbers (responsible_id);

CREATE TABLE IF NOT EXISTS number_clients (
  number_id TEXT NOT NULL REFERENCES numbers(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  PRIMARY KEY (number_id, client_id)
);

CREATE TABLE IF NOT EXISTS number_squads (
  number_id TEXT NOT NULL REFERENCES numbers(id) ON DELETE CASCADE,
  squad_id TEXT NOT NULL REFERENCES squads(id) ON DELETE CASCADE,
  PRIMARY KEY (number_id, squad_id)
);

CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (trim(name) <> ''),
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  squad_id TEXT NOT NULL REFERENCES squads(id) ON DELETE RESTRICT,
  responsible_id TEXT REFERENCES responsibles(id) ON DELETE SET NULL,
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'CLOSED')),
  stage TEXT NOT NULL DEFAULT 'PLANEJAMENTO' CHECK (stage IN ('PLANEJAMENTO', 'EM_ANDAMENTO')),
  started_at TEXT NOT NULL,
  ended_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK ((status = 'ACTIVE' AND ended_at IS NULL) OR (status = 'CLOSED' AND ended_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS campaigns_client_idx ON campaigns (client_id);
CREATE INDEX IF NOT EXISTS campaigns_squad_idx ON campaigns (squad_id);

CREATE TABLE IF NOT EXISTS number_campaign_links (
  id TEXT PRIMARY KEY,
  number_id TEXT NOT NULL REFERENCES numbers(id) ON DELETE RESTRICT,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE RESTRICT,
  role TEXT NOT NULL CHECK (role IN ('PRIMARY', 'BACKUP', 'SUPPORT')),
  started_at TEXT NOT NULL,
  ended_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (ended_at IS NULL OR ended_at >= started_at)
);
CREATE INDEX IF NOT EXISTS number_campaign_links_number_idx ON number_campaign_links (number_id);
CREATE INDEX IF NOT EXISTS number_campaign_links_campaign_idx ON number_campaign_links (campaign_id);
-- Um número pode estar em várias campanhas, mas só uma vez ativo em cada uma.
CREATE UNIQUE INDEX IF NOT EXISTS number_campaign_links_active_pair_uidx
  ON number_campaign_links (number_id, campaign_id) WHERE ended_at IS NULL;

CREATE TABLE IF NOT EXISTS incidents (
  id TEXT PRIMARY KEY,
  number_id TEXT NOT NULL REFERENCES numbers(id) ON DELETE RESTRICT,
  type TEXT NOT NULL CHECK (type IN ('RESTRICTION', 'FALL', 'BLOCK', 'CHIP_ISSUE', 'DEVICE_ISSUE', 'OTHER')),
  title TEXT NOT NULL CHECK (trim(title) <> ''),
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('OPEN', 'RESOLVED')),
  responsible_id TEXT REFERENCES responsibles(id) ON DELETE SET NULL,
  resolution_notes TEXT NOT NULL DEFAULT '',
  resolved_by_id TEXT REFERENCES responsibles(id) ON DELETE SET NULL,
  resolved_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS incidents_number_idx ON incidents (number_id);

CREATE TABLE IF NOT EXISTS restrictions (
  id TEXT PRIMARY KEY,
  number_id TEXT NOT NULL REFERENCES numbers(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('GROUP_CREATION', 'SEND_LIMIT', 'NO_AREA', 'OTHER')),
  description TEXT NOT NULL DEFAULT '',
  recorded_at TEXT NOT NULL,
  ended_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS restrictions_one_active_per_number_uidx ON restrictions (number_id) WHERE ended_at IS NULL;

CREATE TABLE IF NOT EXISTS history_events (
  id TEXT PRIMARY KEY,
  number_id TEXT NOT NULL REFERENCES numbers(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  description TEXT NOT NULL,
  previous_value TEXT,
  new_value TEXT,
  metadata TEXT,
  actor_id TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  occurred_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS history_events_number_idx ON history_events (number_id, occurred_at);

-- user_id sem FK de propósito: o log é imutável e precisa continuar apontando
-- para quem fez a ação mesmo depois que o usuário for excluído.
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  previous_data TEXT,
  new_data TEXT,
  metadata TEXT NOT NULL DEFAULT '{}',
  occurred_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_logs_occurred_idx ON audit_logs (occurred_at);

-- O registro de atividades é somente-inserção: nem o próprio backend consegue
-- editar ou apagar uma linha já gravada.
CREATE TRIGGER IF NOT EXISTS audit_logs_no_update BEFORE UPDATE ON audit_logs
BEGIN SELECT RAISE(ABORT, 'audit_logs é somente leitura'); END;
CREATE TRIGGER IF NOT EXISTS audit_logs_no_delete BEFORE DELETE ON audit_logs
BEGIN SELECT RAISE(ABORT, 'audit_logs é somente leitura'); END;
"""


def utc_now() -> str:
    """Timestamp ISO-8601 em UTC no mesmo formato que o frontend gera (toISOString)."""
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def connect(path: Path | None = None) -> sqlite3.Connection:
    conn = sqlite3.connect(path or config.DB_PATH, timeout=10, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 10000")
    return conn


def initialize(path: Path | None = None) -> None:
    config.ensure_data_dir()
    conn = connect(path)
    try:
        conn.execute("PRAGMA journal_mode = WAL")
        conn.executescript(SCHEMA)
        conn.execute(
            "INSERT INTO app_meta(key, value) VALUES ('schema_version', ?) ON CONFLICT(key) DO NOTHING",
            (str(SCHEMA_VERSION),),
        )
    finally:
        conn.close()


@contextmanager
def transaction(conn: sqlite3.Connection) -> Iterator[sqlite3.Connection]:
    """Transação de escrita exclusiva: tudo ou nada."""
    conn.execute("BEGIN IMMEDIATE")
    try:
        yield conn
    except BaseException:
        conn.execute("ROLLBACK")
        raise
    else:
        conn.execute("COMMIT")


def backup_to(destination: Path, path: Path | None = None) -> Path:
    """Cópia consistente do banco (API de backup do SQLite, segura com o servidor rodando)."""
    destination.parent.mkdir(parents=True, exist_ok=True)
    source = connect(path)
    target = sqlite3.connect(destination)
    try:
        source.backup(target)
    finally:
        target.close()
        source.close()
    return destination
