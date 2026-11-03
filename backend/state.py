"""Estado operacional (números, campanhas, diretórios, ocorrências e histórico).

O frontend trabalha com um "estado" em memória (camelCase) e envia para cá só
as linhas que mudaram. Este módulo é a fronteira de confiança: valida cada
campo, aplica as permissões por nível de acesso e grava tudo numa transação
única, registrando a auditoria. Nada que o navegador mande é aceito sem passar
por aqui.
"""
from __future__ import annotations

import json
import re
import sqlite3
from datetime import datetime
from typing import Any, Callable

from . import audit
from .database import transaction, utc_now
from .errors import Conflict, Forbidden, NotFound, ValidationError
from .security import new_id

ADMIN_PLUS = {"MASTER", "ADMIN"}
OPERATORS = {"MASTER", "ADMIN", "USER"}

NUMBER_STATUSES = {"ACTIVE", "WARMING", "UNDER_REVIEW", "BLOCKED", "INACTIVE"}
CAMPAIGN_STATUSES = {"ACTIVE", "CLOSED"}
CAMPAIGN_STAGES = {"PLANEJAMENTO", "EM_ANDAMENTO"}
CAMPAIGN_ROLES = {"PRIMARY", "BACKUP", "SUPPORT"}
INCIDENT_TYPES = {"RESTRICTION", "FALL", "BLOCK", "CHIP_ISSUE", "DEVICE_ISSUE", "OTHER"}
INCIDENT_STATUSES = {"OPEN", "RESOLVED"}
RESTRICTION_KINDS = {"GROUP_CREATION", "SEND_LIMIT", "NO_AREA", "OTHER"}
BLOCKING_RESTRICTIONS = {"NO_AREA"}

MAX_ITEMS_PER_SYNC = 5000
ID_RE = re.compile(r"^[A-Za-z0-9_.:-]{1,100}$")
PHONE_RE = re.compile(r"^55[0-9]{10,11}$")


# --------------------------------------------------------------------------
# Validação de campos
# --------------------------------------------------------------------------

def _obj(value: Any, label: str) -> dict:
    if not isinstance(value, dict):
        raise ValidationError(f"{label}: registro inválido.")
    return value


def _id(value: Any, label: str, *, required: bool = True) -> str | None:
    if value in (None, ""):
        if required:
            raise ValidationError(f"{label}: identificador ausente.")
        return None
    if not isinstance(value, str) or not ID_RE.match(value):
        raise ValidationError(f"{label}: identificador inválido.")
    return value


def _text(value: Any, label: str, *, max_len: int = 2000, required: bool = False) -> str:
    if value is None:
        value = ""
    if not isinstance(value, str):
        raise ValidationError(f"{label}: texto inválido.")
    value = value.strip()
    if required and not value:
        raise ValidationError(f"{label}: campo obrigatório.")
    if len(value) > max_len:
        raise ValidationError(f"{label}: texto muito longo (máximo {max_len} caracteres).")
    return value


def _timestamp(value: Any, label: str, *, required: bool = True) -> str | None:
    if value in (None, ""):
        if required:
            raise ValidationError(f"{label}: data ausente.")
        return None
    if not isinstance(value, str) or len(value) > 40:
        raise ValidationError(f"{label}: data inválida.")
    try:
        datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValidationError(f"{label}: data inválida.") from exc
    return value


def _choice(value: Any, allowed: set[str], label: str) -> str:
    if value not in allowed:
        raise ValidationError(f"{label}: valor inválido.")
    return value


def _bool(value: Any) -> int:
    return 1 if value is True or value == 1 else 0


def _json_text(value: Any, label: str) -> str | None:
    if value is None:
        return None
    encoded = json.dumps(value, ensure_ascii=False)
    if len(encoded) > 20_000:
        raise ValidationError(f"{label}: conteúdo muito grande.")
    return encoded


