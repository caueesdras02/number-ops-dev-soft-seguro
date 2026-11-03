import { escapeHtml, formatPhone, nameFor, statusLabels } from "./number-presentation.js";

const labels = { clients: "Clientes", groups: "Squads", responsibles: "Colaboradores", locations: "Localizações" };
const singular = { clients: "Cliente", groups: "Squad", responsibles: "Colaborador", locations: "Localização" };
const icon = { clients: "◉", groups: "◇", responsibles: "♙", locations: "⌖" };
const viewActionLabel = { clients: "Ver detalhes", groups: "Ver detalhes", responsibles: "Ver painel", locations: "Ver números" };
const status = (number) => `<span class="status-badge status-${number.status.toLowerCase()}">${statusLabels[number.status]}</span>`;
const date = (value) => value ? new Date(value).toLocaleDateString("pt-BR") : "—";
const directorySubtitle = (type, item, groups, responsibles = []) =>
  type === "responsibles" ? `Squad: ${escapeHtml(nameFor(groups, item.squadId, item.team ? `${item.team} (sem vínculo)` : "Sem Squad"))}`
  : type === "clients" ? `Squad: ${escapeHtml(nameFor(groups, item.squadId, "Sem Squad"))}`
  : type === "locations" ? `Colaborador: ${escapeHtml(nameFor(responsibles, item.responsibleId, "Sem colaborador"))}`
  : item.isActive ? "Registro disponível para associação" : "Registro arquivado";
const campaignCards = (campaigns, groups, links, active) => {
  const filtered = campaigns.filter((campaign) => (campaign.status === "ACTIVE") === active);
  return filtered.map((campaign) => {
    const linkedNumbers = new Set(links.filter((link) => link.campaignId === campaign.id && (!active || !link.endedAt)).map((link) => link.numberId)).size;
    return `<article class="client-campaign-card"><div><span class="status-badge ${active ? "status-active" : "status-inactive"}">${active ? "Ativa" : "Encerrada"}</span><h4>${escapeHtml(campaign.name)}</h4><p>Squad: <strong>${escapeHtml(nameFor(groups, campaign.squadId))}</strong></p><small>Início: ${date(campaign.startedAt || campaign.createdAt)}${active ? ` · ${linkedNumbers} número${linkedNumbers === 1 ? "" : "s"} vinculado${linkedNumbers === 1 ? "" : "s"}` : ` · Encerramento: ${date(campaign.endedAt)}`}</small></div><div class="client-campaign-actions"><button class="button button-quiet" data-action="open-campaign" data-id="${campaign.id}">Ver em Campanhas</button>${active ? `<button class="button button-danger" data-action="close-campaign" data-id="${campaign.id}">Finalizar campanha</button>` : ""}</div></article>`;
  }).join("") || `<div class="directory-empty compact"><span aria-hidden="true">◇</span><div><h3>Nenhuma campanha ${active ? "atual" : "anterior"}</h3><p>${active ? "Campanhas ativas deste cliente aparecerão aqui." : "Campanhas encerradas permanecerão disponíveis aqui."}</p></div></div>`;
};

