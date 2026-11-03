import { renderAuditDetail, renderAuditLog } from "../ui/audit-log-view.js";
import { escapeHtml } from "../ui/number-presentation.js";

export class AuditLogController {
  constructor({ service,content }) { this.service=service;this.content=content;this.filters={};this.data=null; }
  async render() {
    try { this.data=await this.service.load();this.paint(); }
    catch(error) { this.content.innerHTML=`<div class="backup-feedback" role="alert">${escapeHtml(error.message)}</div>`; }
  }
  paint() {
    const filtered=this.service.filter(this.data.logs,this.filters);
    this.content.innerHTML=renderAuditLog({...this.data,logs:filtered,allLogs:this.data.logs,filters:this.filters});
    this.content.querySelectorAll("[data-audit-filter]").forEach((input)=>input.addEventListener("change",()=>{this.filters[input.dataset.auditFilter]=input.value;this.paint();}));
    this.content.querySelector('[data-action="clear-audit-filters"]')?.addEventListener("click",()=>{this.filters={};this.paint();});
    this.content.querySelectorAll('[data-action="audit-detail"]').forEach((button)=>button.addEventListener("click",()=>this.detail(button.dataset.id)));
  }
  detail(id) {
    const log=this.data.logs.find((item)=>String(item.id)===String(id));if(!log)return;
    this.content.insertAdjacentHTML("beforeend",renderAuditDetail(log,this.data.squads));
    const modal=this.content.querySelector("[data-audit-modal]");
    const close=()=>modal?.remove();
    modal?.querySelector('[data-action="close-audit-detail"]')?.addEventListener("click",close);
    modal?.addEventListener("click",(event)=>{if(event.target===modal)close();});
    modal?.querySelector('[data-action="close-audit-detail"]')?.focus();
  }
}
