export function guardedSubmit(form, event, handler) {
  event.preventDefault();
  if (form.dataset.submitting === "true") return;
  form.dataset.submitting = "true";
  const button = form.querySelector(".button-primary");
  const originalText = button?.textContent;
  if (button) { button.disabled = true; button.textContent = "Salvando…"; }
  Promise.resolve().then(handler).finally(() => {
    delete form.dataset.submitting;
    if (button?.isConnected) { button.disabled = false; button.textContent = originalText; }
  });
}
