export const statusLabels = Object.freeze({
  ACTIVE: "Ativo",
  WARMING: "Em aquecimento",
  UNDER_REVIEW: "Em análise",
  BLOCKED: "Bloqueado",
  INACTIVE: "Inativo",
});

export function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", '"': "&quot;" })[character]);
}

export function formatPhone(phone) {
  const country = phone.slice(0, 2);
  const area = phone.slice(2, 4);
  const first = phone.length === 12 ? phone.slice(4, 8) : phone.slice(4, 9);
  const last = phone.length === 12 ? phone.slice(8) : phone.slice(9);
  return `+${country} (${area}) ${first}-${last}`;
}

export function nameFor(items, id, fallback = "Não definido") {
  return items.find((item) => item.id === id)?.name ?? fallback;
}

// Mantém eventos anteriores consistentes com a nomenclatura exibida hoje.
export function displayTerminology(value = "") {
  return String(value)
    .replaceAll("Grupos", "Squads")
    .replaceAll("grupos", "squads")
    .replaceAll("Grupo", "Squad")
    .replaceAll("grupo", "squad");
}
