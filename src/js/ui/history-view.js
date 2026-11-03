import { displayTerminology, escapeHtml, formatPhone } from "./number-presentation.js";

const eventLabels = {
  GROUP_ASSOCIATED: "Squad associado",
  GROUP_REMOVED: "Squad removido",
};
const label = (type) => eventLabels[type] ?? type.replaceAll("_", " ").toLocaleLowerCase("pt-BR");
const date = (value) => new Date(value).toLocaleString("pt-BR");
const formatValue = (value) => value === null ? "Não definido" : typeof value === "object" ? JSON.stringify(value) : String(value);
const change = (metadata) => metadata?.previousValue !== undefined ? `<p class="history-change"><span>Anterior</span> ${escapeHtml(formatValue(metadata.previousValue))}<i>→</i><span>Novo</span> ${escapeHtml(formatValue(metadata.newValue))}</p>` : "";

export function renderHistory(events, numbers, filters = {}) {
  const types = [...new Set(events.map((event) => event.type))].sort();
  return `<section class="history-polished"><header class="history-heading"><div><p class="eyebrow">Consulta operacional</p><h2>Histórico</h2><p>Registro imutável das mudanças importantes da operação.</p></div><span class="history-readonly">Somente leitura</span></header><div class="history-toolbar"><label class="filter-label">Número<select class="input" data-filter="numberId"><option value="">Todos os números</option>${numbers.map((number) => `<option value="${number.id}" ${filters.numberId === number.id ? "selected" : ""}>${formatPhone(number.phone)}</option>`).join("")}</select></label><label class="filter-label">Tipo de evento<select class="input" data-filter="type"><option value="">Todos os eventos</option>${types.map((type) => `<option value="${type}" ${filters.type === type ? "selected" : ""}>${escapeHtml(label(type))}</option>`).join("")}</select></label>${filters.numberId || filters.type ? `<button class="button button-quiet" data-action="clear-filters">Limpar filtros</button>` : ""}</div><p class="history-count">${events.length} ${events.length === 1 ? "evento encontrado" : "eventos encontrados"}</p><ol class="history-timeline">${events.map((event) => { const number = numbers.find((item) => item.id === event.numberId); return `<li><span class="history-dot" aria-hidden="true">↺</span><article><div class="history-event-heading"><div><strong>${escapeHtml(label(event.type))}</strong><button class="history-number" data-action="open-number" data-number-id="${event.numberId}">${number ? formatPhone(number.phone) : "Número removido"}</button></div><time datetime="${event.occurredAt}">${date(event.occurredAt)}</time></div><p>${escapeHtml(displayTerminology(event.description))}</p>${change(event.metadata)}</article></li>`; }).join("") || `<li class="history-empty"><span aria-hidden="true">↺</span><div><h3>Nenhum evento encontrado</h3><p>${filters.numberId || filters.type ? "Ajuste os filtros para consultar outros eventos." : "As mudanças importantes aparecerão aqui automaticamente."}</p></div></li>`}</ol></section>`;
}
