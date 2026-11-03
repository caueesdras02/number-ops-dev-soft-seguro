import { renderBackup } from "../ui/backup-view.js";
import { showToast } from "../ui/toast.js";
import { confirmDialog } from "../ui/confirm-dialog.js";

export class BackupController {
  constructor({ service, content, canRestore = false }) { this.service = service; this.content = content; this.canRestore = canRestore; this.preview = null; this.message = ""; }
  render() {
    this.content.innerHTML = renderBackup(this.preview, this.message, { canRestore: this.canRestore });
    this.content.querySelector('[data-backup-export]')?.addEventListener("click", () => this.export());
    this.content.querySelector('[data-backup-file]')?.addEventListener("change", (event) => this.read(event.target.files[0]));
    this.content.querySelector('[data-backup-confirm]')?.addEventListener("click", () => this.restore());
    this.content.querySelector('[data-backup-cancel]')?.addEventListener("click", () => { this.preview = null; this.message = ""; this.render(); });
  }
  export() { this.download(this.service.createExport(), "Backup exportado com sucesso."); }
  download({ filename, json }, successMessage = "Arquivo baixado.") { const url = URL.createObjectURL(new Blob([json], { type: "application/json" })); const link = Object.assign(document.createElement("a"), { href: url, download: filename }); link.click(); URL.revokeObjectURL(url); showToast(successMessage, "success"); }
  read(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { try { this.preview = this.service.inspect(reader.result); this.message = ""; showToast("Backup validado. Revise o conteúdo antes de restaurar.", "info"); } catch (error) { this.preview = null; this.message = error.message; showToast(this.message, "error"); } this.render(); };
    reader.onerror = () => { this.preview = null; this.message = "Não foi possível ler o arquivo selecionado."; showToast(this.message, "error"); this.render(); };
    reader.readAsText(file);
  }
  async restore() {
    if (!this.preview || !this.canRestore) return;
    const confirmed = await confirmDialog(this.content, {
      icon: "!",
      title: "Restaurar este backup?",
      bodyHtml: `<p>Todos os dados operacionais do servidor serão substituídos. Uma cópia do banco atual será salva em data/backups/.</p>`,
      confirmLabel: "Restaurar backup",
      tone: "danger",
    });
    if (!confirmed) return;
    try { await this.service.restore(this.preview); showToast("Backup restaurado. Recarregando a interface…", "success", 900); window.setTimeout(() => { window.location.hash = "#dashboard"; window.location.reload(); }, 300); } catch (error) { this.message = error.message; showToast(this.message, "error"); this.render(); }
  }
}
