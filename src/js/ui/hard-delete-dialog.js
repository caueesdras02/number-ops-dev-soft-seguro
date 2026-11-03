import { describeReferences } from "../models/hard-delete.js";
import { escapeHtml } from "./number-presentation.js";

const CONFIRM_WORD = "EXCLUIR";

/**
 * Confirmação forte de exclusão definitiva. Resolve `true` só se o usuário digitar
 * a palavra de confirmação e não houver bloqueios. Resolve `false` ao cancelar.
 */
export function confirmHardDelete(root, { entity, state, id, name, typeLabel }) {
  const { blockers, effects } = describeReferences(state, entity, id);
  const blocked = blockers.length > 0;
  const list = (items) => `<ul class="hard-delete-list">${items.map((item) => `<li>${item.count} ${escapeHtml(item.label)}</li>`).join("")}</ul>`;

  const html = `<div class="modal-backdrop hard-delete-backdrop" data-hard-delete>
    <section class="modal-card hard-delete-card" role="alertdialog" aria-modal="true" aria-labelledby="hard-delete-title">
      <div class="modal-header"><div><p class="eyebrow">Ação irreversível</p><h2 id="hard-delete-title">Excluir ${escapeHtml(typeLabel)} definitivamente</h2></div>
      <button class="icon-button" type="button" data-hd-cancel aria-label="Fechar">×</button></div>
      <p class="hard-delete-target"><strong>${escapeHtml(name)}</strong></p>
      ${blocked
        ? `<div class="hard-delete-blockers"><strong>Não é possível excluir agora.</strong><p>Existem referências que impedem a exclusão:</p>${list(blockers)}<p>Arquive o registro ou remova essas referências antes.</p></div>`
        : `<div class="hard-delete-warning"><strong>Esta ação não pode ser desfeita.</strong> O registro será apagado permanentemente do banco compartilhado.</div>
           ${effects.length ? `<p>Consequências:</p>${list(effects)}` : ""}
           <label class="hard-delete-confirm-label">Digite <b>${CONFIRM_WORD}</b> para confirmar<input class="input" type="text" data-hd-input autocomplete="off" autocapitalize="characters"></label>`}
      <div class="form-actions">
        <button class="button button-quiet" type="button" data-hd-cancel>Cancelar</button>
        ${blocked ? "" : `<button class="button button-danger" type="button" data-hd-confirm disabled>Excluir definitivamente</button>`}
      </div>
    </section></div>`;

  root.insertAdjacentHTML("beforeend", html);
  const modal = root.querySelector("[data-hard-delete]");

  return new Promise((resolve) => {
    const done = (value) => { modal.remove(); document.removeEventListener("keydown", onKey); resolve(value); };
    const onKey = (event) => { if (event.key === "Escape") done(false); };
    document.addEventListener("keydown", onKey);
    modal.addEventListener("click", (event) => { if (event.target === modal) done(false); });
    modal.querySelectorAll("[data-hd-cancel]").forEach((button) => button.addEventListener("click", () => done(false)));
    const input = modal.querySelector("[data-hd-input]");
    const confirm = modal.querySelector("[data-hd-confirm]");
    input?.addEventListener("input", () => { confirm.disabled = input.value.trim().toUpperCase() !== CONFIRM_WORD; });
    confirm?.addEventListener("click", () => { if (!confirm.disabled) done(true); });
    (input ?? modal.querySelector("[data-hd-cancel]"))?.focus();
  });
}
