import { renderProfileForm, renderProfiles } from "../ui/profiles-view.js";
import { renderApproveRequestForm, renderSignupRequests } from "../ui/signup-requests-view.js";
import { showToast } from "../ui/toast.js";
import { escapeHtml } from "../ui/number-presentation.js";
import { confirmDialog } from "../ui/confirm-dialog.js";
import { guardedSubmit } from "../ui/form-submit-guard.js";
import { isMaster } from "../models/access.js";

export class ProfilesController {
  constructor({ service, requestsService = null, content, currentProfile, onRequestsChanged = null }) { this.service = service; this.requestsService = requestsService; this.content = content; this.currentProfile = currentProfile; this.onRequestsChanged = onRequestsChanged; this.data = null; this.requests = []; }
  async render() {
    try {
      this.data = await this.service.list();
      let requestsHtml = "";
      if (this.requestsService && isMaster(this.currentProfile)) {
        this.requests = await this.requestsService.list();
        requestsHtml = renderSignupRequests(this.requests, this.data.squads);
        this.onRequestsChanged?.(this.requests.filter((item) => item.status === "PENDING").length);
      }
      // Solicitações pendentes ficam no topo: é a primeira coisa que o MASTER precisa ver.
      this.content.innerHTML = requestsHtml + renderProfiles({ ...this.data, currentProfile: this.currentProfile });
      this.content.querySelectorAll('[data-action="edit-profile"]').forEach((button) => button.addEventListener("click", () => this.openForm(button.dataset.id)));
      this.content.querySelectorAll('[data-action="hard-delete-profile"]').forEach((button) => button.addEventListener("click", () => this.hardDelete(button.dataset.id)));
      this.content.querySelectorAll('[data-action="reset-password"]').forEach((button) => button.addEventListener("click", () => this.resetPassword(button.dataset.id)));
      this.content.querySelectorAll('[data-action="approve-request"]').forEach((button) => button.addEventListener("click", () => this.openApproveForm(button.dataset.id)));
      this.content.querySelectorAll('[data-action="reject-request"]').forEach((button) => button.addEventListener("click", () => this.rejectRequest(button.dataset.id)));
    } catch (error) { this.content.innerHTML = `<div class="backup-feedback" role="alert">${escapeHtml(error.message)}</div>`; }
  }
  openForm(id) {
    const profile = this.data.profiles.find((item) => item.id === id);
    if (!profile) return;
    this.content.insertAdjacentHTML("beforeend", renderProfileForm(profile, this.data.squads, this.currentProfile));
    const close = () => this.content.querySelector(".modal-backdrop")?.remove();
    this.content.querySelectorAll('[data-action="close-profile-form"]').forEach((button) => button.addEventListener("click", close));
    const form = this.content.querySelector("#profile-form");
    form?.addEventListener("submit", (event) => guardedSubmit(form, event, async () => {
      try { await this.service.update(id, Object.fromEntries(new FormData(form)), this.currentProfile); showToast("Usuário atualizado.", "success"); await this.render(); }
      catch (error) { showToast(error.message, "error"); }
    }));
  }
  async hardDelete(id) {
    const profile = this.data.profiles.find((item) => item.id === id);
    if (!profile) return;
    const confirmed = await confirmDialog(this.content, {
      icon: "!",
      title: "Excluir definitivamente este usuário?",
      bodyHtml: `<p>O usuário e todas as sessões dele serão removidos. O Registro de atividades continua preservado.</p><p class="confirm-dialog-phone">${escapeHtml(profile.name)} (${escapeHtml(profile.email)})</p>`,
      confirmLabel: "Excluir usuário",
      tone: "danger",
    });
    if (!confirmed) return;
    try {
      await this.service.hardDelete(id, this.currentProfile);
      showToast("Usuário excluído definitivamente.", "warning");
      await this.render();
    } catch (error) { showToast(error.message, "error"); }
  }
  async resetPassword(id) {
    const profile = this.data.profiles.find((item) => item.id === id);
    if (!profile) return;
    const confirmed = await confirmDialog(this.content, {
      icon: "🔑",
      title: "Redefinir a senha deste usuário?",
      bodyHtml: `<p>Será gerada uma senha temporária. As sessões abertas do usuário serão encerradas e ele precisará criar uma nova senha no próximo login.</p><p class="confirm-dialog-phone">${escapeHtml(profile.name)} (${escapeHtml(profile.email)})</p>`,
      confirmLabel: "Gerar senha temporária",
      tone: "primary",
    });
    if (!confirmed) return;
    try {
      const temporary = await this.service.resetPassword(id, this.currentProfile);
      await confirmDialog(this.content, {
        icon: "✓",
        title: "Senha temporária gerada",
        bodyHtml: `<p>Entregue esta senha ao usuário por um canal seguro. Ela não será exibida novamente.</p><p class="confirm-dialog-phone temporary-password">${escapeHtml(temporary)}</p>`,
        cancelLabel: "Fechar",
        confirmLabel: "Copiar e fechar",
        tone: "primary",
      }).then((copy) => { if (copy) navigator.clipboard?.writeText(temporary).then(() => showToast("Senha copiada.", "success")).catch(() => {}); });
    } catch (error) { showToast(error.message, "error"); }
  }
  openApproveForm(id) {
    const request = this.requests.find((item) => item.id === id);
    if (!request) return;
    this.content.insertAdjacentHTML("beforeend", renderApproveRequestForm(request, this.data.squads));
    const close = () => this.content.querySelector(".modal-backdrop")?.remove();
    this.content.querySelectorAll('[data-action="close-request-form"]').forEach((button) => button.addEventListener("click", close));
    const form = this.content.querySelector("#approve-request-form");
    form?.addEventListener("submit", (event) => guardedSubmit(form, event, async () => {
      try {
        await this.requestsService.approve(id, Object.fromEntries(new FormData(form)), this.currentProfile);
        showToast(`Acesso de ${request.name} aprovado.`, "success");
      } catch (error) { showToast(error.message, "error", 6000); }
      await this.render();
    }));
  }
  async rejectRequest(id) {
    const request = this.requests.find((item) => item.id === id);
    if (!request) return;
    const confirmed = await confirmDialog(this.content, {
      icon: "!",
      title: "Recusar esta solicitação?",
      bodyHtml: `<p>A pessoa não poderá entrar no sistema. Ela poderá enviar uma nova solicitação depois, se necessário.</p><p class="confirm-dialog-phone">${escapeHtml(request.name)} (${escapeHtml(request.email)})</p>`,
      confirmLabel: "Recusar",
      tone: "danger",
    });
    if (!confirmed) return;
    try { await this.requestsService.reject(id, "", this.currentProfile); showToast("Solicitação recusada.", "warning"); await this.render(); }
    catch (error) { showToast(error.message, "error"); }
  }
}
