import { Icon, type IconName } from "../ui/Icon";
import { openAuthorProfile } from "../../context/AuthorProfileContext";
import { useEffect, useRef, useState } from "react";
import type { AuthoredContent } from "../../data/authorDashboard";
import { useSession } from "../../context/SessionContext";
import { getInitials, updateProfile, updateAvatar, removeAvatar } from "../../lib/auth";
import { fetchAuthorDetails, updateAuthorDetails } from "../../lib/authorDetails";
import Avatar from "../ui/Avatar";
import { currentTopicEntries } from "../../data/categoryLabels";
import AuthorStoryEditor from "./AuthorStoryEditor";
import AuthorBackgroundEditor from "./AuthorBackgroundEditor";
import CoverPicker, { type CoverChoice } from "./CoverPicker";
import { parseCoverPhoto } from "./public/AuthorCover";
import { coverFields, isCoverType, parseVariant } from "../../utils/authorCover";
import { isFullName } from "../../utils/personName.ts";

type Props = {
  content: AuthoredContent[];
};

// text limits: each fits where it is shown — the name and specialization on one line of the page header, «З чим ви
// допомагаєте» as two lines under them, «Про себе» and «Підхід» as short paragraphs in «Про автора»
const LIM = {
  name: [3, 50],
  title: [3, 60],
  positioning: [30, 160],
  bio: [80, 600],
  approach: [30, 500],
} as const;
const lenProblem = (label: string, v: string, [min, max]: readonly [number, number]) => {
  const n = v.trim().length;
  if (min > 0 && n < min) return `${label}: щонайменше ${min} символів (зараз ${n}).`;
  if (n > max) return `${label}: не більше ${max} символів.`;
  return null;
};
function Count({ v, lim }: { v: string; lim: readonly [number, number] }) {
  const n = v.trim().length;
  const bad = (lim[0] > 0 && n > 0 && n < lim[0]) || n > lim[1];
  return <span className={`text-[12px] tabular-nums ${bad ? "text-rose-600" : "text-black/40"}`}>{lim[0] > 0 ? `${n} · від ${lim[0]} до ${lim[1]}` : `${n}/${lim[1]}`}</span>;
}

type ProfileTab = "header" | "story" | "background" | "auto";
const PROFILE_TABS: { id: ProfileTab; label: string; hint: string; icon: IconName }[] = [
  { id: "header", label: "Шапка", hint: "Фото, ім’я, обкладинка", icon: "idcard" },
  { id: "story", label: "Про мене", hint: "Історія, підхід, відео", icon: "heart" },
  { id: "background", label: "Освіта й досвід", hint: "Дипломи, курси, кейси", icon: "graduation" },
  { id: "auto", label: "Решта сторінки", hint: "Публікації, матеріали, відгуки", icon: "library" },
];

