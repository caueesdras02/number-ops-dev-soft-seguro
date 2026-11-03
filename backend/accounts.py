"""Contas: configuração inicial, login/sessão, solicitações de acesso e gestão de usuários."""
from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timedelta, timezone
from typing import Any

from . import audit, config, security
from .database import transaction, utc_now
from .errors import Conflict, Forbidden, NotFound, TooManyRequests, Unauthorized, ValidationError

PUBLIC_PROFILE_FIELDS = ("id", "name", "email", "cpf_masked", "job_title", "squad_id", "status", "access_level", "last_login_at", "created_at", "updated_at")
INVALID_LOGIN = "E-mail ou senha inválidos."


def public_profile(row: sqlite3.Row | dict) -> dict:
    data = dict(row)
    out = {field: data.get(field) for field in PUBLIC_PROFILE_FIELDS}
    out["must_change_password"] = bool(data.get("must_change_password"))
    return out


def _profile(conn: sqlite3.Connection, profile_id: str) -> dict | None:
    row = conn.execute("SELECT * FROM profiles WHERE id = ?", (profile_id,)).fetchone()
    return dict(row) if row else None


def has_any_profile(conn: sqlite3.Connection) -> bool:
    return conn.execute("SELECT 1 FROM profiles LIMIT 1").fetchone() is not None


def _parse(moment: str) -> datetime:
    return datetime.fromisoformat(moment.replace("Z", "+00:00"))


# --------------------------------------------------------------------------
# Validação comum de cadastro
# --------------------------------------------------------------------------

def _registration_fields(data: Any) -> dict:
    if not isinstance(data, dict):
        raise ValidationError("Dados de cadastro inválidos.")
    name = security.clean_name(data.get("name"))
    email = security.normalize_email(data.get("email"))
    cpf = security.normalize_cpf(data.get("cpf"))
    password = data.get("password")
    job_title = data.get("jobTitle")
    if len(name) < 3 or len(name) > 120:
        raise ValidationError("Informe o nome completo (3 a 120 caracteres).")
    if not security.is_valid_email(email):
        raise ValidationError("Informe um e-mail válido.")
    if not security.is_valid_cpf(cpf):
        raise ValidationError("Informe um CPF válido.")
    if job_title not in security.JOB_TITLES:
        raise ValidationError("Selecione um cargo válido.")
    if not isinstance(password, str):
        raise ValidationError("Informe uma senha.")
    errors = security.password_policy_errors(password, name=name, email=email)
    if errors:
        raise ValidationError(" ".join(errors))
    return {"name": name, "email": email, "cpf": cpf, "password": password, "job_title": job_title}


def _assert_identity_free(conn: sqlite3.Connection, cpf_hash: str, email: str) -> None:
    if conn.execute("SELECT 1 FROM profiles WHERE cpf_hash = ?", (cpf_hash,)).fetchone() or \
       conn.execute("SELECT 1 FROM signup_requests WHERE cpf_hash = ? AND status = 'PENDING'", (cpf_hash,)).fetchone():
        raise Conflict("Já existe um usuário ou uma solicitação pendente com este CPF.")
    if conn.execute("SELECT 1 FROM profiles WHERE lower(email) = ?", (email,)).fetchone() or \
       conn.execute("SELECT 1 FROM signup_requests WHERE lower(email) = ? AND status = 'PENDING'", (email,)).fetchone():
        raise Conflict("Já existe um usuário ou uma solicitação pendente com este e-mail.")


def _insert_profile(conn: sqlite3.Connection, fields: dict, *, password_hash: str, access_level: str, squad_id: str | None, actor_id: str | None) -> dict:
    timestamp = utc_now()
    profile = {
        "id": security.new_id("profile"),
        "name": fields["name"],
        "email": fields["email"],
        "cpf_hash": fields["cpf_hash"],
        "cpf_masked": fields["cpf_masked"],
        "password_hash": password_hash,
        "must_change_password": 0,
        "job_title": fields["job_title"],
        "squad_id": squad_id,
        "status": "ACTIVE",
        "access_level": access_level,
        "last_login_at": None,
        "password_changed_at": timestamp,
        "created_at": timestamp,
        "updated_at": timestamp,
    }
    columns = list(profile)
    conn.execute(f"INSERT INTO profiles ({', '.join(columns)}) VALUES ({', '.join('?' for _ in columns)})", [profile[c] for c in columns])
    audit.record(conn, actor_id or profile["id"], "profiles", None, profile)
    return profile


