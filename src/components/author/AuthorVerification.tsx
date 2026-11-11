// "Верифікація акаунту" card on the author's Модерація page: shows the real
// status and lets the author send a document for review.
import { useEffect, useRef, useState } from "react";
import { Icon } from "../ui/Icon";
import { useSession } from "../../context/SessionContext";
import { fetchAuthorDetails } from "../../lib/authorDetails";
import {
  VERIFY_MAX_FILES,
  fetchMyVerification,
  missingProfileParts,
  submitVerification,
  validateVerificationFiles,
  type MyVerification,
  type VerificationKind,
} from "../../lib/authorVerification";

export default function AuthorVerification({ kind = "identity" }: { kind?: VerificationKind }) {
  const education = kind === "education";
  const session = useSession();
  const profile = session?.profile;
  const [verified, setVerified] = useState(false);
  const [credentials, setCredentials] = useState("");
  const [title, setTitle] = useState("");
  const [bio, setBio] = useState("");
  const [req, setReq] = useState<MyVerification | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const load = async () => {
    if (!profile) return;
    try {
      const [d, r] = await Promise.all([fetchAuthorDetails(profile.id), fetchMyVerification(profile.id, kind)]);
      setVerified(education ? d.educationVerified : d.verified);
      setCredentials(d.credentials);
      setTitle(d.title);
      setBio(d.bio);
      setReq(r);
    } catch {
      /* shown as not-loaded below */
    } finally {
      setLoaded(true);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  if (!profile) return null;
  const missing = [
    ...missingProfileParts({ name: profile.name, title, bio }),
    ...(education && !credentials.trim() ? ["освіта й досвід"] : []),
  ];
  const pending = req?.status === "pending";

  const send = async () => {
    const problem = validateVerificationFiles(files);
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      await submitVerification(profile.id, files, note, kind);
      setFiles([]);
      setNote("");
      await load();
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Не вдалося надіслати. Спробуйте ще раз.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl bg-white border border-black/5 p-6">
      <div className="flex items-center gap-3">
        <div
          className={`w-10 h-10 rounded-full flex items-center justify-center text-lg ${
            verified ? "bg-emerald-100 text-emerald-700" : "bg-black/5 text-black/60"
          }`}
        >
          {verified ? "✓" : "…"}
        </div>
        <div className="font-semibold text-[16px]">
          {education
            ? verified
              ? "Статус «Фахівець»: документи про освіту переглянуто"
              : pending
                ? "Документи про освіту на розгляді"
                : "Статус «Фахівець»"
            : verified
              ? "Акаунт верифіковано"
              : pending
                ? "Верифікація на розгляді"
                : "Верифікація акаунту"}
        </div>
      </div>

      {!loaded && <div className="mt-3 text-[14px] text-black/60">Завантаження…</div>}

      {loaded && verified && (
        <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#eef2ff] text-[#4338ca] text-[14px] font-medium">
          <Icon name="shield" size={14} /> {education ? "Документи про освіту переглянуто Sensoria" : "Особу перевірено Sensoria"}
        </div>
      )}

      {loaded && !verified && pending && (
        <p className="mt-3 text-[14px] text-black/70 leading-relaxed">
          Ми отримали ваші дані й розглянемо їх найближчим часом. Після рішення файли буде видалено.
        </p>
      )}

      {loaded && !verified && !pending && (
        <div className="mt-3 flex flex-col gap-4">
          {req?.status === "rejected" && (
            <div className="rounded-xl bg-rose-50 text-rose-800 text-[14px] px-3.5 py-2.5">
              Попередню заявку відхилено{req.rejectReason ? `: ${req.rejectReason}` : "."} Можна надіслати нову.
            </div>
          )}
          <p className="text-[14px] text-black/70 leading-relaxed">
            {education
              ? "Статус «Фахівець» («документи про освіту переглянуто») показується в профілі й на ваших матеріалах і відкриває теми підвищеного ризику (травма, суїцидальні думки, розлади харчової поведінки, залежності, діагнози й лікування). Sensoria лише переглядає ваші документи про освіту; досвід не перевіряється й показується як «вказано автором»."
              : "Галочка показує учасникам, що ви реальна людина. Для цього потрібні два кроки."}
          </p>

          <div>
            <div className="text-[14px] font-medium">1. Заповніть профіль</div>
            {missing.length === 0 ? (
              <div className="text-[14px] text-emerald-700 mt-0.5">Готово: {education ? "ім'я, спеціалізація, «Про себе» й «Освіта і досвід» заповнені." : "ім'я, спеціалізація й «Про себе» заповнені."}</div>
            ) : (
              <div className="text-[14px] text-black/70 mt-0.5">Ще потрібно додати: {missing.join(", ")}. Це робиться в розділі «Профіль».</div>
            )}
          </div>

          <div>
            <div className="text-[14px] font-medium">2. Надішліть документ</div>
            <p className="text-[14px] text-black/70 mt-0.5 leading-relaxed">
              {education ? (
                <>
                  Диплом, додаток до диплома або сертифікат про професійну підготовку.
                  Нам потрібно побачити ваше ім'я, навчальний заклад чи організацію, спеціальність і дату,{" "}
                  <strong className="font-semibold">закрийте на фото зайве</strong>: номер документа, РНОКПП, адресу. Файли бачить лише команда
                  Sensoria. Після розгляду ми видаляємо їх; строки та винятки (резервні копії, вимоги закону) описані в Політиці конфіденційності.
                </>
              ) : (
                <>
                  Підійде паспорт, ID-картка, посвідчення водія або диплом. Нам потрібно лише побачити, що ви існуєте, тому{" "}
                  <strong className="font-semibold">закрийте на фото зайве</strong>: номер документа, адресу, РНОКПП, код і підпис.
                  Лишіть ім'я та фото. Файли бачить лише команда Sensoria. Після розгляду ми видаляємо їх; строки та винятки (резервні копії, вимоги закону) описані в Політиці конфіденційності.
                </>
              )}
            </p>

            <input
              ref={input}
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp,application/pdf"
              className="sr-only"
              aria-label="Обрати файли документа"
              onChange={(e) => {
                setFiles(Array.from(e.target.files ?? []).slice(0, VERIFY_MAX_FILES));
                setError(null);
              }}
            />
            <button
              type="button"
              onClick={() => input.current?.click()}
              className="mt-3 min-h-[44px] px-4 rounded-xl border border-black/15 text-[14px] font-medium hover:bg-black/[0.04] transition"
            >
              {files.length ? "Обрати інші файли" : "Обрати файли"}
            </button>
            <div className="mt-1 text-[12px] text-black/60">До {VERIFY_MAX_FILES} файлів: JPG, PNG, WebP або PDF, до 8 МБ.</div>
            {files.length > 0 && (
              <ul className="mt-2 text-[14px] text-black/80">
                {files.map((f) => (
                  <li key={f.name + f.size} className="break-all">
                    {f.name}
                  </li>
                ))}
              </ul>
            )}

            <label className="block mt-3 text-[14px] font-medium" htmlFor={`verify-note-${kind}`}>
              Коментар для команди (необов'язково)
            </label>
            <textarea
              id={`verify-note-${kind}`}
              value={note}
              maxLength={500}
              rows={2}
              onChange={(e) => setNote(e.target.value)}
              className="mt-1 w-full rounded-xl border border-black/[0.12] p-3 text-[16px] sm:text-[14px] resize-none focus:outline-none focus:border-black/30"
            />
          </div>

          {error && (
            <div role="alert" className="text-[14px] text-rose-700">
              {error}
            </div>
          )}
          <button
            type="button"
            onClick={send}
            disabled={busy || missing.length > 0 || files.length === 0}
            className="min-h-[44px] px-5 rounded-xl bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] text-white text-[14px] font-medium hover:opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy ? "Надсилаємо…" : "Надіслати на розгляд"}
          </button>
        </div>
      )}
    </div>
  );
}
