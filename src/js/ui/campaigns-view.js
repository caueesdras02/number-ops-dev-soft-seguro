import { getUtilization, UTILIZATION_LABELS } from "../models/number.js";
import { escapeHtml, formatPhone, nameFor, statusLabels } from "./number-presentation.js";
import { CAMPAIGN_STAGES, CAMPAIGN_STAGE_LABELS } from "../services/campaigns-service.js";
const option = (item, selected) => `<option value="${item.id}" ${item.id === selected ? "selected" : ""}>${escapeHtml(item.name)}</option>`;
const roleLabels = { PRIMARY: "Principal/Disparo", BACKUP: "Backup", SUPPORT: "Apoio" };
const utilClass = { IN_USE: "is-in-use", AVAILABLE: "is-available", UNAVAILABLE: "is-unavailable" };
const date = (value) => value ? new Date(value).toLocaleDateString("pt-BR") : "—";

const stageCssSuffix = (value) => String(value || "PLANEJAMENTO").toLowerCase().replace(/_/g, "-");

/** Itens do menu customizado (referência de interação: ClickUp) para uma campanha ACTIVE — as
 * duas etapas operacionais + "Encerrada" (que aciona o fluxo oficial close(), não duplicado
 * aqui). Campanha CLOSED não tem itens: o badge fica estático, reabrir é pelo botão próprio
 * "Reativar campanha" que já existe. */
export function stageMenuItemsFor(status) {
  if (status !== "ACTIVE") return [];
  return CAMPAIGN_STAGES.map((value) => ({ value, label: CAMPAIGN_STAGE_LABELS[value], css: stageCssSuffix(value) }))
    .concat([{ value: "ENCERRADA", label: CAMPAIGN_STAGE_LABELS.ENCERRADA, css: "encerrada" }]);
}

/** Badge/gatilho ÚNICO de situação da campanha — substitui os dois indicadores separados
 * (Status estrutural + Etapa operacional) por um só, como pedido: "o intuito é apenas saber a
 * situação da campanha". Mostra Planejamento / Em andamento enquanto ACTIVE, ou Encerrada
 * quando CLOSED (via effectiveCampaignStage) — nunca os dois ao mesmo tempo. O modelo de dados
 * por baixo continua com `stage`/`status` separados (isso não muda); só a apresentação unifica.
 * Botão interativo (abre o popover, ver ui/stage-dropdown.js) quando ACTIVE e canEdit; span
 * estático quando CLOSED ou VIEWER — continua visível ("bater o olho"), só não editável. */
function stageBadge(item, canEdit) {
  const effective = item.status === "ACTIVE" ? item.stage : "ENCERRADA";
  const css = stageCssSuffix(effective);
  const label = escapeHtml(CAMPAIGN_STAGE_LABELS[effective] ?? effective);
  if (!(canEdit && item.status === "ACTIVE")) {
    return `<span class="stage-trigger stage-static stage-${css}"><i class="stage-dot" aria-hidden="true"></i><span class="stage-trigger-label">${label}</span></span>`;
  }
  return `<button type="button" class="stage-trigger stage-${css}" data-action="stage-open" data-id="${item.id}" aria-haspopup="listbox" aria-expanded="false"><i class="stage-dot" aria-hidden="true"></i><span class="stage-trigger-label">${label}</span><i class="stage-caret" aria-hidden="true">▾</i></button>`;
}

const gapReport = (gaps) => {
  if (!gaps.length) return "";
  const rows = gaps.map((gap) => `<tr><td><strong>${escapeHtml(formatPhone(gap.phone))}</strong><span class="table-secondary">${escapeHtml(gap.identification || "Sem identificação")}</span></td><td>${escapeHtml(gap.clientName)}</td><td>${escapeHtml(gap.campaignName)}</td><td class="table-actions"><button class="button button-quiet" data-action="open-number" data-id="${gap.numberId}">Ver número</button></td></tr>`).join("");
  return `<details class="gap-report" data-admin-only><summary>⚠ ${gaps.length} possíve${gaps.length === 1 ? "l" : "is"} vínculo${gaps.length === 1 ? "" : "s"} faltando</summary><p class="form-hint">Número já tem o cliente associado, mas não está vinculado a uma campanha ativa desse cliente. Pode ser proposital, ou uma associação que ficou faltando de antes de números aceitarem várias campanhas ao mesmo tempo. Revise e vincule manualmente quando fizer sentido.</p><div class="table-scroll"><table><thead><tr><th>Número</th><th>Cliente</th><th>Campanha sem vínculo</th><th>Ação</th></tr></thead><tbody>${rows}</tbody></table></div></details>`;
};

