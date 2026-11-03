"""Dados de demonstração 100% fictícios (para apresentar o fluxo operacional).

Só são inseridos quando a base operacional está vazia, passando pelas mesmas
validações da API. Telefones usam o prefixo 55 11 90000-xxxx, sem relação com
números reais.
"""
from __future__ import annotations

import sqlite3
from datetime import datetime, timedelta, timezone

from . import state
from .database import transaction

SQUADS = ["Equipe Alfa", "Equipe Beta", "Equipe Gama"]
CLIENTS = [("Empresa Exemplo A", 0), ("Comércio Modelo B", 0), ("Loja Fictícia C", 1), ("Serviços Demonstração D", 2)]
RESPONSIBLES = [("Ana Souza", 0), ("Bruno Lima", 1), ("Carla Mendes", 2), ("Diego Rocha", 0)]
LOCATIONS = [("Aparelho 01", 0), ("Aparelho 02", 1), ("Aparelho 03", 2), ("Estoque", None)]
# (telefone, identificação, status, localização, colaborador, clientes, grupos)
NUMBERS = [
    ("5511900000101", "Chip 01", "ACTIVE", 0, 0, [0], 12),
    ("5511900000102", "Chip 02", "ACTIVE", 0, 0, [0, 1], 8),
    ("5511900000103", "Chip 03", "WARMING", 1, 1, [], 0),
    ("5511900000104", "Chip 04", "ACTIVE", 1, 1, [2], 5),
    ("5511900000105", "Chip 05", "UNDER_REVIEW", 2, 2, [], 3),
    ("5511900000106", "Chip 06", "BLOCKED", 2, 2, [3], 0),
    ("5511900000107", "Chip 07", "ACTIVE", 3, 3, [], 0),
    ("5511900000108", "Chip 08", "INACTIVE", 3, None, [], 0),
]


def _iso(moment: datetime) -> str:
    return moment.isoformat(timespec="milliseconds").replace("+00:00", "Z")


def is_operational_base_empty(conn: sqlite3.Connection) -> bool:
    return all(conn.execute(f"SELECT 1 FROM {table} LIMIT 1").fetchone() is None for table in ("squads", "clients", "numbers", "campaigns"))


def build_payload() -> dict:
    start = datetime.now(timezone.utc) - timedelta(days=14)
    at = lambda days: _iso(start + timedelta(days=days))  # noqa: E731
    base = lambda prefix, index, days=0: {"id": f"{prefix}_demo_{index + 1:02d}", "isActive": True, "createdAt": at(days), "updatedAt": at(days)}  # noqa: E731

    groups = [{**base("group", i), "name": name} for i, name in enumerate(SQUADS)]
    clients = [{**base("client", i), "name": name, "squadId": groups[squad]["id"]} for i, (name, squad) in enumerate(CLIENTS)]
    responsibles = [{**base("responsible", i), "name": name, "team": SQUADS[squad], "squadId": groups[squad]["id"]} for i, (name, squad) in enumerate(RESPONSIBLES)]
    locations = [{**base("location", i), "name": name, "responsibleId": responsibles[owner]["id"] if owner is not None else None} for i, (name, owner) in enumerate(LOCATIONS)]

    numbers, history = [], []
    for i, (phone, ident, status, location, responsible, client_idx, group_count) in enumerate(NUMBERS):
        number = {
            **base("number", i, 1), "phone": phone, "identification": ident, "status": status,
            "locationId": locations[location]["id"], "responsibleId": responsibles[responsible]["id"] if responsible is not None else None,
            "clientIds": [clients[c]["id"] for c in client_idx], "groupIds": sorted({clients[c]["squadId"] for c in client_idx}),
            "groupCount": group_count, "notes": "Registro fictício para demonstração.", "restriction": None,
            "archivedAt": at(10) if status == "INACTIVE" else None,
        }
        numbers.append(number)
        history.append({"id": f"history_demo_{i + 1:02d}", "numberId": number["id"], "type": "NUMBER_CREATED", "description": "Número cadastrado.",
                        "previousValue": None, "newValue": None, "metadata": {"source": "demo"}, "occurredAt": at(1)})
    numbers[4]["restriction"] = {"kind": "SEND_LIMIT", "description": "Limitação no envio", "recordedAt": at(9)}

    campaigns = [
        {**base("campaign", 0, 2), "name": "Campanha de Lançamento", "clientId": clients[0]["id"], "squadId": groups[0]["id"], "responsibleId": responsibles[0]["id"],
         "notes": "Campanha fictícia.", "status": "ACTIVE", "stage": "EM_ANDAMENTO", "startedAt": at(2), "endedAt": None},
        {**base("campaign", 1, 3), "name": "Ação Sazonal", "clientId": clients[2]["id"], "squadId": groups[1]["id"], "responsibleId": responsibles[1]["id"],
         "notes": "", "status": "ACTIVE", "stage": "PLANEJAMENTO", "startedAt": at(3), "endedAt": None},
    ]
    links = [
        {"id": "campaign-link_demo_01", "numberId": numbers[0]["id"], "campaignId": campaigns[0]["id"], "role": "PRIMARY", "startedAt": at(2), "endedAt": None, "createdAt": at(2), "updatedAt": at(2)},
        {"id": "campaign-link_demo_02", "numberId": numbers[1]["id"], "campaignId": campaigns[0]["id"], "role": "BACKUP", "startedAt": at(2), "endedAt": None, "createdAt": at(2), "updatedAt": at(2)},
        {"id": "campaign-link_demo_03", "numberId": numbers[3]["id"], "campaignId": campaigns[1]["id"], "role": "PRIMARY", "startedAt": at(3), "endedAt": None, "createdAt": at(3), "updatedAt": at(3)},
    ]
    incidents = [
        {"id": "incident_demo_01", "numberId": numbers[5]["id"], "type": "BLOCK", "title": "Bloqueio", "description": "Número bloqueado durante o uso (fictício).",
         "status": "OPEN", "responsibleId": responsibles[2]["id"], "resolutionNotes": "", "resolvedById": None, "resolvedAt": None, "createdAt": at(11), "updatedAt": at(11)},
        {"id": "incident_demo_02", "numberId": numbers[2]["id"], "type": "CHIP_ISSUE", "title": "Problema no chip", "description": "Chip sem sinal (fictício).",
         "status": "RESOLVED", "responsibleId": responsibles[1]["id"], "resolutionNotes": "Chip reposicionado.", "resolvedById": responsibles[1]["id"],
         "resolvedAt": at(8), "createdAt": at(6), "updatedAt": at(8)},
    ]
    return {"groups": groups, "clients": clients, "responsibles": responsibles, "locations": locations, "numbers": numbers,
            "campaigns": campaigns, "numberCampaignLinks": links, "incidents": incidents, "historyEvents": history}


def seed(conn: sqlite3.Connection) -> bool:
    if not is_operational_base_empty(conn):
        return False
    system = {"id": None, "access_level": "MASTER"}
    with transaction(conn):
        state._apply(state._Writer(conn, system, audited=False), build_payload())
    return True
