import { createCampaign, createNumberCampaignLink } from "../models/entities.js";
import { now } from "../models/helpers.js";
import { assertHardDeletable, applyLocalHardDelete } from "../models/hard-delete.js";
import { hasBlockingRestriction } from "../models/number.js";

export const CAMPAIGN_STATUSES = Object.freeze({ ACTIVE: "ACTIVE", CLOSED: "CLOSED" });
export const CAMPAIGN_ROLES = Object.freeze({ PRIMARY: "PRIMARY", BACKUP: "BACKUP", SUPPORT: "SUPPORT" });
/**
 * Etapa OPERACIONAL da campanha — só existe (é gravada) enquanto a campanha está ACTIVE.
 * "Encerrada" NUNCA é um valor de `stage`: é só a leitura de status==='CLOSED', que já existe
 * — evita duas fontes da mesma verdade. changeStage() nunca mexe em status/endedAt/número/
 * cliente/responsável/vínculo; close()/reactivate() nunca mexem em stage (por isso reabrir
 * preserva a última etapa automaticamente, sem precisar de nenhuma lógica extra).
 */
export const CAMPAIGN_STAGES = Object.freeze(["PLANEJAMENTO", "EM_ANDAMENTO"]);
export const CAMPAIGN_STAGE_LABELS = Object.freeze({ PLANEJAMENTO: "Planejamento", EM_ANDAMENTO: "Em andamento", ENCERRADA: "Encerrada" });
/** Etapa "efetiva" para exibição: quando a campanha está CLOSED, mostra sempre "Encerrada"
 * (derivado do status estrutural) — nunca lê `stage` nesse caso, mesmo que o valor gravado
 * continue lá (preservado pra quando a campanha for reaberta). */
export function effectiveCampaignStage(campaign) {
  return campaign.status === CAMPAIGN_STATUSES.CLOSED ? "ENCERRADA" : campaign.stage;
}

