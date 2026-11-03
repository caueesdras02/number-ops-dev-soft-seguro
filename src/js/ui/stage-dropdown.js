// Popover compacto tipo "seletor de status" (referência de interação: ClickUp — nada copiado
// literalmente). Genérico de propósito: não sabe nada sobre campanha, só abre um menu com os
// itens recebidos e devolve a escolha via onSelect. Portal pro <body>: nunca fica preso pelo
// overflow/scroll da tabela (`.table-scroll`), então nunca é cortado nem cria scroll horizontal,
// e nunca afeta a altura da linha (é `position:fixed`, fora do fluxo do documento).
let activeMenu = null;

/**
 * Posição (fixed) do menu ancorado no trigger. Preferência: abrir pra baixo e alinhar a borda
 * DIREITA do menu com a do trigger (ou seja, o menu se estende pra ESQUERDA — pedido porque essa
 * coluna fica à direita da tabela). Cai pra cima quando não cabe embaixo, e cai pra alinhar pela
 * esquerda do trigger quando abrir pra esquerda cortaria a viewport — nunca deixa sair da tela.
 */
export function computeMenuPosition(triggerRect, menuSize, viewport, gap = 6) {
  const fitsBelow = triggerRect.bottom + gap + menuSize.height <= viewport.height;
  const top = fitsBelow ? triggerRect.bottom + gap : Math.max(gap, triggerRect.top - gap - menuSize.height);
  let left = triggerRect.right - menuSize.width;
  if (left < gap) left = triggerRect.left;
  left = Math.min(Math.max(gap, left), Math.max(gap, viewport.width - menuSize.width - gap));
  return { top, left };
}

export function closeActiveStageMenu() {
  if (!activeMenu) return;
  const { menu, trigger, cleanup } = activeMenu;
  menu.remove();
  trigger.setAttribute("aria-expanded", "false");
  cleanup();
  activeMenu = null;
}

export function isStageMenuOpenFor(trigger) {
  return activeMenu?.trigger === trigger;
}

/**
 * @param {HTMLElement} trigger
 * @param {{ items: Array<{value:string, label:string, css:string}>, current: string, onSelect: (value:string)=>void, label?: string }} options
 */
export function openStageMenu(trigger, { items, current, onSelect, label = "Etapa" }) {
  closeActiveStageMenu();

  const menu = document.createElement("div");
  menu.className = "stage-menu";
  menu.setAttribute("role", "listbox");
  menu.setAttribute("aria-label", label);
  menu.innerHTML = items.map((item) => `<button type="button" class="stage-menu-option stage-${item.css}" role="option" aria-selected="${item.value === current}" data-value="${item.value}"><i class="stage-dot" aria-hidden="true"></i><span class="stage-menu-option-label">${item.label}</span>${item.value === current ? '<i class="stage-check" aria-hidden="true">✓</i>' : ""}</button>`).join("");
  document.body.appendChild(menu);

  const triggerRect = trigger.getBoundingClientRect();
  const menuRect = menu.getBoundingClientRect();
  const { top, left } = computeMenuPosition(triggerRect, { width: menuRect.width, height: menuRect.height }, { width: window.innerWidth, height: window.innerHeight });
  menu.style.top = `${top}px`;
  menu.style.left = `${left}px`;
  trigger.setAttribute("aria-expanded", "true");

  const onOptionClick = (event) => {
    const button = event.target.closest("[data-value]");
    if (!button) return;
    const value = button.dataset.value;
    closeActiveStageMenu();
    onSelect(value);
  };
  const onDocPointerDown = (event) => { if (!menu.contains(event.target) && event.target !== trigger) closeActiveStageMenu(); };
  const onKeydown = (event) => {
    const options = [...menu.querySelectorAll("[data-value]")];
    if (event.key === "Escape") { closeActiveStageMenu(); trigger.focus(); return; }
    const idx = options.indexOf(document.activeElement);
    if (event.key === "ArrowDown") { event.preventDefault(); (options[idx + 1] || options[0])?.focus(); }
    else if (event.key === "ArrowUp") { event.preventDefault(); (options[idx - 1] || options[options.length - 1])?.focus(); }
  };
  const onScrollOrResize = () => closeActiveStageMenu();

  menu.addEventListener("click", onOptionClick);
  document.addEventListener("pointerdown", onDocPointerDown, true);
  document.addEventListener("keydown", onKeydown, true);
  window.addEventListener("scroll", onScrollOrResize, true);
  window.addEventListener("resize", onScrollOrResize);

  (menu.querySelector(`[data-value="${current}"]`) ?? menu.querySelector("[data-value]"))?.focus();

  activeMenu = {
    menu, trigger,
    cleanup: () => {
      document.removeEventListener("pointerdown", onDocPointerDown, true);
      document.removeEventListener("keydown", onKeydown, true);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    },
  };
}
