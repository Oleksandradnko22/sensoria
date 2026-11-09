type Props = {
  name: string;
  role?: string;
  // «Документи про освіту переглянуто» vs the plain «авторські матеріали» label
  verified?: boolean;
  bio?: string;
  approach?: string;
  specialties?: string[];
  stats?: { label: string; value: string }[];
  since?: string;
  onOpenProfile?: () => void;
  onAsk?: () => void;
  demo?: boolean;
  // colour of the avatar; the page's own colour (teal for guides, rose for meditations)
  avatarClass?: string;
};

// The guide's «Автор» tab: who made it, how they work, and the way to their full profile. Presentational:
// the real author's data (when there is a profile) is shown by the shared author component instead.
export default function GuideAuthorCard({ name, role, verified, bio, approach, specialties, stats, since, onOpenProfile, onAsk, demo, avatarClass = "from-[#00776f] to-[#008a80]" }: Props) {
  return (
    <div className="flex flex-col gap-6">
      {demo && (
        <p role="note" className="rounded-[14px] bg-amber-50 px-4 py-2.5 text-[13px] leading-relaxed text-amber-800 ring-1 ring-amber-200">
          Демо-дані для перегляду вигляду. Справжній профіль підтягнеться з акаунта автора.
        </p>
      )}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-4">
          <span aria-hidden="true" className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${avatarClass} text-[24px] font-bold text-white`}>
            {name.trim().charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <div className="text-[22px] font-semibold leading-tight">{name}</div>
            {role && <div className="mt-1 text-[14px] text-slate-500">{role}</div>}
            {since && <div className="mt-1 text-[13px] text-slate-400">На Sensoria {since}</div>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2.5">
          {onAsk && (
            <button type="button" onClick={onAsk} className="min-h-[44px] rounded-[14px] bg-gradient-to-r from-[#00776f] to-[#008a80] px-5 text-[14px] font-semibold text-white transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00867f] focus-visible:ring-offset-2">
              Є питання до автора?
            </button>
          )}
          {onOpenProfile && (
            <button type="button" onClick={onOpenProfile} className="min-h-[44px] rounded-[14px] border border-[#bfeae3] px-5 text-[14px] font-medium text-[#006b65] transition hover:bg-[#f1fcfa] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00867f]">
              Повний профіль автора →
            </button>
          )}
        </div>
      </div>

      {typeof verified === "boolean" && (
        <div role="note" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[16px] bg-[#f1fcfa] px-4 py-3 ring-1 ring-[#d4f3ee] sm:px-5">
          <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#d4f3ee] text-[#006b65]">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 11v5M12 8h.01" />
            </svg>
          </span>
          <span className="text-[14px] font-semibold text-slate-900">{verified ? "Фахівець · документи про освіту переглянуто" : "Авторські освітні матеріали"}</span>
          <span aria-hidden="true" className="hidden h-4 w-px bg-slate-300 sm:block" />
          <span className="min-w-0 text-[14px] text-slate-600">{verified ? "Матеріали не замінюють консультацію." : "Sensoria не перевіряла професійну кваліфікацію автора."}</span>
        </div>
      )}

      {stats && stats.length > 0 && (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="rounded-[18px] bg-[#f4fbfa] px-4 py-4">
              <dd className="text-[24px] font-bold leading-none text-[#0b3b38]">{s.value}</dd>
              <dt className="mt-1.5 text-[13px] text-slate-600">{s.label}</dt>
            </div>
          ))}
        </dl>
      )}

      {(bio || approach) && (
        <div className="grid gap-5 md:grid-cols-2">
          {bio && (
            <div>
              <h3 className="text-[16px] font-semibold">Про автора</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-slate-700">{bio}</p>
            </div>
          )}
          {approach && (
            <div>
              <h3 className="text-[16px] font-semibold">Підхід до роботи</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-slate-700">{approach}</p>
            </div>
          )}
        </div>
      )}

      {specialties && specialties.length > 0 && (
        <div>
          <h3 className="text-[16px] font-semibold">З чим працює</h3>
          <ul className="mt-3 flex flex-wrap gap-2.5">
            {specialties.map((s) => (
              <li key={s} className="rounded-full bg-[#e6faf6] px-4 py-2 text-[14px] font-medium text-[#0b5a55]">
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