def _id_list(value: Any, label: str) -> list[str]:
    if value is None:
        return []
    if not isinstance(value, list) or len(value) > 500:
        raise ValidationError(f"{label}: lista inválida.")
    return list(dict.fromkeys(_id(item, label) for item in value))


# --------------------------------------------------------------------------
# camelCase (frontend) -> linhas do banco
# --------------------------------------------------------------------------

def _named(item: dict, label: str) -> dict:
    return {
        "id": _id(item.get("id"), label),
        "name": _text(item.get("name"), f"{label} (nome)", max_len=120, required=True),
        "is_active": _bool(item.get("isActive", True)),
        "created_at": _timestamp(item.get("createdAt"), label),
        "updated_at": _timestamp(item.get("updatedAt"), label),
    }


def map_squad(item: dict) -> dict:
    return _named(_obj(item, "Squad"), "Squad")


def map_client(item: dict) -> dict:
    item = _obj(item, "Cliente")
    return {**_named(item, "Cliente"), "squad_id": _id(item.get("squadId"), "Cliente (squad)", required=False)}


def map_responsible(item: dict) -> dict:
    item = _obj(item, "Colaborador")
    return {
        **_named(item, "Colaborador"),
        "team": _text(item.get("team"), "Colaborador (equipe)", max_len=120),
        "squad_id": _id(item.get("squadId"), "Colaborador (squad)", required=False),
    }


def map_location(item: dict) -> dict:
    item = _obj(item, "Localização")
    return {**_named(item, "Localização"), "responsible_id": _id(item.get("responsibleId"), "Localização (colaborador)", required=False)}


def map_number(item: dict) -> dict:
    item = _obj(item, "Número")
    phone = item.get("phone")
    if not isinstance(phone, str) or not PHONE_RE.match(phone):
        raise ValidationError("Número: informe um telefone brasileiro com 55, DDD e 8 ou 9 dígitos.")
    group_count = item.get("groupCount", 0)
    if not isinstance(group_count, int) or isinstance(group_count, bool) or group_count < 0 or group_count > 100_000:
        raise ValidationError("Número: a quantidade de grupos deve ser um inteiro maior ou igual a zero.")
    status = _choice(item.get("status"), NUMBER_STATUSES, "Número (status)")
    archived_at = _timestamp(item.get("archivedAt"), "Número (arquivamento)", required=False)
    if status == "INACTIVE" and not archived_at:
        # Regra de negócio: chip inativo é arquivado automaticamente.
        archived_at = utc_now()
    return {
        "id": _id(item.get("id"), "Número"),
        "phone": phone,
        "identification": _text(item.get("identification"), "Número (identificação)", max_len=120),
        "status": status,
        "location_id": _id(item.get("locationId"), "Número (localização)", required=False),
        "responsible_id": _id(item.get("responsibleId"), "Número (colaborador)", required=False),
        "group_count": group_count,
        "notes": _text(item.get("notes"), "Número (observações)", max_len=5000),
        "archived_at": archived_at,
        "created_at": _timestamp(item.get("createdAt"), "Número"),
        "updated_at": _timestamp(item.get("updatedAt"), "Número"),
    }


def map_restriction(value: Any) -> dict | None:
    if value is None:
        return None
    value = _obj(value, "Restrição")
    kind = _choice(value.get("kind"), RESTRICTION_KINDS, "Restrição (tipo)")
    description = _text(value.get("description"), "Restrição (descrição)", max_len=500)
    if kind == "OTHER" and not description:
        raise ValidationError("Restrição: descreva a outra restrição.")
    return {"kind": kind, "description": description, "recorded_at": _timestamp(value.get("recordedAt"), "Restrição")}


