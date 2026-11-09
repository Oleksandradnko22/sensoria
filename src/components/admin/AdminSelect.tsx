import { useEffect, useRef, useState } from "react";
import { Icon, type IconName } from "../ui/Icon";

// Custom listbox instead of <select>: the native popup ignores the page
// font (renders in the OS serif), so it never matched the rest of the UI.
type Option<T extends string | number> = { value: T; label: string };

export default function AdminSelect<T extends string | number>({
  value,
  options,
  onChange,
  label,
  icon,
  align = "left",
}: {
  value: T;
  options: readonly Option<T>[];
  onChange: (v: T) => void;
  /** Accessible name of the control (e.g. "Період"). */
  label: string;
  icon?: IconName;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const selectedIdx = Math.max(0, options.findIndex((o) => o.value === value));

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const choose = (i: number) => {
    onChange(options[i].value);
    setOpen(false);
    btnRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape" && open) {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        setActive(selectedIdx);
        setOpen(true);
      } else {
        const d = e.key === "ArrowDown" ? 1 : -1;
        setActive((a) => (a + d + options.length) % options.length);
      }
    } else if ((e.key === "Enter" || e.key === " ") && open) {
      e.preventDefault();
      choose(active);
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  };

  return (
    <div ref={rootRef} className="relative" onKeyDown={onKeyDown}>
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}: ${options[selectedIdx].label}`}
        onClick={() => {
          setActive(selectedIdx);
          setOpen((o) => !o);
        }}
        className="inline-flex items-center gap-2 min-h-[44px] pl-3.5 pr-3 rounded-xl bg-white border border-black/10 text-[14px] font-medium hover:border-black/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]"
      >
        {icon && <Icon name={icon} size={16} className="text-black/60" />}
        <span className="mr-1">{options[selectedIdx].label}</span>
        <Icon name="chevron" size={16} className={`text-black/60 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <ul
          role="listbox"
          aria-label={label}
          className={`absolute ${align === "right" ? "right-0" : "left-0"} z-20 mt-2 min-w-full w-max rounded-xl bg-white border border-black/10 shadow-lg p-1`}
        >
          {options.map((o, i) => (
            <li
              key={String(o.value)}
              role="option"
              aria-selected={o.value === value}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(i)}
              className={`flex items-center gap-2 min-h-[44px] px-3 rounded-lg text-[14px] cursor-pointer ${
                i === active ? "bg-[#eef2ff]" : ""
              } ${o.value === value ? "font-semibold" : "font-medium"}`}
            >
              <span className="w-4 shrink-0 text-[#2563eb]">
                {o.value === value && <Icon name="check" size={16} />}
              </span>
              {o.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
