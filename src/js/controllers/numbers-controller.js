import { renderNumberForm, renderNumbersView } from "../ui/numbers-view.js";
import { renderCampaignAddForm, renderNumberDetailView, renderRestrictionForm } from "../ui/number-detail-view.js";
import { renderChangeRoleForm } from "../ui/campaigns-view.js";
import { showToast } from '../ui/toast.js';
import { guardedSubmit } from '../ui/form-submit-guard.js';
import { confirmHardDelete } from '../ui/hard-delete-dialog.js';
import { confirmDialog } from "../ui/confirm-dialog.js";
import { formatPhone } from "../ui/number-presentation.js";
import { renderPageTabs, bindPageTabs, NUMBERS_SECTION_TABS } from "../ui/page-tabs.js";

export class NumbersController {
  constructor({ service, campaignsService, content }) {
    this.service = service;
    this.campaignsService = campaignsService;
    this.content = content;
    this.query = "";
    this.archiveFilter = "ALL";
    this.filters = {};
    this.filtersOpen = window.matchMedia('(min-width: 701px)').matches;
  }

  render() {
    this.content.innerHTML = renderPageTabs(NUMBERS_SECTION_TABS, "numbers") + renderNumbersView(this.service.getNumbers(this.query, { ...this.filters, archiveFilter: this.archiveFilter }), this.service.getLocations(), this.service.getResponsibles(), this.query, this.archiveFilter, this.filters, this.service.getClients(), this.service.getGroups(), this.filtersOpen, this.service.state.campaigns, this.service.state.numberCampaignLinks);
    bindPageTabs(this.content, NUMBERS_SECTION_TABS);
    this.bindPageEvents();
  }

  bindPageEvents() {
    this.content.querySelector("#number-search")?.addEventListener("input", (event) => {
      this.query = event.target.value;
      const cursorPosition = event.target.selectionStart;
      this.render();
      const searchInput = this.content.querySelector("#number-search");
      searchInput?.focus();
      searchInput?.setSelectionRange(cursorPosition, cursorPosition);
    });
    this.content.querySelector('[data-action="add"]')?.addEventListener("click", () => this.openForm());
    this.content.querySelectorAll('[data-action="view"]').forEach((button) => button.addEventListener("click", () => this.showDetail(button.dataset.id)));
    this.content.querySelectorAll('[data-action="edit"]').forEach((button) => button.addEventListener("click", () => this.openForm(button.dataset.id)));
    this.content.querySelectorAll('[data-action="review"]').forEach((button) => button.addEventListener("click", () => this.markUnderReview(button.dataset.id)));
    this.content.querySelectorAll('[data-action="archive"]').forEach((button) => button.addEventListener("click", () => this.archive(button.dataset.id)));
    this.content.querySelectorAll('[data-action="hard-delete"]').forEach((button) => button.addEventListener("click", () => this.hardDelete(button.dataset.id)));
    this.content.querySelectorAll('[data-action="restore"]').forEach((button) => button.addEventListener("click", async () => { try { this.service.restore(button.dataset.id); await this.service.flush(); this.render(); showToast('Número restaurado para operação.', 'success'); } catch(error) { showToast(error.message,"error"); } }));
    this.content.querySelector("#archive-filter")?.addEventListener("change", (event) => { this.archiveFilter = event.target.value; this.render(); });
    this.content.querySelectorAll("[data-filter]").forEach((input) => input.addEventListener("change", () => { this.filters[input.dataset.filter] = input.value; this.render(); }));
    this.content.querySelectorAll('[data-action="toggle-filters"]').forEach((button) => button.addEventListener('click', () => { this.filtersOpen = !this.filtersOpen; this.render(); }));
    this.content.querySelectorAll('[data-action="clear-filters"]').forEach((button) => button.addEventListener('click', () => { this.query = ''; this.archiveFilter = 'ALL'; this.filters = {}; this.render(); }));
  }