def map_campaign(item: dict) -> dict:
    item = _obj(item, "Campanha")
    status = _choice(item.get("status"), CAMPAIGN_STATUSES, "Campanha (status)")
    ended_at = _timestamp(item.get("endedAt"), "Campanha (encerramento)", required=False)
    if status == "ACTIVE":
        ended_at = None
    elif not ended_at:
        raise ValidationError("Campanha: campanha encerrada precisa da data de encerramento.")
    return {
        "id": _id(item.get("id"), "Campanha"),
        "name": _text(item.get("name"), "Campanha (nome)", max_len=160, required=True),
        "client_id": _id(item.get("clientId"), "Campanha (cliente)"),
        "squad_id": _id(item.get("squadId"), "Campanha (squad)"),
        "responsible_id": _id(item.get("responsibleId"), "Campanha (responsável)", required=False),
        "notes": _text(item.get("notes"), "Campanha (observações)", max_len=5000),
        "status": status,
        "stage": _choice(item.get("stage") or "PLANEJAMENTO", CAMPAIGN_STAGES, "Campanha (etapa)"),
        "started_at": _timestamp(item.get("startedAt"), "Campanha (início)"),
        "ended_at": ended_at,
        "created_at": _timestamp(item.get("createdAt"), "Campanha"),
        "updated_at": _timestamp(item.get("updatedAt"), "Campanha"),
    }


def map_link(item: dict) -> dict:
    item = _obj(item, "Vínculo")
    return {
        "id": _id(item.get("id"), "Vínculo"),
        "number_id": _id(item.get("numberId"), "Vínculo (número)"),
        "campaign_id": _id(item.get("campaignId"), "Vínculo (campanha)"),
        "role": _choice(item.get("role"), CAMPAIGN_ROLES, "Vínculo (papel)"),
        "started_at": _timestamp(item.get("startedAt"), "Vínculo (início)"),
        "ended_at": _timestamp(item.get("endedAt"), "Vínculo (fim)", required=False),
        "created_at": _timestamp(item.get("createdAt"), "Vínculo"),
        "updated_at": _timestamp(item.get("updatedAt"), "Vínculo"),
    }


def map_incident(item: dict) -> dict:
    item = _obj(item, "Ocorrência")
    status = _choice(item.get("status"), INCIDENT_STATUSES, "Ocorrência (status)")
    return {
        "id": _id(item.get("id"), "Ocorrência"),
        "number_id": _id(item.get("numberId"), "Ocorrência (número)"),
        "type": _choice(item.get("type"), INCIDENT_TYPES, "Ocorrência (tipo)"),
        "title": _text(item.get("title"), "Ocorrência (título)", max_len=200, required=True),
        "description": _text(item.get("description"), "Ocorrência (descrição)", max_len=5000),
        "status": status,
        "responsible_id": _id(item.get("responsibleId"), "Ocorrência (responsável)", required=False),
        "resolution_notes": _text(item.get("resolutionNotes"), "Ocorrência (resolução)", max_len=5000),
        "resolved_by_id": _id(item.get("resolvedById"), "Ocorrência (resolvida por)", required=False),
        "resolved_at": _timestamp(item.get("resolvedAt"), "Ocorrência (resolução)", required=False) if status == "RESOLVED" else None,
        "created_at": _timestamp(item.get("createdAt"), "Ocorrência"),
        "updated_at": _timestamp(item.get("updatedAt"), "Ocorrência"),
    }


def map_history(item: dict) -> dict:
    item = _obj(item, "Histórico")
    return {
        "id": _id(item.get("id"), "Histórico"),
        "number_id": _id(item.get("numberId"), "Histórico (número)"),
        "type": _text(item.get("type"), "Histórico (tipo)", max_len=80, required=True),
        "description": _text(item.get("description"), "Histórico (descrição)", max_len=500, required=True),
        "previous_value": _json_text(item.get("previousValue"), "Histórico"),
        "new_value": _json_text(item.get("newValue"), "Histórico"),
        "metadata": _json_text(item.get("metadata"), "Histórico"),
        "occurred_at": _timestamp(item.get("occurredAt"), "Histórico"),
    }


