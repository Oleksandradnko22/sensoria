// DEV-only: open http://localhost:5173/?devices=1 to see the site at the
// real screen sizes of phones, tablets, laptops and monitors. Each frame is
// the live site in an iframe of the exact CSS width/height of that device
// (so media queries behave like on the device), scaled down only for display.
// Never shipped: main.tsx loads this behind import.meta.env.DEV.
import { useEffect, useMemo, useRef, useState } from "react";

type Device = { id: string; name: string; w: number; h: number; group: "Телефони" | "Планшети" | "Ноутбуки та монітори" };

const DEVICES: Device[] = [
  { id: "se", name: "iPhone SE", w: 375, h: 667, group: "Телефони" },
  { id: "android", name: "Android малий", w: 360, h: 740, group: "Телефони" },
  { id: "iphone", name: "iPhone 15", w: 390, h: 844, group: "Телефони" },
  { id: "max", name: "iPhone Pro Max", w: 430, h: 932, group: "Телефони" },
  { id: "mini", name: "iPad mini", w: 744, h: 1133, group: "Планшети" },
  { id: "ipad", name: "iPad", w: 820, h: 1180, group: "Планшети" },
  { id: "pro11", name: "iPad Pro 11", w: 834, h: 1194, group: "Планшети" },
  { id: "pro13", name: "iPad Pro 13", w: 1024, h: 1366, group: "Планшети" },
  { id: "lap13", name: "Ноутбук 13″", w: 1280, h: 720, group: "Ноутбуки та монітори" },
  { id: "mac", name: "MacBook", w: 1440, h: 900, group: "Ноутбуки та монітори" },
  { id: "fhd", name: "Full HD", w: 1920, h: 1080, group: "Ноутбуки та монітори" },
  { id: "qhd", name: "QHD 27″", w: 2560, h: 1440, group: "Ноутбуки та монітори" },
];

const GROUPS: Device["group"][] = ["Телефони", "Планшети", "Ноутбуки та монітори"];

function Frame({ d, landscape, src, scale }: { d: Device; landscape: boolean; src: string; scale: number }) {
  const w = landscape ? d.h : d.w;
  const h = landscape ? d.w : d.h;
  return (
    <div className="shrink-0">
      <div className="mb-2 text-[14px] text-slate-700">
        <b>{d.name}</b> · {w}×{h}
      </div>
      <div style={{ width: w * scale, height: h * scale }} className="rounded-2xl overflow-hidden border-4 border-slate-800 bg-white shadow-lg">
        <iframe
          title={`${d.name} ${w}×${h}`}
          src={src}
          style={{ width: w, height: h, border: 0, transform: `scale(${scale})`, transformOrigin: "0 0" }}
        />
      </div>
    </div>
  );
}

export default function DeviceCheck() {
  const [selected, setSelected] = useState("iphone");
  const [mode, setMode] = useState<"one" | "all">("one");
  const [landscape, setLandscape] = useState(false);
  const [path, setPath] = useState("/");
  const [reloadKey, setReloadKey] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const [boxW, setBoxW] = useState(1000);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBoxW(el.clientWidth));
    ro.observe(el);
    setBoxW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const src = useMemo(() => `${path}${path.includes("?") ? "&" : "?"}_=${reloadKey}`, [path, reloadKey]);
  const dev = DEVICES.find((d) => d.id === selected) ?? DEVICES[2];
  const oneW = landscape ? dev.h : dev.w;
  const oneH = landscape ? dev.w : dev.h;
  // fit width of the page, and keep the height reasonable
  const oneScale = Math.min(1, (boxW - 8) / oneW, 820 / oneH);

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 p-4 sm:p-6" style={{ fontFamily: "system-ui, sans-serif" }}>
      <h1 className="text-[24px] font-bold">Перевірка на різних пристроях</h1>
      <p className="text-[14px] text-slate-600 mt-1 max-w-[760px]">
        Це живий сайт у вікні точного розміру кожного пристрою. Прокручуйте всередині вікна, натискайте, відкривайте меню. Показано лише на вашому комп'ютері.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button onClick={() => setMode("one")} aria-pressed={mode === "one"} className={`min-h-[44px] px-4 rounded-xl border text-[14px] ${mode === "one" ? "bg-slate-900 text-white border-slate-900" : "bg-white border-slate-300"}`}>
          Один пристрій
        </button>
        <button onClick={() => setMode("all")} aria-pressed={mode === "all"} className={`min-h-[44px] px-4 rounded-xl border text-[14px] ${mode === "all" ? "bg-slate-900 text-white border-slate-900" : "bg-white border-slate-300"}`}>
          Усі поруч
        </button>
        <button onClick={() => setLandscape((v) => !v)} aria-pressed={landscape} className={`min-h-[44px] px-4 rounded-xl border text-[14px] ${landscape ? "bg-slate-900 text-white border-slate-900" : "bg-white border-slate-300"}`}>
          Повернути (горизонтально)
        </button>
        <button onClick={() => setReloadKey((k) => k + 1)} className="min-h-[44px] px-4 rounded-xl border border-slate-300 bg-white text-[14px]">
          Оновити
        </button>
        <label className="flex items-center gap-2 text-[14px]">
          Адреса:
          <input value={path} onChange={(e) => setPath(e.target.value || "/")} className="min-h-[44px] w-[220px] px-3 rounded-xl border border-slate-300 bg-white" />
        </label>
      </div>

      {mode === "one" && (
        <div className="mt-4 flex flex-col gap-3">
          {GROUPS.map((g) => (
            <div key={g} className="flex flex-wrap items-center gap-2">
              <span className="w-[190px] text-[14px] font-semibold text-slate-700">{g}</span>
              {DEVICES.filter((d) => d.group === g).map((d) => (
                <button
                  key={d.id}
                  onClick={() => setSelected(d.id)}
                  aria-pressed={selected === d.id}
                  className={`min-h-[44px] px-4 rounded-xl border text-[14px] ${selected === d.id ? "bg-blue-600 text-white border-blue-600" : "bg-white border-slate-300"}`}
                >
                  {d.name} <span className="opacity-70">{d.w}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      <div ref={box} className="mt-6">
        {mode === "one" ? (
          <div className="flex justify-center">
            <Frame d={dev} landscape={landscape} src={src} scale={oneScale} />
          </div>
        ) : (
          <div className="flex gap-6 overflow-x-auto pb-4 items-start">
            {DEVICES.map((d) => {
              const h = landscape ? d.w : d.h;
              const w = landscape ? d.h : d.w;
              return <Frame key={d.id} d={d} landscape={landscape} src={src} scale={Math.min(1, 560 / h, 640 / w)} />;
            })}
          </div>
        )}
      </div>
      {mode === "one" && oneScale < 1 && (
        <p className="mt-2 text-center text-[14px] text-slate-600">Показано в масштабі {Math.round(oneScale * 100)}%, розмір сторінки всередині точний.</p>
      )}
    </div>
  );
}