# --------------------------------------------------------------------------
# Configuração inicial (primeiro MASTER)
# --------------------------------------------------------------------------

def setup_master(conn: sqlite3.Connection, data: Any) -> dict:
    fields = _registration_fields(data)
    with transaction(conn):
        if has_any_profile(conn):
            raise Forbidden("O sistema já foi configurado.")
        fields["cpf_hash"] = security.cpf_hash(fields["cpf"])
        fields["cpf_masked"] = security.mask_cpf(fields["cpf"])
        return _insert_profile(conn, fields, password_hash=security.hash_password(fields["password"]), access_level="MASTER", squad_id=None, actor_id=None)


# --------------------------------------------------------------------------
# Sessões
# --------------------------------------------------------------------------

def create_session(conn: sqlite3.Connection, profile_id: str, ip: str, user_agent: str) -> tuple[str, str]:
    token, csrf = security.new_token(), security.new_token()
    now = datetime.now(timezone.utc)
    iso = lambda moment: moment.isoformat(timespec="milliseconds").replace("+00:00", "Z")  # noqa: E731
    conn.execute(
        "INSERT INTO sessions(token_hash, profile_id, csrf_token, created_at, last_seen_at, expires_at, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (security.token_digest(token), profile_id, csrf, iso(now), iso(now), iso(now + timedelta(seconds=config.SESSION_ABSOLUTE_SECONDS)), ip, (user_agent or "")[:300]),
    )
    return token, csrf


def get_session(conn: sqlite3.Connection, token: str | None) -> dict | None:
    """Sessão válida + perfil ativo, ou None. Sessões expiradas são removidas."""
    if not token:
        return None
    digest = security.token_digest(token)
    row = conn.execute("SELECT * FROM sessions WHERE token_hash = ?", (digest,)).fetchone()
    if not row:
        return None
    now = datetime.now(timezone.utc)
    if _parse(row["expires_at"]) <= now or _parse(row["last_seen_at"]) + timedelta(seconds=config.SESSION_IDLE_SECONDS) <= now:
        conn.execute("DELETE FROM sessions WHERE token_hash = ?", (digest,))
        return None
    profile = _profile(conn, row["profile_id"])
    if not profile or profile["status"] != "ACTIVE":
        conn.execute("DELETE FROM sessions WHERE token_hash = ?", (digest,))
        return None
    if (now - _parse(row["last_seen_at"])).total_seconds() > 60:
        conn.execute("UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?", (utc_now(), digest))
    return {"token_hash": digest, "csrf_token": row["csrf_token"], "profile": profile}


def destroy_session(conn: sqlite3.Connection, token: str | None) -> None:
    if token:
        conn.execute("DELETE FROM sessions WHERE token_hash = ?", (security.token_digest(token),))


def prune_sessions(conn: sqlite3.Connection) -> None:
    conn.execute("DELETE FROM sessions WHERE expires_at <= ?", (utc_now(),))


# --------------------------------------------------------------------------
# Login
# --------------------------------------------------------------------------

