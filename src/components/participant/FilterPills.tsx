// Compact pill filters shared by «Мої скарги» and «Мої відгуки».
// Counts are passed in by the caller and always come from the same rows
// the list renders (see utils/myActivityView.ts).
type Option<K extends string> = { key: K; label: string; count: number };

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
    <div role="group" aria-label={label} className="flex gap-2 overflow-x-auto -mx-1 px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {options.map((o) => {
        const on = o.key === value;
        return (
          <button
            key={o.key}
            onClick={() => onChange(o.key)}
            aria-pressed={on}
            className={`shrink-0 inline-flex items-center gap-1.5 min-h-[44px] px-4 rounded-full border text-[14px] transition-colors ${
              on
                ? "border-[#4338ca]/35 bg-[#eef0fd] text-[#4338ca] font-semibold"
                : "border-black/[0.12] bg-white text-black/70 hover:bg-black/[0.04]"
            }`}
          >
            {o.label}
            <span className={`text-[12px] ${on ? "text-[#4338ca]/80" : "text-black/60"}`}>{o.count}</span>
          </button>
        );
      })}
    </div>
  );
}
