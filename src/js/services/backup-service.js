import { SCHEMA_VERSION } from '../config/constants.js';
import { createInitialState } from '../data/initial-state.js';
import { CAMPAIGN_ROLES, CAMPAIGN_STATUSES } from './campaigns-service.js';

const BACKUP_FORMAT_VERSION = 2;
const COLLECTIONS = ['numbers', 'clients', 'groups', 'responsibles', 'locations', 'incidents', 'historyEvents', 'campaigns', 'numberCampaignLinks'];
const clone = (value) => JSON.parse(JSON.stringify(value));
const uniqueIds = (items) => new Set(items.map((item) => item.id));
const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

export class BackupService {
  constructor(numbersService) { this.numbersService = numbersService; }
  createExport() {
    const today = new Date().toISOString().slice(0, 10);
    const backup = { kind: 'number-ops-backup', formatVersion: BACKUP_FORMAT_VERSION, exportedAt: new Date().toISOString(), schemaVersion: SCHEMA_VERSION, state: clone(this.numbersService.state) };
    return { filename: `number-ops-backup-${today}.json`, json: JSON.stringify(backup, null, 2) };
  }
  inspect(serialized) {
    let backup;
    try { backup = typeof serialized === 'string' ? JSON.parse(serialized) : clone(serialized); } catch { throw new Error('O arquivo não contém um JSON válido.'); }
    if (!backup || typeof backup !== 'object' || Array.isArray(backup)) throw new Error('Este arquivo não contém um backup válido do Number Ops.');
    if (backup.kind && backup.kind !== 'number-ops-backup') throw new Error('Este arquivo não é um backup do Number Ops.');
    const declaredVersion = backup.formatVersion ?? backup.backupVersion;
    if (declaredVersion && declaredVersion > BACKUP_FORMAT_VERSION) throw new Error('A versão deste backup não é compatível com esta versão do Number Ops.');
    const source = this.extractState(backup);
    const state = this.normalizeLegacy(source);
    this.validateState(state);
    return { state: clone(state), exportedAt: backup.exportedAt ?? null, formatVersion: backup.formatVersion ?? backup.backupVersion ?? 1, schemaVersion: backup.schemaVersion ?? source.schemaVersion ?? 1, summary: Object.fromEntries(COLLECTIONS.map((name) => [name, state[name].length])) };
  }
  restore(prepared) {
    if (!prepared?.state) throw new Error('Analise um backup válido antes de restaurar.');
    const state = this.normalizeLegacy(prepared.state);
    this.validateState(state);
    return this.numbersService.replaceState(clone(state));
  }
  extractState(backup) {
    if (hasOwn(backup, 'state')) { if (!backup.state || typeof backup.state !== 'object' || Array.isArray(backup.state)) throw new Error('O estado do backup é inválido.'); return backup.state; }
    if (hasOwn(backup, 'data')) { if (!backup.data || typeof backup.data !== 'object' || Array.isArray(backup.data)) throw new Error('A seção data do backup é inválida.'); return backup.data; }
    return backup;
  }
  normalizeLegacy(source) {
    for (const key of COLLECTIONS) if (hasOwn(source, key) && !Array.isArray(source[key])) throw new Error(`${key} deve ser uma lista.`);
    const initial = createInitialState();
    const state = { ...initial, ...clone(source), meta: { ...initial.meta, ...(source.meta ?? {}), seedApplied: true } };
    for (const key of COLLECTIONS) state[key] = Array.isArray(source[key]) ? clone(source[key]) : [];
    state.numbers = state.numbers.map((number) => ({ groupCount: 0, clientIds: [], groupIds: [], restriction: null, ...number }));
    state.clients = state.clients.map((client) => ({ squadId: null, ...client }));
    // Backups da versão anterior usavam outros nomes de etapa de campanha.
    const legacyStages = { CAPTACAO: 'PLANEJAMENTO', TA_ROLANDO_POS_LIVE: 'EM_ANDAMENTO' };
    state.campaigns = state.campaigns.map((campaign) => ({ ...campaign, stage: legacyStages[campaign.stage] ?? campaign.stage ?? 'PLANEJAMENTO' }));
    state.incidents = state.incidents.map((incident) => (incident.type === 'CONNECTIVITY' ? { ...incident, type: 'OTHER' } : incident));
    state.schemaVersion = SCHEMA_VERSION;
    return state;
  }
  validateState(state) {
    COLLECTIONS.forEach((name) => { const values = state[name].map((item) => item?.id); if (values.some((id) => !id || typeof id !== 'string') || new Set(values).size !== values.length) throw new Error(`Há IDs ausentes ou duplicados em ${name}.`); });
    const ids = Object.fromEntries(COLLECTIONS.map((name) => [name, uniqueIds(state[name])]));
    state.numbers.forEach((number) => {
      if (!number.phone) throw new Error(`O Número ${number.id} não possui telefone.`);
      if (!Number.isInteger(number.groupCount) || number.groupCount < 0) throw new Error(`O Número ${number.id} possui groupCount inválido.`);
      if (!Array.isArray(number.clientIds) || !Array.isArray(number.groupIds)) throw new Error('Um Número possui associações inválidas.');
      if (number.locationId && !ids.locations.has(number.locationId)) throw new Error('Um Número referencia uma localização inexistente.');
      if (number.responsibleId && !ids.responsibles.has(number.responsibleId)) throw new Error('Um Número referencia um colaborador inexistente.');
      if (number.clientIds.some((id) => !ids.clients.has(id)) || number.groupIds.some((id) => !ids.groups.has(id))) throw new Error('Um Número possui Cliente ou Squad inexistente.');
    });
    state.clients.forEach((client) => { if (client.squadId && !ids.groups.has(client.squadId)) throw new Error(`O Cliente ${client.id} referencia um Squad inexistente.`); });
    state.campaigns.forEach((campaign) => {
      if (campaign.clientId && !ids.clients.has(campaign.clientId)) throw new Error(`A Campanha ${campaign.id} referencia um Cliente inexistente.`);
      if (campaign.squadId && !ids.groups.has(campaign.squadId)) throw new Error(`A Campanha ${campaign.id} referencia um Squad inexistente.`);
      if (campaign.status && !Object.values(CAMPAIGN_STATUSES).includes(campaign.status)) throw new Error(`A Campanha ${campaign.id} possui status inválido.`);
      const client = state.clients.find((item) => item.id === campaign.clientId);
      if (client && campaign.squadId && client.squadId && client.squadId !== campaign.squadId) throw new Error(`A Campanha ${campaign.id} relaciona Cliente e Squad incompatíveis.`);
    });
    const activePairs = new Set();
    state.numberCampaignLinks.forEach((link) => {
      if (!ids.numbers.has(link.numberId)) throw new Error(`O vínculo ${link.id} referencia um Número inexistente.`);
      if (!ids.campaigns.has(link.campaignId)) throw new Error(`O vínculo ${link.id} referencia uma Campanha inexistente.`);
      if (!Object.values(CAMPAIGN_ROLES).includes(link.role)) throw new Error(`O vínculo ${link.id} possui papel inválido.`);
      if (!link.endedAt) {
        // um número pode ter vínculos ativos com VÁRIAS campanhas; não pode repetir a MESMA campanha ativa duas vezes.
        const pairKey = `${link.numberId}\u0000${link.campaignId}`;
        if (activePairs.has(pairKey)) throw new Error(`O Número ${link.numberId} possui mais de um vínculo ativo com a mesma campanha.`);
        activePairs.add(pairKey);
        const campaign = state.campaigns.find((item) => item.id === link.campaignId);
        if (campaign?.status === CAMPAIGN_STATUSES.CLOSED) throw new Error(`O vínculo ${link.id} está ativo em uma Campanha encerrada.`);
      }
    });
    state.incidents.forEach((incident) => { if (!ids.numbers.has(incident.numberId)) throw new Error('Uma Ocorrência referencia um Número inexistente.'); if (incident.responsibleId && !ids.responsibles.has(incident.responsibleId)) throw new Error('Uma Ocorrência referencia um colaborador inexistente.'); if (incident.resolvedById && !ids.responsibles.has(incident.resolvedById)) throw new Error('Uma Ocorrência referencia um responsável pela resolução inexistente.'); });
    state.historyEvents.forEach((event) => { if (!ids.numbers.has(event.numberId)) throw new Error('Um evento de Histórico referencia um Número inexistente.'); });
    return state;
  }
}
