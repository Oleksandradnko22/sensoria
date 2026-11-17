import { CONTACT_EMAIL } from "../../pages/ContactsPage";

type Props = {
  onOpenTerms?: () => void;
  onOpenPrivacy?: () => void;
  onOpenRefunds?: () => void;
  onOpenAuthorAgreement?: () => void;
  current: "terms" | "privacy" | "refunds" | "author" | "participant";
};

const btn =
  "t-body font-semibold text-[#3b27a8] underline underline-offset-4 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4338ca] rounded";

// Cross-links between the three legal documents + the contact address.
export default function RelatedDocs({ onOpenTerms, onOpenPrivacy, onOpenRefunds, onOpenAuthorAgreement, current }: Props) {
  return (
    <section aria-labelledby="related-h" className="rounded-3xl bg-white/95 text-[#0f172a] border border-white/70 shadow-[0_20px_50px_-28px_rgba(15,23,100,0.55)] p-5 sm:p-8">
      <h2 id="related-h" className="t-h3">Пов’язані документи та контакти</h2>
      <ul className="mt-3 space-y-2">
        {current !== "terms" && (
          <li><button type="button" onClick={onOpenTerms} className={btn}>Умови використання</button></li>
        )}
        {current !== "privacy" && (
          <li><button type="button" onClick={onOpenPrivacy} className={btn}>Політика конфіденційності</button></li>
        )}
        {current !== "refunds" && (
          <li><button type="button" onClick={onOpenRefunds} className={btn}>Правила повернення коштів</button></li>
        )}
        {current !== "participant" && (
          <li><a href="/participant-agreement" className={btn}>Угода учасника</a></li>
        )}
        {current !== "author" && (
          <li>
            {onOpenAuthorAgreement ? (
              <button type="button" onClick={onOpenAuthorAgreement} className={btn}>Договір з автором (оферта)</button>
            ) : (
              <a href="/author-agreement" className={btn}>Договір з автором (оферта)</a>
            )}
          </li>
        )}
        <li><a href="/crisis-help" className={btn}>Допомога в кризі</a></li>
        <li className="t-body text-gray-700">
          Питання щодо цього документа:{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className={`${btn} break-all`}>{CONTACT_EMAIL}</a>
        </li>
      </ul>
    </section>
  );
}
