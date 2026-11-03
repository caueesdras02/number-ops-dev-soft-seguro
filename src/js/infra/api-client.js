// Cliente HTTP da API local (servidor Python). A sessão vive num cookie HttpOnly
// (inacessível ao JavaScript); aqui só guardamos o token anti-CSRF, que o
// servidor exige em toda requisição que altera dados.
let csrfToken = null;

export function setCsrfToken(token) { csrfToken = token || null; }

export class ApiError extends Error {
  constructor(message, status) { super(message); this.name = "ApiError"; this.status = status; }
}

export async function api(path, { method = "GET", body } = {}) {
  const headers = { "X-Requested-With": "number-ops" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (csrfToken && method !== "GET") headers["X-CSRF-Token"] = csrfToken;
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
