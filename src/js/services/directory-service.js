import { createClient, createGroup, createResponsible, createLocation } from "../models/entities.js";
import { now } from "../models/helpers.js";
import { assertHardDeletable, applyLocalHardDelete } from "../models/hard-delete.js";

const creators = { clients: createClient, groups: createGroup, responsibles: createResponsible, locations: createLocation };
const hardDeleteEntity = { clients: "clients", groups: "groups", responsibles: "responsibles", locations: "locations" };

export class DirectoryService {
  constructor(numbersService) { this.numbersService = numbersService; }
  list(type, includeInactive = false) { return this.numbersService.state[type].filter((item) => includeInactive || item.isActive); }
  get(type, id) { return this.numbersService.state[type].find((item) => item.id === id) ?? null; }
  create(type, input) { const name = String(input.name ?? "").trim(); if (!name) throw new Error("Informe o nome."); const item = creators[type]({ ...input, name }); this.numbersService.state[type].push(item); this.numbersService.persist(); return item; }
  update(type, id, input) {
    const item = this.numbersService.state[type].find((entry) => entry.id === id);
    if (!item) throw new Error("Registro não encontrado.");
    const name = String(input.name ?? "").trim();
    if (!name) throw new Error("Informe o nome.");
    Object.assign(item, {
      name,
      ...(type === "responsibles" ? { team: String(input.team ?? item.team ?? "").trim(), squadId: input.squadId || null } : {}),
      ...(type === "clients" ? { squadId: input.squadId || null } : {}),
      ...(type === "locations" ? { responsibleId: input.responsibleId || null } : {}),
      updatedAt: now(),
    });
    this.numbersService.persist();
    return item;
  }
  archive(type, id) { const item = this.numbersService.state[type].find((entry) => entry.id === id); if (!item) throw new Error("Registro não encontrado."); item.isActive = false; item.updatedAt = now(); this.numbersService.persist(); }
  restore(type, id) { const item = this.get(type, id); if (!item) throw new Error("Registro não encontrado."); item.isActive = true; item.updatedAt = now(); this.numbersService.persist(); }

  /** Atribui um squad a vários clientes de uma vez (ação em massa MASTER/ADMIN). */
  bulkAssignSquad(clientIds, squadId) {
    const ids = new Set(clientIds ?? []);
    if (!ids.size) throw new Error("Selecione ao menos um cliente.");
    const squad = squadId ? this.numbersService.state.groups.find((group) => group.id === squadId) : null;
    if (squadId && !squad) throw new Error("Squad inválido.");
    let updated = 0;
    this.numbersService.state.clients.forEach((client) => {
      if (ids.has(client.id) && (client.squadId ?? null) !== (squadId || null)) { client.squadId = squadId || null; client.updatedAt = now(); updated += 1; }
    });
    if (updated) this.numbersService.persist();
    return updated;
  }

  /** Exclusão definitiva (MASTER). */
  async hardDelete(type, id) {
    const item = this.get(type, id);
    if (!item) throw new Error("Registro não encontrado.");
    const entity = hardDeleteEntity[type];
    assertHardDeletable(this.numbersService.state, entity, id);
    const port = this.numbersService.hardDeletePort;
    if (port?.[type]) await port[type].remove(id);
    applyLocalHardDelete(this.numbersService.state, entity, id);
    this.numbersService.persist();
    return item;
  }

  flush() { return this.numbersService.flush(); }
}