# (chave no estado do frontend, tabela, quem pode escrever, conversor)
COLLECTIONS: list[tuple[str, str, set[str], Callable[[dict], dict]]] = [
    ("groups", "squads", ADMIN_PLUS, map_squad),
    ("clients", "clients", ADMIN_PLUS, map_client),
    ("responsibles", "responsibles", ADMIN_PLUS, map_responsible),
    ("locations", "locations", ADMIN_PLUS, map_location),
    ("numbers", "numbers", OPERATORS, map_number),
    ("campaigns", "campaigns", OPERATORS, map_campaign),
    ("numberCampaignLinks", "number_campaign_links", OPERATORS, map_link),
    ("incidents", "incidents", OPERATORS, map_incident),
    ("historyEvents", "history_events", OPERATORS, map_history),
]
COLLECTION_LABELS = {
    "groups": "Squads", "clients": "Clientes", "responsibles": "Colaboradores", "locations": "Localizações",
    "numbers": "Números", "campaigns": "Campanhas", "numberCampaignLinks": "Vínculos", "incidents": "Ocorrências",
    "historyEvents": "Histórico",
}


# --------------------------------------------------------------------------
# Leitura
# --------------------------------------------------------------------------

def _rows(conn: sqlite3.Connection, sql: str, params: tuple = ()) -> list[dict]:
    return [dict(row) for row in conn.execute(sql, params)]


def _loads(value: str | None) -> Any:
    return None if value is None else json.loads(value)


def load_state(conn: sqlite3.Connection) -> dict:
    clients_by_number: dict[str, list[str]] = {}
    for row in conn.execute("SELECT number_id, client_id FROM number_clients"):
        clients_by_number.setdefault(row["number_id"], []).append(row["client_id"])
    squads_by_number: dict[str, list[str]] = {}
    for row in conn.execute("SELECT number_id, squad_id FROM number_squads"):
        squads_by_number.setdefault(row["number_id"], []).append(row["squad_id"])
    restrictions = {row["number_id"]: row for row in _rows(conn, "SELECT * FROM restrictions WHERE ended_at IS NULL")}

    named = lambda row: {"id": row["id"], "name": row["name"], "isActive": bool(row["is_active"]), "createdAt": row["created_at"], "updatedAt": row["updated_at"]}  # noqa: E731

    def number(row: dict) -> dict:
        restriction = restrictions.get(row["id"])
        return {
            "id": row["id"], "phone": row["phone"], "identification": row["identification"], "status": row["status"],
            "locationId": row["location_id"], "responsibleId": row["responsible_id"],
            "clientIds": clients_by_number.get(row["id"], []), "groupIds": squads_by_number.get(row["id"], []),
            "groupCount": row["group_count"], "notes": row["notes"],
            "restriction": {"kind": restriction["kind"], "description": restriction["description"], "recordedAt": restriction["recorded_at"]} if restriction else None,
            "archivedAt": row["archived_at"], "createdAt": row["created_at"], "updatedAt": row["updated_at"],
        }

    return {
        "schemaVersion": 2,
        "meta": {"seedApplied": True, "source": "server"},
        "groups": [named(row) for row in _rows(conn, "SELECT * FROM squads ORDER BY name")],
        "clients": [{**named(row), "squadId": row["squad_id"]} for row in _rows(conn, "SELECT * FROM clients ORDER BY name")],
        "responsibles": [{**named(row), "team": row["team"], "squadId": row["squad_id"]} for row in _rows(conn, "SELECT * FROM responsibles ORDER BY name")],
        "locations": [{**named(row), "responsibleId": row["responsible_id"]} for row in _rows(conn, "SELECT * FROM locations ORDER BY name")],
        "numbers": [number(row) for row in _rows(conn, "SELECT * FROM numbers ORDER BY created_at")],
        "campaigns": [
            {"id": row["id"], "name": row["name"], "clientId": row["client_id"], "squadId": row["squad_id"], "responsibleId": row["responsible_id"],
             "notes": row["notes"], "status": row["status"], "stage": row["stage"], "startedAt": row["started_at"], "endedAt": row["ended_at"],
             "createdAt": row["created_at"], "updatedAt": row["updated_at"]}
            for row in _rows(conn, "SELECT * FROM campaigns ORDER BY created_at")
        ],
        "numberCampaignLinks": [
            {"id": row["id"], "numberId": row["number_id"], "campaignId": row["campaign_id"], "role": row["role"], "startedAt": row["started_at"],
             "endedAt": row["ended_at"], "createdAt": row["created_at"], "updatedAt": row["updated_at"]}
            for row in _rows(conn, "SELECT * FROM number_campaign_links ORDER BY started_at")
        ],
        "incidents": [
            {"id": row["id"], "numberId": row["number_id"], "type": row["type"], "title": row["title"], "description": row["description"],
             "status": row["status"], "responsibleId": row["responsible_id"], "resolutionNotes": row["resolution_notes"],
             "resolvedById": row["resolved_by_id"], "resolvedAt": row["resolved_at"], "createdAt": row["created_at"], "updatedAt": row["updated_at"]}
            for row in _rows(conn, "SELECT * FROM incidents ORDER BY created_at")
        ],
        "historyEvents": [
            {"id": row["id"], "numberId": row["number_id"], "type": row["type"], "description": row["description"],
             "previousValue": _loads(row["previous_value"]), "newValue": _loads(row["new_value"]), "metadata": _loads(row["metadata"]),
             "occurredAt": row["occurred_at"]}
            for row in _rows(conn, "SELECT * FROM history_events ORDER BY occurred_at")
        ],
    }


