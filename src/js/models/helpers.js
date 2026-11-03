export function createId(prefix) { const suffix = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`; return `${prefix}_${suffix}`; }
export function now() { return new Date().toISOString(); }
export function normalizePhone(phone) { return String(phone ?? "").replace(/\D/g, ""); }
