"""Registro de atividades (audit log).

Porta, em Python, as regras das antigas triggers do Postgres: cada escrita feita
pelo backend passa por `entries_for`, que decide quais eventos registrar
comparando a linha antiga com a nova.
"""
from __future__ import annotations

import json
import sqlite3
from typing import Any, Iterable

from .database import utc_now

Row = dict[str, Any] | None
Entry = tuple[str, str, str | None, Row, Row, dict[str, Any]]

ENTITY_BY_TABLE = {
    "numbers": "NUMBER", "campaigns": "CAMPAIGN", "clients": "CLIENT", "squads": "SQUAD",
    "incidents": "INCIDENT", "locations": "LOCATION", "responsibles": "RESPONSIBLE", "profiles": "USER",
}


def _changed(old: dict, new: dict, *fields: str) -> bool:
    return any(old.get(field) != new.get(field) for field in fields)


def _metadata(old: Row, new: Row, **extra: Any) -> dict[str, Any]:
    pick = lambda key: (new or {}).get(key) or (old or {}).get(key)  # noqa: E731
    meta = {
        "source": "server",
        "numberId": pick("number_id") or pick("id"),
        "campaignId": pick("campaign_id"),
        "clientId": pick("client_id"),
        "squadId": pick("squad_id"),
        **extra,
    }
    return {key: value for key, value in meta.items() if value is not None}