def login(conn: sqlite3.Connection, data: Any, ip: str) -> dict:
    if not isinstance(data, dict):
        raise ValidationError("Dados de login inválidos.")
    email = security.normalize_email(data.get("email"))
    password = data.get("password")
    if not email or not isinstance(password, str) or not password or len(password) > security.PASSWORD_MAX_LENGTH:
        raise Unauthorized(INVALID_LOGIN)
    email_key, ip_key = f"login:{email}", f"login-ip:{ip}"
    if security.throttle_count(conn, email_key, config.LOGIN_WINDOW_SECONDS) >= config.LOGIN_MAX_FAILURES or \
       security.throttle_count(conn, ip_key, config.LOGIN_WINDOW_SECONDS) >= config.LOGIN_IP_MAX_FAILURES:
        audit_auth_event(conn, "LOGIN_BLOCKED", email=email, ip=ip, reason="Muitas tentativas inválidas: login bloqueado por 15 minutos.")
        raise TooManyRequests("Muitas tentativas de login. Aguarde 15 minutos e tente novamente.")

    row = conn.execute("SELECT * FROM profiles WHERE lower(email) = ?", (email,)).fetchone()
    if row is None:
        # Só quem sabe a senha da própria solicitação descobre o status dela.
        request = conn.execute("SELECT status, password_hash FROM signup_requests WHERE lower(email) = ? ORDER BY created_at DESC LIMIT 1", (email,)).fetchone()
        if request and security.verify_password(password, request["password_hash"]):
            if request["status"] == "PENDING":
                audit_auth_event(conn, "LOGIN_FAILED", email=email, ip=ip, reason="Solicitação de acesso ainda pendente.")
                raise Forbidden("Sua solicitação de acesso ainda está aguardando aprovação do administrador.")
            if request["status"] == "REJECTED":
                audit_auth_event(conn, "LOGIN_FAILED", email=email, ip=ip, reason="Solicitação de acesso recusada.")
                raise Forbidden("Sua solicitação de acesso foi recusada. Procure o administrador.")
        elif not request:
            security.burn_password_check(password)
        _register_failure(conn, email_key, ip_key)
        audit_auth_event(conn, "LOGIN_FAILED", email=email, ip=ip, reason="E-mail não cadastrado.")
        raise Unauthorized(INVALID_LOGIN)

    profile = dict(row)
    if not security.verify_password(password, profile["password_hash"]):
        _register_failure(conn, email_key, ip_key)
        audit_auth_event(conn, "LOGIN_FAILED", profile_id=profile["id"], email=email, ip=ip, reason="Senha incorreta.")
        raise Unauthorized(INVALID_LOGIN)
    if profile["status"] != "ACTIVE":
        audit_auth_event(conn, "LOGIN_FAILED", profile_id=profile["id"], email=email, ip=ip, reason="Usuário inativo.")
        raise Forbidden("Este usuário está inativo. Procure um administrador.")
    security.throttle_clear(conn, email_key)
    conn.execute("UPDATE profiles SET last_login_at = ? WHERE id = ?", (utc_now(), profile["id"]))
    audit_auth_event(conn, "LOGIN_SUCCEEDED", actor_id=profile["id"], profile_id=profile["id"], email=email, ip=ip)
    return profile


def audit_auth_event(conn: sqlite3.Connection, action: str, *, actor_id: str | None = None, profile_id: str | None = None,
                     email: str = "", ip: str = "", reason: str = "", path: str = "") -> None:
    """Login, logout e acessos negados no Registro de atividades (a senha digitada nunca é gravada)."""
    data = {"email": email, **({"reason": reason} if reason else {}), **({"path": path} if path else {})}
    audit.write(conn, actor_id, [(action, "USER", profile_id, None, data, {"source": "server", "ip": ip})])


def _register_failure(conn: sqlite3.Connection, email_key: str, ip_key: str) -> None:
    security.throttle_hit(conn, email_key)
    security.throttle_hit(conn, ip_key)


def change_password(conn: sqlite3.Connection, profile: dict, data: Any, keep_session_hash: str) -> None:
    if not isinstance(data, dict):
        raise ValidationError("Dados inválidos.")
    current, new = data.get("currentPassword"), data.get("newPassword")
    if not isinstance(current, str) or not security.verify_password(current, profile["password_hash"]):
        raise ValidationError("A senha atual está incorreta.")
    if not isinstance(new, str):
        raise ValidationError("Informe a nova senha.")
    errors = security.password_policy_errors(new, name=profile["name"], email=profile["email"])
    if errors:
        raise ValidationError(" ".join(errors))
    if security.verify_password(new, profile["password_hash"]):
        raise ValidationError("A nova senha deve ser diferente da atual.")
    with transaction(conn):
        updated = {**profile, "password_hash": security.hash_password(new), "must_change_password": 0, "password_changed_at": utc_now(), "updated_at": utc_now()}
        conn.execute("UPDATE profiles SET password_hash = ?, must_change_password = 0, password_changed_at = ?, updated_at = ? WHERE id = ?",
                     (updated["password_hash"], updated["password_changed_at"], updated["updated_at"], profile["id"]))
        # Encerra as outras sessões abertas com a senha antiga.
        conn.execute("DELETE FROM sessions WHERE profile_id = ? AND token_hash <> ?", (profile["id"], keep_session_hash))
        audit.record(conn, profile["id"], "profiles", profile, updated)


