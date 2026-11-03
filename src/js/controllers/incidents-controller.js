import { renderIncidents, renderIncidentForm, renderIncidentDetail, INCIDENT_TYPE_LABELS } from "../ui/incidents-view.js";
import { showToast } from "../ui/toast.js";
import { guardedSubmit } from "../ui/form-submit-guard.js";
import { confirmDialog } from "../ui/confirm-dialog.js";
import { escapeHtml } from "../ui/number-presentation.js";

export class IncidentsController {
  constructor({ service, numbers, content }) { this.service = service; this.numbers = numbers; this.content = content; this.filters = {}; }

  render() {
    this.content.innerHTML = renderIncidents(this.service.list(this.filters), this.numbers.state.numbers, this.numbers.getResponsibles(), this.filters);
    this.content.querySelector('[data-action="add"]')?.addEventListener("click", () => this.form());
    this.content.querySelectorAll('[data-filter]').forEach((input) => input.addEventListener("change", () => { this.filters[input.dataset.filter] = input.value; this.render(); }));
    this.content.querySelectorAll('[data-action="clear-filters"]').forEach((button) => button.addEventListener("click", () => { this.filters = {}; this.render(); }));
    this.content.querySelectorAll('[data-action="view"]').forEach((button) => button.addEventListener("click", () => this.detail(button.dataset.id)));
    this.content.querySelectorAll('[data-action="edit"]').forEach((button) => button.addEventListener("click", () => this.form(button.dataset.id)));
    this.content.querySelectorAll('[data-action="toggle"]').forEach((button) => button.addEventListener("click", () => this.toggle(button.dataset.id)));
    this.bindNumberLinks();
  }

  bindNumberLinks() { this.content.querySelectorAll('[data-action="open-number"]').forEach((button) => button.addEventListener("click", () => { window.location.hash = `#numbers/${button.dataset.numberId}`; })); }

  detail(id) {
    const incident = this.service.get(id);
    if (!incident) return this.render();
    this.content.innerHTML = renderIncidentDetail(incident, this.numbers.state.numbers, this.numbers.getResponsibles());
    this.content.querySelector('[data-action="back"]')?.addEventListener("click", () => this.render());
    this.content.querySelector('[data-action="edit"]')?.addEventListener("click", () => this.form(incident.id));
    this.content.querySelector('[data-action="toggle"]')?.addEventListener("click", () => this.toggle(incident.id, true));
    this.bindNumberLinks();
  }

  async toggle(id, returnToDetail = false) {
    const incident = this.service.get(id);
    if (!incident) return this.render();
    const next = incident.status === "OPEN" ? "RESOLVED" : "OPEN";
    const action = next === "RESOLVED" ? "Resolver" : "Reabrir";
    const confirmed = await confirmDialog(this.content, {
      icon: "!",
      title: `${action} esta ocorrência?`,
      bodyHtml: `<p class="confirm-dialog-phone">${escapeHtml(INCIDENT_TYPE_LABELS[incident.type] || incident.type)}${incident.description ? ` — ${escapeHtml(incident.description)}` : ""}</p>`,
      confirmLabel: action,
      tone: "primary",
    });
    if (!confirmed) return;
    this.service.setStatus(id, next);
    try { await this.numbers.flush(); } catch(error) { showToast(error.message,"error"); return; }
    showToast(next === "RESOLVED" ? "Ocorrência resolvida." : "Ocorrência reaberta.", "success");
    if (returnToDetail) this.detail(id); else this.render();
  }

  form(id = null) {
    this.content.insertAdjacentHTML("beforeend", renderIncidentForm(id ? this.service.get(id) : null, this.numbers.state.numbers, this.numbers.getResponsibles()));
    const close = () => this.content.querySelector(".modal-backdrop")?.remove();
    this.content.querySelectorAll('[data-action="close-form"]').forEach((button) => button.addEventListener("click", close));
    const incidentForm = this.content.querySelector("#incident-form");
    incidentForm?.addEventListener("submit", (event) => guardedSubmit(incidentForm, event, async () => {
      try {
        const values = Object.fromEntries(new FormData(incidentForm));
        const editing = Boolean(incidentForm.dataset.id);
        if (editing) this.service.update(incidentForm.dataset.id, values); else this.service.create(values);
        await this.numbers.flush();
        showToast(editing ? "Ocorrência atualizada." : "Ocorrência criada.", "success");
        this.render();
      } catch (error) { showToast(error.message || "Não foi possível salvar a ocorrência.", "error"); }
    }));
  }
}
