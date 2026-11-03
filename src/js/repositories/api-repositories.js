import { api, setCsrfToken } from "../infra/api-client.js";

const id = (value) => encodeURIComponent(value);

export class ApiAuthRepository {
  async getSession() { const data = await api("/api/auth/session"); setCsrfToken(data.csrfToken); return data; }
  async signIn({ email, password }) { const data = await api("/api/auth/login", { method: "POST", body: { email, password } }); setCsrfToken(data.csrfToken); return data; }
  async setupMaster(payload) { const data = await api("/api/auth/setup", { method: "POST", body: payload }); setCsrfToken(data.csrfToken); return data; }
  async requestAccess(payload) { return api("/api/signup-requests", { method: "POST", body: payload }); }
  async changePassword(currentPassword, newPassword) { return api("/api/auth/change-password", { method: "POST", body: { currentPassword, newPassword } }); }
  async signOut() { try { await api("/api/auth/logout", { method: "POST" }); } finally { setCsrfToken(null); } }
}

export const createApiRepositories = () => Object.freeze({
  profiles: {
    list: async () => (await api("/api/profiles")).profiles,
    update: async (profileId, changes) => (await api(`/api/profiles/${id(profileId)}`, { method: "PATCH", body: changes })).profile,
    remove: async (profileId) => { await api(`/api/profiles/${id(profileId)}`, { method: "DELETE" }); },
    resetPassword: async (profileId) => (await api(`/api/profiles/${id(profileId)}/reset-password`, { method: "POST" })).temporaryPassword,
  },
  squads: { list: async () => (await api("/api/squads")).squads },
  auditLogs: { list: async () => (await api("/api/audit-logs")).logs },
  signupRequests: {
    list: async () => (await api("/api/signup-requests")).requests,
    pendingCount: async () => (await api("/api/signup-requests/pending-count")).pending,
    approve: async (requestId, { accessLevel, squadId }) => (await api(`/api/signup-requests/${id(requestId)}/approve`, { method: "POST", body: { accessLevel, squadId: squadId || null } })).profile,
    reject: async (requestId, note = "") => { await api(`/api/signup-requests/${id(requestId)}/reject`, { method: "POST", body: { note } }); },
  },
});

/** Porta de exclusão definitiva (MASTER) usada pelos services: port[colecao].remove(id). */
export const createHardDeletePort = () => Object.fromEntries(
  ["numbers", "clients", "groups", "responsibles", "locations", "campaigns"].map((collection) => [collection, { remove: (recordId) => api(`/api/records/${collection}/${id(recordId)}`, { method: "DELETE" }) }]),
);