/** Valor único do filtro de Situação, derivado dos dois filtros internos (status/stage) que o
 * service ainda usa separados — a UI mostra só UM seletor, sem duplicar o conceito pro usuário. */
export function situacaoFilterValue(filters) {
  if (filters.status === "CLOSED") return "ENCERRADA";
  return filters.stage || "";
}

export function renderCampaigns({ campaigns, clients, squads, responsibles = [], filters, gaps = [], canEdit = true }) {
  const rows = campaigns.map((item) => `<tr><td><strong>${escapeHtml(item.name)}</strong><span class="table-secondary">${escapeHtml(item.notes || "Sem observações")}</span></td><td>${escapeHtml(nameFor(squads,item.squadId,"—"))}</td><td>${escapeHtml(nameFor(clients,item.clientId,"—"))}</td><td>${escapeHtml(nameFor(responsibles,item.responsibleId,"Não definido"))}</td><td>${stageBadge(item, canEdit)}</td><td class="table-actions"><button class="button button-quiet" data-action="view" data-id="${item.id}">Detalhes</button><button class="button button-quiet" data-action="edit" data-id="${item.id}">Editar</button>${item.status === "ACTIVE" ? `<button class="button button-danger" data-action="close" data-id="${item.id}">Encerrar</button>` : `<button class="button button-quiet" data-action="reactivate" data-id="${item.id}">Reativar</button>`}<button class="button button-danger" data-action="hard-delete" data-id="${item.id}" data-master-only>Excluir definitivamente</button></td></tr>`).join("");
  const situacao = situacaoFilterValue(filters);
  const situacaoOptions = CAMPAIGN_STAGES.map((value) => `<option value="${value}" ${situacao === value ? "selected" : ""}>${escapeHtml(CAMPAIGN_STAGE_LABELS[value])}</option>`).join("")
    + `<option value="ENCERRADA" ${situacao === "ENCERRADA" ? "selected" : ""}>${escapeHtml(CAMPAIGN_STAGE_LABELS.ENCERRADA)}</option>`;
  return `<section class="numbers-page">${gapReport(gaps)}<div class="page-heading"><div><p class="eyebrow">Operação</p><h2>Campanhas</h2><p>Gerencie campanhas e seus vínculos com números.</p></div><button class="button button-primary" data-action="add">+ Nova campanha</button></div><div class="list-controls"><label class="search-panel">Buscar<input class="input" data-action="search" type="search" value="${escapeHtml(filters.query)}" placeholder="Nome da campanha"></label><label class="filter-label">Situação<select class="input" data-action="situacao-filter"><option value="">Todas</option>${situacaoOptions}</select></label></div><div class="table-card"><div class="table-scroll"><table><thead><tr><th>Campanha</th><th>Squad</th><th>Cliente</th><th>Responsável</th><th>Situação</th><th>Ações</th></tr></thead><tbody>${rows || '<tr><td class="empty-cell" colspan="6">Nenhuma campanha encontrada.</td></tr>'}</tbody></table></div></div></section>`;
}

const linkRow = (link, numbers, locations, allLinks) => {
  const number = numbers.find((entry) => entry.id === link.numberId);
  const location = number ? nameFor(locations, number.locationId, "—") : "—";
  const util = number ? getUtilization(number, allLinks.some((l) => l.numberId === number.id && !l.endedAt)) : "UNAVAILABLE";
  const currentActions = `<div class="table-actions"><button class="button button-quiet" data-action="change-role" data-number-id="${link.numberId}" data-role="${link.role}">Alterar função</button><button class="button button-quiet" data-action="end-link" data-number-id="${link.numberId}">Encerrar</button></div>`;
  return `<tr><td><strong>${escapeHtml(number?.phone ? formatPhone(number.phone) : link.numberId)}</strong></td><td>${escapeHtml(number?.identification || "—")} · ${escapeHtml(location)}</td><td>${roleLabels[link.role] || escapeHtml(link.role)}</td><td>${number ? `<span class="status-badge status-${number.status.toLowerCase()}">${statusLabels[number.status]}</span>` : "—"}</td><td><span class="utilization ${utilClass[util]}">${UTILIZATION_LABELS[util]}</span></td><td>${date(link.startedAt)}</td><td>${link.endedAt ? date(link.endedAt) : currentActions}</td></tr>`;
};

