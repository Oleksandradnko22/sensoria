import { useEffect, useRef, useState } from "react";
import type { AuthoredContent } from "../../data/authorDashboard";
import { useSession } from "../../context/SessionContext";
import { getInitials, updateProfile, updateAvatar, removeAvatar } from "../../lib/auth";
import { fetchAuthorDetails, updateAuthorDetails } from "../../lib/authorDetails";
import { fetchAuthorReviewSummary, type AuthorReviewSummary } from "../../lib/authorReviews";
import Avatar from "../ui/Avatar";
import { categoryLabels } from "../../data/categoryLabels";
import AuthorStoryEditor from "./AuthorStoryEditor";
import AuthorBackgroundEditor from "./AuthorBackgroundEditor";
import CoverPicker, { type CoverChoice } from "./CoverPicker";
import { coverFields, isCoverType, parseVariant } from "../../utils/authorCover";
import { isFullName } from "../../utils/personName.ts";

type Props = {
  content: AuthoredContent[];
};

export default function AuthorProfile({ content }: Props) {
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
  const [reviewSummary, setReviewSummary] = useState<AuthorReviewSummary>({
    average: 0,
    count: 0,
  });

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
    fetchAuthorReviewSummary(profile.id).then((summary) => {
      if (!cancelled) setReviewSummary(summary);
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

  const publishedCount = content.filter((c) => c.status === "published").length;
  const memberSinceLabel = profile?.memberSince
    ? new Date(profile.memberSince).toLocaleDateString("uk-UA", {
        month: "long",
        year: "numeric",
      })
    : "";
  const initials = getInitials(name);

  if (!profile || loading) {
    return <div className="text-black/40 text-[14px]">Завантаження…</div>;
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-bold">Публічний профіль</h1>
        <p className="text-black/50 mt-1">
          Це побачать учасники на сторінці ваших курсів.
        </p>
      </div>

      <div className="grid lg:grid-cols-[1fr_340px] gap-8 items-start">
        {/* FORM */}
        <div className="flex flex-col gap-8 max-w-[680px]">
          <div className="flex items-center gap-4">
            <Avatar
              avatarUrl={profile?.avatarUrl}
              initials={initials}
              className="w-16 h-16 text-[20px] text-white"
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
              className="px-4 py-2 rounded-xl bg-black/5 hover:bg-black/10 text-[13px] font-medium transition disabled:opacity-50"
            >
              {uploadingAvatar ? "Завантажуємо…" : "Змінити фото"}
            </button>
            {profile?.avatarUrl && (
              <button
                onClick={handleRemoveAvatar}
                disabled={avatarBusy}
                className="px-4 py-2 rounded-xl bg-black/5 hover:bg-black/10 text-[13px] font-medium text-red-500 transition disabled:opacity-50"
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

          <div className="flex flex-col gap-4">
            <div>

              <div className="text-[13px] font-medium text-black/50 mb-2">Ім'я та прізвище</div>
              <input
                value={name}
                placeholder="Ім'я Прізвище"
                autoComplete="name"
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-black/10 text-[14px] focus:outline-none focus:border-black/30"
              />
            </div>

            <div>

              <div className="text-[13px] font-medium text-black/50 mb-2">
                Спеціалізація
              </div>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-black/10 text-[14px] focus:outline-none focus:border-black/30"
              />
            </div>

            <div>
              <div className="text-[13px] font-medium text-black/50 mb-2">З чим ви допомагаєте людям</div>
              <textarea
                value={positioning}
                onChange={(e) => setPositioning(e.target.value)}
                rows={2}
                maxLength={220}
                placeholder="Одне-два речення: наприклад, «Допомагаю краще розуміти емоційні реакції та знаходити практичні способи підтримати себе»."
                className="w-full px-4 py-3 rounded-xl border border-black/10 text-[14px] focus:outline-none focus:border-black/30 resize-none"
              />
              <div className="text-[12px] text-black/40 mt-1.5">
                Показується на початку вашого профілю. {positioning.length}/220
              </div>
            </div>

            <div>
              <div className="text-[13px] font-medium text-black/50 mb-2">Теми</div>
              <div className="flex flex-wrap gap-2">
                {Object.entries(categoryLabels).map(([key, label]) => {
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
                        on ? "bg-[#eef2ff] border-[#4338ca]/30 text-[#4338ca]" : "border-black/10 text-black/55 hover:bg-black/5"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <div className="text-[12px] text-black/40 mt-1.5">До 5 тем — ті самі, що й у каталозі.</div>
            </div>

            <CoverPicker value={cover} onChange={setCover} topics={topics} authorId={profile.id} />

            <div>

              <div className="text-[13px] font-medium text-black/50 mb-2">Про себе</div>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={4}
                className="w-full px-4 py-3 rounded-xl border border-black/10 text-[14px] focus:outline-none focus:border-black/30 resize-none"
              />
            </div>

            <div>
              <div className="text-[13px] font-medium text-black/50 mb-2">Підхід</div>
              <textarea
                value={approach}
                onChange={(e) => setApproach(e.target.value)}
                rows={3}
                maxLength={700}
                placeholder="Як ви працюєте і думаєте про емоційний добробут — коротко, без резюме."
                className="w-full px-4 py-3 rounded-xl border border-black/10 text-[14px] focus:outline-none focus:border-black/30 resize-none"
              />
              <div className="text-[12px] text-black/40 mt-1.5">{approach.length}/700</div>
            </div>

            <div>
              <div className="text-[13px] font-medium text-black/50 mb-2">
                Освіта і досвід (вказано вами)
              </div>
              <input
                value={credentials}
                onChange={(e) => setCredentials(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-black/10 text-[14px] focus:outline-none focus:border-black/30"
              />
              <div className="text-[12px] text-black/40 mt-1.5">
                Це ваші слова: Sensoria не перевіряє досвід. Освіту вона переглядає лише за документами, які ви надсилаєте в розділі «Модерація» (статус «Фахівець»). Публічно це поле не показується; освіту й сертифікати для профілю додайте нижче.
              </div>
            </div>

          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-5 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 text-white text-[14px] font-medium hover:opacity-90 transition disabled:opacity-50"
            >
              {saving ? "Зберігаємо…" : "Зберегти зміни"}
            </button>
            {saved && (
              <span className="text-[13px] text-emerald-600">Збережено ✓</span>
            )}
            {error && <span className="text-[13px] text-red-500">{error}</span>}
          </div>

          <AuthorBackgroundEditor authorId={profile.id} />
        </div>

        {/* LIVE PREVIEW — how this shows to participants on a course page,
            so the empty space next to a narrow form does something useful
            instead of just sitting there. Kept deliberately quiet: same
            plain card style as the rest of the app, no extra decoration. */}
        <div className="lg:sticky lg:top-6">
          <div className="text-[12px] text-black/35 mb-2 px-1">Прев'ю профілю</div>
          <div className="rounded-2xl bg-white border border-black/5 p-8">
            <div className="flex items-center gap-4">
              <Avatar
                avatarUrl={profile?.avatarUrl}
                initials={initials}
                className="w-16 h-16 text-[18px] text-white"
              />
              <div className="min-w-0">
                <div className="font-semibold text-[16px] truncate flex items-center gap-1.5">
                  {name || "Ім'я автора"}
                  {verified && (
                    <span className="text-emerald-600 text-[14px]">✓</span>
                  )}
                </div>
                <div className="text-[13px] text-black/45 truncate mt-0.5">
                  {title || "Спеціалізація"}
                </div>
              </div>
            </div>

            <p className="text-[13px] text-black/65 leading-relaxed mt-6">
              {bio || "Опис буде показано тут."}
            </p>

            <div className="flex items-center gap-4 mt-6 pt-6 border-t border-black/5 text-[12px] text-black/45 flex-wrap">
              {reviewSummary.count > 0 && (
                <>
                  <span className="flex items-center gap-1 text-amber-500 font-medium">
                    ★ {reviewSummary.average.toFixed(1)}
                    <span className="text-black/45 font-normal">
                      ({reviewSummary.count})
                    </span>
                  </span>
                  <span className="w-1 h-1 rounded-full bg-black/20" />
                </>
              )}
              <span>{publishedCount} опублікованих програм</span>
              {memberSinceLabel && (
                <>
                  <span className="w-1 h-1 rounded-full bg-black/20" />
                  <span>На Sensoria з {memberSinceLabel}</span>
                </>
              )}
            </div>

          </div>
        </div>
      </div>

      <AuthorStoryEditor authorId={profile.id} name={name || profile.name} initials={initials} avatarUrl={profile.avatarUrl ?? null} role={title} approach={approach} />
    </div>
  );
}
