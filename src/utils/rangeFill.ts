// Keeps --range-pct on every <input type="range"> so the brand fill in index.css follows the value: on user input,
// and when the page renders or changes a slider (new sliders, value attribute updates from React).
function update(el: HTMLInputElement) {
  const min = Number(el.min || 0);
  const max = Number(el.max || 100);
  const pct = max > min ? ((Number(el.value) - min) / (max - min)) * 100 : 0;
  el.style.setProperty("--range-pct", `${Math.min(100, Math.max(0, pct))}%`);
}

function isRange(n: unknown): n is HTMLInputElement {
  return n instanceof HTMLInputElement && n.type === "range";
}

export function startRangeFill() {
  if (typeof document === "undefined") return;
  document.addEventListener("input", (e) => { if (isRange(e.target)) update(e.target); }, true);
  const scan = (root: ParentNode) => root.querySelectorAll<HTMLInputElement>('input[type="range"]').forEach(update);
  scan(document);
  new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === "attributes") { if (isRange(r.target)) update(r.target); continue; }
      r.addedNodes.forEach((n) => { if (isRange(n)) update(n); else if (n instanceof Element) scan(n); });
    }
  }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["value", "min", "max"] });
}
