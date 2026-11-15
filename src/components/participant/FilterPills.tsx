// Filter tabs shared by «Мої скарги» and «Мої відгуки»: one full-width bar, the same as in «Моє навчання».
// Counts are passed in by the caller and always come from the same rows
// the list renders (see utils/myActivityView.ts).
type Option<K extends string> = { key: K; label: string; count: number };

const COLS = ["", "grid-cols-1", "grid-cols-2", "grid-cols-3", "grid-cols-2 sm:grid-cols-4", "grid-cols-2 sm:grid-cols-5", "grid-cols-2 sm:grid-cols-3 lg:grid-cols-6"];

export default function FilterPills<K extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: Option<K>[];
  value: K;
  onChange: (k: K) => void;
  label: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={`grid gap-1.5 rounded-[20px] bg-white p-1.5 shadow-[0_14px_36px_-30px_rgba(60,50,140,0.55)] ring-1 ring-[#ece8fb] ${COLS[Math.min(options.length, 6)]}`}
    >
      {options.map((o) => {
        const on = o.key === value;
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(o.key)}
            aria-pressed={on}
            className={`flex min-h-[50px] min-w-0 items-center justify-center gap-2 rounded-2xl px-3 text-[14px] font-semibold transition ${
              on
                ? "bg-gradient-to-r from-[#eef0fd] to-[#f3eeff] text-[#4338ca] shadow-[inset_0_0_0_1px_rgba(67,56,202,0.25)]"
                : "text-black/60 hover:bg-[#faf9ff] hover:text-[#3b3f66]"
            }`}
          >
            <span className="truncate">{o.label}</span>
            <span className={`flex h-6 min-w-[24px] shrink-0 items-center justify-center rounded-lg px-1.5 text-[12px] font-bold tabular-nums ${on ? "bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] text-white" : "bg-[#f1eeff] text-[#6d5bd0]"}`}>
              {o.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
