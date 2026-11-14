import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { LEGAL, type LegalKey } from "../../data/legalOperator";

import BrandSelect from "../ui/BrandSelect";
export type LegalSection = {
  id: string;
  title: string;
  // paragraphs (string) and bullet lists (string[]); inline {{key}} / {{?hint}} tokens
  body: (string | string[])[];
};

const LABELS: Record<LegalKey, string> = {
  operatorName: "повне найменування оператора",
  registration: "реєстраційні дані (ЄДРПОУ / РНОКПП)",
  address: "адреса для юридично значущих звернень",
  effectiveDate: "дата набрання чинності",
  edition: "номер або дата редакції",
  privacyEmail: "пошта для звернень щодо персональних даних",
  email: "електронна адреса для звернень",
};

const card =
  "scroll-mt-6 rounded-3xl bg-white/95 text-[#0f172a] border border-white/70 shadow-[0_20px_50px_-28px_rgba(15,23,100,0.55)] p-5 sm:p-8";

const mark = "rounded bg-amber-200 text-amber-950 px-1.5 py-0.5 font-medium";

/** {{operatorName}} -> value from data/legalOperator.ts (or a visible marker); {{?текст}} -> marker. */
export function inline(text: string): ReactNode {
  const parts = text.split(/(\{\{[^}]+\}\})/g);
  return parts.map((p, i) => {
    const m = /^\{\{(.+)\}\}$/.exec(p);
    if (!m) return <Fragment key={i}>{p}</Fragment>;
    const token = m[1];
    if (token.startsWith("?")) return <mark key={i} className={mark}>[заповнити: {token.slice(1)}]</mark>;
    const v = LEGAL[token as LegalKey];
    return v ? <Fragment key={i}>{v}</Fragment> : <mark key={i} className={mark}>[заповнити: {LABELS[token as LegalKey] ?? token}]</mark>;
  });
}

type Props = {
  title: string;
  lead: string;
  metaTitle: string;
  metaDescription: string;
  sections: LegalSection[];
  footer?: ReactNode;
};

export default function LegalLayout({ title, lead, metaTitle, metaDescription, sections, footer }: Props) {
  const h1Ref = useRef<HTMLHeadingElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const prev = document.title;
    const desc = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    const prevDesc = desc?.content;
    document.title = metaTitle;
    if (desc) desc.content = metaDescription;
    h1Ref.current?.focus({ preventScroll: true });
    return () => {
      document.title = prev;
      if (desc && prevDesc !== undefined) desc.content = prevDesc;
    };
  }, [metaTitle, metaDescription]);

  // One section at a time; switching keeps the reader at the top of the panel.
  const select = (i: number) => {
    const next = Math.min(sections.length - 1, Math.max(0, i));
    setActive(next);
    const el = panelRef.current;
    if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ block: "start" });
  };

  return (
    <main className="relative page-container pt-28 sm:pt-32 pb-6 sm:pb-8 text-white">
      <div className="max-w-2xl">
        <h1 ref={h1Ref} tabIndex={-1} className="fluid-h2 font-bold mb-3 outline-none">{title}</h1>
        <p className="text-white fluid-lead">{lead}</p>
        <p className="mt-3 t-small text-white">
          Редакція: {inline("{{edition}}")} · Набирає чинності: {inline("{{effectiveDate}}")}
        </p>
      </div>

      <div className="mt-8 sm:mt-12 grid lg:grid-cols-[260px_1fr] gap-6 lg:gap-10 items-start">
        <div className="lg:hidden">
          <label htmlFor="legal-section" className="sr-only">Розділ</label>
          <BrandSelect
            id="legal-section"
            value={active}
            onChange={(e) => select(Number(e.target.value))}
            className="w-full min-h-[48px] rounded-xl bg-white text-[#0f172a] px-4 font-medium border border-white/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            {sections.map((s, i) => (
              <option key={s.id} value={i}>
                {i + 1}. {s.title}
              </option>
            ))}
          </BrandSelect>
        </div>

        <nav aria-label="Зміст" className="hidden lg:block sticky top-6 rounded-2xl bg-white/10 border border-white/20 p-4 max-h-[calc(100vh-3rem)] overflow-y-auto">
          <ol className="space-y-0.5">
            {sections.map((s, i) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => select(i)}
                  aria-current={i === active ? "true" : undefined}
                  className={`w-full text-left t-small text-white rounded-lg px-2.5 py-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-white ${i === active ? "bg-white/20 font-semibold" : "hover:bg-white/10"}`}
                >
                  <span className="text-white/70 tabular-nums mr-2">{i + 1}.</span>
                  {s.title}
                </button>
              </li>
            ))}
          </ol>
        </nav>

        <div ref={panelRef} className="flex flex-col gap-4 sm:gap-5 min-w-0 scroll-mt-6">
          {sections.map((s, i) =>
            i !== active ? null : (
              <section key={s.id} id={s.id} aria-labelledby={`${s.id}-h`} className={card}>
                <h2 id={`${s.id}-h`} className="t-h3">
                  <span className="text-[#5b3fd1] tabular-nums mr-2">{i + 1}.</span>
                  {s.title}
                </h2>
                <div className="mt-3 space-y-3 max-w-3xl">
                  {s.body.map((b, k) =>
                    Array.isArray(b) ? (
                      <ul key={k} className="list-disc pl-5 space-y-1.5 t-body text-gray-700 leading-relaxed">
                        {b.map((li, j) => (
                          <li key={j}>{inline(li)}</li>
                        ))}
                      </ul>
                    ) : (
                      <p key={k} className="t-body text-gray-700 leading-relaxed">{inline(b)}</p>
                    ),
                  )}
                </div>

                <div className="mt-8 pt-5 border-t border-[#e5e7f5] flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => select(i - 1)}
                    disabled={i === 0}
                    className="min-h-[44px] px-4 rounded-xl border border-[#c9cffa] text-[#3b27a8] font-semibold text-[14px] hover:bg-[#f3f4ff] disabled:opacity-40 disabled:cursor-default focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4338ca]"
                  >
                    ← Назад
                  </button>
                  <span className="t-small text-gray-600 tabular-nums" aria-live="polite">
                    {i + 1} / {sections.length}
                  </span>
                  <button
                    type="button"
                    onClick={() => select(i + 1)}
                    disabled={i === sections.length - 1}
                    className="min-h-[44px] px-4 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 text-white font-semibold text-[14px] hover:opacity-90 disabled:opacity-40 disabled:cursor-default focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4338ca] focus-visible:ring-offset-2"
                  >
                    Далі →
                  </button>
                </div>
              </section>
            ),
          )}
          {footer}
        </div>
      </div>
    </main>
  );
}
