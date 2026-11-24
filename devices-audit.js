// Dev-only automatic check of a page on every device size from devices.html (not part of the site build).
// In the console of http://localhost:5173/devices.html:
//   const { audit } = await import("/devices-audit.js"); await audit(["/programs"])
// For each page × device it reports: horizontal scroll, elements sticking out of the screen, uneven side margins of
// the main column, text under 12 px, tap targets under 32 px. Only problems are returned.
const DEVICES = [
  ["SE", 375, 667], ["12mini", 375, 812], ["14", 390, 844], ["15", 393, 852], ["16Pro", 402, 874], ["Air", 420, 912],
  ["Plus", 430, 932], ["ProMax", 440, 956], ["DuoOut", 466, 678], ["DuoOpen", 950, 669],
  ["A-budget", 360, 800], ["S24", 360, 780], ["Pixel", 412, 915], ["Flip", 412, 1004], ["FoldOut", 344, 882],
  ["FoldOpen", 712, 832], ["SDuo1", 540, 720], ["SDuo2", 1114, 720],
  ["iPadMini", 744, 1133], ["iPadAir11", 820, 1180], ["iPadPro11", 834, 1210], ["iPad13", 1032, 1376], ["TabS9", 800, 1280],
  ["iPadMini-L", 1133, 744], ["iPad13-L", 1376, 1032],
  ["Win1366", 1366, 768], ["Win1536", 1536, 864], ["Lap1280", 1280, 800], ["MBA13", 1470, 956], ["MBP14", 1512, 982],
  ["MBP16", 1728, 1117], ["FHD", 1920, 1080], ["2K", 2560, 1440], ["TV", 960, 540],
  ["15-L", 852, 393], ["Plus-L", 932, 430],
];

export function check(win) {
  const d = win.document, W = win.innerWidth, out = [];
  if (d.documentElement.scrollWidth > W + 1) out.push(`h-scroll +${d.documentElement.scrollWidth - W}`);
  const stick = new Set();
  let small = 0, tiny = 0;
  for (const el of d.body.querySelectorAll("*")) {
    const cs = win.getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || cs.position === "fixed") continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    let clipped = false;
    for (let p = el.parentElement; p && p !== d.body; p = p.parentElement) {
      const o = win.getComputedStyle(p);
      if (o.overflowX !== "visible" || o.overflow === "hidden") { clipped = true; break; }
    }
    if (!clipped && (r.right > W + 1 || r.left < -1) && el.children.length === 0 && el.textContent.trim())
      stick.add(`${el.tagName.toLowerCase()}«${el.textContent.trim().slice(0, 24)}»`);
    if (el.children.length === 0 && el.textContent.trim() && parseFloat(cs.fontSize) < 12 && !el.closest("[aria-hidden=true]")) small++;
    if ((el.tagName === "BUTTON" || el.tagName === "A") && r.height < 32 && r.width < 32 && !el.closest("[aria-hidden=true]")) tiny++;
  }
  if (stick.size) out.push(`out-of-screen: ${[...stick].slice(0, 4).join(", ")}`);
  if (small > 3) out.push(`text<12px ×${small}`);
  if (tiny) out.push(`tap<32px ×${tiny}`);
  // the main column: the widest block that is narrower than the screen
  const main = [...d.querySelectorAll("main, .page-container, [class*='max-w-']")]
    .map((e) => e.getBoundingClientRect()).filter((r) => r.width > W * 0.5 && r.width < W - 8 && r.height > 200)
    .sort((a, b) => b.width - a.width)[0];
  if (main) {
    const l = Math.round(main.left), rr = Math.round(W - main.right);
    if (Math.abs(l - rr) > 4) out.push(`margins L${l}/R${rr}`);
    // design: the column on big screens should use the width (owner's rule: ~75–80 % from 1440 px), tablets need air
    const ratio = Math.round((main.width / W) * 100);
    if (W >= 1400 && ratio < 70) out.push(`narrow ${ratio}%`);
    if (W >= 700 && W < 1100 && win.innerHeight > W && (l < 24 || rr < 24)) out.push(`tight L${l}/R${rr}`);
  } else if (W >= 1400) {
    out.push("no-main");
  }
  return out;
}

