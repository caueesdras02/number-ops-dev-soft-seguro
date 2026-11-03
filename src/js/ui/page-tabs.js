export function renderPageTabs(tabs, activeId) {
  return `<nav class="page-tabs" aria-label="Subseções desta área">${tabs.map((tab) => `<button type="button" class="page-tab ${tab.id === activeId ? "is-active" : ""}" data-page-tab="${tab.id}">${tab.label}</button>`).join("")}</nav>`;
}

export function bindPageTabs(content, tabs) {
  content.querySelectorAll("[data-page-tab]").forEach((button) => button.addEventListener("click", () => {
    const tab = tabs.find((item) => item.id === button.dataset.pageTab);
    if (tab) window.location.hash = tab.href;
  }));
}

// "Números" reúne, como abas, a lista de números e a área de Localizações —
// ambas continuam sendo as mesmas telas/rotas de sempre, só deixam de ocupar
// item próprio na sidebar. "locations" nunca colide com um id real de
// número (createId sempre gera "number_<uuid>").
export const NUMBERS_SECTION_TABS = [
  { id: "numbers", label: "Todos os números", href: "#numbers" },
  { id: "locations", label: "Localizações", href: "#numbers/locations" },
];