# --------------------------------------------------------------------------
# Escrita
# --------------------------------------------------------------------------

class _Writer:
    """Aplica linhas validadas dentro de uma transação aberta."""

    def __init__(self, conn: sqlite3.Connection, profile: dict, *, audited: bool = True):
        self.conn = conn
        self.profile = profile
        self.audited = audited
        self.user_id = profile["id"]

    def log(self, table: str, old: dict | None, new: dict | None, **kwargs: Any) -> None:
        if self.audited:
            audit.record(self.conn, self.user_id, table, old, new, **kwargs)

    def get(self, table: str, row_id: str) -> dict | None:
        row = self.conn.execute(f"SELECT * FROM {table} WHERE id = ?", (row_id,)).fetchone()
        return dict(row) if row else None

    def upsert(self, table: str, row: dict, allowed: set[str], label: str) -> tuple[dict | None, bool]:
        old = self.get(table, row["id"])
        if old is not None and all(old.get(key) == value for key, value in row.items()):
            return old, False
        if self.profile["access_level"] not in allowed:
            raise Forbidden(f"Seu nível de acesso não permite alterar {label}.")
        self._check_rules(table, row, old)
        columns = list(row)
        try:
            if old is None:
                self.conn.execute(
                    f"INSERT INTO {table} ({', '.join(columns)}) VALUES ({', '.join('?' for _ in columns)})",
                    [row[column] for column in columns],
                )
                if table == "number_campaign_links":
                    self.log(table, None, row, previous_link=self._previous_link(row))
                else:
                    self.log(table, None, row)
            else:
                updates = [column for column in columns if column not in ("id", "created_at")]
                self.conn.execute(
                    f"UPDATE {table} SET {', '.join(f'{column} = ?' for column in updates)} WHERE id = ?",
                    [row[column] for column in updates] + [row["id"]],
                )
                self.log(table, old, {**old, **row})
        except sqlite3.IntegrityError as exc:
            raise _integrity_error(table, exc) from exc
        return old, True

    def _previous_link(self, row: dict) -> dict | None:
        previous = self.conn.execute(
            "SELECT * FROM number_campaign_links WHERE number_id = ? AND id <> ? AND ended_at IS NOT NULL ORDER BY ended_at DESC LIMIT 1",
            (row["number_id"], row["id"]),
        ).fetchone()
        return dict(previous) if previous else None

    def _check_rules(self, table: str, row: dict, old: dict | None) -> None:
        if table == "campaigns":
            client = self.get("clients", row["client_id"])
            if not client:
                raise ValidationError("Campanha: cliente inexistente.")
            if client["squad_id"] and client["squad_id"] != row["squad_id"]:
                raise ValidationError("O Cliente deve pertencer ao Squad selecionado.")
        elif table == "number_campaign_links" and row["ended_at"] is None and (old is None or old["ended_at"] is not None):
            campaign = self.get("campaigns", row["campaign_id"])
            number = self.get("numbers", row["number_id"])
            if not campaign or campaign["status"] != "ACTIVE":
                raise ValidationError("Selecione uma campanha ativa.")
            if not number or number["archived_at"]:
                raise ValidationError("Números arquivados não podem ser vinculados a campanhas.")
            restriction = self.active_restriction(row["number_id"])
            if restriction and restriction["kind"] in BLOCKING_RESTRICTIONS:
                raise ValidationError("Este número possui uma restrição operacional ativa (Sem área) e não pode ser vinculado a uma nova campanha.")
        elif table == "history_events" and old is not None:
            # Histórico é imutável: um evento já gravado nunca é reescrito.
            raise Forbidden("Eventos de histórico não podem ser alterados.")

    def active_restriction(self, number_id: str) -> dict | None:
        row = self.conn.execute("SELECT * FROM restrictions WHERE number_id = ? AND ended_at IS NULL", (number_id,)).fetchone()
        return dict(row) if row else None

    def sync_joins(self, number_id: str, table: str, column: str, desired: list[str]) -> None:
        current = {row[0] for row in self.conn.execute(f"SELECT {column} FROM {table} WHERE number_id = ?", (number_id,))}
        wanted = set(desired)
        try:
            for target in current - wanted:
                self.conn.execute(f"DELETE FROM {table} WHERE number_id = ? AND {column} = ?", (number_id, target))
                self.log(table, {"number_id": number_id, column: target}, None)
            for target in desired:
                if target not in current:
                    self.conn.execute(f"INSERT INTO {table} (number_id, {column}) VALUES (?, ?)", (number_id, target))
                    self.log(table, None, {"number_id": number_id, column: target})
        except sqlite3.IntegrityError as exc:
            raise ValidationError("Número: cliente ou squad associado não existe.") from exc

    def sync_restriction(self, number_id: str, desired: dict | None) -> None:
        active = self.active_restriction(number_id)
        timestamp = utc_now()
        if active and desired is None:
            ended = {**active, "ended_at": timestamp, "updated_at": timestamp}
            self.conn.execute("UPDATE restrictions SET ended_at = ?, updated_at = ? WHERE id = ?", (timestamp, timestamp, active["id"]))
            self.log("restrictions", active, ended)
        elif desired and not active:
            row = {"id": new_id("restriction"), "number_id": number_id, **desired, "ended_at": None, "created_at": timestamp, "updated_at": timestamp}
            self.conn.execute(
                "INSERT INTO restrictions (id, number_id, kind, description, recorded_at, ended_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                [row[key] for key in ("id", "number_id", "kind", "description", "recorded_at", "ended_at", "created_at", "updated_at")],
            )
            self.log("restrictions", None, row)
        elif desired and active and any(active[key] != desired[key] for key in desired):
            updated = {**active, **desired, "updated_at": timestamp}
            self.conn.execute(
                "UPDATE restrictions SET kind = ?, description = ?, recorded_at = ?, updated_at = ? WHERE id = ?",
                (desired["kind"], desired["description"], desired["recorded_at"], timestamp, active["id"]),
            )
            self.log("restrictions", active, updated)

    def enforce_invariants(self) -> None:
        """Número arquivado ou campanha encerrada não ficam com vínculo ativo."""
        timestamp = utc_now()
        stale = _rows(self.conn, """
            SELECT l.* FROM number_campaign_links l
            JOIN numbers n ON n.id = l.number_id
            JOIN campaigns c ON c.id = l.campaign_id
            WHERE l.ended_at IS NULL AND (n.archived_at IS NOT NULL OR c.status = 'CLOSED')
        """)
        for link in stale:
            ended_at = max(timestamp, link["started_at"])
            self.conn.execute("UPDATE number_campaign_links SET ended_at = ?, updated_at = ? WHERE id = ?", (ended_at, timestamp, link["id"]))
            self.log("number_campaign_links", link, {**link, "ended_at": ended_at, "updated_at": timestamp})