# --------------------------------------------------------------------------
# Solicitações de acesso
# --------------------------------------------------------------------------

def create_signup_request(conn: sqlite3.Connection, data: Any, ip: str) -> None:
    ip_key = f"signup-ip:{ip}"
    if security.throttle_count(conn, ip_key, config.SIGNUP_WINDOW_SECONDS) >= config.SIGNUP_MAX_PER_IP:
        raise TooManyRequests("Muitas solicitações enviadas. Tente novamente mais tarde.")
    fields = _registration_fields(data)
    digest = security.cpf_hash(fields["cpf"])
    password_hash = security.hash_password(fields["password"])
    with transaction(conn):
        _assert_identity_free(conn, digest, fields["email"])
        timestamp = utc_now()
        request_id = security.new_id("signup")
        try:
            conn.execute(
                "INSERT INTO signup_requests(id, name, email, cpf_hash, cpf_masked, password_hash, job_title, status, request_ip, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?)",
                (request_id, fields["name"], fields["email"], digest, security.mask_cpf(fields["cpf"]), password_hash, fields["job_title"], ip, timestamp, timestamp),
            )
        except sqlite3.IntegrityError as exc:
            raise Conflict("Já existe uma solicitação pendente com este CPF ou e-mail.") from exc
        security.throttle_hit(conn, ip_key)
        audit.write(conn, None, [("SIGNUP_REQUESTED", "SIGNUP_REQUEST", request_id, None, {"name": fields["name"], "email": fields["email"], "job_title": fields["job_title"]}, {"source": "server"})])


def _require_master(profile: dict) -> None:
    if profile["access_level"] != "MASTER":
        raise Forbidden("Somente MASTER pode gerenciar solicitações de acesso.")


def list_signup_requests(conn: sqlite3.Connection, profile: dict) -> list[dict]:
    _require_master(profile)
    rows = conn.execute("""
        SELECT id, name, email, cpf_masked, job_title, status, access_level, squad_id, profile_id, reviewed_by, reviewed_at, review_note, created_at, updated_at
        FROM signup_requests ORDER BY CASE status WHEN 'PENDING' THEN 0 ELSE 1 END, created_at DESC LIMIT 500
    """)
    return [dict(row) for row in rows]


def pending_signup_count(conn: sqlite3.Connection) -> int:
    return conn.execute("SELECT count(*) FROM signup_requests WHERE status = 'PENDING'").fetchone()[0]


def _pending_request(conn: sqlite3.Connection, request_id: str) -> dict:
    row = conn.execute("SELECT * FROM signup_requests WHERE id = ?", (request_id,)).fetchone()
    if not row:
        raise NotFound("Solicitação não encontrada.")
    if row["status"] != "PENDING":
        raise Conflict("Esta solicitação já foi analisada.")
    return dict(row)


def _valid_squad(conn: sqlite3.Connection, squad_id: Any) -> str | None:
    if squad_id in (None, ""):
        return None
    if not isinstance(squad_id, str) or not conn.execute("SELECT 1 FROM squads WHERE id = ? AND is_active = 1", (squad_id,)).fetchone():
        raise ValidationError("Selecione um Squad ativo.")
    return squad_id


def approve_signup_request(conn: sqlite3.Connection, master: dict, request_id: str, data: Any) -> dict:
    _require_master(master)
    data = data if isinstance(data, dict) else {}
    access_level = data.get("accessLevel") or "USER"
    if access_level not in security.ACCESS_LEVELS:
        raise ValidationError("Selecione um nível de acesso válido.")
    duplicate = False
    with transaction(conn):
        request = _pending_request(conn, request_id)
        squad_id = _valid_squad(conn, data.get("squadId"))
        if conn.execute("SELECT 1 FROM profiles WHERE cpf_hash = ? OR lower(email) = ?", (request["cpf_hash"], request["email"].lower())).fetchone():
            # Mesmo CPF/e-mail já virou usuário: a solicitação é descartada (fica registrada como recusada).
            conn.execute("UPDATE signup_requests SET status = 'REJECTED', review_note = ?, reviewed_by = ?, reviewed_at = ?, updated_at = ? WHERE id = ?",
                         ("CPF ou e-mail já cadastrado.", master["id"], utc_now(), utc_now(), request_id))
            duplicate = True
        else:
            profile = _approve(conn, master, request, request_id, access_level, squad_id)
    if duplicate:
        raise Conflict("Já existe um usuário com este CPF ou e-mail. A solicitação foi recusada automaticamente.")
    return profile


