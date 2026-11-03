import { api } from "../infra/api-client.js";

const clone = (value) => JSON.parse(JSON.stringify(value));
const COLLECTIONS = ["groups", "clients", "responsibles", "locations", "numbers", "campaigns", "numberCampaignLinks", "incidents", "historyEvents"];

/**
 * Estado operacional compartilhado, guardado no banco SQLite pelo servidor Python.
 * Mesma interface que os services já usavam (initialize/save/flush): a cada save,
 * envia só os registros que mudaram desde a última gravação confirmada. Quem valida
 * e aplica as permissões é o servidor — este arquivo não decide nada de segurança.
 */
export class ApiStateRepository {
  constructor(state) { this.state = clone(state); this.previous = clone(state); this.pending = Promise.resolve(); this.onRejected = null; }

  static async create() {
    const { state } = await api("/api/state");
    return new ApiStateRepository(state);
  }

  initialize() { return clone(this.state); }
  save(state) {
    const snapshot = clone(state);
    this.pending = this.pending.catch(() => {}).then(() => this.sync(snapshot));
    return this.pending;
  }
  flush() { return this.pending; }

  async sync(state) {
    const changes = {};
    let count = 0;
    for (const key of COLLECTIONS) {
      const previous = new Map((this.previous[key] ?? []).map((item) => [item.id, JSON.stringify(item)]));
      const rows = (state[key] ?? []).filter((item) => previous.get(item.id) !== JSON.stringify(item));
      if (rows.length) { changes[key] = rows; count += rows.length; }
    }
    if (count) {
      try { await api("/api/state/sync", { method: "POST", body: { changes } }); }
      catch (error) {
        // Recusa definitiva do servidor (permissão, validação, conflito): não reenvia a mesma
        // alteração para sempre; o app recarrega os dados reais do banco (ver app.js).
        if (error.status >= 400 && error.status < 500) { this.previous = clone(state); this.onRejected?.(error); }
        throw error;
      }
    }
    this.state = clone(state);
    this.previous = clone(state);
  }

  /** Restauração completa de backup (somente MASTER; o servidor guarda uma cópia antes). */
  async replaceAll(state) {
    await this.flush().catch(() => {});
    const result = await api("/api/state/restore", { method: "POST", body: { state } });
    this.state = clone(state);
    this.previous = clone(state);
    return result;
  }
}