def _integrity_error(table: str, exc: sqlite3.IntegrityError) -> ValidationError:
    message = str(exc)
    if "numbers.phone" in message:
        return Conflict("Este telefone já está cadastrado.")
    if "number_campaign_links_active_pair" in message or "number_campaign_links.number_id, number_campaign_links.campaign_id" in message:
        return Conflict("Este número já está ativo nesta campanha.")
    if "FOREIGN KEY" in message:
        return ValidationError("Um registro referencia outro que não existe (ou que ainda está em uso).")
    return ValidationError(f"Dados inválidos para {table}.")


def _apply(writer: _Writer, payload: dict) -> int:
    total = sum(len(payload.get(key) or []) for key, *_ in COLLECTIONS)
    if total > MAX_ITEMS_PER_SYNC:
        raise ValidationError("Alterações demais em uma única gravação.")
    applied = 0
    for key, table, allowed, mapper in COLLECTIONS:
        items = payload.get(key) or []
        if not isinstance(items, list):
            raise ValidationError(f"{COLLECTION_LABELS[key]}: lista inválida.")
        for item in items:
            row = mapper(item)
            if table == "history_events":
                if writer.get(table, row["id"]):
                    continue  # imutável: reenvio do mesmo evento é ignorado
                if writer.profile["access_level"] not in allowed:
                    raise Forbidden("Seu nível de acesso não permite registrar histórico.")
                try:
                    writer.conn.execute(
                        "INSERT INTO history_events (id, number_id, type, description, previous_value, new_value, metadata, actor_id, occurred_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                        (row["id"], row["number_id"], row["type"], row["description"], row["previous_value"], row["new_value"], row["metadata"], writer.user_id, row["occurred_at"]),
                    )
                except sqlite3.IntegrityError as exc:
                    raise ValidationError("Histórico referencia um número inexistente.") from exc
                applied += 1
                continue
            _, changed = writer.upsert(table, row, allowed, COLLECTION_LABELS[key])
            applied += int(changed)
            if table == "numbers":
                client_ids = _id_list(item.get("clientIds"), "Número (clientes)")
                squad_ids = _id_list(item.get("groupIds"), "Número (squads)")
                restriction = map_restriction(item.get("restriction"))
                needs_write = changed or _joins_differ(writer, row["id"], client_ids, squad_ids) or _restriction_differs(writer, row["id"], restriction)
                if needs_write and writer.profile["access_level"] not in allowed:
                    raise Forbidden("Seu nível de acesso não permite alterar Números.")
                writer.sync_joins(row["id"], "number_clients", "client_id", client_ids)
                writer.sync_joins(row["id"], "number_squads", "squad_id", squad_ids)
                writer.sync_restriction(row["id"], restriction)
    writer.enforce_invariants()
    return applied


