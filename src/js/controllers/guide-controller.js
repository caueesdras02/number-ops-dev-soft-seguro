import { renderGuide } from "../ui/guide-view.js";

export class GuideController {
  constructor({ content }) { this.content = content; }
  render() {
    this.content.innerHTML = renderGuide();
    this.content.querySelectorAll("[data-guide-target]").forEach((button) => button.addEventListener("click", () => {
      const target = this.content.querySelector(`#${button.dataset.guideTarget}`);
      target?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
      target?.setAttribute("tabindex", "-1");
      target?.focus({ preventScroll: true });
    }));
  }
}