export default function AuthorProfile(_props: Props) {
  const [tab, setTab] = useState<ProfileTab>("header");
  const session = useSession();
  const profile = session?.profile;

  const [name, setName] = useState(profile?.name ?? "");
  const [title, setTitle] = useState("");
  const [bio, setBio] = useState("");
  const [credentials, setCredentials] = useState("");
  const [verified, setVerified] = useState(false);
  const [positioning, setPositioning] = useState("");
  const [approach, setApproach] = useState("");
  const [topics, setTopics] = useState<string[]>([]);
  const [cover, setCover] = useState<CoverChoice>({ type: null, family: null, comp: null, imageUrl: null });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── AVATAR ─────────────────────────────────────────────────────
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [removingAvatar, setRemovingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const avatarBusy = uploadingAvatar || removingAvatar;

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !session) return;
    setUploadingAvatar(true);
    setAvatarError(null);
    try {
      const updated = await updateAvatar(file);
      if (updated) session.refreshProfile(updated);
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : "Не вдалося завантажити фото.");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleRemoveAvatar = async () => {
    if (!session) return;
    setRemovingAvatar(true);
    setAvatarError(null);
    try {
      const updated = await removeAvatar();
      if (updated) session.refreshProfile(updated);
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : "Не вдалося видалити фото.");
    } finally {
      setRemovingAvatar(false);
    }
  };

  useEffect(() => {
    if (!profile) return;
    let cancelled = false;
    fetchAuthorDetails(profile.id).then((details) => {
      if (cancelled) return;
      setTitle(details.title);
      setBio(details.bio);
      setCredentials(details.credentials);
      setVerified(details.verified);
      setPositioning(details.positioning);
      setApproach(details.approach);
      setTopics(details.topics);
      {
        const v = parseVariant(details.coverVariant);
        setCover({
          type: isCoverType(details.coverType) ? details.coverType : null,
          family: v?.family ?? null,
          comp: v?.comp ?? null,
          imageUrl: details.coverImageUrl,
        });
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [profile?.id]);

  const handleSave = async () => {
    if (!profile || !session) return;
    if (!isFullName(name)) {
      setError("Вкажіть ім'я та прізвище — під ними вас бачитимуть на публічному профілі.");
      return;
    }
    const limitProblem = lenProblem("Ім’я та прізвище", name, LIM.name) ?? lenProblem("Спеціалізація", title, LIM.title)
      ?? lenProblem("З чим ви допомагаєте", positioning, LIM.positioning)
      ?? lenProblem("Про себе", bio, LIM.bio) ?? lenProblem("Підхід", approach, LIM.approach);
    if (limitProblem) { setError(limitProblem); return; }
    // everything on this tab is required; the cover may stay the automatic one
    const photo = parseCoverPhoto(cover.imageUrl);
    const missing = !profile.avatarUrl ? "Додайте своє фото — люди мають бачити, хто автор."
      : topics.length === 0 ? "Оберіть хоча б одну тему."
      : cover.type === "personal" && !photo ? "Додайте фото обкладинки або оберіть інший вигляд."
      : cover.type === "personal" && !photo?.mobile ? "Додайте фото обкладинки для телефона (1200 × 300)."
      : null;
    if (missing) { setError(missing); return; }
    setSaving(true);
    setError(null);
    try {
      const updated = await updateProfile({ name: name.trim() });
      if (updated) session.refreshProfile(updated);
      await updateAuthorDetails(profile.id, {
        title: title.trim(),
        bio: bio.trim(),
        credentials: credentials.trim(),
        // no external sites / social accounts on Sensoria: they would lead people to buy outside the platform
        site: "",
        instagram: "",
        positioning: positioning.trim(),
        approach: approach.trim(),
        topics,
        ...coverFields(cover),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не вдалося зберегти.");
    } finally {
      setSaving(false);
    }
  };

  const initials = getInitials(name);

  if (!profile || loading) {
    return <div className="text-black/40 text-[14px]">Завантаження…</div>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[32px] font-bold leading-tight text-[#12172b]">Профіль</h1>
          <p className="mt-1 text-[15px] text-black/55">Ваша сторінка автора: так вас бачать учасники. Заповнюйте частинами — кожна вкладка зберігається окремо.</p>
        </div>
        <button type="button" onClick={() => openAuthorProfile(profile.id)} className="inline-flex min-h-[46px] items-center gap-2 whitespace-nowrap rounded-2xl bg-white px-5 text-[14px] font-semibold text-[#4338ca] ring-1 ring-[#d9d4f5] transition hover:bg-[#f6f4ff]">
          <Icon name="idcard" size={18} /> Переглянути мою сторінку ↗
        </button>
      </div>

      {/* the same parts as the public page */}
      <div className="grid gap-1.5 rounded-[20px] bg-white p-1.5 shadow-[0_14px_36px_-30px_rgba(60,50,140,0.55)] ring-1 ring-[#ece8fb] grid-cols-2 sm:grid-cols-4" role="tablist" aria-label="Частини сторінки">
        {PROFILE_TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={`flex min-h-[54px] flex-col items-center justify-center rounded-2xl px-3 text-center transition ${tab === t.id ? "bg-gradient-to-r from-[#eef0fd] to-[#f3eeff] text-[#4338ca] shadow-[inset_0_0_0_1px_rgba(67,56,202,0.25)]" : "text-black/60 hover:bg-[#faf9ff]"}`}>
            <span className="flex items-center gap-2 text-[14px] font-semibold"><Icon name={t.icon} size={16} /> {t.label}</span>
            <span className="text-[12px] text-black/45">{t.hint}</span>
          </button>
        ))}
      </div>

      <div className={`flex flex-col gap-8 ${tab === "header" ? "" : "hidden"}`}>
        {/* FORM */}
        <div className="flex flex-col gap-5">
          <Card n={1} title="Хто ви" hint="Фото, ім’я та спеціалізація — перше, що бачать люди.">
          <div className="flex flex-wrap items-center gap-4">
            <Avatar
              avatarUrl={profile?.avatarUrl}
              initials={initials}
              className="w-20 h-20 text-[22px] text-white ring-4 ring-[#f1eeff]"
            />
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarChange}
            />
            <button
              onClick={() => avatarInputRef.current?.click()}
              disabled={avatarBusy}
              className="min-h-[40px] px-4 rounded-xl bg-white ring-1 ring-[#e3def9] hover:ring-[#c9bff7] text-[13px] font-semibold text-[#4338ca] transition disabled:opacity-50"
            >
              {uploadingAvatar ? "Завантажуємо…" : "Змінити фото"}
            </button>
            {profile?.avatarUrl && (
              <button
                onClick={handleRemoveAvatar}
                disabled={avatarBusy}
                className="min-h-[40px] px-3 rounded-xl text-[13px] font-medium text-black/50 hover:text-rose-600 transition disabled:opacity-50"
              >
                {removingAvatar ? "Видаляємо…" : "Видалити фото"}
              </button>
            )}
          </div>
          {avatarError && <p className="text-[12px] text-red-500">{avatarError}</p>}

          {verified && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-emerald-50 text-emerald-700 text-[13px] w-fit">
              <span>✓</span>
              Особу автора перевірено Sensoria
            </div>
          )}

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <div className="mb-2 flex justify-between text-[13px] font-semibold text-[#2d2a5c]"><span>Ім'я та прізвище</span><Count v={name} lim={LIM.name} /></div>
              <input
                maxLength={LIM.name[1]}
                value={name}
                placeholder="Ім'я Прізвище"
                autoComplete="name"
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-xl bg-[#faf9ff] px-4 py-3 text-[15px] ring-1 ring-[#e3def9] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#7c5cf0]"
              />
            </div>

            <div>

              <div className="mb-2 flex justify-between text-[13px] font-semibold text-[#2d2a5c]"><span>Спеціалізація</span><Count v={title} lim={LIM.title} /></div>
              <input
                maxLength={LIM.title[1]}
                placeholder="Наприклад: психолог, гештальт-терапевт"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-xl bg-[#faf9ff] px-4 py-3 text-[15px] ring-1 ring-[#e3def9] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#7c5cf0]"
              />
            </div>

          </div>
          </Card>

          <Card n={2} title="З чим ви допомагаєте" hint="Короткий опис і теми — за ними вас знаходять у каталозі.">
          <div className="flex flex-col gap-5">
            <div>
              <div className="mb-2 flex justify-between text-[13px] font-semibold text-[#2d2a5c]"><span>З чим ви допомагаєте людям</span><Count v={positioning} lim={LIM.positioning} /></div>
              <textarea
                value={positioning}
                onChange={(e) => setPositioning(e.target.value)}
                rows={2}
                maxLength={LIM.positioning[1]}
                placeholder="Одне-два речення: наприклад, «Допомагаю краще розуміти емоційні реакції та знаходити практичні способи підтримати себе»."
                className="w-full rounded-xl bg-[#faf9ff] px-4 py-3 text-[15px] ring-1 ring-[#e3def9] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#7c5cf0] resize-none"
              />
              <div className="text-[12px] text-black/40 mt-1.5">Показується під вашим ім’ям на початку сторінки.</div>
            </div>

            <div>
              <div className="text-[13px] font-semibold text-[#2d2a5c] mb-2">Теми</div>
              <div className="flex flex-wrap gap-2">
                {currentTopicEntries().map(([key, label]) => {
                  const on = topics.includes(key);
                  return (
                    <button
                      type="button"
                      key={key}
                      aria-pressed={on}
                      onClick={() =>
                        setTopics((prev) =>
                          prev.includes(key) ? prev.filter((k) => k !== key) : prev.length >= 5 ? prev : [...prev, key]
                        )
                      }
                      className={`px-3 py-1.5 rounded-full text-[13px] border transition ${
                        on ? "bg-[#eef0fd] border-[#4338ca]/35 text-[#4338ca] font-semibold" : "border-[#e3def9] bg-white text-black/60 hover:border-[#c9bff7]"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <div className="text-[12px] text-black/40 mt-1.5">До 5 тем — ті самі, що й у каталозі.</div>
            </div>

          </div>
          </Card>

          <Card n={3} title="Обкладинка" hint="Широка смуга над вашим фото на сторінці.">
            <CoverPicker value={cover} onChange={setCover} topics={topics} authorId={profile.id} title={name} />
          </Card>

          <Card n={4} title="Про себе" hint="Кілька речень, щоб людям було легше вам довіритися.">
          <div className="flex flex-col gap-5">

            <div>

              <div className="mb-2 flex justify-between text-[13px] font-semibold text-[#2d2a5c]"><span>Про себе</span><Count v={bio} lim={LIM.bio} /></div>
              <textarea
                maxLength={LIM.bio[1]}
                placeholder="Кілька речень про вас і вашу роботу: що для вас важливо й кому ви допомагаєте."
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={4}
                className="w-full rounded-xl bg-[#faf9ff] px-4 py-3 text-[15px] ring-1 ring-[#e3def9] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#7c5cf0] resize-none"
              />
            </div>

            <div>
              <div className="mb-2 flex justify-between text-[13px] font-semibold text-[#2d2a5c]"><span>Підхід</span><Count v={approach} lim={LIM.approach} /></div>
              <textarea
                value={approach}
                onChange={(e) => setApproach(e.target.value)}
                rows={3}
                maxLength={LIM.approach[1]}
                placeholder="Як ви працюєте і думаєте про емоційний добробут — коротко, без резюме."
                className="w-full rounded-xl bg-[#faf9ff] px-4 py-3 text-[15px] ring-1 ring-[#e3def9] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#7c5cf0] resize-none"
              />
            </div>

          </div>
          </Card>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-5 py-3 rounded-xl bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] text-white text-[14px] font-medium hover:opacity-90 transition disabled:opacity-50"
            >
              {saving ? "Зберігаємо…" : "Зберегти зміни"}
            </button>
            {saved && (
              <span className="text-[13px] text-emerald-600">Збережено ✓</span>
            )}
            {error && <span className="text-[13px] text-red-500">{error}</span>}
          </div>

        </div>
      </div>

      <div className={tab === "background" ? "" : "hidden"}>
        <AuthorBackgroundEditor authorId={profile.id} />
      </div>

      {/* what fills itself from the other tabs of the cabinet */}
      <div className={`grid gap-3 sm:grid-cols-3 ${tab === "auto" ? "" : "hidden"}`}>
        {([
          ["community", "Публікації", "Ваші дописи «Для всіх» зі «Спільноти». Один можна закріпити."],
          ["library", "Матеріали", "Опубліковані програми, гайди й медитації з «Контенту»."],
          ["star", "Відгуки", "Оцінки й відгуки учасників. Відповідати — у «Відгуках»."],
        ] as const).map(([icon, title, text]) => (
          <div key={title} className="rounded-[22px] bg-white p-5 ring-1 ring-[#ece8fb]">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#f1eeff] text-[#5b3df5]"><Icon name={icon} size={20} /></span>
            <div className="mt-3 text-[16px] font-semibold text-[#12172b]">{title}</div>
            <p className="mt-1 text-[14px] leading-relaxed text-black/55">{text}</p>
            <p className="mt-2 text-[12px] font-semibold text-[#6d5bd0]">Заповнюється автоматично</p>
          </div>
        ))}
      </div>

      <div className={tab === "story" ? "" : "hidden"}>
      <AuthorStoryEditor authorId={profile.id} />
      </div>
    </div>
  );
}

// one block of the «Шапка» form: a number, a title and a short line on why it matters
function Card({ n, title, hint, children }: { n: number; title: string; hint: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[26px] bg-white p-5 ring-1 ring-[#ece8fb] shadow-[0_14px_36px_-30px_rgba(60,50,140,0.55)] sm:p-7">
      <div className="mb-5 flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#3b6df0] to-[#7c5cf0] text-[15px] font-bold text-white">{n}</span>
        <div>
          <h2 className="text-[18px] font-bold leading-tight text-[#12172b]">{title}</h2>
          <p className="mt-0.5 text-[13px] text-black/55">{hint}</p>
        </div>
      </div>
      {children}
    </section>
  );
}
