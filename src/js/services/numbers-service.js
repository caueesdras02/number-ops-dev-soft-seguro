import { NUMBER_STATUSES } from "../config/constants.js";
import { createNumber, getUtilization, UTILIZATION } from "../models/number.js";
import { normalizePhone, now } from "../models/helpers.js";
import { assertHardDeletable, applyLocalHardDelete } from "../models/hard-delete.js";
import { HistoryService } from "./history-service.js";

export class NumbersService {
  constructor(repository, { hardDeletePort = null } = {}) {
    this.repository = repository;
    this.hardDeletePort = hardDeletePort;
    this.state = repository.initialize();
    this.state.campaigns ??= [];
    this.state.numberCampaignLinks ??= [];
    this.state.numbers = (this.state.numbers ?? []).map((number) => ({ ...number, groupCount: number.groupCount ?? 0 }));
    this.state.clients = (this.state.clients ?? []).map((client) => ({ ...client, squadId: client.squadId ?? null }));
    this.state.responsibles = (this.state.responsibles ?? []).map((responsible) => ({ ...responsible, squadId: responsible.squadId ?? null }));
    this.state.locations = (this.state.locations ?? []).map((location) => ({ ...location, responsibleId: location.responsibleId ?? null }));
    this.history = new HistoryService(this);
  }

  hasActiveCampaignLink(numberId) {
    return this.state.numberCampaignLinks.some((link) => link.numberId === numberId && !link.endedAt);
  }

  /** Utilização derivada: EM USO (vínculo ativo) / DISPONÍVEL (apto e livre) / INDISPONÍVEL. */
  utilizationOf(numberOrId) {
    const number = typeof numberOrId === "string" ? this.getNumber(numberOrId) : numberOrId;
    if (!number) return UTILIZATION.UNAVAILABLE;
    return getUtilization(number, this.hasActiveCampaignLink(number.id));
  }

  getNumbers(query = "", filters = {}) {
    const normalizedQuery = normalizePhone(query);
    return this.state.numbers.filter((number) => {
      const activeCampaignLink=this.state.numberCampaignLinks.find((link)=>link.numberId===number.id&&!link.endedAt);
      const matchesQuery = !normalizedQuery || number.phone.includes(normalizedQuery);
      const archiveFilter = filters.archiveFilter ?? "ALL";
      const matchesArchive = archiveFilter === "ARCHIVED" ? Boolean(number.archivedAt) : archiveFilter === "ACTIVE" ? !number.archivedAt : true;
      const matchesCampaign=!filters.campaignId||activeCampaignLink?.campaignId===filters.campaignId;
      const matchesUtilization=!filters.utilization||this.utilizationOf(number)===filters.utilization;
      return matchesQuery && matchesArchive && matchesCampaign && matchesUtilization && (!filters.status || number.status === filters.status) && (!filters.locationId || number.locationId === filters.locationId) && (!filters.responsibleId || number.responsibleId === filters.responsibleId) && (!filters.clientId || number.clientIds.includes(filters.clientId)) && (!filters.groupId || number.groupIds.includes(filters.groupId));
    });
  }

  getNumbersFor(type, id) {
    if (type === "clients") return this.state.numbers.filter((number) => number.clientIds.includes(id));
    if (type === "groups") return this.state.numbers.filter((number) => number.groupIds.includes(id));
    if (type === "locations") return this.state.numbers.filter((number) => number.locationId === id);
    if (type === "responsibles") return this.state.numbers.filter((number) => number.responsibleId === id);
    return [];
  }

  getNumber(id) { return this.state.numbers.find((number) => number.id === id) ?? null; }
  getLocations() { return [...this.state.locations].filter((location) => location.isActive); }
  getResponsibles() { return [...this.state.responsibles].filter((responsible) => responsible.isActive); }
  getClients() { return [...this.state.clients].filter((client) => client.isActive); }
  getGroups() { return [...this.state.groups].filter((group) => group.isActive); }

  create(input, { historyDescription = "Número cadastrado.", historyMetadata = {} } = {}) {
    const phone = this.validatePhone(input.phone);
    this.assertPhoneIsUnique(phone);
    const groupCount = this.validateGroupCount(input.groupCount);
    const number = createNumber({ ...input, phone, groupCount });
    // Regra: chip cadastrado já como Inativo nasce arquivado.
    if (number.status === NUMBER_STATUSES.INACTIVE) number.archivedAt = number.createdAt;
    this.state.numbers = [...this.state.numbers, number];
    this.persist();
    this.record(number.id, "NUMBER_CREATED", historyDescription, { newValue: number, ...historyMetadata });
    if (number.archivedAt) this.record(number.id, "NUMBER_ARCHIVED", "Número arquivado automaticamente (chip inativo).", { previousValue: null, newValue: { status: number.status, archivedAt: number.archivedAt } });
    return number;
  }