  showDetail(id) {
    const number = this.service.getNumber(id);
    if (!number) return this.render();
    this.content.innerHTML = renderNumberDetailView({ number, locations: this.service.getLocations(), responsibles: this.service.getResponsibles(), clients: this.service.getClients(), groups: this.service.getGroups(), historyEvents: this.service.history.list(number.id), incidents: this.service.state.incidents.filter((incident) => incident.numberId === number.id), campaigns:this.service.state.campaigns, campaignLinks:this.campaignsService.linksFor(number.id), utilization:this.service.utilizationOf(number) });
    this.content.querySelector('[data-action="back-to-list"]')?.addEventListener("click", () => {
      if (window.location.hash !== "#numbers") window.location.hash = "#numbers";
      else this.render();
    });
    this.content.querySelector('[data-action="edit"]')?.addEventListener('click', () => this.openForm(number.id));
    this.content.querySelector('[data-action="review"]')?.addEventListener('click', () => this.markUnderReview(number.id, true));
    this.content.querySelector('[data-action="register-restriction"]')?.addEventListener('click', () => this.openRestrictionForm(number.id));
    this.content.querySelector('[data-action="remove-restriction"]')?.addEventListener('click', () => this.removeRestriction(number.id));
    this.content.querySelector('[data-action="manage-campaign"]')?.addEventListener('click', () => this.openCampaignForm(number.id));
    this.content.querySelectorAll('[data-action="end-campaign-link"]').forEach((button) => button.addEventListener('click', () => this.endCampaignLink(number.id, button.dataset.campaignId)));
    this.content.querySelectorAll('[data-action="change-role"]').forEach((button) => button.addEventListener('click', () => this.openChangeRoleForm(number.id, button.dataset.campaignId, button.dataset.role)));
    this.content.querySelector('[data-action="archive"]')?.addEventListener('click', () => this.archive(number.id));
    this.content.querySelector('[data-action="hard-delete"]')?.addEventListener('click', () => this.hardDelete(number.id, true));
    this.content.querySelector('[data-action="restore"]')?.addEventListener('click', async () => { try { this.service.restore(number.id); await this.service.flush(); showToast('Número restaurado para operação.', 'success'); this.showDetail(number.id); } catch(error) { showToast(error.message,"error"); } });
    this.content.querySelectorAll('[data-target]').forEach((button) => button.addEventListener('click', () => { window.location.hash = button.dataset.target; }));
  }

  openForm(id = null, message = "") {
    const number = id ? this.service.getNumber(id) : null;
    this.content.insertAdjacentHTML("beforeend", renderNumberForm({ number, locations: this.service.getLocations(), responsibles: this.service.getResponsibles(), clients: this.service.getClients(), groups: this.service.getGroups(), message }));
    const form = this.content.querySelector("#number-form");
    form.querySelector('[name="phone"]')?.addEventListener("input", (event) => { event.target.value = event.target.value.replace(/\D/g, "").slice(0, 13); });
    this.content.querySelectorAll('[data-action="close-form"]').forEach((button) => button.addEventListener("click", () => this.closeForm()));
    form.querySelectorAll("[data-relation-search]").forEach((input) => input.addEventListener("input", () => this.filterRelationOptions(form, input)));
    form.addEventListener("submit", (event) => guardedSubmit(form, event, () => this.submitForm(form)));
  }

  closeForm() { this.content.querySelector(".modal-backdrop")?.remove(); }

  filterRelationOptions(form, input) {
    const group = input.dataset.relationSearch;
    const optionsContainer = form.querySelector(`[data-relation-options="${group}"]`);
    if (!optionsContainer) return;
    const query = input.value.trim().toLocaleLowerCase("pt-BR");
    const options = [...optionsContainer.querySelectorAll(".check-option")];
    let visibleCount = 0;
    options.forEach((option) => {
      const matches = !query || option.textContent.toLocaleLowerCase("pt-BR").includes(query);
      option.hidden = !matches;
      if (matches) visibleCount++;
    });
    const emptyHint = form.querySelector(`[data-relation-empty="${group}"]`);
    if (emptyHint) emptyHint.hidden = visibleCount !== 0 || options.length === 0;
  }

  async submitForm(form) {
    const formData = new FormData(form);
    const values = { ...Object.fromEntries(formData), clientIds: formData.getAll("clientIds"), groupIds: formData.getAll("groupIds") };
    try {
      const editing = Boolean(form.dataset.id);
      editing ? this.service.update(form.dataset.id, values) : this.service.create(values);
      await this.service.flush();
      this.closeForm();
      this.render();
      showToast(editing ? 'Número atualizado com sucesso.' : 'Número cadastrado com sucesso.', 'success');
    } catch (error) {
      showToast(error.message, 'error');
      this.closeForm(); this.openForm(form.dataset.id || null, error.message);
    }
  }

  async archive(id) {
    const number = this.service.getNumber(id);
    if (!number) return;
    const confirmed = await confirmDialog(this.content, {
      icon: "!",
      title: "Arquivar este número?",
      bodyHtml: `<p>O número ficará inativo e indisponível.</p><p class="confirm-dialog-phone">${formatPhone(number.phone)}</p>`,
      confirmLabel: "Arquivar número",
      tone: "danger",
    });
    if (!confirmed) return;
    this.service.archive(id);
    try { await this.service.flush(); } catch(error) { showToast(error.message,"error"); return; }
    this.render();
    showToast('Número arquivado e retirado da operação.', 'warning');
  }

  async hardDelete(id, fromDetail = false) {
    const number = this.service.getNumber(id);
    if (!number) return;
    if (!(await confirmHardDelete(this.content, { entity: "numbers", state: this.service.state, id, name: number.phone, typeLabel: "número" }))) return;
    try {
      await this.service.hardDelete(id);
      await this.service.flush();
      showToast("Número excluído definitivamente.", "warning");
      if (fromDetail) window.location.hash = "#numbers"; else this.render();
    } catch (error) { showToast(error.message, "error"); }
  }

