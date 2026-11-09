// The one small label style for the «Про мене» blocks (Знайомство, Познайомимось
// ближче, Професійний бекграунд, Підхід і напрями): same size, weight, case,
// tracking, colour and the same short leading rule.
import type { ReactNode } from "react";

export default function SectionLabel({ children, as: Tag = "div", id }: { children: ReactNode; as?: "div" | "h3"; id?: string }) {
  return (
    <Tag id={id} className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-[#4338ca]">
      <span aria-hidden className="h-0.5 w-5 shrink-0 rounded-full bg-[#4338ca]/40" />
      {children}
    </Tag>
  );
}