def entries_for(table: str, old: Row, new: Row, *, previous_link: Row = None) -> list[Entry]:
    """Eventos de auditoria para uma escrita em `table` (insert: old=None; delete: new=None)."""
    meta = _metadata(old, new)
    out: list[Entry] = []
    add = lambda action, entity, entity_id, before, after, metadata=meta: out.append((action, entity, entity_id, before, after, metadata))  # noqa: E731
    insert, delete = old is None, new is None
    row_id = (new or old or {}).get("id")

    if table == "numbers":
        if insert:
            add("NUMBER_CREATED", "NUMBER", row_id, None, new)
        elif delete:
            add("NUMBER_DELETED", "NUMBER", row_id, old, None)
        else:
            if old["archived_at"] != new["archived_at"]:
                add("NUMBER_RESTORED" if new["archived_at"] is None else "NUMBER_ARCHIVED", "NUMBER", row_id,
                    {"status": old["status"], "archivedAt": old["archived_at"]}, {"status": new["status"], "archivedAt": new["archived_at"]})
            elif old["status"] != new["status"]:
                add("NUMBER_STATUS_CHANGED", "NUMBER", row_id, {"status": old["status"]}, {"status": new["status"]})
            if old["responsible_id"] != new["responsible_id"]:
                add("NUMBER_RESPONSIBLE_CHANGED", "NUMBER", row_id, {"responsibleId": old["responsible_id"]}, {"responsibleId": new["responsible_id"]})
            if old["location_id"] != new["location_id"]:
                add("NUMBER_LOCATION_CHANGED", "NUMBER", row_id, {"locationId": old["location_id"]}, {"locationId": new["location_id"]})
            if old["group_count"] != new["group_count"]:
                add("NUMBER_GROUP_COUNT_CHANGED", "NUMBER", row_id, {"groupCount": old["group_count"]}, {"groupCount": new["group_count"]})
            if _changed(old, new, "phone", "identification", "notes"):
                add("NUMBER_UPDATED", "NUMBER", row_id, old, new)

    elif table == "restrictions":
        number_id = (new or old)["number_id"]
        meta = {**meta, "restrictionId": row_id}
        if insert:
            add("NUMBER_RESTRICTION_ADDED", "NUMBER", number_id, None, new, meta)
        elif not delete:
            if old["ended_at"] is None and new["ended_at"] is not None:
                add("NUMBER_RESTRICTION_REMOVED", "NUMBER", number_id, old, new, meta)
            elif old["ended_at"] is not None and new["ended_at"] is None:
                add("NUMBER_RESTRICTION_ADDED", "NUMBER", number_id, old, new, meta)
            elif _changed(old, new, "kind", "description"):
                add("NUMBER_RESTRICTION_UPDATED", "NUMBER", number_id, old, new, meta)

    elif table in ("number_clients", "number_squads"):
        kind = "CLIENT" if table == "number_clients" else "SQUAD"
        add(f"NUMBER_{kind}_ASSOCIATED" if insert else f"NUMBER_{kind}_REMOVED", "NUMBER", (new or old)["number_id"], old, new)

    elif table == "campaigns":
        if insert:
            add("CAMPAIGN_CREATED", "CAMPAIGN", row_id, None, new)
        elif delete:
            add("CAMPAIGN_DELETED", "CAMPAIGN", row_id, old, None)
        else:
            if old["status"] != new["status"]:
                add("CAMPAIGN_CLOSED" if new["status"] == "CLOSED" else "CAMPAIGN_REACTIVATED", "CAMPAIGN", row_id, old, new)
            if old["responsible_id"] != new["responsible_id"]:
                add("CAMPAIGN_RESPONSIBLE_CHANGED", "CAMPAIGN", row_id, {"responsibleId": old["responsible_id"]}, {"responsibleId": new["responsible_id"]})
            if old["stage"] != new["stage"]:
                add("CAMPAIGN_STAGE_CHANGED", "CAMPAIGN", row_id, {"stage": old["stage"]}, {"stage": new["stage"]})
            if _changed(old, new, "name", "client_id", "squad_id", "notes", "started_at"):
                add("CAMPAIGN_UPDATED", "CAMPAIGN", row_id, old, new)

    elif table == "number_campaign_links":
        number_id = (new or old)["number_id"]
        if insert:
            role_meta = {**meta, "role": new["role"]}
            if previous_link and previous_link["campaign_id"] != new["campaign_id"]:
                add("NUMBER_CAMPAIGN_CHANGED", "NUMBER", number_id, previous_link, new, role_meta)
            elif previous_link and previous_link["role"] != new["role"]:
                add("NUMBER_CAMPAIGN_ROLE_CHANGED", "NUMBER", number_id, previous_link, new, role_meta)
            else:
                add("NUMBER_CAMPAIGN_LINKED", "NUMBER", number_id, None, new, role_meta)
        elif not delete:
            if old["campaign_id"] != new["campaign_id"]:
                add("NUMBER_CAMPAIGN_CHANGED", "NUMBER", number_id, old, new)
            if old["role"] != new["role"]:
                add("NUMBER_CAMPAIGN_ROLE_CHANGED", "NUMBER", number_id, {"role": old["role"]}, {"role": new["role"]})
            if old["ended_at"] is None and new["ended_at"] is not None:
                add("NUMBER_CAMPAIGN_LINK_ENDED", "NUMBER", number_id, old, new)

    elif table == "clients":
        if insert:
            add("CLIENT_CREATED", "CLIENT", row_id, None, new)
        elif delete:
            add("CLIENT_DELETED", "CLIENT", row_id, old, None)
        else:
            if old["squad_id"] != new["squad_id"]:
                add("CLIENT_SQUAD_CHANGED", "CLIENT", row_id, {"squadId": old["squad_id"]}, {"squadId": new["squad_id"]})
            if _changed(old, new, "name", "is_active"):
                add("CLIENT_UPDATED", "CLIENT", row_id, old, new)

    elif table == "squads":
        meta = {**meta, "squadId": row_id}
        if insert:
            add("SQUAD_CREATED", "SQUAD", row_id, None, new, meta)
        elif delete:
            add("SQUAD_DELETED", "SQUAD", row_id, old, None, meta)
        elif _changed(old, new, "name", "is_active"):
            add("SQUAD_UPDATED", "SQUAD", row_id, old, new, meta)

    elif table == "locations":
        if insert:
            add("LOCATION_CREATED", "LOCATION", row_id, None, new)
        elif delete:
            add("LOCATION_DELETED", "LOCATION", row_id, old, None)
        else:
            if old["responsible_id"] != new["responsible_id"]:
                add("LOCATION_RESPONSIBLE_CHANGED", "LOCATION", row_id, {"responsibleId": old["responsible_id"]}, {"responsibleId": new["responsible_id"]})
            if _changed(old, new, "name", "is_active"):
                add("LOCATION_UPDATED", "LOCATION", row_id, old, new)

    elif table == "responsibles":
        if insert:
            add("RESPONSIBLE_CREATED", "RESPONSIBLE", row_id, None, new)
        elif delete:
            add("RESPONSIBLE_DELETED", "RESPONSIBLE", row_id, old, None)
        else:
            if _changed(old, new, "team", "squad_id"):
                add("RESPONSIBLE_TEAM_CHANGED", "RESPONSIBLE", row_id, {"team": old["team"], "squadId": old["squad_id"]}, {"team": new["team"], "squadId": new["squad_id"]})
            if _changed(old, new, "name", "is_active"):
                add("RESPONSIBLE_UPDATED", "RESPONSIBLE", row_id, old, new)

    elif table == "incidents":
        if insert:
            add("INCIDENT_CREATED", "INCIDENT", row_id, None, new)
        elif delete:
            add("INCIDENT_DELETED", "INCIDENT", row_id, old, None)
        else:
            if old["status"] != new["status"]:
                add("INCIDENT_RESOLVED" if new["status"] == "RESOLVED" else "INCIDENT_REOPENED", "INCIDENT", row_id, {"status": old["status"]}, {"status": new["status"]})
            if _changed(old, new, "title", "description", "responsible_id", "resolution_notes", "resolved_by_id"):
                add("INCIDENT_UPDATED", "INCIDENT", row_id, old, new)

    elif table == "profiles":
        public = lambda row: {k: v for k, v in (row or {}).items() if k not in ("email", "password_hash", "cpf_hash")} or None  # noqa: E731
        if insert:
            add("PROFILE_CREATED", "USER", row_id, None, public(new))
        elif delete:
            add("PROFILE_DELETED", "USER", row_id, public(old), None)
        else:
            if _changed(old, new, "name", "email"):
                add("PROFILE_UPDATED", "USER", row_id, public(old), public(new))
            if old["job_title"] != new["job_title"]:
                add("PROFILE_JOB_TITLE_CHANGED", "USER", row_id, {"jobTitle": old["job_title"]}, {"jobTitle": new["job_title"]})
            if old["squad_id"] != new["squad_id"]:
                add("PROFILE_SQUAD_CHANGED", "USER", row_id, {"squadId": old["squad_id"]}, {"squadId": new["squad_id"]})
            if old["status"] != new["status"]:
                add("PROFILE_STATUS_CHANGED", "USER", row_id, {"status": old["status"]}, {"status": new["status"]})
            if old["access_level"] != new["access_level"]:
                add("PROFILE_ACCESS_LEVEL_CHANGED", "USER", row_id, {"accessLevel": old["access_level"]}, {"accessLevel": new["access_level"]})
            if old["password_hash"] != new["password_hash"]:
                add("PROFILE_PASSWORD_CHANGED", "USER", row_id, None, None, {**meta, "forced": bool(new.get("must_change_password"))})
    return out


def write(conn: sqlite3.Connection, user_id: str | None, entries: Iterable[Entry]) -> None:
    occurred_at = utc_now()
    for action, entity_type, entity_id, previous, new, metadata in entries:
        conn.execute(
            "INSERT INTO audit_logs(user_id, action, entity_type, entity_id, previous_data, new_data, metadata, occurred_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (user_id, action, entity_type, entity_id, _json(previous), _json(new), json.dumps(metadata or {}, ensure_ascii=False), occurred_at),
        )


def record(conn: sqlite3.Connection, user_id: str | None, table: str, old: Row, new: Row, **kwargs: Any) -> None:
    write(conn, user_id, entries_for(table, old, new, **kwargs))


def _json(value: Any) -> str | None:
    return None if value is None else json.dumps(value, ensure_ascii=False, default=str)