def _joins_differ(writer: _Writer, number_id: str, client_ids: list[str], squad_ids: list[str]) -> bool:
    current_clients = {row[0] for row in writer.conn.execute("SELECT client_id FROM number_clients WHERE number_id = ?", (number_id,))}
    current_squads = {row[0] for row in writer.conn.execute("SELECT squad_id FROM number_squads WHERE number_id = ?", (number_id,))}
    return current_clients != set(client_ids) or current_squads != set(squad_ids)


def _restriction_differs(writer: _Writer, number_id: str, desired: dict | None) -> bool:
    active = writer.active_restriction(number_id)
    if not active or not desired:
        return bool(active) != bool(desired)
    return any(active[key] != desired[key] for key in desired)


def sync(conn: sqlite3.Connection, profile: dict, payload: Any) -> int:
    if not isinstance(payload, dict):
        raise ValidationError("Formato de alterações inválido.")
    if profile["access_level"] not in OPERATORS:
        raise Forbidden("Seu nível de acesso é somente leitura.")
    with transaction(conn):
        return _apply(_Writer(conn, profile), payload)


# --------------------------------------------------------------------------
# Exclusão definitiva (somente MASTER)
# --------------------------------------------------------------------------

HARD_DELETE = {
    # coleção do frontend: (tabela, [(sql que conta bloqueios, rótulo)])
    "numbers": ("numbers", [
        ("SELECT count(*) FROM number_campaign_links WHERE number_id = ?", "vínculo(s) de campanha"),
        ("SELECT count(*) FROM incidents WHERE number_id = ?", "ocorrência(s)"),
    ]),
    "clients": ("clients", [("SELECT count(*) FROM campaigns WHERE client_id = ?", "campanha(s)")]),
    "groups": ("squads", [("SELECT count(*) FROM campaigns WHERE squad_id = ?", "campanha(s)")]),
    "responsibles": ("responsibles", []),
    "locations": ("locations", []),
    "campaigns": ("campaigns", [("SELECT count(*) FROM number_campaign_links WHERE campaign_id = ?", "vínculo(s) de número")]),
}