/** Form compartilhado (usado no detalhe da campanha e no detalhe do número) pra trocar a função de um vínculo
 * ativo num clique só — por baixo, encerra o vínculo atual e cria um novo com a função escolhida (mesma
 * arquitetura de sempre: histórico preservado, registra quando a função mudou). */
export function renderChangeRoleForm({ numberId, campaignId, phone, campaignName, currentRole }) {
  return `<div class="modal-backdrop"><form id="change-role-form" class="modal-card" data-number-id="${numberId}" data-campaign-id="${campaignId}"><div class="modal-header"><div><p class="eyebrow">Campanhas</p><h2>Alterar função</h2><p>${escapeHtml(formatPhone(phone))} · ${escapeHtml(campaignName)}</p></div><button class="icon-button" type="button" data-action="close-form" aria-label="Fechar">×</button></div><div class="number-form"><label>Nova função<select class="input" name="role" required><option value="PRIMARY" ${currentRole === "PRIMARY" ? "selected" : ""}>Principal/Disparo</option><option value="BACKUP" ${currentRole === "BACKUP" ? "selected" : ""}>Backup</option><option value="SUPPORT" ${currentRole === "SUPPORT" ? "selected" : ""}>Apoio</option></select></label><small class="form-hint">O vínculo atual será encerrado e um novo será criado com a função escolhida — o histórico registra a troca.</small><div class="form-actions"><button class="button button-quiet" type="button" data-action="close-form">Cancelar</button><button class="button button-primary" type="submit">Salvar</button></div></div></form></div>`;
}

export function renderCampaignDetail({ item, clients, squads, responsibles = [], numbers, locations = [], links, allLinks = links, canEdit = true }) {
  const current = links.filter((link) => !link.endedAt);
  const history = links.filter((link) => link.endedAt);
  const table = (rows, emptyText) => `<div class="table-scroll"><table><thead><tr><th>Número</th><th>Identificação/Localização</th><th>Função</th><th>Status operacional</th><th>Utilização</th><th>Início</th><th>Saída</th></tr></thead><tbody>${rows || `<tr><td class="empty-cell" colspan="7">${emptyText}</td></tr>`}</tbody></table></div>`;
  // "Histórico de números" = todo número/conta que já foi registrado nesta campanha, mesmo depois de
  // encerrada (number_campaign_links com ended_at preenchido, nunca apagado).
  return `<section class="directory-detail"><button class="back-link" data-action="back">← Voltar para Campanhas</button><header class="directory-detail-hero"><span class="directory-icon" aria-hidden="true">◆</span><div><p class="eyebrow">Campanha</p><h2>${escapeHtml(item.name)}</h2><p>${escapeHtml(nameFor(clients,item.clientId,"Cliente não definido"))} · ${escapeHtml(nameFor(squads,item.squadId,"Squad não definido"))} · Responsável: ${escapeHtml(nameFor(responsibles,item.responsibleId,"Não definido"))}</p></div><div class="campaign-detail-badges">${stageBadge(item, canEdit)}</div></header><div class="form-actions" style="justify-content:flex-end;margin:-4px 0 18px">${item.status === "ACTIVE" ? `<button class="button button-quiet" data-action="add-links" data-id="${item.id}">+ Vincular números</button><button class="button button-danger" data-action="close" data-id="${item.id}">Encerrar campanha</button>` : `<button class="button button-primary" data-action="reactivate" data-id="${item.id}">Reativar campanha</button>`}<button class="button button-danger" data-action="hard-delete" data-id="${item.id}" data-master-only>Excluir definitivamente</button></div><section class="related-numbers-section"><div class="section-heading"><div><p class="eyebrow">Período</p><h3>${date(item.startedAt || item.createdAt)} → ${item.endedAt ? date(item.endedAt) : "em andamento"}</h3></div><span>${current.length} atual${current.length === 1 ? "" : "is"} · ${links.length} no total</span></div><h4 class="campaign-subheading">Números atuais</h4>${table(current.map((link) => linkRow(link, numbers, locations, allLinks)).join(""), "Nenhum número vinculado no momento.")}<h4 class="campaign-subheading">Números que já passaram pela campanha (Histórico)</h4>${table(history.map((link) => linkRow(link, numbers, locations, allLinks)).join(""), "Nenhuma conta registrada encerrada ainda.")}</section></section>`;
}

