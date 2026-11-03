// Melhoria só de UX mobile pras tabelas com scroll horizontal (.table-scroll — hoje usado em
// Campanhas, Usuários, Solicitações de acesso e Log de Atividades) — nunca muda
// a tabela, os dados ou o comportamento em desktop (tudo escondido por CSS acima do breakpoint
// mobile, ver components.css). Acrescenta uma dica ("Deslize para ver mais →") acima da tabela, um
// fade nas bordas esquerda/direita, e um botão de navegação (selo verde "‹"/"›") sobre cada fade
// que avança/volta a tabela com scroll suave — sem duplicar essa lógica por tabela: qualquer
// `.table-scroll` da página ganha os três automaticamente.
//
// A dica e os botões/fade seguem o MESMO estado (há mais conteúdo pra revelar naquele lado?) —
// tudo fica visível desde o carregamento (percepção imediata) e só some quando o usuário realmente
// chega no fim do scroll daquele lado, não "na primeira vez que ele encostou no dedo". Antes a
// dica desaparecia para sempre no primeiro pixel de scroll, o que deixava o resto da rolagem sem
// nenhum aviso claro de que ainda faltava conteúdo (relatado pelo usuário: a tabela "parecia
// terminar" na 3ª coluna). Reagir à posição resolve isso sem precisar fixar nenhuma coluna.
//
// Observa #page-content via MutationObserver em vez de ser chamado por cada controller: todo
// controller já substitui o innerHTML inteiro a cada render() (ver campaigns/profiles/audit
// controllers), então reagir a inserções cobre automaticamente qualquer tabela nova, atual ou
// futura, sem precisar lembrar de conectar isso em cada tela.

// Avança ~65% da largura visível por clique (pedido: 60-70%) — perto o bastante de "uma tela" pra
// sentir progresso, longe o bastante do total pra nunca pular uma coluna inteira sem o usuário ver.
const NAV_STEP_RATIO = 0.65;

function updateScrollAffordances(scrollEl, { fadeStart, fadeEnd, navPrev, navNext, hint }) {
  const maxScroll = scrollEl.scrollWidth - scrollEl.clientWidth;
  const hasBefore = scrollEl.scrollLeft > 1;
  const hasAhead = scrollEl.scrollLeft < maxScroll - 1;
  fadeStart.classList.toggle("is-visible", hasBefore);
  fadeEnd.classList.toggle("is-visible", hasAhead);
  // [hidden] (não só opacity:0) tira o botão do foco por teclado enquanto não faz sentido clicar.
  navPrev.hidden = !hasBefore;
  navNext.hidden = !hasAhead;
  hint.classList.toggle("is-dismissed", !hasAhead);
}

function enhance(scrollEl) {
  if (scrollEl.dataset.scrollHintBound === "true") return;
  // Sem conteúdo escondido (coube inteira), não precisa de dica, fade nem botão.
  if (scrollEl.scrollWidth <= scrollEl.clientWidth + 1) return;
  scrollEl.dataset.scrollHintBound = "true";

  const wrap = document.createElement("div");
  wrap.className = "table-scroll-wrap";
  scrollEl.parentNode.insertBefore(wrap, scrollEl);
  wrap.appendChild(scrollEl);

  // A dica fica FORA do wrap posicionado (que só envolve a própria .table-scroll) pra nunca
  // disputar espaço visual com o fade/botões das bordas nem cobrir a tabela.
  const hint = document.createElement("p");
  hint.className = "table-scroll-hint";
  hint.setAttribute("aria-hidden", "true");
  hint.textContent = "Deslize para ver mais →";
  wrap.parentNode.insertBefore(hint, wrap);

  const fadeStart = document.createElement("div");
  fadeStart.className = "table-scroll-fade table-scroll-fade-start";
  fadeStart.setAttribute("aria-hidden", "true");
  const fadeEnd = document.createElement("div");
  fadeEnd.className = "table-scroll-fade table-scroll-fade-end";
  fadeEnd.setAttribute("aria-hidden", "true");

  const navButton = (className, label, symbol) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `table-scroll-nav ${className}`;
    button.setAttribute("aria-label", label);
    button.textContent = symbol;
    return button;
  };
  const navPrev = navButton("table-scroll-nav-prev", "Ver colunas anteriores", "‹");
  const navNext = navButton("table-scroll-nav-next", "Ver mais colunas", "›");
  const scrollByStep = (direction) => scrollEl.scrollBy({ left: direction * scrollEl.clientWidth * NAV_STEP_RATIO, behavior: "smooth" });
  navPrev.addEventListener("click", () => scrollByStep(-1));
  navNext.addEventListener("click", () => scrollByStep(1));

  wrap.append(fadeStart, fadeEnd, navPrev, navNext);

  const refs = { fadeStart, fadeEnd, navPrev, navNext, hint };
  updateScrollAffordances(scrollEl, refs);
  // Cobre clique nos botões (scrollBy anima e dispara "scroll" a cada frame) e arraste/swipe manual.
  scrollEl.addEventListener("scroll", () => updateScrollAffordances(scrollEl, refs), { passive: true });
}

function scan(node) {
  if (node.nodeType !== 1) return;
  if (node.matches?.(".table-scroll")) enhance(node);
  node.querySelectorAll?.(".table-scroll").forEach(enhance);
}

/** Liga a observação num container estável (ex.: #page-content) — não precisa ser chamado de
 * novo a cada render(), continua funcionando pra qualquer tabela inserida depois. */
export function observeTableScrollHints(root) {
  if (!root) return null;
  scan(root);
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) mutation.addedNodes.forEach(scan);
  });
  observer.observe(root, { childList: true, subtree: true });
  return observer;
}
