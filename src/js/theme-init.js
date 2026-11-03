// Anti-flash: aplica o tema salvo antes do CSS pintar. Padrão: claro.
try { var t = localStorage.getItem("numberOpsTheme"); if (t === "dark" || t === "light") document.documentElement.dataset.theme = t; } catch (e) {}
