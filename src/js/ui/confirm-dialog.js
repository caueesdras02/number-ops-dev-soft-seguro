// Modal de confirmação customizado — substitui window.confirm()/alert()/prompt() nativos.
// Mesma arquitetura de diálogo já usada em hard-delete-dialog.js (Promise<boolean>, mesmas
// classes .modal-backdrop/.modal-card do resto do app, fecha com Cancelar/clique fora/Esc) —
// não é uma segunda arquitetura de modal, só um conteúdo mais rico (ícone, nota informativa,
// tom de botão configurável) e uma animação discreta de saída.
let seq = 0;

/**
 * @param {HTMLElement} root
 * @param {{
 *   icon?: string,
 *   title: string,
 *   bodyHtml: string,
 *   noteHtml?: string,
 *   cancelLabel?: string,
 *   confirmLabel: string,
 *   tone?: "primary" | "danger",
 * }} options `bodyHtml`/`noteHtml` são HTML já escapado pelo chamador (mesmo padrão de todo o
 *   resto da camada de view deste app — interpola valor já tratado com escapeHtml).
 * @returns {Promise<boolean>} true se confirmado, false se cancelado (Cancelar, clique fora ou Esc).
 */
export function confirmDialog(root, { icon = "!", title, bodyHtml, noteHtml = "", cancelLabel = "Cancelar", confirmLabel, tone = "danger" } = {}) {
  const titleId = `confirm-dialog-title-${++seq}`;
  const html = `<div class="modal-backdrop confirm-dialog-backdrop" data-confirm-dialog>
    <section class="modal-card confirm-dialog-card" role="alertdialog" aria-modal="true" aria-labelledby="${titleId}">
      <span class="confirm-dialog-icon" aria-hidden="true">${icon}</span>
      <h2 id="${titleId}">${title}</h2>
      <div class="confirm-dialog-body">${bodyHtml}</div>
      ${noteHtml ? `<div class="bot-detail-note confirm-dialog-note">${noteHtml}</div>` : ""}
      <div class="form-actions confirm-dialog-actions">
        <button class="button button-quiet" type="button" data-confirm-cancel>${cancelLabel}</button>
        <button class="button button-${tone}" type="button" data-confirm-ok>${confirmLabel}</button>
      </div>
    </section></div>`;

  root.insertAdjacentHTML("beforeend", html);
  const modal = root.querySelector("[data-confirm-dialog]");
  const okButton = modal.querySelector("[data-confirm-ok]");
  const cancelButton = modal.querySelector("[data-confirm-cancel]");

  return new Promise((resolve) => {
    let settled = false;
    // Fecha com animação discreta (mesmo padrão de toast.js: classe + setTimeout casado com a
    // duração da transição) antes de remover — nunca resolve/anima duas vezes.
    const done = (value) => {
      if (settled) return;
      settled = true;
      document.removeEventListener("keydown", onKey);
      modal.classList.add("is-closing");
      window.setTimeout(() => modal.remove(), 160);
      resolve(value);
    };
    const onKey = (event) => { if (event.key === "Escape") done(false); };
    document.addEventListener("keydown", onKey);
    modal.addEventListener("click", (event) => { if (event.target === modal) done(false); });
    cancelButton?.addEventListener("click", () => done(false));
    // Desabilita no primeiro clique — impede duplo clique/duplo submit enquanto a animação de
    // saída ainda não terminou e o chamador ainda não processou a confirmação.
    okButton?.addEventListener("click", () => {
      if (okButton.disabled) return;
      okButton.disabled = true;
      cancelButton.disabled = true;
      done(true);
    });
    // Foca Cancelar por padrão (mesmo critério de segurança do hard-delete-dialog.js — Enter
    // acidental nunca confirma sozinho uma ação de atenção).
    cancelButton?.focus();
  });
}
