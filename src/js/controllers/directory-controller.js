import { renderBulkSquadForm, renderDirectory, renderDirectoryDetail, renderDirectoryForm, renderGroupDetail, renderResponsibleDetail } from "../ui/directory-view.js";
import { showToast } from "../ui/toast.js";
import { guardedSubmit } from "../ui/form-submit-guard.js";
import { confirmHardDelete } from "../ui/hard-delete-dialog.js";
import { confirmDialog } from "../ui/confirm-dialog.js";
import { escapeHtml } from "../ui/number-presentation.js";
import { renderPageTabs, bindPageTabs, NUMBERS_SECTION_TABS } from "../ui/page-tabs.js";

const labels = { clients: "Cliente", groups: "Squad", responsibles: "Colaborador", locations: "Localização" };
const typeLabels = { clients: "cliente", groups: "squad", responsibles: "colaborador", locations: "localização" };

export class DirectoryController {
  constructor({ service, campaignsService = null, content, type }) { this.service = service; this.campaignsService = campaignsService; this.content = content; this.type = type; this.query = ""; }

  get state() { return this.service.numbersService.state; }

  render() {
    const tabs = this.type === "locations" ? renderPageTabs(NUMBERS_SECTION_TABS, "locations") : "";
    this.content.innerHTML = tabs + renderDirectory(this.type, this.service.list(this.type, true), this.query, this.state.groups, this.state.responsibles);
    if (this.type === "locations") bindPageTabs(this.content, NUMBERS_SECTION_TABS);
    this.content.querySelector('[data-action="add"]')?.addEventListener("click", () => this.openForm());
    this.content.querySelector('[data-action="bulk-squad"]')?.addEventListener("click", () => this.openBulkSquad());
    this.content.querySelector('[data-action="search"]')?.addEventListener("input", (event) => { this.query = event.target.value; this.render(); });
    this.content.querySelector('[data-action="clear-search"]')?.addEventListener("click", () => { this.query = ""; this.render(); });
    this.content.querySelectorAll('[data-action="view"]').forEach((button) => button.addEventListener("click", () => this.detail(button.dataset.id)));
    this.content.querySelectorAll('[data-action="edit"]').forEach((button) => button.addEventListener("click", () => this.openForm(button.dataset.id)));
    this.content.querySelectorAll('[data-action="archive"]').forEach((button) => button.addEventListener("click", () => this.archive(button.dataset.id)));
    this.content.querySelectorAll('[data-action="hard-delete"]').forEach((button) => button.addEventListener("click", () => this.hardDelete(button.dataset.id)));
    this.content.querySelectorAll('[data-action="restore"]').forEach((button) => button.addEventListener("click", async () => { try { this.service.restore(this.type, button.dataset.id); await this.service.flush(); showToast(`${labels[this.type]} restaurado.`, "success"); this.render(); } catch(error) { showToast(error.message,"error"); } }));
  }

  detail(id) {
    const item = this.service.get(this.type, id);
    if (!item) return this.render();
    const state = this.state;
    if (this.type === "responsibles") {
      this.content.innerHTML = renderResponsibleDetail(item, state.groups, state.clients, state.campaigns, state.numbers, state.locations);
    } else if (this.type === "groups") {
      const numbers = this.service.numbersService.getNumbersFor(this.type, id);
      this.content.innerHTML = renderGroupDetail(item, state.clients, state.responsibles, numbers, state.locations);
    } else {
      const numbers = this.service.numbersService.getNumbersFor(this.type, id);
      const campaigns = this.type === "clients" && this.campaignsService ? this.campaignsService.list({ clientId: id }) : [];
      this.content.innerHTML = renderDirectoryDetail(this.type, item, numbers, state.locations, state.responsibles, campaigns, state.groups, state.numberCampaignLinks);
    }
    this.content.querySelector('[data-action="back"]')?.addEventListener("click", () => this.render());
    this.content.querySelectorAll('[data-action="open-number"]').forEach((button) => button.addEventListener("click", () => { window.location.hash = `#numbers/${button.dataset.id}`; }));
    this.content.querySelectorAll('[data-action="open-campaign"]').forEach((button) => button.addEventListener("click", () => { window.location.hash = `#campaigns/${button.dataset.id}`; }));
    this.content.querySelectorAll('[data-action="close-campaign"]').forEach((button) => button.addEventListener("click", async () => {
      const confirmed = await confirmDialog(this.content, {
        icon: "!",
        title: "Finalizar esta campanha?",
        bodyHtml: `<p>Os vínculos ativos serão encerrados e o histórico será preservado.</p>`,
        confirmLabel: "Finalizar campanha",
        tone: "danger",
      });
      if (!confirmed) return;
      this.campaignsService.close(button.dataset.id);
      try { await this.campaignsService.flush(); } catch(error) { showToast(error.message,"error"); return; }
      showToast("Campanha finalizada.", "warning");
      this.detail(id);
    }));
  }

