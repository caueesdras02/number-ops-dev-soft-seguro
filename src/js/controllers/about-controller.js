import { renderAboutModal } from "../ui/about-view.js";

export class AboutController {
  constructor({ trigger,root=document.body }) { this.trigger=trigger;this.root=root;this.previousFocus=null;this.boundKeydown=(event)=>this.keydown(event); }
  bind() { this.trigger?.addEventListener("click",()=>this.open()); }
  open() {
    if(this.root.querySelector("[data-about-modal]"))return;
    this.previousFocus=document.activeElement;
    this.root.insertAdjacentHTML("beforeend",renderAboutModal());
    const modal=this.root.querySelector("[data-about-modal]");
    modal.querySelector("[data-about-close]").addEventListener("click",()=>this.close());
    modal.addEventListener("click",(event)=>{if(event.target===modal)this.close();});
    document.addEventListener("keydown",this.boundKeydown);
    modal.querySelector("[data-about-close]").focus();
  }
  close() { this.root.querySelector("[data-about-modal]")?.remove();document.removeEventListener("keydown",this.boundKeydown);this.previousFocus?.focus?.(); }
  keydown(event) { if(event.key==="Escape"){event.preventDefault();this.close();} }
}
