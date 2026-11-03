import { renderHistory } from "../ui/history-view.js";

export class HistoryController {
  constructor({ service, numbers, content }) { this.service = service; this.numbers = numbers; this.content = content; this.filters = {}; }
  render() {
    let events = this.service.list(this.filters.numberId);
    if (this.filters.type) events = events.filter((event) => event.type === this.filters.type);
    this.content.innerHTML = renderHistory(events, this.numbers.state.numbers, this.filters);
    this.content.querySelectorAll('[data-filter]').forEach((input) => input.addEventListener("change", () => { this.filters[input.dataset.filter] = input.value; this.render(); }));
    this.content.querySelector('[data-action="clear-filters"]')?.addEventListener("click", () => { this.filters = {}; this.render(); });
    this.content.querySelectorAll('[data-action="open-number"]').forEach((button) => button.addEventListener("click", () => { window.location.hash = `#numbers/${button.dataset.numberId}`; }));
  }
}
