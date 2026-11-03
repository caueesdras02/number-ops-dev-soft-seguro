import { ACCESS_LEVELS, isMaster } from "../models/access.js";

const LEVELS = new Set(ACCESS_LEVELS);

/**
 * Solicitações de acesso enviadas pela tela "Solicitar acesso". Só MASTER lista,
 * aprova (escolhendo nível de acesso e Squad) ou recusa — o servidor reforça isso.
 * CPF duplicado nunca chega aqui: o servidor recusa já no envio da solicitação.
 */
export class SignupRequestsService {
  constructor(repository) { this.repository = repository; }

  async list() { return this.repository.list(); }
  async pendingCount() { return this.repository.pendingCount(); }

  async approve(id, { accessLevel, squadId }, currentProfile) {
    if (!isMaster(currentProfile)) throw new Error("Somente MASTER pode aprovar solicitações de acesso.");
    if (!LEVELS.has(accessLevel)) throw new Error("Selecione um nível de acesso válido.");
    return this.repository.approve(id, { accessLevel, squadId });
  }

  async reject(id, note, currentProfile) {
    if (!isMaster(currentProfile)) throw new Error("Somente MASTER pode recusar solicitações de acesso.");
    return this.repository.reject(id, String(note ?? "").trim().slice(0, 300));
  }
}