  async markUnderReview(id, returnToDetail = false) {
    const number = this.service.getNumber(id);
    const confirmed = await confirmDialog(this.content, {
      icon: "!",
      title: "Colocar este número em análise?",
      bodyHtml: `<p>O status será alterado, sem criar uma ocorrência automaticamente.</p>${number ? `<p class="confirm-dialog-phone">${formatPhone(number.phone)}</p>` : ""}`,
      confirmLabel: "Colocar em análise",
      tone: "danger",
    });
    if (!confirmed) return;
    this.service.markUnderReview(id);
    try { await this.service.flush(); } catch(error) { showToast(error.message,"error"); return; }
    showToast("Número colocado em análise.", "success");
    if (returnToDetail) this.showDetail(id); else this.render();
  }

  openCampaignForm(id) {
    const number=this.service.getNumber(id);if(!number)return;
    const activeCampaignIds=new Set(this.campaignsService.activeLinksFor(id).map((link)=>link.campaignId));
    const availableCampaigns=this.service.state.campaigns.filter((item)=>item.status==="ACTIVE"&&!activeCampaignIds.has(item.id));
    this.content.insertAdjacentHTML("beforeend",renderCampaignAddForm(number,availableCampaigns));
    const close=()=>this.closeForm();
    this.content.querySelectorAll('[data-action="close-form"]').forEach((button)=>button.addEventListener("click",close));
    const linkForm=this.content.querySelector("#campaign-link-form");
    linkForm?.addEventListener("submit",(event)=>guardedSubmit(linkForm,event,async()=>{
      try { const values=Object.fromEntries(new FormData(linkForm));this.campaignsService.assign(id,values.campaignId,values.role);await this.campaignsService.flush();close();showToast("Número vinculado à campanha.","success");this.showDetail(id); }
      catch(error){showToast(error.message,"error");}
    }));
  }

  async endCampaignLink(id, campaignId) {
    const confirmed = await confirmDialog(this.content, {
      icon: "!",
      title: "Encerrar este vínculo de campanha?",
      bodyHtml: `<p>O histórico será preservado.</p>`,
      confirmLabel: "Encerrar vínculo",
      tone: "danger",
    });
    if (!confirmed) return;
    try { this.campaignsService.unassign(id,campaignId);await this.campaignsService.flush();showToast("Vínculo de campanha encerrado.","warning");this.showDetail(id); }
    catch(error){showToast(error.message,"error");}
  }

  openChangeRoleForm(numberId, campaignId, currentRole) {
    const number=this.service.getNumber(numberId);const campaign=this.service.state.campaigns.find((item)=>item.id===campaignId);
    if(!number||!campaign)return;
    this.content.insertAdjacentHTML("beforeend",renderChangeRoleForm({numberId,campaignId,phone:number.phone,campaignName:campaign.name,currentRole}));
    const close=()=>this.closeForm();
    this.content.querySelectorAll('[data-action="close-form"]').forEach((button)=>button.addEventListener("click",close));
    const form=this.content.querySelector("#change-role-form");
    form?.addEventListener("submit",(event)=>guardedSubmit(form,event,async()=>{
      try{
        const role=new FormData(form).get("role");
        this.campaignsService.assign(numberId,campaignId,role);
        await this.campaignsService.flush();
        close();
        showToast("Função atualizada.","success");
        this.showDetail(numberId);
      }catch(error){showToast(error.message,"error");}
    }));
  }

  openRestrictionForm(id) {
    const number = this.service.getNumber(id);
    if (!number) return;
    this.content.insertAdjacentHTML("beforeend", renderRestrictionForm(number));
    const form = this.content.querySelector("#restriction-form");
    const other = form.querySelector("[data-other-restriction]");
    const kind = form.querySelector('[name="kind"]');
    const updateOther = () => { other.hidden = kind.value !== "OTHER"; };
    kind.addEventListener("change", updateOther);
    this.content.querySelectorAll('[data-action="close-form"]').forEach((button) => button.addEventListener("click", () => this.closeForm()));
    form.addEventListener("submit", (event) => guardedSubmit(form, event, async () => {
      try {
        this.service.registerRestriction(id, Object.fromEntries(new FormData(form)));
        await this.service.flush();
        this.closeForm();
        showToast("Restrição operacional registrada.", "success");
        this.showDetail(id);
      } catch (error) { showToast(error.message, "error"); }
    }));
  }

  async removeRestriction(id) {
    const confirmed = await confirmDialog(this.content, {
      icon: "!",
      title: "Remover a restrição ativa?",
      bodyHtml: `<p>O status principal não será alterado.</p>`,
      confirmLabel: "Remover restrição",
      tone: "danger",
    });
    if (!confirmed) return;
    this.service.removeRestriction(id);
    try { await this.service.flush(); } catch(error) { showToast(error.message,"error"); return; }
    showToast("Restrição operacional removida.", "success");
    this.showDetail(id);
  }
}