export function renderDirectory(type, items, query = "", groups = [], responsibles = []) {
  const label = labels[type];
  const queryValue = escapeHtml(query);
  const visible = items.filter((item) => item.name.toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR")));
  const squadlessClients = type === "clients" ? items.filter((item) => item.isActive && !item.squadId).length : 0;
  // Clientes, Squads, Colaboradores e Localizações: só ADMIN/MASTER criam, editam ou arquivam.
  const writeGate = "data-admin-only";
  return `<section class="directory-polished">
    <header class="directory-heading"><div><p class="eyebrow">Cadastros operacionais</p><h2>${label}</h2><p>${type === "responsibles" ? "Cada colaborador pertence a um Squad; os clientes do Squad ficam sob sua responsabilidade." : `Organize os ${label.toLocaleLowerCase("pt-BR")} ligados aos números.`}</p></div><div class="directory-heading-actions">${type === "clients" && squadlessClients ? `<button class="button button-quiet" data-action="bulk-squad" data-admin-only>Definir Squad em massa (${squadlessClients})</button>` : ""}<button class="button button-primary" data-action="add" ${writeGate}>+ Adicionar ${singular[type].toLocaleLowerCase("pt-BR")}</button></div></header>
    <div class="directory-toolbar"><label class="search-field"><span aria-hidden="true">⌕</span><span class="sr-only">Buscar ${label.toLocaleLowerCase("pt-BR")}</span><input class="input" type="search" data-action="search" value="${queryValue}" placeholder="Buscar ${label.toLocaleLowerCase("pt-BR")}"></label><span class="directory-count">${visible.length} ${visible.length === 1 ? "registro" : "registros"}</span></div>
    <div class="directory-list">${visible.map((item) => `<article class="directory-record ${item.isActive ? "" : "is-archived"}"><span class="directory-icon" aria-hidden="true">${icon[type]}</span><div class="directory-record-main"><strong>${escapeHtml(item.name)}</strong><small>${directorySubtitle(type,item,groups,responsibles)}</small></div><span class="directory-state ${item.isActive ? "is-active" : "is-archived"}">${item.isActive ? "Ativo" : "Arquivado"}</span><div class="directory-actions">${type === "clients" || type === "groups" || type === "locations" || type === "responsibles" ? `<button class="button button-quiet" data-action="view" data-id="${item.id}">${viewActionLabel[type]}</button>` : ""}<button class="button button-quiet" data-action="edit" data-id="${item.id}" ${writeGate}>Editar</button>${item.isActive ? `<button class="button button-danger" data-action="archive" data-id="${item.id}" ${writeGate}>Arquivar</button>` : `<button class="button button-primary" data-action="restore" data-id="${item.id}" ${writeGate}>Restaurar</button>`}<button class="button button-danger" data-action="hard-delete" data-id="${item.id}" data-master-only>Excluir definitivamente</button></div></article>`).join("") || `<div class="directory-empty"><span aria-hidden="true">${icon[type]}</span><div><h3>Nenhum ${singular[type].toLocaleLowerCase("pt-BR")} encontrado</h3><p>${query ? "Tente ajustar a busca." : "Adicione o primeiro registro para começar."}</p></div>${query ? `<button class="button button-quiet" data-action="clear-search">Limpar busca</button>` : `<button class="button button-primary" data-action="add" ${writeGate}>Adicionar</button>`}</div>`}</div>
  </section>`;
}

export function renderResponsibleDetail(item, groups, clients, campaigns, numbers, locations) {
  const squad = groups.find((group) => group.id === item.squadId) || null;
  const squadClients = squad ? clients.filter((client) => client.squadId === squad.id) : [];
  const clientIds = new Set(squadClients.map((client) => client.id));
  const activeCampaigns = squad ? campaigns.filter((campaign) => campaign.status === "ACTIVE" && clientIds.has(campaign.clientId)) : [];
  const ownNumbers = numbers.filter((number) => number.responsibleId === item.id);
  const clientList = squadClients.length
    ? `<ul class="derived-list">${squadClients.map((client) => `<li><strong>${escapeHtml(client.name)}</strong>${client.isActive ? "" : ' <span class="table-secondary">(arquivado)</span>'}</li>`).join("")}</ul>`
    : `<div class="detail-empty"><span>i</span><p>${squad ? "Nenhum cliente associado a este Squad." : "Defina o Squad do colaborador para ver os clientes."}</p></div>`;
  const campaignList = activeCampaigns.length
    ? `<ul class="derived-list">${activeCampaigns.map((campaign) => `<li><button class="history-number" data-action="open-campaign" data-id="${campaign.id}">${escapeHtml(campaign.name)}</button> <span class="table-secondary">${escapeHtml(nameFor(clients, campaign.clientId, "—"))}</span></li>`).join("")}</ul>`
    : `<div class="detail-empty"><span>✓</span><p>Nenhuma campanha ativa nos clientes deste Squad.</p></div>`;
  const numberRows = ownNumbers.map((number) => `<button class="related-number" data-action="open-number" data-id="${number.id}"><div><strong>${formatPhone(number.phone)}</strong><small>${escapeHtml(number.identification || "Sem identificação")}</small></div><div class="related-number-meta">${status(number)}<small>${escapeHtml(nameFor(locations, number.locationId))}</small></div></button>`).join("");
  return `<section class="directory-detail"><button class="back-link" data-action="back">← Voltar para Colaboradores</button>
    <header class="directory-detail-hero"><span class="directory-icon" aria-hidden="true">♙</span><div><p class="eyebrow">Colaborador</p><h2>${escapeHtml(item.name)}</h2><p>Squad: ${escapeHtml(squad ? squad.name : "Não definido")}</p></div><span class="directory-state ${item.isActive ? "is-active" : "is-archived"}">${item.isActive ? "Ativo" : "Arquivado"}</span></header>
    <div class="detail-grid"><div class="detail-card"><span>Clientes do Squad</span><strong>${squadClients.length}</strong></div><div class="detail-card"><span>Campanhas ativas</span><strong>${activeCampaigns.length}</strong></div><div class="detail-card"><span>Números sob responsabilidade</span><strong>${ownNumbers.length}</strong></div></div>
    <section class="related-numbers-section"><div class="section-heading"><div><p class="eyebrow">Responsabilidade operacional</p><h3>Clientes do Squad ${escapeHtml(squad ? squad.name : "")}</h3></div><span>${squadClients.length}</span></div>${clientList}</section>
    <section class="related-numbers-section"><div class="section-heading"><div><p class="eyebrow">Campanhas</p><h3>Campanhas ativas desses clientes</h3></div><span>${activeCampaigns.length}</span></div>${campaignList}</section>
    <section class="related-numbers-section"><div class="section-heading"><div><p class="eyebrow">Relacionamentos</p><h3>Números atribuídos diretamente</h3></div><span>${ownNumbers.length}</span></div>${numberRows || `<div class="directory-empty compact"><span aria-hidden="true">#</span><div><h3>Sem números atribuídos</h3><p>Nenhum número tem este colaborador como responsável.</p></div></div>`}</section>
  </section>`;
}

export function renderGroupDetail(item, clients, responsibles, numbers, locations) {
  const squadClients = clients.filter((client) => client.squadId === item.id);
  const squadResponsibles = responsibles.filter((responsible) => responsible.squadId === item.id);
  const clientList = squadClients.length
    ? `<ul class="derived-list">${squadClients.map((client) => `<li><strong>${escapeHtml(client.name)}</strong>${client.isActive ? "" : ' <span class="table-secondary">(arquivado)</span>'}</li>`).join("")}</ul>`
    : `<div class="detail-empty"><span>i</span><p>Nenhum cliente associado a este Squad.</p></div>`;
  const responsibleList = squadResponsibles.length
    ? `<ul class="derived-list">${squadResponsibles.map((responsible) => `<li><strong>${escapeHtml(responsible.name)}</strong>${responsible.isActive ? "" : ' <span class="table-secondary">(arquivado)</span>'}</li>`).join("")}</ul>`
    : `<div class="detail-empty"><span>i</span><p>Nenhum colaborador associado a este Squad.</p></div>`;
  const numberRows = numbers.map((number) => `<button class="related-number" data-action="open-number" data-id="${number.id}"><div><strong>${formatPhone(number.phone)}</strong><small>${escapeHtml(number.identification || "Sem identificação")}</small></div><div class="related-number-meta">${status(number)}<small>${escapeHtml(nameFor(locations, number.locationId))}</small></div></button>`).join("");
  return `<section class="directory-detail"><button class="back-link" data-action="back">← Voltar para Squads</button>
    <header class="directory-detail-hero"><span class="directory-icon" aria-hidden="true">${icon.groups}</span><div><p class="eyebrow">Squad</p><h2>${escapeHtml(item.name)}</h2></div><span class="directory-state ${item.isActive ? "is-active" : "is-archived"}">${item.isActive ? "Ativo" : "Arquivado"}</span></header>
    <div class="detail-grid"><div class="detail-card"><span>Clientes</span><strong>${squadClients.length}</strong></div><div class="detail-card"><span>Colaboradores</span><strong>${squadResponsibles.length}</strong></div><div class="detail-card"><span>Números</span><strong>${numbers.length}</strong></div></div>
    <section class="related-numbers-section"><div class="section-heading"><div><p class="eyebrow">Relacionamentos</p><h3>Clientes deste Squad</h3></div><span>${squadClients.length}</span></div>${clientList}</section>
    <section class="related-numbers-section"><div class="section-heading"><div><p class="eyebrow">Relacionamentos</p><h3>Colaboradores deste Squad</h3></div><span>${squadResponsibles.length}</span></div>${responsibleList}</section>
    <section class="related-numbers-section"><div class="section-heading"><div><p class="eyebrow">Relacionamentos</p><h3>Números deste Squad</h3></div><span>${numbers.length}</span></div>${numberRows || `<div class="directory-empty compact"><span aria-hidden="true">#</span><div><h3>Sem números associados</h3><p>Nenhum número está vinculado a este Squad.</p></div></div>`}</section>
  </section>`;
}

export function renderDirectoryDetail(type, item, numbers, locations, responsibles, campaigns = [], groups = [], campaignLinks = []) {
  const label = singular[type];
  const numberRows = numbers.map((number) => `<button class="related-number" data-action="open-number" data-id="${number.id}"><div><strong>${formatPhone(number.phone)}</strong><small>${escapeHtml(number.identification || "Sem identificação")}</small></div><div class="related-number-meta">${status(number)}<small>${escapeHtml(nameFor(locations, number.locationId))} · ${escapeHtml(nameFor(responsibles, number.responsibleId))}</small></div></button>`).join("");
  const clientCampaigns = type === "clients" ? `<section class="related-numbers-section client-campaigns-section"><div class="section-heading"><div><p class="eyebrow">Campanhas</p><h3>Campanhas atuais</h3></div><span>${campaigns.filter((campaign) => campaign.status === "ACTIVE").length}</span></div><div class="client-campaign-list">${campaignCards(campaigns, groups, campaignLinks, true)}</div></section><section class="related-numbers-section client-campaigns-section"><div class="section-heading"><div><p class="eyebrow">Histórico</p><h3>Campanhas anteriores</h3></div><span>${campaigns.filter((campaign) => campaign.status !== "ACTIVE").length}</span></div><div class="client-campaign-list">${campaignCards(campaigns, groups, campaignLinks, false)}</div></section>` : "";
  return `<section class="directory-detail"><button class="back-link" data-action="back">← Voltar para ${labels[type]}</button><header class="directory-detail-hero"><span class="directory-icon" aria-hidden="true">${icon[type]}</span><div><p class="eyebrow">${label}</p><h2>${escapeHtml(item.name)}</h2><p>${directorySubtitle(type,item,groups,responsibles)}</p></div><span class="directory-state ${item.isActive ? "is-active" : "is-archived"}">${item.isActive ? "Ativo" : "Arquivado"}</span></header>${clientCampaigns}<section class="related-numbers-section"><div class="section-heading"><div><p class="eyebrow">Relacionamentos</p><h3>Números associados</h3></div><span>${numbers.length}</span></div>${numberRows || `<div class="directory-empty compact"><span aria-hidden="true">#</span><div><h3>Sem números associados</h3><p>As associações aparecerão aqui quando existirem.</p></div></div>`}</section></section>`;
}

export function renderDirectoryForm(type, item = {}, groups = [], responsibles = []) {
  const label = singular[type];
  const squadSelect = (name) => `<select class="input" name="${name}"><option value="">Sem Squad</option>${groups.map((group) => `<option value="${group.id}" ${group.id === item.squadId ? "selected" : ""}>${escapeHtml(group.name)}</option>`).join("")}</select>`;
  const responsibleSelect = (name) => `<select class="input" name="${name}"><option value="">Sem colaborador</option>${responsibles.map((responsible) => `<option value="${responsible.id}" ${responsible.id === item.responsibleId ? "selected" : ""}>${escapeHtml(responsible.name)}</option>`).join("")}</select>`;
  const extra = type === "responsibles"
    ? `<label>Squad<small class="form-hint">Define os clientes sob responsabilidade deste colaborador.</small>${squadSelect("squadId")}</label>`
    : type === "clients"
    ? `<label>Squad${squadSelect("squadId")}</label>`
    : type === "locations"
    ? `<label>Colaborador<small class="form-hint">Quem está com este dispositivo/localização no momento.</small>${responsibleSelect("responsibleId")}</label>`
    : "";
  return `<div class="modal-backdrop" role="presentation"><form id="directory-form" class="modal-card directory-form" data-id="${item.id || ""}"><div class="modal-header"><div><p class="eyebrow">Cadastro operacional</p><h2>${item.id ? "Editar" : "Adicionar"} ${label.toLocaleLowerCase("pt-BR")}</h2></div><button type="button" class="icon-button" data-action="close-form" aria-label="Fechar formulário">×</button></div><label>Nome<input class="input" name="name" required value="${escapeHtml(item.name || "")}" autocomplete="off"></label>${extra}<div class="form-actions"><button type="button" class="button button-quiet" data-action="close-form">Cancelar</button><button class="button button-primary">Salvar ${label.toLocaleLowerCase("pt-BR")}</button></div></form></div>`;
}

export function renderBulkSquadForm(clients, groups) {
  const rows = clients.map((client) => `<label class="check-option check-row"><input type="checkbox" name="clientIds" value="${client.id}" checked><span>${escapeHtml(client.name)}</span></label>`).join("");
  return `<div class="modal-backdrop"><form id="bulk-squad-form" class="modal-card"><div class="modal-header"><div><p class="eyebrow">Clientes sem Squad</p><h2>Definir Squad em massa</h2><p>${clients.length} cliente(s) sem Squad. Escolha o Squad e confirme os selecionados.</p></div><button class="icon-button" type="button" data-action="close-form" aria-label="Fechar">×</button></div><label>Squad<select class="input" name="squadId" required><option value="">Selecione</option>${groups.map((group) => `<option value="${group.id}">${escapeHtml(group.name)}</option>`).join("")}</select></label><div class="bulk-squad-list">${rows}</div><div class="form-actions"><button class="button button-quiet" type="button" data-action="close-form">Cancelar</button><button class="button button-primary" type="submit">Aplicar Squad</button></div></form></div>`;
}
