// Admin → Матеріали: every program / guide / meditation with its sale and
// access state. The admin works with the material and its sale — never with
// the author's or buyers' accounts, and never with private messages.
import { useCallback, useEffect, useState } from "react";
import {
  fetchAdminMaterials,
  runMaterialAction,
  type AdminMaterial,
  type AdminRole,
  type MaterialAct,
  type SaleStatus,
} from "../../lib/admin";
import ConfirmDialog from "../author/public/ConfirmDialog";
import { formatAbsoluteDate } from "../../utils/relativeTime";

const KIND: Record<AdminMaterial["kind"], string> = { program: "Програма", guide: "Гайд", meditation: "Медитація" };
const STATUS: Record<AdminMaterial["status"], string> = {
  draft: "Чернетка",
  review: "На модерації",
  published: "Опубліковано",
  archived: "Архів",
};
const SALE: Record<SaleStatus, { label: string; cls: string }> = {
  published: { label: "У продажу", cls: "bg-emerald-100 text-emerald-800" },
  restored: { label: "Продаж відновлено", cls: "bg-emerald-100 text-emerald-800" },
  complaint_pending: { label: "Продаж призупинено", cls: "bg-amber-100 text-amber-800" },
  unlisted: { label: "Знято з продажу", cls: "bg-rose-100 text-rose-800" },
  suspended_debt: { label: "Продажі призупинено (борг автора)", cls: "bg-amber-100 text-amber-800" },
};

const ACT_TEXT: Record<MaterialAct, { button: string; title: string; text: string; danger: boolean }> = {
  approve: {
    button: "Схвалити й опублікувати",
    title: "Схвалити матеріал?",
    text: "Матеріал буде опубліковано. Це не означає, що Sensoria перевірила його зміст.",
    danger: false,
  },
  send_back: {
    button: "Повернути автору в чернетки",
    title: "Повернути матеріал у чернетки?",
    text: "Матеріал не буде опубліковано. Вкажіть причину; зв'яжіться з автором, щоб пояснити, що виправити.",
    danger: false,
  },
  suspend_sale: {
    button: "Призупинити продаж",
    title: "Призупинити продаж?",
    text: "Матеріал зникне з каталогу для нових покупців. Ті, хто вже купив, зберігають доступ.",
    danger: false,
  },
  unlist: {
    button: "Зняти з продажу остаточно",
    title: "Остаточно зняти з продажу?",
    text: "Нові покупки неможливі. Ті, хто вже купив, зберігають доступ.",
    danger: true,
  },
  restore_sale: {
    button: "Відновити продаж",
    title: "Відновити продаж?",
    text: "Матеріал знову з'явиться в каталозі для нових покупців.",
    danger: false,
  },
  restrict_access: {
    button: "Обмежити доступ усім покупцям",
    title: "Обмежити доступ усім покупцям?",
    text: "Лише якщо збереження доступу створює серйозний ризик, порушує закон або права третіх осіб. Покупці втратять доступ; їхні права за законом зберігаються, питання повернення коштів вирішується окремо.",
    danger: true,
  },
  restore_access: {
    button: "Відновити доступ покупцям",
    title: "Відновити доступ покупцям?",
    text: "Покупці знову бачитимуть матеріал у своєму кабінеті.",
    danger: false,
  },
  delete_material: {
    button: "Видалити остаточно",
    title: "Видалити матеріал назавжди?",
    text: "Можливо лише якщо в матеріалу немає покупців. Дію не можна скасувати.",
    danger: true,
  },
};

