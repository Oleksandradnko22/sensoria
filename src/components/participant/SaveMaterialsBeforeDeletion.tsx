// «Профіль» → «Видалення акаунту»: before deleting, the person sees every material they have and can keep it.
// Guides (when the author allows downloads) and meditations open where their own download already lives (a guide's
// PDF carries the buyer's watermark). Programs and guides whose author turned downloads off cannot be downloaded:
// for those the person asks Sensoria in one request, and the team asks the author for the material.
import { useEffect, useState } from "react";
import { Icon } from "../ui/Icon";
import { fetchOwnedKeys } from "../../lib/ownedContent";
import { getContentInfo } from "../../data/participantDashboard";
import { guides } from "../../data/guides";
import { submitTicket } from "../../lib/supportTickets";
import type { ContentKind } from "../../data/participantDashboard";

type Item = { kind: ContentKind; id: string; title: string; downloadable: boolean };
const KIND: Record<ContentKind, string> = { program: "Програма", guide: "Гайд", meditation: "Медитація" };

export default function SaveMaterialsBeforeDeletion({ userId, onOpen }: { userId: string; onOpen?: (kind: ContentKind, id: string) => void }) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [requested, setRequested] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchOwnedKeys(userId, { demoEnrollments: false })
      .then((owned) => {
        const list: Item[] = [];
        owned.forEach((_, key) => {
          const [kind, ...rest] = key.split(":");
          const id = rest.join(":");
          const info = getContentInfo(id, kind as ContentKind);
          if (!info) return;
          const downloadable = kind === "meditation" || (kind === "guide" && guides.find((g) => g.id === id)?.allowDownload !== false);
          list.push({ kind: kind as ContentKind, id, title: info.title, downloadable });
        });
        if (!cancelled) setItems(list);
      })
      .catch(() => !cancelled && setItems([]));
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const toRequest = (items ?? []).filter((i) => !i.downloadable);
  const ask = async () => {
    setBusy(true);
    setError(null);
    try {
      await submitTicket({
        userId,
        category: "content",
        description: `Перед видаленням акаунта прошу, якщо це можливо, надати мені матеріали, які не можна завантажити самостійно: ${toRequest.map((i) => `${KIND[i.kind]} «${i.title}»`).join("; ")}.`,
      });
      setRequested(true);
    } catch {
      setError("Не вдалося надіслати запит. Спробуйте ще раз.");
    } finally {
      setBusy(false);
    }
  };

  if (items === null) return <p className="mt-3 text-[13px] text-black/50">Завантажуємо ваші матеріали…</p>;
  if (items.length === 0) return null;

  return (
    <div className="mt-4 rounded-2xl bg-white p-4 ring-1 ring-rose-100">
      <div className="text-[15px] font-bold text-[#12172b]">Перш ніж видалити — збережіть свої матеріали</div>
      <p className="mt-0.5 text-[13px] text-black/55">Гайди й медитації можна завантажити на їхній сторінці. Решту ми можемо попросити в автора.</p>
      <ul className="mt-3 flex flex-col gap-2">
        {items.map((i) => (
          <li key={`${i.kind}:${i.id}`} className="flex flex-wrap items-center gap-3 rounded-xl bg-[#faf9ff] px-3.5 py-2.5 ring-1 ring-[#f1eefb]">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#f1eeff] text-[#6d5bd0]"><Icon name={i.kind} size={17} /></span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-semibold text-[#12172b]">{i.title}</span>
              <span className="block text-[12px] text-black/50">{KIND[i.kind]}{i.downloadable ? "" : " · завантаження немає — можна попросити в автора"}</span>
            </span>
            {i.downloadable && onOpen && (
              <button type="button" onClick={() => onOpen(i.kind, i.id)} className="min-h-[36px] shrink-0 rounded-lg bg-white px-3 text-[13px] font-semibold text-[#4338ca] ring-1 ring-[#e3def9] hover:ring-[#c9bff7]">
                Відкрити й завантажити
              </button>
            )}
          </li>
        ))}
      </ul>
      {toRequest.length > 0 && (
        <div className="mt-3">
          {requested ? (
            <p role="status" className="rounded-xl bg-emerald-50 px-3.5 py-2.5 text-[13px] text-emerald-800 ring-1 ring-emerald-100">
              Запит надіслано. Ми звернемося до авторів і напишемо вам у «Допомога» → «Ваші звернення». Автор може й не погодитися.
            </p>
          ) : (
            <button type="button" onClick={() => void ask()} disabled={busy} className="min-h-[40px] rounded-xl bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] px-4 text-[13px] font-semibold text-white hover:opacity-95 disabled:opacity-50">
              {busy ? "Надсилаємо…" : `Попросити матеріали в авторів (${toRequest.length})`}
            </button>
          )}
          {error && <p role="alert" className="mt-2 text-[13px] text-rose-700">{error}</p>}
        </div>
      )}
    </div>
  );
}