  update(id, input) {
    const existing = this.getNumber(id);
    if (!existing) throw new Error("Número não encontrado.");
    const phone = this.validatePhone(input.phone);
    this.assertPhoneIsUnique(phone, id);
    const groupCount = this.validateGroupCount(input.groupCount ?? existing.groupCount ?? 0);
    const updated = {
      ...existing,
      phone,
      identification: (input.identification ?? existing.identification ?? "").trim(),
      status: input.status ?? existing.status,
      locationId: input.locationId || null,
      responsibleId: input.responsibleId || null,
      clientIds: input.clientIds ?? existing.clientIds ?? [],
      groupIds: input.groupIds ?? existing.groupIds ?? [],
      groupCount,
      notes: (input.notes ?? existing.notes ?? "").trim(),
      updatedAt: now(),
    };
    // Regra: chip que passa para Inativo é arquivado automaticamente e sai das campanhas.
    const autoArchived = updated.status === NUMBER_STATUSES.INACTIVE && !updated.archivedAt;
    if (autoArchived) updated.archivedAt = updated.updatedAt;
    this.state.numbers = this.state.numbers.map((number) => number.id === id ? updated : number);
    if (autoArchived) this.endActiveCampaignLinks(id);
    this.persist();
    this.recordChanges(existing, updated);
    if (autoArchived) this.record(id, "NUMBER_ARCHIVED", "Número arquivado automaticamente (chip inativo).", { previousValue: { status: existing.status, archivedAt: null }, newValue: { status: updated.status, archivedAt: updated.archivedAt } });
    return updated;
  }

  archive(id) {
    const existing = this.getNumber(id);
    if (!existing) throw new Error("Número não encontrado.");
    const archived = { ...existing, status: NUMBER_STATUSES.INACTIVE, archivedAt: now(), updatedAt: now() };
    this.state.numbers = this.state.numbers.map((number) => number.id === id ? archived : number);
    this.endActiveCampaignLinks(id);
    this.persist();
    this.record(id, "NUMBER_ARCHIVED", "Número arquivado.", { previousValue: { status: existing.status, archivedAt: existing.archivedAt }, newValue: { status: archived.status, archivedAt: archived.archivedAt } });
    return archived;
  }

  restore(id, status = NUMBER_STATUSES.ACTIVE) {
    const existing = this.getNumber(id);
    if (!existing) throw new Error("Número não encontrado.");
    if (status === NUMBER_STATUSES.INACTIVE) throw new Error("Para desarquivar, escolha um status diferente de Inativo.");
    const restored = { ...existing, status, archivedAt: null, updatedAt: now() };
    this.state.numbers = this.state.numbers.map((number) => number.id === id ? restored : number);
    this.persist();
    this.record(id, "NUMBER_RESTORED", "Número desarquivado.", { previousValue: { status: existing.status, archivedAt: existing.archivedAt }, newValue: { status: restored.status, archivedAt: restored.archivedAt } });
    return restored;
  }

  markUnderReview(id) {
    const existing = this.getNumber(id);
    if (!existing) throw new Error("Número não encontrado.");
    if (existing.status === NUMBER_STATUSES.UNDER_REVIEW) return existing;
    return this.update(id, { ...existing, status: NUMBER_STATUSES.UNDER_REVIEW });
  }

  registerRestriction(id, input) {
    const existing = this.getNumber(id);
    if (!existing) throw new Error("Número não encontrado.");
    const kind = String(input.kind ?? "");
    const descriptions = { GROUP_CREATION: "Não consegue criar squads", SEND_LIMIT: "Limitação no envio", NO_AREA: "Sem área — número não pode ser utilizado", OTHER: "Outra restrição" };
    if (!descriptions[kind]) throw new Error("Selecione o tipo de restrição.");
    const description = String(input.description ?? "").trim();
    if (kind === "OTHER" && !description) throw new Error("Descreva a outra restrição.");
    const restriction = { kind, description: kind === "OTHER" ? description : descriptions[kind], recordedAt: now() };
    const updated = { ...existing, restriction, updatedAt: now() };
    this.state.numbers = this.state.numbers.map((number) => number.id === id ? updated : number);
    this.persist();
    this.record(id, "NUMBER_RESTRICTION_RECORDED", "Restrição operacional registrada.", { previousValue: existing.restriction ?? null, newValue: restriction });
    return updated;
  }

  removeRestriction(id) {
    const existing = this.getNumber(id);
    if (!existing) throw new Error("Número não encontrado.");
    if (!existing.restriction) return existing;
    const updated = { ...existing, restriction: null, updatedAt: now() };
    this.state.numbers = this.state.numbers.map((number) => number.id === id ? updated : number);
    this.persist();
    this.record(id, "NUMBER_RESTRICTION_REMOVED", "Restrição operacional removida.", { previousValue: existing.restriction, newValue: null });
    return updated;
  }