export function renderCampaignForm({ item = {}, clients, squads, responsibles = [], numbers = [], links = [] }) {
  const linkedSection = item.id
    ? `<section class="form-section"><div class="detail-section-heading"><div><p class="dash-kicker">Vínculos</p><h3>Números vinculados</h3></div><button class="button button-quiet" type="button" data-action="add-links-inline" data-id="${item.id}">+ Adicionar números</button></div>${links.length ? `<ul class="derived-list">${links.map((link) => { const number = numbers.find((n) => n.id === link.numberId); return `<li class="derived-list-item"><span>${escapeHtml(number ? formatPhone(number.phone) : link.numberId)}${number?.identification ? ` · ${escapeHtml(number.identification)}` : ""} · ${roleLabels[link.role] || escapeHtml(link.role)}</span><button class="button button-quiet" type="button" data-action="remove-link-inline" data-number-id="${link.numberId}">Remover</button></li>`; }).join("")}</ul>` : `<p class="table-secondary">Nenhum número vinculado no momento.</p>`}</section>`
    : `<section class="form-section"><p class="form-hint">Você poderá vincular números a esta campanha depois de salvá-la.</p></section>`;
  return `<div class="modal-backdrop"><form id="campaign-form" class="modal-card" data-id="${item.id || ""}"><div class="modal-header"><div><p class="eyebrow">Campanhas</p><h2>${item.id ? "Editar" : "Nova"} campanha</h2></div><button class="icon-button" type="button" data-action="close-form">×</button></div><div class="number-form"><label>Nome<input class="input" name="name" required value="${escapeHtml(item.name || "")}"></label><label>Cliente<select class="input" name="clientId" required><option value="">Selecione</option>${clients.map(i=>`<option value="${i.id}" ${i.id===item.clientId?"selected":""} data-squad="${i.squadId||""}">${escapeHtml(i.name)}${i.squadId?"":" · Sem Squad"}</option>`).join("")}</select></label><label>Squad<select class="input" name="squadId" required><option value="">Selecione</option>${squads.map(i=>option(i,item.squadId)).join("")}</select><small class="form-hint" data-squad-hint>O Squad é definido pelo Cliente selecionado.</small></label><label>Responsável<select class="input" name="responsibleId" required><option value="">Selecione</option>${responsibles.map(i=>option(i,item.responsibleId)).join("")}</select></label><label class="form-full">Observações<textarea class="input" name="notes" rows="3">${escapeHtml(item.notes || "")}</textarea></label></div>${linkedSection}<div class="form-actions"><button class="button button-quiet" type="button" data-action="close-form">Cancelar</button><button class="button button-primary" type="submit">Salvar</button></div></form></div>`;
}

export function renderCampaignLinkAddForm({ campaign, numbers }) {
  const row = (number) => `<label class="check-option link-role-row" data-relation-option><span class="link-role-check"><input type="checkbox" name="numberIds" value="${number.id}"><span>${formatPhone(number.phone)}${number.identification ? ` · ${escapeHtml(number.identification)}` : ""}</span></span><select class="input link-role-select" name="role_${number.id}" aria-label="Função de ${formatPhone(number.phone)}"><option value="PRIMARY">Principal/Disparo</option><option value="BACKUP">Backup</option><option value="SUPPORT">Apoio</option></select></label>`;
  const rows = numbers.map(row).join("");
  return `<div class="modal-backdrop"><form id="campaign-add-links-form" class="modal-card" data-id="${campaign.id}"><div class="modal-header"><div><p class="eyebrow">Campanhas</p><h2>Vincular números</h2><p>${escapeHtml(campaign.name)}</p></div><button class="icon-button" type="button" data-action="close-form" aria-label="Fechar">×</button></div><div class="number-form"><label class="form-full">Buscar número<input class="input" type="search" data-link-search placeholder="Buscar por telefone ou identificação" autocomplete="off"></label><fieldset class="link-role-list" data-link-options>${rows || '<p class="table-secondary">Nenhum número disponível para vincular.</p>'}</fieldset><p class="relation-empty-hint" data-link-empty hidden>Nenhum número encontrado.</p><small class="form-hint">Marque um ou vários números e defina a função de cada um.</small><div class="form-actions"><button class="button button-quiet" type="button" data-action="close-form">Cancelar</button><button class="button button-primary" type="submit">Vincular</button></div></div></form></div>`;
}
