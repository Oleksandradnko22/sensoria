// "Оберіть обкладинку профілю" — deliberately NOT a design editor: pick a
// type, a visual style and one of four ready compositions (or use your own
// photo, or leave it automatic). No colours, gradients or opacity to tune.
import { useRef, useState } from "react";
import AuthorCover, { CoverArt } from "./public/AuthorCover";
import { uploadContentFile } from "../../lib/storage";
import { validateImages } from "../../utils/authorPosts";
import {
  COVER_COMPOSITIONS,
  COVER_FAMILIES,
  COVER_FAMILY_HINT,
  COVER_FAMILY_LABEL,
  COVER_PALETTES,
  COVER_TYPES,
  COVER_TYPE_HINT,
  COVER_TYPE_LABEL,
  familyFromTopics,
  resolveCover,
  type CoverFamily,
  type CoverType,
} from "../../utils/authorCover";

export type CoverChoice = {
  type: CoverType | null; // null = automatic
  family: CoverFamily | null;
  comp: number | null;
  imageUrl: string | null;
};

type Props = {
  value: CoverChoice;
  onChange: (next: CoverChoice) => void;
  topics: string[];
  authorId: string;
};

export default function CoverPicker({ value, onChange, topics, authorId }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const autoFamily = familyFromTopics(topics);

  const preview = resolveCover({
    coverType: value.type,
    coverVariant: value.family && value.comp ? `${value.family}-0${value.comp}` : null,
    coverImageUrl: value.imageUrl,
    topics,
    seed: authorId,
  });

  const pickType = (type: CoverType | null) => {
    setErr(null);
    if (!type) return onChange({ type: null, family: null, comp: null, imageUrl: null });
    if (type === "personal") return onChange({ ...value, type, family: value.family ?? autoFamily, comp: value.comp ?? 1 });
    onChange({ ...value, type, family: value.family ?? autoFamily, comp: value.comp ?? 1 });
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const problem = validateImages([file]);
    if (problem) return setErr(problem);
    setBusy(true);
    setErr(null);
    try {
      const url = await uploadContentFile(authorId, file, "cover");
      onChange({ ...value, type: "personal", imageUrl: `${url}?v=${Date.now()}` });
    } catch {
      setErr("Не вдалося завантажити зображення. Спробуйте ще раз.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const drawn = value.type && value.type !== "personal" ? value.type : null;
  const family = value.family ?? autoFamily;

  return (
    <div>
      <div className="text-[13px] font-medium text-black/50 mb-2">Оберіть обкладинку профілю</div>
      <div className="rounded-2xl overflow-hidden border border-black/[0.06]">
        <AuthorCover cover={preview} />
      </div>
      <div className="text-[12px] text-black/40 mt-1.5">
        {value.type
          ? "Так обкладинка виглядатиме на вашому публічному профілі."
          : "Автоматично: колір і композиція підбираються за вашими темами. Можна обрати свій варіант нижче."}
      </div>

      <div className="flex flex-wrap gap-2 mt-4" role="radiogroup" aria-label="Тип обкладинки">
        <TypeChip on={!value.type} onClick={() => pickType(null)} label="Автоматично" hint="За вашими темами" />
        {COVER_TYPES.map((t) => (
          <TypeChip key={t} on={value.type === t} onClick={() => pickType(t)} label={COVER_TYPE_LABEL[t]} hint={COVER_TYPE_HINT[t]} />
        ))}
      </div>

      {drawn && (
        <div className="mt-5">
          <div className="text-[13px] font-medium text-black/50 mb-2">Візуальний стиль профілю</div>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Візуальний стиль">
            {COVER_FAMILIES.map((f) => {
              const on = family === f;
              const pal = COVER_PALETTES[f];
              return (
                <button
                  type="button"
                  key={f}
                  role="radio"
                  aria-checked={on}
                  onClick={() => onChange({ ...value, family: f })}
                  title={COVER_FAMILY_HINT[f]}
                  className={`flex items-center gap-2 pl-2 pr-3.5 py-1.5 rounded-full border text-[13px] transition ${
                    on ? "border-[#4338ca]/40 bg-[#eef2ff] text-[#4338ca]" : "border-black/10 text-black/60 hover:bg-black/5"
                  }`}
                >
                  <span className="w-5 h-5 rounded-full" style={{ background: `linear-gradient(135deg, ${pal.a}, ${pal.b})` }} />
                  {COVER_FAMILY_LABEL[f]}
                </button>
              );
            })}
          </div>
          <div className="text-[12px] text-black/40 mt-1.5">{COVER_FAMILY_HINT[family]}</div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4" role="radiogroup" aria-label="Композиція">
            {COVER_COMPOSITIONS.map((c) => {
              const on = (value.comp ?? 1) === c;
              return (
                <button
                  type="button"
                  key={c}
                  role="radio"
                  aria-checked={on}
                  aria-label={`${COVER_FAMILY_LABEL[family]} 0${c}`}
                  onClick={() => onChange({ ...value, comp: c })}
                  className={`text-left rounded-xl p-1 border-2 transition ${on ? "border-[#4338ca]" : "border-transparent hover:border-black/10"}`}
                >
                  <CoverArt type={drawn} family={family} comp={c} className="aspect-[1200/160] rounded-lg" />
                  <div className="text-[12px] text-black/55 mt-1 px-1">
                    {COVER_FAMILY_LABEL[family]} 0{c}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {value.type === "personal" && (
        <div className="mt-5">
          <div className="flex items-center gap-3 flex-wrap">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="px-4 py-2.5 rounded-xl border border-black/10 text-[13px] font-medium hover:bg-black/5 disabled:opacity-50"
            >
              {busy ? "Завантажуємо…" : value.imageUrl ? "Замінити зображення" : "Завантажити зображення"}
            </button>
            {value.imageUrl && (
              <button type="button" onClick={() => onChange({ ...value, imageUrl: null })} className="text-[13px] text-black/50 hover:text-black">
                Прибрати
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => onFile(e.target.files?.[0])} />
          </div>
          <div className="text-[12px] text-black/40 mt-1.5">
            Ваше фото, робочий простір або деталь середовища. Широке горизонтальне зображення, JPG/PNG/WebP до 5 МБ. Без зображення
            показується автоматична обкладинка.
          </div>
        </div>
      )}

      {err && (
        <div role="alert" className="text-[13px] text-rose-600 mt-3">
          {err}
        </div>
      )}
    </div>
  );
}

function TypeChip({ on, onClick, label, hint }: { on: boolean; onClick: () => void; label: string; hint: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onClick}
      className={`text-left px-3.5 py-2 rounded-xl border transition ${
        on ? "border-[#4338ca]/40 bg-[#eef2ff]" : "border-black/10 hover:bg-black/5"
      }`}
    >
      <div className={`text-[13px] font-medium ${on ? "text-[#4338ca]" : "text-black/75"}`}>{label}</div>
      <div className="text-[11.5px] text-black/40">{hint}</div>
    </button>
  );
}