def hard_delete(conn: sqlite3.Connection, profile: dict, collection: str, row_id: str) -> None:
    if profile["access_level"] != "MASTER":
        raise Forbidden("Somente MASTER pode excluir registros definitivamente.")
    if collection not in HARD_DELETE:
        raise NotFound("Tipo de registro desconhecido.")
    _id(row_id, "Registro")
    table, blockers = HARD_DELETE[collection]
    with transaction(conn):
        writer = _Writer(conn, profile)
        existing = writer.get(table, row_id)
        if not existing:
            raise NotFound("Registro não encontrado.")
        found = [f"{count} {label}" for sql, label in blockers if (count := conn.execute(sql, (row_id,)).fetchone()[0])]
        if found:
            raise Conflict(f"Não é possível excluir definitivamente: {', '.join(found)}. Arquive o registro ou remova as referências antes.")
        conn.execute(f"DELETE FROM {table} WHERE id = ?", (row_id,))
        writer.log(table, existing, None)


# --------------------------------------------------------------------------
# Restauração de backup (somente MASTER)
# --------------------------------------------------------------------------

WIPE_ORDER = ["number_campaign_links", "incidents", "history_events", "restrictions", "number_clients", "number_squads", "campaigns", "numbers", "locations", "responsibles", "clients"]


def replace_all(conn: sqlite3.Connection, profile: dict, state: Any) -> dict:
    if profile["access_level"] != "MASTER":
        raise Forbidden("Somente MASTER pode restaurar um backup.")
    if not isinstance(state, dict):
        raise ValidationError("Backup inválido.")
    with transaction(conn):
        for table in WIPE_ORDER:
            conn.execute(f"DELETE FROM {table}")
        keep = [_id(item.get("id"), "Squad") for item in state.get("groups") or [] if isinstance(item, dict)]
        conn.execute(f"DELETE FROM squads WHERE id NOT IN ({', '.join('?' for _ in keep)})", keep) if keep else conn.execute("DELETE FROM squads")
        writer = _Writer(conn, profile, audited=False)
        _apply(writer, state)
        summary = {key: len(state.get(key) or []) for key, *_ in COLLECTIONS}
        audit.write(conn, profile["id"], [("BACKUP_RESTORED", "SYSTEM", None, None, None, {"source": "server", **summary})])
    return summary
