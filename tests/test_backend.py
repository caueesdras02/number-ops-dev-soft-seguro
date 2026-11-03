"""Testes do backend (servidor HTTP real + SQLite temporário).

Rodar:  python -m unittest discover -s tests -v
"""
from __future__ import annotations

import http.client
import json
import os
import shutil
import sys
import tempfile
import threading
import unittest
from pathlib import Path

TMP_DIR = tempfile.mkdtemp(prefix="nops-test-")
os.environ["NUMBER_OPS_DATA_DIR"] = TMP_DIR
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend import config, database, demo, security  # noqa: E402
from backend.http_app import create_server  # noqa: E402

config.PASSWORD_ITERATIONS = 1_000  # testes rápidos; em produção são 600 000
# Todos os testes vêm de 127.0.0.1: limites por IP elevados (o limite em si tem teste próprio).
config.SIGNUP_MAX_PER_IP = 10_000
config.LOGIN_IP_MAX_FAILURES = 10_000

STRONG = "Forte#2026x"
MASTER = {"name": "Maria Master", "email": "master@exemplo.com", "cpf": "529.982.247-25", "password": STRONG, "jobTitle": "OTHER"}
NOW = "2026-10-27T12:00:00.000Z"


def valid_cpf(seed: int) -> str:
    base = f"{seed:09d}"
    digits = [int(c) for c in base]
    for size in (9, 10):
        total = sum(digits[i] * (size + 1 - i) for i in range(size))
        digits.append((total * 10) % 11 % 10)
    return "".join(map(str, digits))


class Client:
    def __init__(self, port: int):
        self.port = port
        self.cookie = None
        self.csrf = None

    def request(self, method: str, path: str, body=None, *, csrf=True, marker=True, origin=None):
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=10)
        headers = {}
        if marker:
            headers["X-Requested-With"] = "number-ops"
        if origin:
            headers["Origin"] = origin
        if self.cookie:
            headers["Cookie"] = self.cookie
        if csrf and self.csrf and method != "GET":
            headers["X-CSRF-Token"] = self.csrf
        data = None
        if body is not None:
            data = json.dumps(body).encode()
            headers["Content-Type"] = "application/json"
        conn.request(method, path, body=data, headers=headers)
        response = conn.getresponse()
        raw = response.read()
        cookie = response.getheader("Set-Cookie")
        if cookie:
            value = cookie.split(";", 1)[0]
            self.cookie = None if value.endswith("=") else value
        conn.close()
        payload = json.loads(raw) if raw and response.getheader("Content-Type", "").startswith("application/json") else raw
        if isinstance(payload, dict) and payload.get("csrfToken"):
            self.csrf = payload["csrfToken"]
        return response.status, payload

    def login(self, email, password):
        return self.request("POST", "/api/auth/login", {"email": email, "password": password})


def number(phone: str, **extra) -> dict:
    row = {"id": f"number_{phone}", "phone": phone, "identification": "", "status": "ACTIVE", "locationId": None, "responsibleId": None,
           "clientIds": [], "groupIds": [], "groupCount": 0, "notes": "", "restriction": None, "archivedAt": None, "createdAt": NOW, "updatedAt": NOW}
    row.update(extra)
    return row


class BackendTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        database.initialize()
        cls.server = create_server("127.0.0.1", 0)
        cls.port = cls.server.server_address[1]
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()
        cls.master = Client(cls.port)
        status, payload = cls.master.request("POST", "/api/auth/setup", MASTER)
        assert status == 200, payload

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        shutil.rmtree(TMP_DIR, ignore_errors=True)

    def create_user(self, seed: int, level: str) -> Client:
        email = f"user{seed}@exemplo.com"
        client = Client(self.port)
        status, _ = client.request("POST", "/api/signup-requests", {"name": f"Pessoa {seed}", "email": email, "cpf": valid_cpf(seed), "password": STRONG, "jobTitle": "ANALYST"})
        self.assertEqual(status, 200)
        _, data = self.master.request("GET", "/api/signup-requests")
        request_id = next(r["id"] for r in data["requests"] if r["email"] == email)
        status, _ = self.master.request("POST", f"/api/signup-requests/{request_id}/approve", {"accessLevel": level})
        self.assertEqual(status, 200)
        status, _ = client.login(email, STRONG)
        self.assertEqual(status, 200)
        return client

    # ---------------------------------------------------------------- setup/login

    def test_setup_only_once(self):
        status, payload = Client(self.port).request("POST", "/api/auth/setup", {**MASTER, "email": "outro@exemplo.com", "cpf": valid_cpf(9)})
        self.assertEqual(status, 403, payload)

    def test_session_reports_master(self):
        status, payload = self.master.request("GET", "/api/auth/session")
        self.assertEqual(status, 200)
        self.assertEqual(payload["profile"]["access_level"], "MASTER")
        self.assertNotIn("password_hash", payload["profile"])
        self.assertNotIn("cpf_hash", payload["profile"])
        self.assertEqual(payload["profile"]["cpf_masked"], "***.982.247-**")

    def test_login_lockout_after_failures(self):
        client = Client(self.port)
        for _ in range(config.LOGIN_MAX_FAILURES):
            status, _ = client.login("ninguem@exemplo.com", "Errada#123x")
            self.assertEqual(status, 401)
        status, payload = client.login("ninguem@exemplo.com", "Errada#123x")
        self.assertEqual(status, 429, payload)

    # ---------------------------------------------------------------- senha forte

    def test_password_policy(self):
        self.assertTrue(security.password_policy_errors("curta"))
        self.assertTrue(security.password_policy_errors("semnumero#A"))
        self.assertTrue(security.password_policy_errors("SemEspecial123"))
        self.assertTrue(security.password_policy_errors("Senha@123"))  # comum
        self.assertTrue(security.password_policy_errors("Joaquim#2026", name="Joaquim Silva"))
        self.assertTrue(security.password_policy_errors("Aaa#1aaa"))  # 3 iguais seguidos
        self.assertEqual(security.password_policy_errors(STRONG), [])

    def test_pure_pbkdf2_matches_native(self):
        # Fallback usado no navegador (Pyodide não tem OpenSSL) precisa gerar o mesmo hash.
        import hashlib
        for password in (b"Forte#2026x", b"x" * 100):
            self.assertEqual(security._pbkdf2_sha256_pure(password, b"sal-aleatorio", 1_000), hashlib.pbkdf2_hmac("sha256", password, b"sal-aleatorio", 1_000))

    def test_weak_password_rejected_on_signup(self):
        status, payload = Client(self.port).request("POST", "/api/signup-requests", {"name": "Fraca Teste", "email": "fraca@exemplo.com", "cpf": valid_cpf(11), "password": "12345678", "jobTitle": "ANALYST"})
        self.assertEqual(status, 400, payload)

    # ---------------------------------------------------------------- CPF / solicitações

    def test_cpf_validation(self):
        self.assertTrue(security.is_valid_cpf("529.982.247-25"))
        self.assertFalse(security.is_valid_cpf("529.982.247-26"))
        self.assertFalse(security.is_valid_cpf("111.111.111-11"))
        status, _ = Client(self.port).request("POST", "/api/signup-requests", {"name": "Cpf Invalido", "email": "cpf@exemplo.com", "cpf": "123.456.789-00", "password": STRONG, "jobTitle": "ANALYST"})
        self.assertEqual(status, 400)

    def test_duplicate_cpf_blocked(self):
        cpf = valid_cpf(21)
        anon = Client(self.port)
        self.assertEqual(anon.request("POST", "/api/signup-requests", {"name": "Primeira Pessoa", "email": "a21@exemplo.com", "cpf": cpf, "password": STRONG, "jobTitle": "ANALYST"})[0], 200)
        status, payload = anon.request("POST", "/api/signup-requests", {"name": "Outra Pessoa", "email": "b21@exemplo.com", "cpf": cpf, "password": STRONG, "jobTitle": "ANALYST"})
        self.assertEqual(status, 409, payload)
        status, _ = anon.request("POST", "/api/signup-requests", {"name": "Outra Pessoa", "email": "a21@exemplo.com", "cpf": valid_cpf(22), "password": STRONG, "jobTitle": "ANALYST"})
        self.assertEqual(status, 409)
        # CPF do MASTER já é uma conta: também bloqueia.
        status, _ = anon.request("POST", "/api/signup-requests", {"name": "Copia Master", "email": "c21@exemplo.com", "cpf": MASTER["cpf"], "password": STRONG, "jobTitle": "ANALYST"})
        self.assertEqual(status, 409)

    def test_pending_request_cannot_login_until_approved(self):
        client = Client(self.port)
        client.request("POST", "/api/signup-requests", {"name": "Aguardando Aprovacao", "email": "espera@exemplo.com", "cpf": valid_cpf(31), "password": STRONG, "jobTitle": "ANALYST"})
        status, payload = client.login("espera@exemplo.com", STRONG)
        self.assertEqual(status, 403)
        self.assertIn("aguardando", payload["error"])
        _, session = self.master.request("GET", "/api/auth/session")
        self.assertGreaterEqual(session["pendingSignupRequests"], 1)
        _, data = self.master.request("GET", "/api/signup-requests")
        request_id = next(r["id"] for r in data["requests"] if r["email"] == "espera@exemplo.com")
        self.assertNotIn("password_hash", data["requests"][0])
        self.assertEqual(self.master.request("POST", f"/api/signup-requests/{request_id}/approve", {"accessLevel": "VIEWER"})[0], 200)
        self.assertEqual(self.master.request("POST", f"/api/signup-requests/{request_id}/approve", {"accessLevel": "VIEWER"})[0], 409)
        self.assertEqual(client.login("espera@exemplo.com", STRONG)[0], 200)

    def test_only_master_manages_requests(self):
        admin = self.create_user(41, "ADMIN")
        self.assertEqual(admin.request("GET", "/api/signup-requests")[0], 403)

    def test_signup_rate_limit_per_ip(self):
        original = config.SIGNUP_MAX_PER_IP
        conn = database.connect()
        try:
            config.SIGNUP_MAX_PER_IP = security.throttle_count(conn, "signup-ip:127.0.0.1", config.SIGNUP_WINDOW_SECONDS)
            status, _ = Client(self.port).request("POST", "/api/signup-requests", {"name": "Spam Teste", "email": "spam@exemplo.com", "cpf": valid_cpf(45), "password": STRONG, "jobTitle": "ANALYST"})
            self.assertEqual(status, 429)
        finally:
            config.SIGNUP_MAX_PER_IP = original
            conn.close()

    # ---------------------------------------------------------------- CSRF / estáticos

    def test_csrf_protection(self):
        user = self.create_user(51, "USER")
        payload = {"changes": {"numbers": [number("5511911110051")]}}
        self.assertEqual(user.request("POST", "/api/state/sync", payload, csrf=False)[0], 403)
        self.assertEqual(user.request("POST", "/api/state/sync", payload, marker=False)[0], 403)
        self.assertEqual(user.request("POST", "/api/state/sync", payload, origin="http://malicioso.example")[0], 403)
        self.assertEqual(user.request("POST", "/api/state/sync", payload)[0], 200)

    def test_static_files_are_restricted(self):
        anon = Client(self.port)
        self.assertEqual(anon.request("GET", "/")[0], 200)
        self.assertEqual(anon.request("GET", "/src/js/app.js")[0], 200)
        for path in ("/server.py", "/backend/security.py", "/data/number_ops.db", "/data/secret.key", "/src/../server.py", "/src/%2e%2e/server.py"):
            self.assertEqual(anon.request("GET", path)[0], 404, path)
        self.assertEqual(anon.request("GET", "/api/state")[0], 401)

    # ---------------------------------------------------------------- permissões e regras

    def test_permissions_by_level(self):
        user = self.create_user(61, "USER")
        viewer = self.create_user(62, "VIEWER")
        client_row = {"id": "client_t61", "name": "Cliente Teste", "squadId": None, "isActive": True, "createdAt": NOW, "updatedAt": NOW}
        self.assertEqual(user.request("POST", "/api/state/sync", {"changes": {"clients": [client_row]}})[0], 403)
        self.assertEqual(viewer.request("POST", "/api/state/sync", {"changes": {"numbers": [number("5511911110062")]}})[0], 403)
        self.assertEqual(self.master.request("POST", "/api/state/sync", {"changes": {"clients": [client_row]}})[0], 200)
        self.assertEqual(user.request("POST", "/api/state/sync", {"changes": {"numbers": [number("5511911110061", clientIds=["client_t61"])]}})[0], 200)
        self.assertEqual(user.request("DELETE", "/api/records/numbers/number_5511911110061")[0], 403)

    def test_invalid_phone_and_duplicate(self):
        self.assertEqual(self.master.request("POST", "/api/state/sync", {"changes": {"numbers": [number("123")]}})[0], 400)
        self.assertEqual(self.master.request("POST", "/api/state/sync", {"changes": {"numbers": [number("5511911110071")]}})[0], 200)
        dup = number("5511911110071", id="number_other")
        self.assertEqual(self.master.request("POST", "/api/state/sync", {"changes": {"numbers": [dup]}})[0], 409)

    def test_inactive_number_is_archived_and_leaves_campaigns(self):
        squad = {"id": "group_t81", "name": "Equipe T", "isActive": True, "createdAt": NOW, "updatedAt": NOW}
        client = {"id": "client_t81", "name": "Cliente T", "squadId": "group_t81", "isActive": True, "createdAt": NOW, "updatedAt": NOW}
        campaign = {"id": "campaign_t81", "name": "Campanha T", "clientId": "client_t81", "squadId": "group_t81", "responsibleId": None, "notes": "",
                    "status": "ACTIVE", "stage": "PLANEJAMENTO", "startedAt": NOW, "endedAt": None, "createdAt": NOW, "updatedAt": NOW}
        link = {"id": "link_t81", "numberId": "number_5511911110081", "campaignId": "campaign_t81", "role": "PRIMARY", "startedAt": NOW, "endedAt": None, "createdAt": NOW, "updatedAt": NOW}
        changes = {"groups": [squad], "clients": [client], "numbers": [number("5511911110081")], "campaigns": [campaign], "numberCampaignLinks": [link]}
        self.assertEqual(self.master.request("POST", "/api/state/sync", {"changes": changes})[0], 200)
        # Cliente só envia o status INACTIVE (sem archivedAt): o servidor arquiva sozinho.
        self.assertEqual(self.master.request("POST", "/api/state/sync", {"changes": {"numbers": [number("5511911110081", status="INACTIVE")]}})[0], 200)
        _, data = self.master.request("GET", "/api/state")
        row = next(n for n in data["state"]["numbers"] if n["id"] == "number_5511911110081")
        self.assertEqual(row["status"], "INACTIVE")
        self.assertIsNotNone(row["archivedAt"])
        saved_link = next(l for l in data["state"]["numberCampaignLinks"] if l["id"] == "link_t81")
        self.assertIsNotNone(saved_link["endedAt"])
        # Número arquivado não pode entrar em campanha.
        new_link = {**link, "id": "link_t81b", "endedAt": None}
        self.assertEqual(self.master.request("POST", "/api/state/sync", {"changes": {"numberCampaignLinks": [new_link]}})[0], 400)

    def test_history_is_immutable(self):
        self.master.request("POST", "/api/state/sync", {"changes": {"numbers": [number("5511911110091")]}})
        event = {"id": "history_t91", "numberId": "number_5511911110091", "type": "NOTE", "description": "Original", "previousValue": None, "newValue": None, "metadata": None, "occurredAt": NOW}
        self.assertEqual(self.master.request("POST", "/api/state/sync", {"changes": {"historyEvents": [event]}})[0], 200)
        self.master.request("POST", "/api/state/sync", {"changes": {"historyEvents": [{**event, "description": "Adulterado"}]}})
        _, data = self.master.request("GET", "/api/state")
        saved = next(h for h in data["state"]["historyEvents"] if h["id"] == "history_t91")
        self.assertEqual(saved["description"], "Original")

    def test_audit_log_records_and_is_append_only(self):
        _, data = self.master.request("GET", "/api/audit-logs")
        self.assertTrue(any(log["action"] == "PROFILE_CREATED" for log in data["logs"]))
        conn = database.connect()
        try:
            with self.assertRaises(Exception):
                conn.execute("DELETE FROM audit_logs")
        finally:
            conn.close()

    def test_auth_events_are_audited(self):
        viewer = self.create_user(81, "VIEWER")
        status, _ = Client(self.port).login(MASTER["email"], "Errada#123x")
        self.assertEqual(status, 401)
        self.assertEqual(viewer.request("POST", "/api/state/sync", {"changes": {"numbers": [number("5511911110081")]}})[0], 403)
        _, data = self.master.request("GET", "/api/audit-logs")
        failed = next(log for log in data["logs"] if log["action"] == "LOGIN_FAILED" and log["new_data"]["email"] == MASTER["email"])
        self.assertEqual(failed["new_data"]["reason"], "Senha incorreta.")
        self.assertNotIn("Errada#123x", json.dumps(data["logs"]))  # a senha digitada nunca vai para o registro
        self.assertTrue(any(log["action"] == "LOGIN_SUCCEEDED" for log in data["logs"]))
        self.assertTrue(any(log["action"] == "ACCESS_DENIED" and log["new_data"]["path"] == "POST /api/state/sync" for log in data["logs"]))

    # ---------------------------------------------------------------- usuários

    def test_last_master_cannot_be_demoted(self):
        _, session = self.master.request("GET", "/api/auth/session")
        me = session["profile"]
        status, _ = self.master.request("PATCH", f"/api/profiles/{me['id']}", {"name": me["name"], "job_title": me["job_title"], "status": "ACTIVE", "access_level": "ADMIN"})
        self.assertEqual(status, 403)

    def test_admin_cannot_change_access_level(self):
        admin = self.create_user(101, "ADMIN")
        target = self.create_user(102, "USER")
        _, session = target.request("GET", "/api/auth/session")
        p = session["profile"]
        status, _ = admin.request("PATCH", f"/api/profiles/{p['id']}", {"name": p["name"], "job_title": p["job_title"], "status": "ACTIVE", "access_level": "MASTER"})
        self.assertEqual(status, 403)
        # Desativar derruba a sessão na hora.
        self.assertEqual(admin.request("PATCH", f"/api/profiles/{p['id']}", {"name": p["name"], "job_title": p["job_title"], "status": "INACTIVE"})[0], 200)
        self.assertEqual(target.request("GET", "/api/state")[0], 401)

    def test_reset_password_forces_change(self):
        user = self.create_user(111, "USER")
        _, session = user.request("GET", "/api/auth/session")
        _, data = self.master.request("POST", f"/api/profiles/{session['profile']['id']}/reset-password")
        temporary = data["temporaryPassword"]
        self.assertEqual(security.password_policy_errors(temporary), [])
        self.assertEqual(user.request("GET", "/api/state")[0], 401)  # sessões antigas encerradas
        self.assertEqual(user.login("user111@exemplo.com", temporary)[0], 200)
        self.assertEqual(user.request("GET", "/api/state")[0], 403)  # precisa trocar antes de usar
        self.assertEqual(user.request("POST", "/api/auth/change-password", {"currentPassword": temporary, "newPassword": "fraca"})[0], 400)
        self.assertEqual(user.request("POST", "/api/auth/change-password", {"currentPassword": temporary, "newPassword": "NovaSenha#77"})[0], 200)
        self.assertEqual(user.request("GET", "/api/state")[0], 200)

    # ---------------------------------------------------------------- demo

    def test_demo_payload_is_valid(self):
        payload = demo.build_payload()
        self.assertTrue(all(n["phone"].startswith("55119000001") for n in payload["numbers"]))
        status, body = self.master.request("POST", "/api/state/sync", {"changes": payload})
        self.assertEqual(status, 200, body)


if __name__ == "__main__":
    unittest.main()
