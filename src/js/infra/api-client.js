// Cliente HTTP da API local (servidor Python). A sessão vive num cookie HttpOnly
// (inacessível ao JavaScript); aqui só guardamos o token anti-CSRF, que o
// servidor exige em toda requisição que altera dados.
//
// Sem servidor (ex.: GitHub Pages), o mesmo backend Python roda no navegador via
// Pyodide (python-worker.js) e as requisições vão para ele em vez da rede.
let csrfToken = null;

export function setCsrfToken(token) { csrfToken = token || null; }

export class ApiError extends Error {
  constructor(message, status) { super(message); this.name = "ApiError"; this.status = status; }
}

let backendMode = null;

/** "server" (python server.py) ou "browser" (Python no navegador, via Pyodide). */
export function getBackendMode() {
  backendMode ??= fetch("/api/auth/session", { headers: { "X-Requested-With": "number-ops" }, credentials: "same-origin", cache: "no-store" })
    .then((response) => ((response.headers.get("Content-Type") || "").startsWith("application/json") ? "server" : "browser"))
    .catch(() => "browser");
  return backendMode;
}

export async function api(path, { method = "GET", body } = {}) {
  const headers = { "X-Requested-With": "number-ops" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (csrfToken && method !== "GET") headers["X-CSRF-Token"] = csrfToken;
  if (await getBackendMode() === "browser") return browserApi(path, method, headers, body);
  let response;
  try {
    response = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), credentials: "same-origin", cache: "no-store" });
  } catch {
    throw new ApiError("Não foi possível conectar ao servidor do Number Ops. Verifique se ele está em execução (python server.py).", 0);
  }
  let data = null;
  try { data = await response.json(); } catch { data = null; }
  if (!response.ok) throw new ApiError(data?.error || `Erro ${response.status} no servidor.`, response.status);
  return data;
}

// --------------------------------------------------------------------------
// Modo navegador: o "cookie" de sessão fica no localStorage (não há HttpOnly sem servidor).
// --------------------------------------------------------------------------

const SESSION_KEY = "number-ops:session";
const pending = new Map();
let worker = null;
let nextId = 0;

function readSessionToken() { try { return localStorage.getItem(SESSION_KEY); } catch { return null; } }

function storeSessionCookie(setCookie) {
  const match = /^[^=]+=([^;]*);.*Max-Age=(\d+)/.exec(setCookie);
  try {
    if (match && match[1] && Number(match[2]) > 0) localStorage.setItem(SESSION_KEY, match[1]);
    else localStorage.removeItem(SESSION_KEY);
  } catch { /* sem armazenamento: a sessão dura só até recarregar */ }
}

function callWorker(message) {
  if (!worker) {
    worker = new Worker(new URL("./python-worker.js", import.meta.url), { type: "module" });
    worker.onmessage = ({ data }) => { pending.get(data.id)?.(data); pending.delete(data.id); };
    worker.onerror = (event) => {
      event.preventDefault?.();
      pending.forEach((resolve, id) => resolve({ id, failure: event.message || "falha ao carregar o Pyodide" }));
      pending.clear();
      worker = null;
    };
  }
  const id = ++nextId;
  return new Promise((resolve) => { pending.set(id, resolve); worker.postMessage({ ...message, id }); });
}

async function browserApi(path, method, headers, body) {
  const token = readSessionToken();
  if (token) headers.Cookie = `nops_session=${token}`;
  const reply = await callWorker({ method, path, headers, body: body === undefined ? "" : JSON.stringify(body) });
  if (reply.failure) throw new ApiError(`Não foi possível iniciar o Python no navegador (Pyodide): ${reply.failure}`, 0);
  if (reply.setCookie) storeSessionCookie(reply.setCookie);
  if (reply.status >= 400) throw new ApiError(reply.body?.error || `Erro ${reply.status} no backend.`, reply.status);
  return reply.body;
}
