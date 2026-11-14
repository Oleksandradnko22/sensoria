// A drop-in for the native <select> in the Sensoria style: the closed field and the open list are ours (the native
// list is drawn by the operating system and ignores the page's design — grey gradients in Safari).
// Same usage as <select>: value, onChange(e => e.target.value), <option> / <optgroup> children, disabled, id, aria-*.
import { Children, isValidElement, useEffect, useId, useRef, useState, type ReactElement, type ReactNode } from "react";

type Opt = { value: string; label: string; disabled?: boolean; group?: string };
type OptionProps = { value?: string | number; children?: ReactNode; disabled?: boolean };
type GroupProps = { label?: string; children?: ReactNode };

const text = (n: ReactNode): string =>
  Children.toArray(n).map((c) => (typeof c === "string" || typeof c === "number" ? String(c) : isValidElement<{ children?: ReactNode }>(c) ? text(c.props.children) : "")).join("");

function collect(children: ReactNode, group?: string, out: Opt[] = []): Opt[] {
  Children.forEach(children, (c) => {
    if (!isValidElement(c)) return;
    if (c.type === "option") {
      const p = (c as ReactElement<OptionProps>).props;
      out.push({ value: String(p.value ?? text(p.children)), label: text(p.children), disabled: p.disabled, group });
    } else if (c.type === "optgroup") {
      const p = (c as ReactElement<GroupProps>).props;
      collect(p.children, p.label, out);
    } else {
      collect((c as ReactElement<{ children?: ReactNode }>).props.children, group, out);
    }
  });
  return out;
}

export default function BrandSelect({
  value,
  onChange,
  children,
  className = "",
  disabled,
  id,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledby,
  "aria-invalid": ariaInvalid,
}: {
  value: string | number | undefined;
  onChange: (e: { target: { value: string } }) => void;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  id?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-invalid"?: boolean | "true" | "false";
  required?: boolean;
  name?: string;
}) {
  const options = collect(children);
  const current = options.find((o) => o.value === String(value ?? "")) ?? options[0];
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);
  useEffect(() => {
    if (open) root.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const pick = (o: Opt) => {
    if (o.disabled) return;
    setOpen(false);
    if (o.value !== String(value ?? "")) onChange({ target: { value: o.value } });
  };
  const openList = () => { setActive(Math.max(0, options.findIndex((o) => o === current))); setOpen(true); };
  const step = (d: number) => {
    let i = active;
    for (let n = 0; n < options.length; n += 1) { i = (i + d + options.length) % options.length; if (!options[i].disabled) break; }
    setActive(i);
  };

  return (
    // full width when the field was meant to be full width (w-full), as the native select stretched
    <div ref={root} className={`relative ${/(^|\s)w-full(\s|$)/.test(className) ? "w-full min-w-0 flex-1" : "inline-block"}`}>
      <button
        type="button"
        id={id}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledby}
        aria-invalid={ariaInvalid}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); if (!open) openList(); else step(e.key === "ArrowDown" ? 1 : -1); }
          else if ((e.key === "Enter" || e.key === " ") && open) { e.preventDefault(); pick(options[active]); }
          else if (e.key === "Escape") setOpen(false);
        }}
        className={`flex min-h-[44px] w-full items-center justify-between gap-2 bg-white text-left ${className} ${open ? "ring-2 ring-[#7c5cf0]/40" : ""} disabled:cursor-not-allowed disabled:opacity-50`}
      >
        <span className={`min-w-0 truncate ${current && current.value === "" ? "text-black/45" : "text-[#1d1a3b]"}`}>{current?.label ?? ""}</span>
        <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#6d5bd0" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`}><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {open && (
        <ul id={listId} role="listbox" className="sensoria-scroll absolute left-0 right-0 z-40 mt-1.5 max-h-[300px] overflow-y-auto rounded-2xl bg-white p-1.5 shadow-[0_22px_48px_-18px_rgba(60,40,160,0.45)] ring-1 ring-[#e7e3fb]">
          {options.map((o, i) => (
            <li key={`${o.group ?? ""}:${o.value}`}>
              {o.group && o.group !== options[i - 1]?.group && <div className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-[0.12em] text-[#6d5bd0]">{o.group}</div>}
              <button
                type="button"
                role="option"
                data-i={i}
                aria-selected={o === current}
                disabled={o.disabled}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(o)}
                className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left text-[14px] transition disabled:opacity-40 ${o === current ? "bg-[#eef0fd] font-semibold text-[#4338ca]" : i === active ? "bg-[#f6f4ff] text-[#1d1a3b]" : "text-[#1d1a3b]"}`}
              >
                <span className="min-w-0">{o.label}</span>
                {o === current && <svg aria-hidden="true" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
