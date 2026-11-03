import { renderPasswordChecklist } from "../ui/auth-view.js";
import { bindPasswordToggles, bindRegistrationHelpers } from "./auth-controller.js";
import { guardedSubmit } from "../ui/form-submit-guard.js";
import { showToast } from "../ui/toast.js";

const field = (label, name, extra = "") => `<label>${label}<div class="password-field"><input class="input" name="${name}" type="password" maxlength="128" required ${extra}><button type="button" class="password-toggle" data-toggle-password aria-label="Mostrar senha" aria-pressed="false"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/><line class="password-toggle-slash" x1="3" y1="3" x2="21" y2="21" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button></div>${extra.includes("data-password-strength") ? renderPasswordChecklist("") : ""}</label>`;

/** Modal "Alterar senha" do topo — disponível para qualquer usuário logado. */
export class PasswordController {
  constructor({ service, profile, root = document.body }) { this.service = service; this.profile = profile; this.root = root; }

  bind(button) { button.hidden = false; button.addEventListener("click", () => this.open()); }

  open() {
    if (this.root.querySelector("[data-password-modal]")) return;
    this.root.insertAdjacentHTML("beforeend", `<div class="modal-backdrop" data-password-modal><form class="modal-card" id="password-form"><div class="modal-header"><div><p class="eyebrow">Segurança</p><h2>Alterar senha</h2><p>As outras sessões abertas com a senha antiga serão encerradas.</p></div><button class="icon-button" type="button" data-close-password aria-label="Fechar">×</button></div><div class="number-form">${field("Senha atual", "currentPassword", 'autocomplete="current-password"')}${field("Nova senha", "password", 'autocomplete="new-password" data-password-strength')}${field("Confirmar nova senha", "passwordConfirm", 'autocomplete="new-password"')}<div class="form-actions"><button class="button button-quiet" type="button" data-close-password>Cancelar</button><button class="button button-primary" type="submit">Salvar nova senha</button></div></div></form></div>`);
    const modal = this.root.querySelector("[data-password-modal]");
    const close = () => modal.remove();
    modal.querySelectorAll("[data-close-password]").forEach((button) => button.addEventListener("click", close));
    bindPasswordToggles(modal);
    bindRegistrationHelpers(modal);
    const form = modal.querySelector("#password-form");
    form.addEventListener("submit", (event) => guardedSubmit(form, event, async () => {
      try { await this.service.changePassword(Object.fromEntries(new FormData(form)), this.profile); close(); showToast("Senha alterada com sucesso.", "success"); }
      catch (error) { showToast(error.message || "Não foi possível alterar a senha.", "error", 6000); }
    }));
    form.elements.currentPassword.focus();
  }
}