def _approve(conn: sqlite3.Connection, master: dict, request: dict, request_id: str, access_level: str, squad_id: str | None) -> dict:
    # A senha é a que a própria pessoa escolheu ao solicitar (já guardada como hash).
    fields = {key: request[key] for key in ("name", "email", "cpf_hash", "cpf_masked", "job_title")}
    profile = _insert_profile(conn, fields, password_hash=request["password_hash"], access_level=access_level, squad_id=squad_id, actor_id=master["id"])
    timestamp = utc_now()
    conn.execute("UPDATE signup_requests SET status = 'APPROVED', access_level = ?, squad_id = ?, profile_id = ?, reviewed_by = ?, reviewed_at = ?, updated_at = ? WHERE id = ?",
                 (access_level, squad_id, profile["id"], master["id"], timestamp, timestamp, request_id))
    audit.write(conn, master["id"], [("SIGNUP_REQUEST_APPROVED", "SIGNUP_REQUEST", request_id, None, {"profileId": profile["id"], "accessLevel": access_level, "squadId": squad_id}, {"source": "server"})])
    return public_profile(profile)


def reject_signup_request(conn: sqlite3.Connection, master: dict, request_id: str, data: Any) -> None:
    _require_master(master)
    note = security.clean_name((data or {}).get("note") if isinstance(data, dict) else "")[:300]
    with transaction(conn):
        _pending_request(conn, request_id)
        timestamp = utc_now()
        conn.execute("UPDATE signup_requests SET status = 'REJECTED', review_note = ?, reviewed_by = ?, reviewed_at = ?, updated_at = ? WHERE id = ?",
                     (note, master["id"], timestamp, timestamp, request_id))
        audit.write(conn, master["id"], [("SIGNUP_REQUEST_REJECTED", "SIGNUP_REQUEST", request_id, None, {"note": note}, {"source": "server"})])


# --------------------------------------------------------------------------
# Usuários
# --------------------------------------------------------------------------

def list_profiles(conn: sqlite3.Connection, actor: dict) -> list[dict]:
    if actor["access_level"] in ("MASTER", "ADMIN"):
        rows = conn.execute("SELECT * FROM profiles ORDER BY name").fetchall()
    else:
        rows = conn.execute("SELECT * FROM profiles WHERE id = ?", (actor["id"],)).fetchall()
    return [public_profile(row) for row in rows]


def _active_masters_except(conn: sqlite3.Connection, profile_id: str) -> int:
    return conn.execute("SELECT count(*) FROM profiles WHERE access_level = 'MASTER' AND status = 'ACTIVE' AND id <> ?", (profile_id,)).fetchone()[0]


