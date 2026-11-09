import { useEffect, useState } from "react";
import type { Profile } from "../../lib/auth";
import { fetchMyReviews, upsertReview } from "../../lib/reviews";
import { fetchMyAuthorReviews, upsertAuthorReview } from "../../lib/authorReviews";

function Stars({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="mb-2 flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={n === value}
          aria-label={`${n} з 5`}
          onClick={() => onChange(n)}
          className={`rounded text-[24px] leading-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4338ca] ${n <= value ? "text-amber-400" : "text-black/15"}`}
        >
          ★
        </button>
      ))}
    </div>
  );
}

const LOGIN_BTN =
  "w-full min-h-[44px] rounded-[14px] border border-[#dbe4ff] bg-white px-4 text-[14px] font-medium text-slate-700 transition hover:bg-[#f8faff] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4338ca]";
const SAVE_BTN =
  "mt-2 min-h-[44px] w-full rounded-[14px] bg-slate-900 px-4 text-[14px] font-medium text-white transition hover:opacity-90 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4338ca] focus-visible:ring-offset-2";
const AREA =
  "w-full resize-none rounded-xl border border-black/10 bg-white px-3 py-2.5 text-[14px] focus:border-black/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4338ca]/40";

type Common = { session?: Profile | null; onRequireLogin: () => void };

// "Залишити відгук" about this program (reviews table, one per participant).
export function ContentReviewForm({ programId, session, onRequireLogin, onSaved }: Common & { programId: string; onSaved: () => void }) {
  const participant = session?.role === "participant" ? session : null;
  const [rating, setRating] = useState(5);
  const [text, setText] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!participant) return;
    let cancelled = false;
    fetchMyReviews(participant.id).then((rows) => {
      if (cancelled) return;
      const mine = rows.find((r) => r.contentId === programId);
      if (mine) {
        setRating(mine.rating);
        setText(mine.text);
      }
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [programId, participant?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!participant) {
    return (
      <button type="button" onClick={onRequireLogin} className={LOGIN_BTN}>
        Увійти як учасник, щоб залишити відгук
      </button>
    );
  }
  if (!loaded) return null;

  const save = async () => {
    if (!text.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await upsertReview({ participantId: participant.id, contentId: programId, rating, text: text.trim() });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не вдалося зберегти відгук.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <Stars value={rating} onChange={setRating} label="Оцінка програми" />
      <textarea
        aria-label="Ваш відгук про програму"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setError(null);
        }}
        rows={3}
        placeholder="Поділіться враженнями від програми…"
        className={AREA}
      />
      <button type="button" onClick={save} disabled={saving || !text.trim()} className={SAVE_BTN}>
        {saving ? "Зберігаємо…" : "Зберегти відгук"}
      </button>
      {saved && <div role="status" className="mt-2 text-[12px] text-emerald-600">Збережено ✓</div>}
      {error && <div role="alert" className="mt-2 text-[12px] text-red-500">{error}</div>}
    </div>
  );
}

// "Оцінити автора" — scores the author as a person (author_reviews), not this program.
export function AuthorRatingForm({ authorId, session, onRequireLogin, onSaved }: Common & { authorId: string; onSaved?: () => void }) {
  const participant = session?.role === "participant" ? session : null;
  const [rating, setRating] = useState(5);
  const [text, setText] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!participant) return;
    let cancelled = false;
    fetchMyAuthorReviews(participant.id).then((rows) => {
      if (cancelled) return;
      const mine = rows.find((r) => r.authorId === authorId);
      if (mine) {
        setRating(mine.rating);
        setText(mine.text);
      }
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [authorId, participant?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!participant) {
    return (
      <button type="button" onClick={onRequireLogin} className={LOGIN_BTN}>
        Увійти як учасник, щоб оцінити автора
      </button>
    );
  }
  if (!loaded) return null;

  const save = async () => {
    if (!text.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await upsertAuthorReview({ participantId: participant.id, authorId, rating, text: text.trim() });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не вдалося зберегти відгук про автора.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <Stars value={rating} onChange={setRating} label="Оцінка автора" />
      <textarea
        aria-label="Ваш відгук про автора"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setError(null);
        }}
        rows={3}
        placeholder="Як вам робота з автором — стиль викладання, спілкування…"
        className={AREA}
      />
      <button type="button" onClick={save} disabled={saving || !text.trim()} className={SAVE_BTN}>
        {saving ? "Зберігаємо…" : "Зберегти оцінку автора"}
      </button>
      {saved && <div role="status" className="mt-2 text-[12px] text-emerald-600">Збережено ✓</div>}
      {error && <div role="alert" className="mt-2 text-[12px] text-red-500">{error}</div>}
    </div>
  );
}