export class CampaignsService {
  constructor(numbersService) { this.numbers = numbersService; this.state = numbersService.state; this.state.campaigns ??= []; this.state.numberCampaignLinks ??= []; }
  list(filters = {}) { return this.state.campaigns.filter((item) => (!filters.query || item.name.toLocaleLowerCase("pt-BR").includes(filters.query.toLocaleLowerCase("pt-BR"))) && (!filters.status || item.status === filters.status) && (!filters.stage || item.stage === filters.stage) && (!filters.squadId || item.squadId === filters.squadId) && (!filters.clientId || item.clientId === filters.clientId)); }
  get(id) { return this.state.campaigns.find((item) => item.id === id) ?? null; }
  create(input) { this.validate(input); const item = createCampaign({ ...input, status: CAMPAIGN_STATUSES.ACTIVE }); this.state.campaigns.push(item); this.persist(); return item; }
  update(id, input) { const existing = this.get(id); if (!existing) throw new Error("Campanha não encontrada."); this.validate(input); const item = { ...existing, name: String(input.name).trim(), clientId: input.clientId || null, squadId: input.squadId || null, responsibleId: input.responsibleId || null, notes: String(input.notes ?? "").trim(), updatedAt: now() }; Object.assign(existing, item); this.persist(); return existing; }
  close(id) { const item = this.get(id); if (!item) throw new Error("Campanha não encontrada."); if(item.status===CAMPAIGN_STATUSES.CLOSED)return item;item.status = CAMPAIGN_STATUSES.CLOSED; item.endedAt = now(); item.updatedAt = now(); this.state.numberCampaignLinks.filter((link) => link.campaignId === id && !link.endedAt).forEach((link) => { link.endedAt = item.endedAt; link.updatedAt = item.endedAt; this.numbers.record(link.numberId, "CAMPAIGN_LEFT", "Número saiu da campanha.", { previousValue: id, newValue: null }); }); this.persist(); return item; }
  reactivate(id) { const item = this.get(id); if (!item) throw new Error("Campanha não encontrada."); if (item.status === CAMPAIGN_STATUSES.ACTIVE) return item; item.status = CAMPAIGN_STATUSES.ACTIVE; item.endedAt = null; item.updatedAt = now(); this.persist(); return item; }
  /** Etapa operacional (Planejamento / Em andamento) — só se aplica a campanha ACTIVE;
   * nunca mexe em status estrutural, endedAt, número, cliente, responsável ou vínculo.
   * Idempotente. Para "Encerrada", use close() diretamente (é o fluxo oficial, não duplicado
   * aqui — ver CampaignsController). */
  changeStage(id, stage) {
    const item = this.get(id);
    if (!item) throw new Error("Campanha não encontrada.");
    if (item.status !== CAMPAIGN_STATUSES.ACTIVE) throw new Error("Só é possível alterar a etapa de uma campanha ativa.");
    if (!CAMPAIGN_STAGES.includes(stage)) throw new Error("Selecione uma etapa válida.");
    if (item.stage === stage) return item;
    item.stage = stage;
    item.updatedAt = now();
    this.persist();
    return item;
  }
  /** Candidatos a novo vínculo: nem arquivados, nem com restrição operacional bloqueante (ex.: Sem área). */
  availableNumbers() { return this.numbers.state.numbers.filter((number) => !number.archivedAt && !hasBlockingRestriction(number)); }
  /** Números disponíveis para vincular a uma campanha específica (exclui os já vinculados ativamente a ELA; um número pode estar em outras campanhas). */
  availableNumbersFor(campaignId) { const linked = new Set(this.activeLinksForCampaign(campaignId).map((link) => link.numberId)); return this.availableNumbers().filter((number) => !linked.has(number.id)); }
  /** Vínculo ativo entre um número e UMA campanha específica (um número pode ter vínculos ativos com várias campanhas). */
  activeLinkForPair(numberId, campaignId) { return this.state.numberCampaignLinks.find((link) => link.numberId === numberId && link.campaignId === campaignId && !link.endedAt) ?? null; }
  /** Todos os vínculos ativos (em qualquer campanha) de um número — um número pode estar em uso por várias campanhas simultaneamente. */
  activeLinksFor(numberId) { return this.state.numberCampaignLinks.filter((link) => link.numberId === numberId && !link.endedAt).sort((a, b) => a.startedAt.localeCompare(b.startedAt)); }
  activeLinksForCampaign(campaignId) { return this.state.numberCampaignLinks.filter((link) => link.campaignId === campaignId && !link.endedAt); }
  linksFor(numberId) { return this.state.numberCampaignLinks.filter((link) => link.numberId === numberId).sort((a,b) => b.startedAt.localeCompare(a.startedAt)); }
  /** Vincula um número a uma campanha (não afeta vínculos ativos com OUTRAS campanhas). Trocar o papel na MESMA campanha encerra o vínculo anterior e cria um novo, preservando histórico. Deriva cliente/squad da campanha no número. */
  assign(numberId, campaignId, role) {
    const campaign = this.get(campaignId);
    if (!campaign || campaign.status !== CAMPAIGN_STATUSES.ACTIVE) throw new Error("Selecione uma campanha ativa.");
    if (!Object.values(CAMPAIGN_ROLES).includes(role)) throw new Error("Selecione o papel do número na campanha.");
    const previous = this.activeLinkForPair(numberId, campaignId);
    if (previous?.role === role) return previous;
    if (!previous) {
      const number = this.numbers.getNumber(numberId);
      if (!number) throw new Error("Número não encontrado.");
      if (hasBlockingRestriction(number)) throw new Error("Este número possui uma restrição operacional ativa (Sem área) e não pode ser vinculado a uma nova campanha.");
    }
    if (previous) { previous.endedAt = now(); previous.updatedAt = previous.endedAt; this.numbers.record(numberId, "CAMPAIGN_LEFT", "Número saiu da campanha.", { previousValue: campaignId, newValue: null }); }
    const link = createNumberCampaignLink({ numberId, campaignId, role });
    this.state.numberCampaignLinks.push(link);
    this.numbers.deriveClientAndSquad(numberId, { clientId: campaign.clientId, squadId: campaign.squadId });
    this.persist();
    this.numbers.record(numberId, "CAMPAIGN_JOINED", "Número entrou em campanha.", { previousValue: previous ? campaignId : null, newValue: { campaignId, role } });
    return link;
  }
  /** Encerra SOMENTE o vínculo com a campanha informada; outros vínculos ativos do número não são afetados. */
  unassign(numberId, campaignId) {
    const link = this.activeLinkForPair(numberId, campaignId);
    if (!link) return null;
    link.endedAt = now(); link.updatedAt = link.endedAt;
    this.persist();
    this.numbers.record(numberId, "CAMPAIGN_LEFT", "Número saiu da campanha.", { previousValue: campaignId, newValue: null });
    return link;
  }
  async hardDelete(id) {
    const existing = this.get(id);
    if (!existing) throw new Error("Campanha não encontrada.");
    assertHardDeletable(this.state, "campaigns", id);
    const port = this.numbers.hardDeletePort;
    if (port?.campaigns) await port.campaigns.remove(id);
    applyLocalHardDelete(this.state, "campaigns", id);
    this.persist();
    return existing;
  }