def update_profile(conn: sqlite3.Connection, actor: dict, profile_id: str, data: Any) -> dict:
    if actor["access_level"] not in ("MASTER", "ADMIN"):
        raise Forbidden("Somente administradores podem alterar usuários.")
    if not isinstance(data, dict):
        raise ValidationError("Dados inválidos.")
    is_master = actor["access_level"] == "MASTER"
    with transaction(conn):
        target = _profile(conn, profile_id)
        if not target:
            raise NotFound("Usuário não encontrado.")
        name = security.clean_name(data.get("name"))
        if len(name) < 3 or len(name) > 120:
            raise ValidationError("Informe o nome (3 a 120 caracteres).")
        job_title, status = data.get("job_title"), data.get("status")
        if job_title not in security.JOB_TITLES:
            raise ValidationError("Selecione um cargo válido.")
        if status not in ("ACTIVE", "INACTIVE"):
            raise ValidationError("Selecione um status válido.")
        next_level = data.get("access_level") or target["access_level"]
        if next_level not in security.ACCESS_LEVELS:
            raise ValidationError("Selecione um nível de acesso válido.")
        if next_level != target["access_level"] and not is_master:
            raise Forbidden("Somente MASTER pode alterar o nível de acesso.")
        if target["access_level"] == "MASTER" and not is_master:
            raise Forbidden("Somente MASTER pode alterar um usuário MASTER.")
        if profile_id == actor["id"] and (status != "ACTIVE" or next_level != actor["access_level"]):
            raise Forbidden("Você não pode desativar ou alterar o próprio nível de acesso.")
        if target["access_level"] == "MASTER" and target["status"] == "ACTIVE" and (next_level != "MASTER" or status != "ACTIVE") \
           and _active_masters_except(conn, profile_id) == 0:
            raise Conflict("O sistema precisa de pelo menos um MASTER ativo. Promova outro usuário antes.")
        squad_id = data.get("squad_id") or None
        if squad_id is not None and (not isinstance(squad_id, str) or not conn.execute("SELECT 1 FROM squads WHERE id = ?", (squad_id,)).fetchone()):
            raise ValidationError("Squad inexistente.")
        updated = {**target, "name": name, "job_title": job_title, "squad_id": squad_id, "status": status, "access_level": next_level, "updated_at": utc_now()}
        conn.execute("UPDATE profiles SET name = ?, job_title = ?, squad_id = ?, status = ?, access_level = ?, updated_at = ? WHERE id = ?",
                     (name, job_title, squad_id, status, next_level, updated["updated_at"], profile_id))
        if status != "ACTIVE" or next_level != target["access_level"]:
            # Desativação ou mudança de permissão vale imediatamente: derruba as sessões abertas.
            conn.execute("DELETE FROM sessions WHERE profile_id = ?", (profile_id,))
        audit.record(conn, actor["id"], "profiles", target, updated)
        return public_profile(updated)


def delete_profile(conn: sqlite3.Connection, actor: dict, profile_id: str) -> None:
    if actor["access_level"] != "MASTER":
        raise Forbidden("Somente MASTER pode excluir usuários definitivamente.")
    if profile_id == actor["id"]:
        raise Forbidden("Você não pode excluir o próprio usuário.")
    with transaction(conn):
        target = _profile(conn, profile_id)
        if not target:
            raise NotFound("Usuário não encontrado.")
        if target["access_level"] == "MASTER" and target["status"] == "ACTIVE" and _active_masters_except(conn, profile_id) == 0:
            raise Conflict("Não é possível excluir o último MASTER ativo.")
        conn.execute("DELETE FROM profiles WHERE id = ?", (profile_id,))
        audit.record(conn, actor["id"], "profiles", target, None)


def reset_password(conn: sqlite3.Connection, actor: dict, profile_id: str) -> str:
    """Gera uma senha temporária (exibida uma única vez) e obriga a troca no próximo login."""
    if actor["access_level"] != "MASTER":
        raise Forbidden("Somente MASTER pode redefinir senhas.")
    if profile_id == actor["id"]:
        raise Forbidden("Para alterar a própria senha, use “Alterar senha”.")
    temporary = security.generate_temporary_password()
    with transaction(conn):
        target = _profile(conn, profile_id)
        if not target:
            raise NotFound("Usuário não encontrado.")
        updated = {**target, "password_hash": security.hash_password(temporary), "must_change_password": 1, "password_changed_at": utc_now(), "updated_at": utc_now()}
        conn.execute("UPDATE profiles SET password_hash = ?, must_change_password = 1, password_changed_at = ?, updated_at = ? WHERE id = ?",
                     (updated["password_hash"], updated["password_changed_at"], updated["updated_at"], profile_id))
        conn.execute("DELETE FROM sessions WHERE profile_id = ?", (profile_id,))
        audit.record(conn, actor["id"], "profiles", target, updated)
    return temporary


def list_squads(conn: sqlite3.Connection) -> list[dict]:
    return [dict(row) for row in conn.execute("SELECT id, name, is_active FROM squads ORDER BY name")]


def list_audit_logs(conn: sqlite3.Connection, actor: dict, limit: int = 5000) -> list[dict]:
    if actor["access_level"] not in ("MASTER", "ADMIN"):
        raise Forbidden("Somente administradores ou MASTER podem consultar o Registro de atividades.")
    rows = conn.execute("SELECT * FROM audit_logs ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
    loads = lambda value: None if value is None else json.loads(value)  # noqa: E731
    return [{**dict(row), "previous_data": loads(row["previous_data"]), "new_data": loads(row["new_data"]), "metadata": loads(row["metadata"]) or {}} for row in rows]