export async function audit(paths, only) {
  // the frames share this tab's sessionStorage: mark the tab as already open, otherwise the app's «new tab after idle»
  // rule would sign the account out when a cabinet is checked
  try { sessionStorage.setItem("sensoria.auth.tabOpen", "1"); } catch { /* private mode */ }
  const res = {};
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-99999px;top:0";
  document.body.append(host);
  for (const path of paths) {
    for (const [name, w, h] of DEVICES) {
      if (only && !only.includes(name)) continue;
      const f = document.createElement("iframe");
      f.style.cssText = `width:${w}px;height:${h}px;border:0`;
      f.src = path;
      host.append(f);
      await new Promise((r) => f.addEventListener("load", r, { once: true }));
      await new Promise((r) => setTimeout(r, 1400));
      try {
        const st = f.contentDocument.createElement("style");
        st.textContent = "html{scrollbar-width:none}html::-webkit-scrollbar{display:none}*{animation:none!important;transition:none!important}";
        f.contentDocument.head.append(st);
        await new Promise((r) => setTimeout(r, 150));
        const p = check(f.contentWindow);
        if (p.length) (res[path] ??= {})[name] = p.join(" | ");
        try { localStorage.setItem("audit-res", JSON.stringify({ at: `${path} ${name}`, res })); } catch { /* */ }
      } catch (e) {
        (res[path] ??= {})[name] = `error ${e}`;
      }
      f.remove();
    }
  }
  host.remove();
  return res;
}

// Big screens: for each page, the page height over the screen (one-screen steps) and the widest column share.
export async function bigCheck(paths, sizes = [[1512, 982], [1728, 1117], [1920, 1080], [2560, 1440]]) {
  const out = [];
  for (const path of paths) for (const [w, h] of sizes) {
    const f = document.createElement("iframe");
    f.style.cssText = `position:fixed;left:-99999px;top:0;width:${w}px;height:${h}px;border:0`;
    f.src = path; document.body.append(f);
    await new Promise((r) => f.addEventListener("load", r, { once: true }));
    await new Promise((r) => setTimeout(r, 1800));
    const d = f.contentDocument, W = w;
    const cols = [...d.querySelectorAll(".page-container, .result-wrap, .rec-wrap, .wide-col, .cab-wrap, .qcard, .reg-card, .state-inner")]
      .map((e) => e.getBoundingClientRect().width).filter((x) => x > 200);
    out.push(`${path} ${w}x${h}: over ${d.documentElement.scrollHeight - h}, col ${cols.length ? Math.round((Math.max(...cols) / W) * 100) : "-"}%`);
    f.remove();
  }
  return out;
}

// Cabinet sections: opens the demo cabinet in a frame of each size, clicks every section in its menu, checks each.
export async function cabinetCheck(role, sections, sizes) {
  const out = {};
  for (const [name, w, h] of DEVICES.filter((d) => sizes.includes(d[0]))) {
    const f = document.createElement("iframe");
    f.style.cssText = `position:fixed;left:-99999px;top:0;width:${w}px;height:${h}px;border:0`;
    f.src = `/?devSession=${role}`; document.body.append(f);
    await new Promise((r) => f.addEventListener("load", r, { once: true }));
    await new Promise((r) => setTimeout(r, 2500));
    for (const s of sections) {
      const btn = [...f.contentDocument.querySelectorAll("button, a")].find((b) => b.textContent.trim().startsWith(s) && b.getBoundingClientRect().width);
      if (!btn) { (out[s] ??= []).push(`${name}: no button`); continue; }
      btn.click();
      await new Promise((r) => setTimeout(r, 1200));
      const p = check(f.contentWindow);
      if (p.length) (out[s] ??= []).push(`${name}: ${p.join(" | ")}`);
      try { localStorage.setItem("cab-res", JSON.stringify({ at: `${role} ${s} ${name}`, out })); } catch { /* */ }
    }
    f.remove();
  }
  try { sessionStorage.removeItem("sensoria:dev-session"); } catch { /* */ }
  return out;
}