  async archive(id) {
    const label = labels[this.type];
    const item = this.service.get(this.type, id);
    const confirmed = await confirmDialog(this.content, {
      icon: "!",
      title: `Arquivar este ${label.toLocaleLowerCase("pt-BR")}?`,
      bodyHtml: `<p>Ele continuará preservado na base.</p>${item ? `<p class="confirm-dialog-phone">${escapeHtml(item.name)}</p>` : ""}`,
      confirmLabel: `Arquivar ${label.toLocaleLowerCase("pt-BR")}`,
      tone: "danger",
    });
    if (!confirmed) return;
    this.service.archive(this.type, id);
    try { await this.service.flush(); } catch(error) { showToast(error.message,"error"); return; }
    showToast(`${label} arquivado.`, "warning");
    this.render();
  }

  async hardDelete(id) {
    const item = this.service.get(this.type, id);
    if (!item) return;
    const entity = this.type === "groups" ? "groups" : this.type;
    if (!(await confirmHardDelete(this.content, { entity, state: this.state, id, name: item.name, typeLabel: typeLabels[this.type] }))) return;
    try {
      await this.service.hardDelete(this.type, id);
      await this.service.flush();
      showToast(`${labels[this.type]} excluído definitivamente.`, "warning");
      this.render();
    } catch (error) { showToast(error.message, "error"); }
  }

  openForm(id = null) {
    this.content.insertAdjacentHTML("beforeend", renderDirectoryForm(this.type, id ? this.service.get(this.type, id) : {}, this.service.list("groups"), this.service.list("responsibles")));
    const close = () => this.content.querySelector(".modal-backdrop")?.remove();
    this.content.querySelectorAll('[data-action="close-form"]').forEach((button) => button.addEventListener("click", close));
    const directoryForm = this.content.querySelector("#directory-form");
    directoryForm?.addEventListener("submit", (event) => guardedSubmit(directoryForm, event, async () => {
      try {
        const values = Object.fromEntries(new FormData(directoryForm));
        const isUpdate = Boolean(directoryForm.dataset.id);
        if (isUpdate) this.service.update(this.type, directoryForm.dataset.id, values); else this.service.create(this.type, values);
        await this.service.flush();
        showToast(`${labels[this.type]} ${isUpdate ? "atualizado" : "adicionado"}.`, "success");
        this.render();
      } catch (error) { showToast(error.message || "Não foi possível salvar o registro.", "error"); }
    }));
  }

  openBulkSquad() {
    const squadless = this.service.list("clients", true).filter((client) => client.isActive && !client.squadId);
    if (!squadless.length) { showToast("Nenhum cliente sem Squad.", "info"); return; }
    this.content.insertAdjacentHTML("beforeend", renderBulkSquadForm(squadless, this.service.list("groups")));
    const close = () => this.content.querySelector(".modal-backdrop")?.remove();
    this.content.querySelectorAll('[data-action="close-form"]').forEach((button) => button.addEventListener("click", close));
    const form = this.content.querySelector("#bulk-squad-form");
    form?.addEventListener("submit", (event) => guardedSubmit(form, event, async () => {
      try {
        const data = new FormData(form);
        const squadId = data.get("squadId");
        if (!squadId) throw new Error("Selecione o Squad.");
        const updated = this.service.bulkAssignSquad(data.getAll("clientIds"), squadId);
        await this.service.flush();
        close();
        showToast(`${updated} cliente(s) atualizados.`, "success");
        this.render();
      } catch (error) { showToast(error.message, "error"); }
    }));
  }
}