export default function AdminMaterials({ role }: { role: AdminRole }) {
  const [items, setItems] = useState<AdminMaterial[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ m: AdminMaterial; act: MaterialAct } | null>(null);
  const [onlyReview, setOnlyReview] = useState(false);
  const reviewCount = (items ?? []).filter((m) => m.status === "review").length;

  const load = useCallback((q: string) => {
    fetchAdminMaterials(q)
      .then((r) => {
        setItems(r);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Не вдалося завантажити матеріали."));
  }, []);

  useEffect(() => {
    const t = setTimeout(() => load(query.trim()), items ? 300 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, load]);

  const actionsFor = (m: AdminMaterial): MaterialAct[] => {
    const out: MaterialAct[] = [];
    // a draft is not on sale: nothing to pause or unlist. But a material that was sold and then turned back into a draft
    // still has buyers — their access can be restricted if it is harmful.
    if (m.status === "draft") return role === "owner" ? [...(m.buyers > 0 || m.accessRestricted ? [m.accessRestricted ? "restore_access" as const : "restrict_access" as const] : []), "delete_material"] : [];
    // archived by the author: buyers keep access; only that access (or the material) can be dealt with
    if (m.status === "archived") return role === "owner" ? [m.accessRestricted ? "restore_access" : "restrict_access", "delete_material"] : [];
    const onSale = m.status === "published" && (m.saleStatus === "published" || m.saleStatus === "restored");
    if (m.status === "review" && role === "owner") out.push("approve", "send_back");
    if (onSale) out.push("suspend_sale");
    if (role === "owner") {
      if (m.saleStatus !== "unlisted") out.push("unlist");
      if (!onSale) out.push("restore_sale");
      out.push(m.accessRestricted ? "restore_access" : "restrict_access");
      out.push("delete_material");
    }
    return out;
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Матеріали</h1>
      <p className="text-black/60 text-[14px] mb-5">
        Програми, гайди й медитації авторів. Зняття з продажу не відбирає доступ у тих, хто вже купив; обмеження доступу
        всім покупцям — виняток для серйозного ризику чи вимоги закону. Кожна дія потребує причини й потрапляє в журнал.
      </p>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Пошук за назвою"
        aria-label="Пошук матеріалу за назвою"
        className="w-full sm:w-[360px] min-h-[44px] mb-5 px-4 rounded-xl border border-black/10 bg-white text-[14px] focus:outline-none focus:border-black/30"
      />

      <label className="mb-4 inline-flex items-center gap-2 min-h-[44px] px-1 text-[14px] text-black/70 cursor-pointer">
        <input type="checkbox" className="accent-black w-4 h-4" checked={onlyReview} onChange={(e) => setOnlyReview(e.target.checked)} />
        Тільки у статусі «На модерації» (залишок старої черги): {reviewCount}
      </label>

      {error && <div role="alert" className="text-red-600 text-[14px] mb-3">{error}</div>}
      {!items && !error && <div className="text-black/60 text-[14px]">Завантаження…</div>}
      {items && items.length === 0 && <div className="text-black/60 text-[14px]">Матеріалів не знайдено.</div>}

      <div className="flex flex-col gap-3">
        {items?.filter((m) => !onlyReview || m.status === "review").map((m) => (
          <div key={m.id} className="rounded-2xl bg-white border border-black/5 p-5 flex flex-col gap-3">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-[12px] font-medium text-black/60 uppercase tracking-wide">
                  {KIND[m.kind]} · {STATUS[m.status]}
                </div>
                <div className="font-medium text-[16px] break-words">{m.title}</div>
                <div className="text-[13px] text-black/60">
                  {m.authorName}
                  {m.authorEmail ? ` · ${m.authorEmail}` : ""} · оновлено {formatAbsoluteDate(m.updatedAt)}
                </div>
              </div>
              <div className="shrink-0 flex flex-col items-end gap-1">
                {m.status === "published" ? (
                  <span className={`px-2.5 py-1 rounded-full text-[12px] font-medium ${SALE[m.saleStatus].cls}`}>
                    {SALE[m.saleStatus].label}
                  </span>
                ) : (
                  // a draft / on review / archived material is not «У продажу», whatever its sale flag says
                  <span className="px-2.5 py-1 rounded-full text-[12px] font-medium bg-[#eef0fd] text-[#4338ca]">
                    {m.status === "review" ? "Чекає модерації" : m.status === "archived" ? "В архіві" : "Не опубліковано"}
                  </span>
                )}
                {m.accessRestricted && (
                  <span className="px-2.5 py-1 rounded-full text-[12px] font-medium bg-rose-100 text-rose-800">
                    Доступ покупцям обмежено
                  </span>
                )}
              </div>
            </div>

            <div className="text-[13px] text-black/60">
              Покупців: {m.buyers} · Відкритих скарг: {m.openReports}
              {m.riskTopics && m.riskTopics.length > 0 ? ` · Теми ризику: ${m.riskTopics.join(", ")}` : ""}
              {m.accessRestrictedReason ? ` · Причина обмеження: ${m.accessRestrictedReason}` : ""}
            </div>

            <div className="flex flex-wrap gap-2">
              {actionsFor(m).map((act) => (
                <button
                  key={act}
                  onClick={() => setConfirm({ m, act })}
                  disabled={busy === m.id}
                  className={`min-h-[44px] px-4 rounded-lg text-[14px] font-medium transition disabled:opacity-50 ${
                    ACT_TEXT[act].danger
                      ? "bg-rose-50 text-rose-700 hover:bg-rose-100"
                      : act === "restore_sale" || act === "restore_access"
                        ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                        : "bg-amber-50 text-amber-800 hover:bg-amber-100"
                  }`}
                >
                  {ACT_TEXT[act].button}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {confirm && (
        <ConfirmDialog
          title={`${ACT_TEXT[confirm.act].title}`}
          text={`«${confirm.m.title}». ${ACT_TEXT[confirm.act].text}`}
          confirmLabel={ACT_TEXT[confirm.act].button}
          danger={ACT_TEXT[confirm.act].danger}
          askReason
          busy={busy === confirm.m.id}
          onCancel={() => busy === null && setConfirm(null)}
          onConfirm={async (reason) => {
            const c = confirm;
            setBusy(c.m.id);
            try {
              await runMaterialAction(c.m.id, c.act, reason ?? "");
              setConfirm(null);
              load(query.trim());
            } catch (e) {
              setError(e instanceof Error ? e.message : "Не вдалося виконати дію.");
              setConfirm(null);
            } finally {
              setBusy(null);
            }
          }}
        />
      )}
    </div>
  );
}
