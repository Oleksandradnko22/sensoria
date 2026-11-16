import { useEffect, useRef } from "react";

// Public page referenced by the participant agreement (п. 2.4). Only numbers confirmed by several current sources are listed;
// re-check them before each edition and update CHECKED_AT.
const CHECKED_AT = "17.11.2026";

type Line = { name: string; phones: string[]; note: string };

const EMERGENCY: Line[] = [
  { name: "Єдиний номер екстрених служб", phones: ["112"], note: "Загроза життю, думки про самоушкодження, небезпека для вас чи інших. Цілодобово, безкоштовно." },
  { name: "Екстрена медична допомога", phones: ["103"], note: "Якщо потрібна швидка допомога. Цілодобово, безкоштовно." },
];

const SUPPORT: Line[] = [
  {
    name: "Національна гаряча лінія з протидії домашньому насильству, торгівлі людьми та гендерній дискримінації («Ла Страда-Україна»)",
    phones: ["116 123", "0 800 500 335"],
    note: "Психологи та юристи. Цілодобово, безкоштовно; 116 123 — з мобільного, 0 800 500 335 — з мобільного й стаціонарного.",
  },
];

const card = "rounded-3xl bg-white/95 text-[#0f172a] border border-white/70 shadow-[0_20px_50px_-28px_rgba(15,23,100,0.55)] p-5 sm:p-8";

function LineList({ lines }: { lines: Line[] }) {
  return (
    <ul className="mt-4 grid gap-3 sm:grid-cols-2">
      {lines.map((l) => (
        <li key={l.name} className="rounded-2xl bg-[#f6f7ff] ring-1 ring-[#e5e7f5] p-4">
          <p className="font-semibold text-[15px] leading-snug">{l.name}</p>
          <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {l.phones.map((p) => (
              <a key={p} href={`tel:${p.replace(/\s/g, "")}`} className="text-[22px] font-bold text-[#4338ca] tabular-nums underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4338ca] rounded">
                {p}
              </a>
            ))}
          </p>
          <p className="mt-2 t-small text-gray-700 leading-relaxed">{l.note}</p>
        </li>
      ))}
    </ul>
  );
}

export default function CrisisHelpPage() {
  const h1Ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const prev = document.title;
    document.title = "Допомога в кризі — Sensoria";
    h1Ref.current?.focus({ preventScroll: true });
    return () => {
      document.title = prev;
    };
  }, []);

  return (
    <main className="relative page-container pt-28 sm:pt-32 pb-6 sm:pb-8 text-white">
      <div className="max-w-2xl">
        <h1 ref={h1Ref} tabIndex={-1} className="fluid-h2 font-bold mb-3 outline-none">Допомога в кризі</h1>
        <p className="text-white fluid-lead">
          Sensoria — освітня платформа, а не служба екстреної допомоги. Повідомлення на Платформі можуть не бути прочитані одразу. Якщо вам зараз важко чи небезпечно — зверніться до служб нижче.
        </p>
        <p className="mt-3 t-small text-white">Контакти перевірено: {CHECKED_AT}</p>
      </div>

      <div className="mt-8 sm:mt-12 flex flex-col gap-4 sm:gap-5 max-w-4xl">
        <section aria-labelledby="crisis-emergency" className={card}>
          <h2 id="crisis-emergency" className="t-h3">Якщо є загроза життю</h2>
          <LineList lines={EMERGENCY} />
        </section>
        <section aria-labelledby="crisis-support" className={card}>
          <h2 id="crisis-support" className="t-h3">Психологічна підтримка</h2>
          <LineList lines={SUPPORT} />
          <p className="mt-4 t-small text-gray-700 leading-relaxed">
            Якщо поруч є людина, якій ви довіряєте, скажіть їй, що вам зараз потрібна підтримка. Якщо ви за кордоном, телефонуйте на місцевий екстрений номер.
          </p>
        </section>
      </div>
    </main>
  );
}