  /**
   * Corrige retroativamente números cujo cliente/squad da campanha nunca foi derivado
   * (vínculos ativos criados antes desta derivação automática existir). Idempotente:
   * só grava quando falta algo, nunca remove associações existentes.
   */
  reconcileClientSquadFromActiveLinks() {
    this.state.numberCampaignLinks.filter((link) => !link.endedAt).forEach((link) => {
      const campaign = this.get(link.campaignId);
      if (campaign) this.numbers.deriveClientAndSquad(link.numberId, { clientId: campaign.clientId, squadId: campaign.squadId });
    });
  }

  /**
   * Diagnóstico (não altera nada): números que têm um cliente associado (clientIds) mas
   * NÃO possuem vínculo ativo com nenhuma campanha ativa daquele cliente. Sinal de que o
   * vínculo real pode nunca ter sido criado (ex.: limitação do sistema antigo de só 1
   * vínculo ativo por número) — precisa de revisão humana, não é corrigido automaticamente.
   */
  findClientCampaignGaps() {
    const activeCampaignsByClient = new Map();
    this.state.campaigns.filter((campaign) => campaign.status === CAMPAIGN_STATUSES.ACTIVE && campaign.clientId).forEach((campaign) => {
      if (!activeCampaignsByClient.has(campaign.clientId)) activeCampaignsByClient.set(campaign.clientId, []);
      activeCampaignsByClient.get(campaign.clientId).push(campaign);
    });
    const clientName = (id) => this.state.clients.find((item) => item.id === id)?.name ?? "—";
    const gaps = [];
    this.numbers.state.numbers.filter((number) => !number.archivedAt).forEach((number) => {
      const linkedCampaignIds = new Set(this.activeLinksFor(number.id).map((link) => link.campaignId));
      (number.clientIds ?? []).forEach((clientId) => {
        (activeCampaignsByClient.get(clientId) ?? []).forEach((campaign) => {
          if (!linkedCampaignIds.has(campaign.id)) gaps.push({ numberId: number.id, phone: number.phone, identification: number.identification, clientId, clientName: clientName(clientId), campaignId: campaign.id, campaignName: campaign.name });
        });
      });
    });
    return gaps;
  }

  persist() { this.numbers.persist(); }
  flush() { return this.numbers.flush(); }
  validate(input) { if (!String(input.name ?? "").trim()) throw new Error("Informe o nome da campanha."); if (!input.squadId || !input.clientId) throw new Error("Selecione Squad e Cliente."); if (!input.responsibleId) throw new Error("Selecione o responsável pela campanha."); const client = this.state.clients.find((item) => item.id === input.clientId); if (!client || (client.squadId && client.squadId !== input.squadId)) throw new Error("O Cliente deve pertencer ao Squad selecionado."); }
}
