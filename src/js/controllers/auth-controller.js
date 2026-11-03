import { renderChangePassword, renderForgotPassword, renderLogin, renderPasswordChecklist, renderRegistration, renderSetup } from "../ui/auth-view.js";
import { guardedSubmit } from "../ui/form-submit-guard.js";
import { bindThemeToggles } from "../ui/theme-toggle.js";
import { formatCpfInput, isValidCpf, normalizeCpf } from "../models/cpf.js";

/** Liga a máscara de CPF e a checklist de senha ao vivo em qualquer formulário. */
export function bindRegistrationHelpers(root) {
  root.querySelectorAll("[data-cpf-input]").forEach((input) => {
    const hint = input.closest("label")?.querySelector("[data-cpf-hint]");
    input.addEventListener("input", () => { input.value = formatCpfInput(input.value); if (hint) hint.hidden = true; });
    input.addEventListener("blur", () => {
      if (!hint) return;
      const invalid = normalizeCpf(input.value).length > 0 && !isValidCpf(input.value);
      hint.hidden = !invalid;
      hint.textContent = invalid ? "CPF inválido. Confira os números digitados." : "";
    });
  });
  root.querySelectorAll("[data-password-strength]").forEach((input) => {
    const checklist = input.closest("label")?.querySelector("[data-password-checklist]");
    input.addEventListener("input", () => { if (checklist) checklist.outerHTML = renderPasswordChecklist(input.value); });
  });
}

export function bindPasswordToggles(root) {
  root.querySelectorAll("[data-toggle-password]").forEach((button) => {
    button.addEventListener("click", () => {
      const input = button.closest(".password-field")?.querySelector("input");
      if (!input) return;
      const visible = input.type === "text";
      input.type = visible ? "password" : "text";
      button.classList.toggle("is-visible", !visible);
      button.setAttribute("aria-pressed", String(!visible));
      button.setAttribute("aria-label", visible ? "Mostrar senha" : "Ocultar senha");
    });
  });
}

export class AuthController {
  constructor({ service, root }) { this.service = service; this.root = root; this.mode = "login"; this.message = ""; this.tone = "alert"; this.profile = null; }

  async render() {
    this.root.classList.add("is-auth-screen");
    this.root.innerHTML =
      this.mode === "register" ? renderRegistration(this.message) :
      this.mode === "setup" ? renderSetup(this.message) :
      this.mode === "forgot" ? renderForgotPassword() :
      this.mode === "change-password" ? renderChangePassword(this.message, { forced: true }) :
      renderLogin(this.message, this.tone);
    this.root.querySelectorAll("[data-auth-mode]").forEach((button) => button.addEventListener("click", () => this.go(button.dataset.authMode)));
    this.root.querySelector('[data-auth-form="login"]')?.addEventListener("submit", (event) => this.login(event));
    this.root.querySelector('[data-auth-form="register"]')?.addEventListener("submit", (event) => this.submitRegistration(event, "register"));
    this.root.querySelector('[data-auth-form="setup"]')?.addEventListener("submit", (event) => this.submitRegistration(event, "setup"));
    this.root.querySelector('[data-auth-form="change-password"]')?.addEventListener("submit", (event) => this.changePassword(event));
    this.root.querySelector("[data-auth-logout-inline]")?.addEventListener("click", () => this.logout());
    bindPasswordToggles(this.root);
    bindRegistrationHelpers(this.root);
    bindThemeToggles(this.root);
  }

  go(mode, message = "", tone = "alert") { this.mode = mode; this.message = message; this.tone = tone; return this.render(); }

  async login(event) {
    const form = event.currentTarget;
    guardedSubmit(form, event, async () => {
      try { await this.service.signIn(form.elements.email.value, form.elements.password.value); window.location.reload(); }
      catch (error) { await this.go("login", error.message || "Não foi possível entrar."); }
    });
  }

  async submitRegistration(event, mode) {
    const form = event.currentTarget;
    guardedSubmit(form, event, async () => {
      const values = Object.fromEntries(new FormData(form));
      try {
        if (mode === "setup") { await this.service.setupMaster(values); window.location.reload(); return; }
        await this.service.requestAccess(values);
        await this.go("login", "Solicitação enviada! Assim que um administrador aprovar, você poderá entrar com o e-mail e a senha cadastrados.", "success");
      } catch (error) {
        this.message = error.message || "Não foi possível concluir o cadastro.";
        await this.render();
        // Mantém o que a pessoa digitou (menos as senhas) para não precisar preencher tudo de novo.
        const again = this.root.querySelector(`[data-auth-form="${mode}"]`);
        ["name", "email", "cpf", "jobTitle"].forEach((field) => { if (again?.elements[field]) again.elements[field].value = values[field] ?? ""; });
      }
    });
  }

  async changePassword(event) {
    const form = event.currentTarget;
    guardedSubmit(form, event, async () => {
      try { await this.service.changePassword(Object.fromEntries(new FormData(form)), this.profile); window.location.reload(); }
      catch (error) { await this.go("change-password", error.message || "Não foi possível alterar a senha."); }
    });
  }

  async logout() { try { await this.service.signOut(); } finally { window.location.hash = ""; window.location.reload(); } }

  bindLogout(button) {
    button.hidden = false;
    button.addEventListener("click", () => this.logout());
  }
}