  /** Deriva cliente/squad da campanha vinculada, sem remover associações existentes nem duplicar IDs. */
  deriveClientAndSquad(numberId, { clientId = null, squadId = null } = {}) {
    const existing = this.getNumber(numberId);
    if (!existing) return existing;
    const clientIds = clientId && !existing.clientIds.includes(clientId) ? [...existing.clientIds, clientId] : existing.clientIds;
    const groupIds = squadId && !existing.groupIds.includes(squadId) ? [...existing.groupIds, squadId] : existing.groupIds;
    if (clientIds === existing.clientIds && groupIds === existing.groupIds) return existing;
    const updated = { ...existing, clientIds, groupIds, updatedAt: now() };
    this.state.numbers = this.state.numbers.map((number) => number.id === numberId ? updated : number);
    this.persist();
    if (clientIds !== existing.clientIds) this.record(numberId, "CLIENT_ASSOCIATED", "Cliente associado automaticamente pela campanha.", { newValue: clientId });
    if (groupIds !== existing.groupIds) this.record(numberId, "GROUP_ASSOCIATED", "Squad associado automaticamente pela campanha.", { newValue: squadId });
    return updated;
  }

  /** Exclusão definitiva (MASTER). Bloqueia se houver referências; remove no banco antes do estado local. */
  async hardDelete(id) {
    const existing = this.getNumber(id);
    if (!existing) throw new Error("Número não encontrado.");
    assertHardDeletable(this.state, "numbers", id);
    if (this.hardDeletePort?.numbers) await this.hardDeletePort.numbers.remove(id);
    applyLocalHardDelete(this.state, "numbers", id);
    this.persist();
    return existing;
  }

  /** Número fora de operação (arquivado/inativo) não fica "em uso" em nenhuma campanha. */
  endActiveCampaignLinks(numberId) {
    const timestamp = now();
    this.state.numberCampaignLinks.filter((link) => link.numberId === numberId && !link.endedAt).forEach((link) => {
      link.endedAt = timestamp; link.updatedAt = timestamp;
      this.record(numberId, "CAMPAIGN_LEFT", "Número saiu da campanha (arquivado).", { previousValue: link.campaignId, newValue: null });
    });
  }

  persist() { return this.repository.save(this.state); }
  flush() { return this.repository.flush?.() ?? Promise.resolve(); }

  /** Restauração de backup: o servidor substitui a base inteira (ver ApiStateRepository.replaceAll). */
  replaceState(state) { this.state = state; return this.repository.replaceAll ? this.repository.replaceAll(state) : this.persist(); }

  record(numberId, type, description, metadata) { this.history.add({ numberId, type, description, metadata }); }

  recordChanges(previous, next) {
    const fields = [["status", "NUMBER_STATUS_CHANGED", "Status alterado."], ["locationId", "NUMBER_LOCATION_CHANGED", "Localização alterada."], ["responsibleId", "NUMBER_RESPONSIBLE_CHANGED", "Responsável alterado."], ["groupCount", "GROUP_COUNT_CHANGED", "Quantidade de grupos alterada."]];
    fields.forEach(([field, type, description]) => { if (previous[field] !== next[field]) this.record(next.id, type, description, { previousValue: previous[field], newValue: next[field] }); });
    [["clientIds", "CLIENT", "Cliente"], ["groupIds", "GROUP", "Squad"]].forEach(([field, key, label]) => { const oldIds = previous[field] ?? [], newIds = next[field] ?? []; newIds.filter((id) => !oldIds.includes(id)).forEach((id) => this.record(next.id, `${key}_ASSOCIATED`, `${label} associado.`, { newValue: id })); oldIds.filter((id) => !newIds.includes(id)).forEach((id) => this.record(next.id, `${key}_REMOVED`, `${label} removido.`, { previousValue: id })); });
  }

  validatePhone(phone) {
    const normalized = normalizePhone(phone);
    if (!normalized) throw new Error("Informe o número de telefone.");
    if (!normalized.startsWith("55") || (normalized.length !== 12 && normalized.length !== 13)) throw new Error("Informe um telefone brasileiro com 55, DDD e 8 ou 9 dígitos.");
    return normalized;
  }

  validateGroupCount(value) {
    const normalized = value === "" || value === undefined || value === null ? 0 : Number(value);
    if (!Number.isInteger(normalized) || normalized < 0) throw new Error("A quantidade de grupos deve ser um número inteiro maior ou igual a zero.");
    return normalized;
  }

  assertPhoneIsUnique(phone, excludedId = null) {
    const duplicate = this.state.numbers.some((number) => number.phone === phone && number.id !== excludedId);
    if (duplicate) throw new Error("Este telefone já está cadastrado.");
  }
}
