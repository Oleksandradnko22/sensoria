import { useEffect, useRef } from "react";
import { Icon, type IconName } from "../components/ui/Icon";
import { CHECKED_AT, EMERGENCY, SUPPORT } from "../data/crisisLines";

// Public page referenced by the participant agreement (п. 2.4). Only numbers confirmed by several current sources are listed;
// re-check them every quarter and before each edition and update CHECKED_AT (docs/legal/crisis-help-edits.md).
// Not listed: Lifeline Ukraine 7333 (paused). 0 800 501 701 and 0 800 211 444 added on the owner's decision 18.11.2026;
// their hours are not published — add them to `hours` after a test call.
const KNOW: { icon: IconName; title: string; text: string }[] = [
  { icon: "community", title: "Ви не самі", text: "Скажіть людині, якій довіряєте, що вам зараз потрібна підтримка." },
  { icon: "compass", title: "Ви за кордоном", text: "Телефонуйте на місцевий екстрений номер країни, де ви зараз." },
  { icon: "clock", title: "Ми не екстрена служба", text: "Повідомлення на Sensoria можуть не прочитати одразу. У небезпеці — 112." },
];

const tel = (n: string) => `tel:${n.replace(/\s/g, "")}`;

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
    <main className="relative page-container pt-28 sm:pt-32 pb-10 sm:pb-14 text-white">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <h1 ref={h1Ref} tabIndex={-1} className="fluid-h2 font-bold outline-none">Допомога в кризі</h1>
          <p className="mt-3 text-white/90 fluid-lead">Якщо вам зараз важко чи небезпечно — зателефонуйте. Дзвінки безкоштовні.</p>
        </div>
        <span className="rounded-full bg-white/15 px-3.5 py-1.5 text-[13px] font-medium text-white ring-1 ring-white/25">Контакти перевірено {CHECKED_AT}</span>
      </div>

      {/* 1 — danger now */}
      <section aria-labelledby="crisis-now" className="mt-8 sm:mt-10">
        <h2 id="crisis-now" className="text-[20px] sm:text-[22px] font-bold">Зараз небезпечно</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {EMERGENCY.map((e) => (
            <a
              key={e.phone}
              href={tel(e.phone)}
              className={`group flex items-center gap-5 rounded-[28px] p-6 sm:p-7 transition focus:outline-none focus-visible:ring-4 focus-visible:ring-white/70 ${
                e.primary
                  ? "bg-white text-[#0f172a] shadow-[0_24px_60px_-30px_rgba(15,23,100,0.7)] hover:shadow-[0_28px_70px_-28px_rgba(15,23,100,0.8)]"
                  : "bg-white/95 text-[#0f172a] shadow-[0_20px_50px_-30px_rgba(15,23,100,0.55)] hover:bg-white"
              }`}
            >
              <span className={`flex h-20 w-20 sm:h-24 sm:w-24 shrink-0 items-center justify-center rounded-[22px] text-[34px] sm:text-[40px] font-extrabold tabular-nums ${e.primary ? "bg-gradient-to-br from-[#3b6df0] to-[#7c5cf0] text-white" : "bg-[#eef0fd] text-[#4338ca]"}`}>
                {e.phone}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[19px] sm:text-[21px] font-bold leading-snug">{e.title}</span>
                <span className="mt-1 block text-[14px] sm:text-[15px] leading-relaxed text-slate-600">{e.when}</span>
                <span className="mt-3 inline-flex items-center gap-2 text-[14px] font-semibold text-[#4338ca]">
                  Подзвонити {e.phone} · цілодобово
                </span>
              </span>
            </a>
          ))}
        </div>
      </section>

      {/* 2 — someone to talk to */}
      <section aria-labelledby="crisis-talk" className="mt-10 sm:mt-12">
        <h2 id="crisis-talk" className="text-[20px] sm:text-[22px] font-bold">Потрібно поговорити</h2>
        <p className="mt-1 text-[15px] text-white/85">Психологи вислухають і підтримають. Оберіть лінію, яка вам підходить.</p>
        <ul className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {SUPPORT.map((l) => (
            <li key={l.name} className="flex flex-col rounded-[24px] bg-white p-5 sm:p-6 text-[#0f172a] shadow-[0_20px_50px_-30px_rgba(15,23,100,0.55)]">
              <div className="flex items-center gap-2.5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f1eeff] text-[#5b3df5]">
                  <Icon name={l.icon} size={18} />
                </span>
                <span className="rounded-full bg-[#eef0fd] px-3 py-1 text-[12px] font-semibold text-[#4338ca]">{l.forWhom}</span>
              </div>
              <h3 className="mt-4 text-[16px] font-bold leading-snug">{l.name}</h3>
              <div className="mt-3 flex flex-col gap-1.5">
                {l.phones.map((p) => (
                  <a key={p.number} href={tel(p.number)} className="group inline-flex flex-wrap items-baseline gap-x-2 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4338ca]">
                    <span className="text-[24px] font-extrabold tabular-nums text-[#4338ca] group-hover:underline underline-offset-4">{p.number}</span>
                    {p.hint && <span className="text-[13px] text-slate-500">{p.hint}</span>}
                  </a>
                ))}
              </div>
              <p className="mt-3 inline-flex items-center gap-1.5 text-[14px] font-semibold text-slate-800">
                <Icon name="clock" size={15} className="text-[#7c5cf0]" />
                {l.hours}
              </p>
              {l.note && <p className="mt-2 text-[13px] leading-relaxed text-slate-500">{l.note}</p>}
            </li>
          ))}
        </ul>
      </section>

      {/* 3 — good to know */}
      <section aria-labelledby="crisis-know" className="mt-10 sm:mt-12">
        <h2 id="crisis-know" className="text-[20px] sm:text-[22px] font-bold">Важливо знати</h2>
        <ul className="mt-4 grid gap-4 md:grid-cols-3">
          {KNOW.map((k) => (
            <li key={k.title} className="flex gap-4 rounded-[24px] bg-white/12 p-5 ring-1 ring-white/20 backdrop-blur-sm">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-[#5b3df5]">
                <Icon name={k.icon} size={20} />
              </span>
              <div className="min-w-0">
                <h3 className="text-[16px] font-bold leading-snug">{k.title}</h3>
                <p className="mt-1 text-[14px] leading-relaxed text-white/85">{k.text}</p>
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-5 text-[13px] leading-relaxed text-white/70">
          Ці служби не пов’язані з Sensoria. Ми регулярно перевіряємо контакти, але не можемо гарантувати роботу сторонніх ліній. Якщо номер не відповідає — телефонуйте 112.
        </p>
      </section>
    </main>
  );
}
