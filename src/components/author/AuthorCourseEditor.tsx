import { guideTypeInfo, guideTypeOrder, type GuideType } from "../../data/guideTypes";
import type { MeditationFormat } from "../../data/meditationFormats";
import { CHECKLIST_ITEMS_MAX, CHECKLIST_ITEMS_MIN, CHECKLIST_ITEM_MAX, CHECKLIST_ITEM_MIN, CHECKLIST_TITLE_MAX, checklistItems, splitChecklist } from "../../utils/lessonChecklist";
import { MAX_WARNING_CUSTOM_CHARS, WARNING_TOPICS, parseWarning, setCustomWarning, toggleWarningTopic } from "../../utils/contentWarning";
import { guideFileProblems, meditationAudioProblems, meditationTranscriptProblems, meditationWhenProblems, TRANSCRIPT_MAX_CHARS, WHEN_MAX_ITEMS, WHEN_MIN_ITEMS, WHEN_ITEM_MAX, stepKeysFor, stepLabelsFor, stepNumber, wordsFor, MEDITATION_MAX_MINUTES, MEDITATION_MAX_AUDIO_BYTES, GUIDE_MAX_PAGES, GUIDE_MAX_READ_MINUTES } from "../../utils/contentSteps";
import { Icon, type IconName } from "../ui/Icon";
import CategoryGlyph from "./CategoryGlyph";
import ConfirmDialog from "./ConfirmDialog";
import CoverMaker from "./CoverMaker";
import { MAX_PROGRAM_CATEGORIES, categoriesProblem, categoryTags, primaryCategory, makePrimaryCategory, orderTags, toggleCategoryTag } from "../../utils/programCategories";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { MAX_LESSONS_PER_MODULE, MAX_MODULES, lessonLimitReached } from "../../utils/programModule";
import { deriveLessonType } from "../../utils/lessonType";
import { lessonChecks, validatePublishable } from "../../utils/programPublish";
import { aiDeclaration, withAiDeclaration } from "../../utils/contentLabels";
import { benefitsFromTags, benefitsProblem, cleanBenefit, stripBenefitTags, withBenefits, MAX_BENEFITS, MAX_BENEFIT_CHARS, MIN_BENEFIT_CHARS } from "../../utils/programBenefits";
import { BenefitWaves } from "../programDetail/ProgramAccessPanel";
import { affectedLessonIds, analyzeEdit, describeImpact, hasImpact } from "../../utils/programEditSafety";
import { countAffectedParticipants } from "../../lib/programEditImpact";
import type {
  AuthoredContent,
  AuthoredItem,
  AuthoredModule,
  ContentType,
} from "../../data/authorDashboard";
import type { PracticeType } from "../../data/contentTypes";
import { useSession } from "../../context/SessionContext";
import { contentFilePath, deleteContentFile, isPaidFileRef, uploadContentFile, uploadPaidFile } from "../../lib/storage";
import { notifyNewContent } from "../../lib/content";
import { fetchAuthorStory } from "../../lib/authorStory";
import { categoryLabels } from "../../data/categoryLabels";
import { fetchAuthorDetails } from "../../lib/authorDetails";
import { RISK_TOPICS, riskKeywordWords, unknownRiskTopics } from "../../utils/riskTopics";
import { formatPrice } from "../../utils/price";
import { DEFAULT_SETTINGS } from "../../utils/financeEngine";
import { CONTENT_LIMITS, charCount, descriptionProblem, priceProblem, titleProblem } from "../../utils/contentLimits";
import { COVER_MAX_STORED_BYTES, coverFileProblem, prepareCoverImage } from "../../utils/coverFile";
import { DEFAULT_COVER_FOCUS, coverImageStyle, focusForNewCover, parseCoverFocus, type CoverFocus, type CoverFrameId } from "../../utils/coverFocus";
import CoverFocusPicker, { CoverFramesPreview } from "./CoverFocusPicker";
import { isYoutubeUrl, youtubeId } from "../../utils/youtube";
import { checkYoutubeVideo, UNAVAILABLE_VIDEO_MESSAGE, type VideoAvailability } from "../../utils/youtubeAvailability";
import { usesProfileIntro, withProfileIntro } from "../../utils/introVideoSource";
import { hasAcceptedAuthorAgreement, acceptAuthorAgreement } from "../../lib/consents";
import AuthorAgreementDialog from "./AuthorAgreementDialog";

// Only the types that actually change anything in the Lesson Player —
// "image"/"pdf"/"mixed" still exist in ContentItemType (and the
// content_items.type check constraint) for backward compatibility, but
// the player renders video/audio/image/file blocks purely by which
// fields are attached (videoUrl/audioUrl/imageUrl/fileUrl), not by this
// value, so offering them here just let an author pick a label with no
// visible effect. Trimmed per Sasha's call (2026-08-27) rather than
// removed from the type/schema, since that would need touching the DB
// constraint for no real gain.

// "Спробуйте зараз" — the inline interactive practice attached to a
// lesson (see PracticeSpec in data/contentTypes.ts), independent of the
// item's own type/checklist above (that's read-only instructions; this
// is something the person actually answers in the Lesson Player).
const practiceTypeLabel: Record<PracticeType, string> = {
  text: "Текст",
  scale: "Шкала",
  choice: "Один варіант",
  checkboxes: "Кілька варіантів",
};

const practiceTypeHint: Record<PracticeType, string> = {
  text: "Учасник пише своїми словами",
  scale: "Оцінка стану від меншого до більшого",
  choice: "Можна обрати лише одну відповідь",
  checkboxes: "Можна відзначити кілька відповідей",
};

function fileSizeLabel(bytes: number): string {
  return bytes > 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} МБ`
    : `${Math.max(1, Math.round(bytes / 1024))} КБ`;
}

type EditorTarget = { mode: "create"; type?: ContentType } | { mode: "edit"; id: string } | null;

type Props = {
  target: EditorTarget;
  content: AuthoredContent[];
  /** `stay`: save and keep the editor open (used by «Зберегти й далі» on the video step). */
  onSave: (item: AuthoredContent, opts?: { stay?: boolean }) => Promise<void>;
  onCancel: () => void;
  // Tells the page whether there is unsaved work, and how to save it, so leaving (another tab, «Назад»,
  // closing the page) can ask "save the draft?". `null` once the editor is gone.
  onGuardChange?: (guard: EditorGuard | null) => void;
};

export type EditorGuard = { dirty: boolean; save: () => Promise<boolean>; published: boolean; noun: string; hasTitle: boolean };

const typeLowerLabel: Record<ContentType, string> = { program: "програма", meditation: "медитація", guide: "гайд" };

const typeLabel: Record<ContentType, string> = {
  program: "Програма",
  meditation: "Медитація",
  guide: "Гайд",
};

const emptyModule = (): AuthoredModule => ({
  title: "",
  lessons: 1,
  duration: "",
});

const emptyItem = (): AuthoredItem => ({
  title: "",
  type: "text",
  isRequired: true,
});

export default function AuthorCourseEditor({
  target,
  content,
  onSave,
  onCancel,
  onGuardChange,
}: Props) {
  const editing =
    target?.mode === "edit"
      ? content.find((c) => c.id === target.id) ?? null
      : null;

  // Editing an already-published item is a different action than
  // creating/submitting new content — there's no "save as draft" or
  // "resubmit for review" here, just "save the changes and stay
  // published." Keeping that as its own case avoids the two submit
  // buttons silently downgrading a live course back to draft/review.
  const isPublishedEdit = editing?.status === "published";

  const session = useSession();
  const authorId = session?.profile.id;
  // Storage paths need a stable id before the content row itself is
  // ever saved — reuse the real id when editing, generate one now for
  // a brand-new draft so re-uploads in the same session overwrite
  // rather than orphan previous files.
  const [draftId] = useState(() => editing?.id ?? crypto.randomUUID());

  const [type, setType] = useState<ContentType>(editing?.type ?? (target?.mode === "create" ? target.type : undefined) ?? "program");
  // The type was chosen before opening the editor (create menu) or the item already exists: it cannot be switched here.
  const lockedType = target?.mode === "create" && !!target.type;
  // Every kind of material is filled in step by step; the steps differ (a program has modules, a meditation has audio, a guide a PDF).
  const STEPS = stepLabelsFor(type);
  const STEP_KEYS = stepKeysFor(type);
  const W = wordsFor(type);
  const stepNo = (key: Parameters<typeof stepNumber>[1]) => stepNumber(type, key);
  const [title, setTitle] = useState(editing?.title ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [price, setPrice] = useState(editing?.price ?? "0");
  const [modules, setModules] = useState<AuthoredModule[]>(
    editing?.modules ?? [emptyModule()]
  );
  const [coverUrl, setCoverUrl] = useState<string | null>(editing?.coverUrl ?? null);
  const [coverUploading, setCoverUploading] = useState(false);
  const [coverMakerOpen, setCoverMakerOpen] = useState(false);
  // Programs are filled in one step at a time; an existing program can be opened at any step.
  // Free = the price is exactly "0" (the existing convention). «Paid» keeps the amount empty until the author types
  // one, so an unfinished paid price is never mistaken for free.
  const [priceMode, setPriceMode] = useState<"free" | "paid">(Number(editing?.price ?? 0) > 0 ? "paid" : "free");
  // A saved draft reopens on the step where the author stopped; anything else starts at the first step.
  const [step, setStep] = useState(() => (editing?.status === "draft" && editing.draftStep ? Math.min(Math.max(editing.draftStep, 1), STEPS.length) : 1));
  const [maxStep, setMaxStep] = useState(editing ? STEPS.length : 1);
  const [stepErrors, setStepErrors] = useState<string[]>([]);
  const stepKey = STEP_KEYS[step - 1];
  const [coverFocus, setCoverFocus] = useState<CoverFocus>(parseCoverFocus(editing?.coverFocus) ?? DEFAULT_COVER_FOCUS);
  const [introVideoUrl, setIntroVideoUrl] = useState(editing?.introVideoUrl ?? "");
  const introVideoId = youtubeId(introVideoUrl);
  // The presentation video belongs to the author: the video from her profile («Кілька слів від мене») can serve every
  // program, or she adds a new one for this program only. Choosing the profile video copies its link into the program.
  const [profileVideo, setProfileVideo] = useState<{ loading: boolean; url: string | null; notYoutube: boolean }>({ loading: true, url: null, notYoutube: false });
  const [videoChoice, setVideoChoice] = useState<"profile" | "own" | null>(null);
  const ownVideoRef = useRef(editing?.introVideoUrl ?? "");
  // «Use the video from my profile» is remembered (reserved tag) so the program keeps following the profile video.
  const [fromProfile, setFromProfile] = useState(() => usesProfileIntro(editing?.tags));
  const [profileSynced, setProfileSynced] = useState(false);
  const [linkTouched, setLinkTouched] = useState(false);
  const [videoCheck, setVideoCheck] = useState<{ id: string; status: VideoAvailability } | null>(null);
  useEffect(() => {
    if (!authorId) { setProfileVideo({ loading: false, url: null, notYoutube: false }); return; }
    let alive = true;
    fetchAuthorStory(authorId)
      .then((st) => {
        if (!alive) return;
        const link = st.media?.kind === "video" ? st.media.url.trim() : "";
        setProfileVideo({ loading: false, url: link && isYoutubeUrl(link) ? link : null, notYoutube: !!link && !isYoutubeUrl(link) });
      })
      .catch(() => { if (alive) setProfileVideo({ loading: false, url: null, notYoutube: false }); });
    return () => { alive = false; };
  }, [authorId]);
  const profileUrl = profileVideo.url;
  const videoMode: "profile" | "own" | null =
    videoChoice ?? (introVideoUrl.trim() ? ((fromProfile && (profileVideo.loading || profileUrl)) || (profileUrl && introVideoUrl.trim() === profileUrl) ? "profile" : "own") : !profileVideo.loading && !profileUrl ? "own" : null);
  // The program follows the author's current profile video: if it changed since the program was saved, the link is refreshed.
  useEffect(() => {
    if (profileVideo.loading || !profileUrl || !fromProfile) return;
    if (introVideoUrl.trim() !== profileUrl) { setIntroVideoUrl(profileUrl); setProfileSynced(true); }
  }, [profileVideo.loading, profileUrl, fromProfile]); // eslint-disable-line react-hooks/exhaustive-deps
  // Is the video viewable? (private / removed / embed-disabled videos are caught before the program goes further)
  useEffect(() => {
    if (!introVideoId) { setVideoCheck(null); return; }
    const ctl = new AbortController();
    const t = window.setTimeout(() => {
      checkYoutubeVideo(introVideoId, ctl.signal).then((status) => { if (!ctl.signal.aborted) setVideoCheck({ id: introVideoId, status }); });
    }, 500);
    return () => { window.clearTimeout(t); ctl.abort(); };
  }, [introVideoId]);
  const videoUnavailable = !!introVideoId && videoCheck?.id === introVideoId && videoCheck.status === "unavailable";
  const chooseVideo = (m: "profile" | "own") => {
    if (m === videoMode) return;
    setFromProfile(m === "profile" && !!profileUrl);
    if (m === "profile" && profileUrl) {
      if (videoMode === "own") ownVideoRef.current = introVideoUrl;
      setIntroVideoUrl(profileUrl);
    } else if (m === "own") {
      setIntroVideoUrl(ownVideoRef.current === profileUrl ? "" : ownVideoRef.current);
    }
    setVideoChoice(m);
    setStepErrors([]);
  };
  // Step 6 is walked through in small parts (arrows), each part is one idea: which video, what to say, how to upload, the link.
  const VIDEO_PARTS = ["Яке відео показувати?", "Що має бути у відео?", "Як додати відео?", "Посилання на відео"] as const;
  const [videoPart, setVideoPart] = useState(1);
  const [videoReached, setVideoReached] = useState(1);
  const videoParts = videoMode === "own" ? 4 : videoMode === "profile" ? 2 : 1;
  const part = Math.min(videoPart, videoParts);
  const reachedMax = introVideoUrl.trim() ? videoParts : Math.min(videoReached, videoParts);
  const goPart = (n: number) => { setVideoPart(n); setVideoReached((r) => Math.max(r, n)); };
  // After the author moves between parts, the pressed button disappears: keyboard / screen-reader focus goes to the new part's heading.
  const focusNextPart = useRef(false);
  const goPartByUser = (n: number) => { focusNextPart.current = n !== part; goPart(n); };
  useEffect(() => {
    if (!focusNextPart.current) return;
    focusNextPart.current = false;
    document.getElementById(["video-source", "video-content", "video-how", "video-link-label"][part - 1])?.focus();
  }, [part]);
  useEffect(() => { if (stepKey === "video" && stepErrors.length > 0) goPart(videoMode === "own" ? 4 : 1); }, [stepErrors]); // eslint-disable-line react-hooks/exhaustive-deps
  // The «not a YouTube link» hint appears once the author leaves the field (or tries to continue), not on the first typed letter.
  const showBadLink = introVideoUrl.trim() !== "" && !isYoutubeUrl(introVideoUrl) && (linkTouched || stepErrors.length > 0);
  const [navNote, setNavNote] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const videoNav = (
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[#ece9fe] pt-4">
      {navNote && <p role="alert" className="w-full text-[13px] text-rose-700">{navNote}</p>}
      {part > 1 ? (
        <button type="button" onClick={() => goPartByUser(part - 1)} className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-[#d9d4f5] bg-white px-4 text-[14px] font-semibold text-[#4a2fd0] transition hover:bg-[#f3efff] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5b3df5]/50">
          <span aria-hidden="true">←</span> {VIDEO_PARTS[part - 2]}
        </button>
      ) : <span />}
      {part < videoParts ? (
        <button type="button" onClick={() => goPartByUser(part + 1)} disabled={part === 1 && !videoMode} className={`inline-flex items-center gap-2 text-white transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5b3df5]/50 disabled:opacity-50 ${part <= 2 ? "ml-auto min-h-[44px] rounded-xl bg-gradient-to-r from-[#5b3df5] to-[#8a63f7] px-6 text-[14px] font-semibold shadow-[0_12px_26px_-14px_rgba(91,61,245,0.9)] hover:brightness-110" : "min-h-[44px] rounded-xl bg-[#5b3df5] px-5 text-[14px] font-semibold hover:bg-[#4a2fd0]"}`}>
          Далі: {VIDEO_PARTS[part]} <span aria-hidden="true">→</span>
        </button>
      ) : part === 1 && !videoMode ? (
        <span className="text-[13px] text-black/60">Оберіть один із двох варіантів, щоб продовжити.</span>
      ) : (
        // the last part: the same check and move as the main «Далі», right here at the end of the content
        <button type="button" onClick={() => void saveAndNext()} disabled={saving} className="ml-auto inline-flex min-h-[44px] items-center gap-2 disabled:opacity-60 rounded-xl bg-gradient-to-r from-[#5b3df5] to-[#8a63f7] px-6 text-[14px] font-semibold text-white shadow-[0_12px_28px_-14px_rgba(91,61,245,0.9)] transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5b3df5]/50">
          {saving ? "Зберігаємо…" : <>Зберегти й далі: {PROGRAM_STEPS[6]} <span aria-hidden="true">→</span></>}
        </button>
      )}
    </div>
  );
  const [mainFileUrl, setMainFileUrl] = useState<string | null>(
    editing?.mainFileUrl ?? null
  );
  const [mainFileUploading, setMainFileUploading] = useState(false);
  // Guide-only fields (stored in content_guide_meta / _body)
  const [guideType, setGuideType] = useState<GuideType>(editing?.guide?.guideType ?? "practical");
  const [guidePages, setGuidePages] = useState(editing?.guide?.pages ? String(editing.guide.pages) : "");
  const [guideReadMinutes, setGuideReadMinutes] = useState(editing?.guide?.readMinutes ? String(editing.guide.readMinutes) : "");
  const [guideRelevantText, setGuideRelevantText] = useState((editing?.guide?.relevantIf ?? []).join("\n"));
  const [guideOutcomesText, setGuideOutcomesText] = useState((editing?.guide?.outcomes ?? []).join("\n"));
  // Meditation-only fields (stored in content_meditation_meta / _body)
  const [durationAuto, setDurationAuto] = useState(false);
  const [durationMinutes, setDurationMinutes] = useState<string>(editing?.durationMinutes ? String(editing.durationMinutes) : "");
  // The «з голосом / у тиші» choice was removed from the form: new recordings count as guided (text of the practice
  // is required); older ones keep the format they were saved with.
  const [medFormat] = useState<MeditationFormat>(editing?.meditation?.format ?? "guided");
  const [hasEmbeddedMusic, setHasEmbeddedMusic] = useState(editing?.meditation?.hasEmbeddedMusic ?? false);
  const [offlineDownload, setOfflineDownload] = useState(editing?.meditation?.offlineDownloadEnabled ?? false);
  const [whenItems, setWhenItems] = useState<string[]>(() => {
    const saved = editing?.meditation?.whenToUse ?? [];
    return saved.length >= WHEN_MIN_ITEMS ? saved : [...saved, ...Array(WHEN_MIN_ITEMS - saved.length).fill("")];
  });
  const [transcriptText, setTranscriptText] = useState(editing?.meditation?.transcript?.text ?? "");
    const [error, setError] = useState<string | null>(null);
  // What still blocks sending to moderation / publishing (utils/programPublish.ts).
  const [publishProblems, setPublishProblems] = useState<string[]>([]);
  // `tags` holds everything except the benefits; the benefits live only in `benefitFields` (one source of truth).
  const [tags, setTags] = useState<string[]>(() => stripBenefitTags(editing?.tags));
  // «Що ви отримаєте»: the raw text of the three fields; `allTags` below is `tags` + the cleaned benefits (utils/programBenefits.ts)
  const [benefitFields, setBenefitFields] = useState<string[]>(() => {
    const b = benefitsFromTags(editing?.tags);
    return Array.from({ length: MAX_BENEFITS }, (_, i) => b[i] ?? "");
  });
  const [riskTopics, setRiskTopics] = useState<string[]>(editing?.riskTopics ?? []);
  // «Фахівець» = education documents reviewed by Sensoria; null until known.
  const [isSpecialist, setIsSpecialist] = useState<boolean | null>(null);
  useEffect(() => {
    const id = session?.profile?.id;
    if (!id) return;
    fetchAuthorDetails(id).then((d) => setIsSpecialist(d.educationVerified)).catch(() => setIsSpecialist(null));
  }, [session?.profile?.id]);
  // Lesson (content_items) editor state — collapsed by default (key
  // `${moduleIndex}:${itemIndex}`) so a module with several lessons
  // doesn't turn into one giant wall of fields; `itemUploading` tracks
  // which specific lesson+field is mid-upload (`${mi}:${ii}:audio` or
  // `:file`) so only that lesson's button shows "Завантаження…".
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});
  const [itemUploading, setItemUploading] = useState<string | null>(null);
  // Upload errors shown right at the material that failed, keyed "module:lesson:kind".
  const [itemErrors, setItemErrors] = useState<Record<string, string>>({});

  // Tags toggle through one helper; `limit` caps categories (programs: 1-3, the first is the primary one).
  const toggleTag = (tag: string, limit?: number) => setTags((prev) => toggleCategoryTag(prev, tag, limit));
  const allTags = withProfileIntro(withBenefits(tags, benefitFields), fromProfile);
  const previewBenefits = benefitsFromTags(allTags);
  // Which benefit field was just shortened because the pasted text was too long.
  const [benefitCut, setBenefitCut] = useState<number | null>(null);
  const setBenefit = (i: number, raw: string) => {
    let v = raw.replace(/\s+/g, " ").replace(/^\s+/, "");
    const chars = [...v];
    const cut = chars.length > MAX_BENEFIT_CHARS;
    if (cut) v = chars.slice(0, MAX_BENEFIT_CHARS).join("");
    setBenefitCut(cut ? i : null);
    const next = benefitFields.map((x, j) => (j === i ? v : x));
    setBenefitFields(next);
    // Follow the field being typed in: its tile is the (compacted, de-duplicated) position among the filled fields.
    const seen: string[] = [];
    let pos = -1;
    next.forEach((x, j) => {
      const c = cleanBenefit(x).toLowerCase();
      if (!c || seen.includes(c)) return;
      seen.push(c);
      if (j === i) pos = seen.length - 1;
    });
    if (pos >= 0) setPreviewIndex(pos);
    // The error goes away once all three benefits are filled in, not on any keystroke.
    if (!benefitsProblem(benefitsFromTags(withBenefits([], next)))) setStepErrors([]);
  };
  // When the author leaves the three fields: tidy the texts and move filled ones up (what gets saved is what they see).
  const tidyBenefits = () => {
    setBenefitCut(null);
    const filled = benefitFields.map(cleanBenefit).filter(Boolean);
    setBenefitFields(Array.from({ length: MAX_BENEFITS }, (_, i) => filled[i] ?? ""));
  };
  const isDuplicateBenefit = (i: number) => {
    const v = cleanBenefit(benefitFields[i]).toLowerCase();
    return !!v && benefitFields.slice(0, i).some((x) => cleanBenefit(x).toLowerCase() === v);
  };
  // The preview shows one tile at a time; it follows the field being edited and can be flipped with the arrows.
  const [previewIndex, setPreviewIndex] = useState(0);
  const shownIndex = Math.min(previewIndex, Math.max(0, previewBenefits.length - 1));
  const showBenefitOf = (value: string) => {
    const k = previewBenefits.findIndex((b) => b.toLowerCase() === cleanBenefit(value).toLowerCase());
    if (k >= 0) setPreviewIndex(k);
  };
  const focusInvalid = () => window.setTimeout(() => document.querySelector<HTMLElement>('[aria-invalid="true"],[data-focus-invalid="true"]')?.focus(), 60);
  const MAX_CATEGORIES = MAX_PROGRAM_CATEGORIES;
  const catCount = categoryTags(tags).length;
  const [limitNote, setLimitNote] = useState("");
  const pickCategory = (id: string) => {
    if (!tags.includes(id) && catCount >= MAX_CATEGORIES) {
      setLimitNote(`Можна обрати не більше ${MAX_CATEGORIES} категорій. Зніміть одну, щоб обрати іншу.`);
      return;
    }
    setLimitNote("");
    toggleTag(id, MAX_CATEGORIES);
  };
  const makePrimary = (id: string) => setTags((prev) => makePrimaryCategory(prev, id));

  // A confirmation window instead of the browser's window.confirm.
  const [confirmReq, setConfirmReq] = useState<{ title: string; lines: string[]; confirm: string; resolve: (ok: boolean) => void } | null>(null);
  const askConfirm = (title: string, lines: string[], confirm: string) =>
    new Promise<boolean>((resolve) => setConfirmReq({ title, lines, confirm, resolve }));
  // The last paid price: switching to «Безкоштовно» and back must not lose it.
  const paidPriceRef = useRef(Number(editing?.price) > 0 ? String(editing?.price) : "");

  // A cover made in the editor already had its four frames checked, so the focus step is only offered for a picture
  // the author uploads herself (and stays folded until she asks for it).
  const [, setCoverFromEditor] = useState(false);
  const [coverFocusOpen, setCoverFocusOpen] = useState(false);
  // Old cover files that are no longer used are deleted only AFTER the program is saved (an earlier saved version may still
  // point at them), and never when a new file took the same path.
  const staleCoverPaths = useRef<Set<string>>(new Set());
  const markStale = (url: string | null | undefined) => { const p = contentFilePath(url); if (p) staleCoverPaths.current.add(p); };
  const sweepStaleCovers = (currentCover: string | null, focus: CoverFocus) => {
    const live = new Set<string>();
    [currentCover, ...Object.values(focus.frames ?? {}).map((f) => f?.url)].forEach((u) => { const p = contentFilePath(u); if (p) live.add(p); });
    staleCoverPaths.current.forEach((p) => { if (!live.has(p)) void deleteContentFile(p).catch(() => undefined); });
    staleCoverPaths.current.clear();
  };
  // Every change of the frames goes through here so a removed or replaced own photo is remembered for the sweep.
  const changeCoverFocus = (next: CoverFocus) => {
    Object.entries(coverFocus.frames ?? {}).forEach(([id, pt]) => {
      if (pt?.url && next.frames?.[id as CoverFrameId]?.url !== pt.url) markStale(pt.url);
    });
    setCoverFocus(next);
  };
  const [coverWarning, setCoverWarning] = useState<string | null>(null);

  const handleCoverUpload = async (file: File, fromEditor = false) => {
    if (!authorId) {
      setError("Не вдалося визначити автора — увійдіть ще раз.");
      return;
    }
    const bad = fromEditor ? null : coverFileProblem(file);
    if (bad) { setError(bad); return; }
    setCoverUploading(true);
    setError(null);
    setCoverWarning(null);
    try {
      let toUpload = file;
      let warning: string | null = null;
      if (!fromEditor) {
        try {
          const prepared = await prepareCoverImage(file);
          toUpload = prepared.file;
          warning = prepared.warning;
        } catch {
          setError("Не вдалося прочитати зображення. Спробуйте інший файл.");
          return;
        }
        if (toUpload.size > COVER_MAX_STORED_BYTES) { setError("Навіть після стиснення файл більший за 5 МБ. Оберіть простіше зображення."); return; }
      }
      const url = await uploadContentFile(authorId, toUpload, `${draftId}/cover`);
      // The file keeps the same path when it is replaced, so the link must change or the browser shows the old picture.
      markStale(coverUrl);
      setCoverUrl(`${url}${url.includes("?") ? "&" : "?"}v=${Date.now()}`);
      setCoverFromEditor(fromEditor);
      setCoverFocusOpen(false);
      setCoverWarning(warning);
      if (!fromEditor) setCoverFocus((f) => focusForNewCover(f)); // positions set for the old picture do not fit the new one
    } catch (e) {
      const text = e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : "";
      setError(text ? `Не вдалося завантажити обкладинку: ${text}` : "Не вдалося завантажити обкладинку.");
    } finally {
      setCoverUploading(false);
    }
  };

  // A separate photo for one cover frame (catalog card, 16:9, cart, 1:1): its own file, its link is kept next to the frame's position.
  const handleFrameUpload = async (frame: CoverFrameId, file: File): Promise<{ url: string; warning?: string } | { error: string }> => {
    if (!authorId) return { error: "Не вдалося визначити автора — увійдіть ще раз." };
    const bad = coverFileProblem(file);
    if (bad) return { error: bad };
    setError(null);
    try {
      let prepared;
      try { prepared = await prepareCoverImage(file); } catch { return { error: "Не вдалося прочитати зображення. Спробуйте інший файл." }; }
      if (prepared.file.size > COVER_MAX_STORED_BYTES) return { error: "Навіть після стиснення файл більший за 5 МБ. Оберіть простіше зображення." };
      const url = await uploadContentFile(authorId, prepared.file, `${draftId}/cover-${frame}`);
      return { url: `${url}${url.includes("?") ? "&" : "?"}v=${Date.now()}`, warning: prepared.warning ?? undefined };
    } catch (e) {
      const text = e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : "";
      return { error: text ? `Не вдалося завантажити фото: ${text}` : "Не вдалося завантажити фото. Спробуйте ще раз." };
    }
  };

  const handleMainFileUpload = async (file: File) => {
    if (!authorId) {
      setError("Не вдалося визначити автора — увійдіть ще раз.");
      return;
    }
    if (type === "meditation" && file.size > MEDITATION_MAX_AUDIO_BYTES) {
      setError(`Файл завеликий: до ${Math.round(MEDITATION_MAX_AUDIO_BYTES / 1024 / 1024)} МБ. Стисніть запис (mp3, 128 кбіт/с) і завантажте ще раз.`);
      return;
    }
    setMainFileUploading(true);
    setError(null);
    try {
      // A paid guide/meditation keeps its file in the private bucket (only buyers get a link); a free one stays public.
      const paid = type !== "program" && (Number(price) || 0) > 0;
      const url = paid ? await uploadPaidFile(authorId, draftId, file, "main") : await uploadContentFile(authorId, file, `${draftId}/main`);
      setMainFileUrl(url);
      if (type === "meditation") {
        // The real length of the recording, so a wrong typed number can't reach the catalog and the player.
        const minutes = await audioMinutes(file);
        if (minutes) {
          if (minutes > MEDITATION_MAX_MINUTES) { setError(`Запис довший за ${MEDITATION_MAX_MINUTES} хвилин. Скоротіть його або розділіть на кілька медитацій.`); setMainFileUrl(""); return; }
          setDurationMinutes(String(Math.max(1, Math.round(minutes)))); setDurationAuto(true);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не вдалося завантажити файл.");
    } finally {
      setMainFileUploading(false);
    }
  };

  const updateModule = (index: number, patch: Partial<AuthoredModule>) => {
    setModules((prev) =>
      prev.map((m, i) => (i === index ? { ...m, ...patch } : m))
    );
  };

  const moveModule = (index: number, dir: -1 | 1) => {
    setExpandedItems({});
    setLessonIdx({});
    setModules((prev) => {
      const next = [...prev];
      const swapWith = index + dir;
      if (swapWith < 0 || swapWith >= next.length) return prev;
      [next[index], next[swapWith]] = [next[swapWith], next[index]];
      return next;
    });
  };

  // LESSONS (content_items) — one module can hold several individually
  // editable lessons now, not just a bare count. Mirrors the
  // update/move pattern above, one level deeper.
  const updateItem = (mi: number, ii: number, patch: Partial<AuthoredItem>) => {
    setModules((prev) =>
      prev.map((m, i) =>
        i !== mi
          ? m
          : {
              ...m,
              items: (m.items ?? []).map((it, j) => {
                if (j !== ii) return it;
                const next = { ...it, ...patch };
                // The lesson kind follows what is attached, so authors never pick it by hand.
                next.type = deriveLessonType(next, checklistItems(next.checklist).length > 0);
                return next;
              }),
            }
      )
    );
  };

  const addItem = (mi: number) => {
    if (lessonLimitReached(modules, mi)) return;
    const newIndex = modules[mi]?.items?.length ?? 0;
    setModules((prev) =>
      prev.map((m, i) => (i === mi ? { ...m, items: [...(m.items ?? []), emptyItem()] } : m))
    );
    setExpandedItems((prev) => ({ ...prev, [`${mi}:${newIndex}`]: true }));
    setLessonIdx((prev) => ({ ...prev, [mi]: newIndex }));
    setTimeout(() => document.querySelector<HTMLInputElement>(`[data-lesson-title="${mi}:${newIndex}"]`)?.focus(), 50);
  };

  const removeItem = (mi: number, ii: number) => {
    setExpandedItems({});
    setLessonIdx((prev) => ({ ...prev, [mi]: Math.max(0, ii - 1) }));
    setModules((prev) =>
      prev.map((m, i) => (i === mi ? { ...m, items: (m.items ?? []).filter((_, j) => j !== ii) } : m))
    );
  };

  const moveItem = (mi: number, ii: number, dir: -1 | 1) => {
    setExpandedItems({});
    setModules((prev) =>
      prev.map((m, i) => {
        if (i !== mi) return m;
        const items = [...(m.items ?? [])];
        const swapWith = ii + dir;
        if (swapWith < 0 || swapWith >= items.length) return m;
        [items[ii], items[swapWith]] = [items[swapWith], items[ii]];
        return { ...m, items };
      })
    );
  };


  const handleItemAudioUpload = async (mi: number, ii: number, file: File) => {
    const key = `${mi}:${ii}:audio`;
    if (!authorId) {
      setItemErrors((p) => ({ ...p, [key]: "Не вдалося визначити автора — увійдіть ще раз." }));
      return;
    }
    setItemUploading(key);
    setItemErrors((p) => { const n = { ...p }; delete n[key]; return n; });
    try {
      const url = await uploadContentFile(authorId, file, `${draftId}/module-${mi}-item-${ii}-audio`);
      const minutes = await audioMinutes(file);
      updateItem(mi, ii, minutes ? { audioUrl: url, durationMinutes: minutes } : { audioUrl: url });
    } catch (e) {
      setItemErrors((p) => ({ ...p, [key]: e instanceof Error ? e.message : "Не вдалося завантажити аудіо." }));
    } finally {
      setItemUploading((cur) => (cur === key ? null : cur));
    }
  };

  const handleItemImageUpload = async (mi: number, ii: number, file: File) => {
    const key = `${mi}:${ii}:image`;
    if (!authorId) {
      setItemErrors((p) => ({ ...p, [key]: "Не вдалося визначити автора — увійдіть ще раз." }));
      return;
    }
    setItemUploading(key);
    setItemErrors((p) => { const n = { ...p }; delete n[key]; return n; });
    try {
      const url = await uploadContentFile(authorId, file, `${draftId}/module-${mi}-item-${ii}-image`);
      updateItem(mi, ii, { imageUrl: url });
    } catch (e) {
      setItemErrors((p) => ({ ...p, [key]: e instanceof Error ? e.message : "Не вдалося завантажити зображення." }));
    } finally {
      setItemUploading((cur) => (cur === key ? null : cur));
    }
  };

  const handleItemFileUpload = async (mi: number, ii: number, file: File) => {
    const key = `${mi}:${ii}:file`;
    if (!authorId) {
      setItemErrors((p) => ({ ...p, [key]: "Не вдалося визначити автора — увійдіть ще раз." }));
      return;
    }
    setItemUploading(key);
    setItemErrors((p) => { const n = { ...p }; delete n[key]; return n; });
    try {
      const url = await uploadContentFile(authorId, file, `${draftId}/module-${mi}-item-${ii}-file`);
      updateItem(mi, ii, { fileUrl: url, fileName: file.name, fileSizeLabel: fileSizeLabel(file.size) });
    } catch (e) {
      setItemErrors((p) => ({ ...p, [key]: e instanceof Error ? e.message : "Не вдалося завантажити файл." }));
    } finally {
      setItemUploading((cur) => (cur === key ? null : cur));
    }
  };

  // What only a guide or only a meditation has (saved with the material, and also used by the live «what is missing» list).
  const typeFields = (): Partial<AuthoredContent> => ({
    ...(type === "guide"
      ? {
          guide: {
            guideType,
            pages: Math.max(0, Math.round(Number(guidePages)) || 0),
            readMinutes: Math.max(0, Math.round(Number(guideReadMinutes)) || 0),
            relevantIf: guideRelevantText.split("\n").map((l) => l.trim()).filter(Boolean),
            outcomes: guideOutcomesText.split("\n").map((l) => l.trim()).filter(Boolean),
            source: editing?.guide?.source,
          },
        }
      : {}),
    ...(type === "meditation"
      ? {
          durationMinutes: Math.round(Number(durationMinutes)) > 0 ? Math.round(Number(durationMinutes)) : undefined,
          meditation: {
            format: medFormat,
            hasEmbeddedMusic,
            offlineDownloadEnabled: offlineDownload,
            whenToUse: whenItems.map((l) => l.trim()).filter(Boolean),
            // optional; the author wrote it, so a real text (20+ characters) is shown to participants as it is
            transcript: transcriptText.trim().length >= 20
              ? {
                  text: transcriptText.trim(),
                  status: "confirmed" as const,
                  confirmedBy: editing?.meditation?.transcript?.text === transcriptText.trim() ? editing?.meditation?.transcript?.confirmedBy ?? session?.profile?.name ?? "Автор" : session?.profile?.name ?? "Автор",
                  confirmedAt: editing?.meditation?.transcript?.text === transcriptText.trim() ? editing?.meditation?.transcript?.confirmedAt ?? new Date().toISOString() : new Date().toISOString(),
                }
              : undefined,
          },
        }
      : {}),
  });

  const [agreementOk, setAgreementOk] = useState(false);
  const [agreementFor, setAgreementFor] = useState<AuthoredContent["status"] | null>(null);

  const handleSave = async (nextStatus: AuthoredContent["status"], opts?: { stay?: boolean; draftStep?: number }): Promise<boolean> => {
    if (!title.trim()) {
      setError("Вкажіть назву — без неї нічого зберегти.");
      return false;
    }
    setError(null);
    setPublishProblems([]);
    if (nextStatus !== "draft") {
      const pp = priceModeProblem(priceMode, price, W);
      if (pp) {
        setError(pp);
        return false;
      }
    }

    const item: AuthoredContent = {
      id: draftId,
      type,
      title: title.trim(),
      description: description.trim() || undefined,
      status: nextStatus,
      price,
      participants: editing?.participants ?? 0,
      revenue: editing?.revenue ?? 0,
      rating: editing?.rating ?? null,
      reviewsCount: editing?.reviewsCount ?? 0,
      createdAt: editing?.createdAt ?? new Date().toISOString().slice(0, 10),
      updatedAt: new Date().toISOString().slice(0, 10),
      coverUrl: coverUrl ?? undefined,
      coverFocus: coverUrl ? coverFocus : undefined,
      draftStep: opts?.draftStep ?? step,
      introVideoUrl: introVideoUrl.trim() || undefined,
      mainFileUrl: mainFileUrl ?? undefined,
      slug: editing?.slug,
      ...typeFields(),
      tags: type === "program" ? orderTags(allTags) : allTags,
      riskTopics,
      ...(type === "program"
        ? {
            // A module that was already saved (has an id) or already has
            // lessons is NEVER dropped just because its title field is empty:
            // saving drops modules that are not in the list, which would
            // silently delete its lessons and participants' history. Only a
            // brand-new, empty, unnamed module is discarded.
            modules: modules
              .filter((m) => m.title.trim() || m.id || (m.items?.length ?? 0) > 0)
              .map((m) => (m.title.trim() ? m : { ...m, title: "Без назви" })),
          }
        : {}),
    };

    // Draft: save as is. Moderation / publish: everything must be in place.
    if (nextStatus !== "draft") {
      // Checked on the modules as typed (an unnamed saved module is kept
      // above under "Без назви" so nothing is deleted, but it must be named
      // before it can go live).
      const problems = validatePublishable({
        ...item,
        modules: type === "program" ? modules.filter((m) => m.title.trim() || m.id || (m.items?.length ?? 0) > 0) : item.modules,
      }, isSpecialist === null ? undefined : { isSpecialist });
      if (problems.length > 0) {
        setPublishProblems(problems.map((p) => p.message));
        setError("Перед тим як надіслати або опублікувати, виправте:");
        return false;
      }
    }

    // First publish / moderation requires the accepted author agreement.
    if (nextStatus !== "draft" && !agreementOk) {
      try {
        if (await hasAcceptedAuthorAgreement()) {
          setAgreementOk(true);
        } else {
          setAgreementFor(nextStatus);
          return false;
        }
      } catch {
        setError("Не вдалося перевірити згоду з договором. Спробуйте ще раз.");
        return false;
      }
    }

    // A live program: removing a lesson, changing its type or flipping
    // required/optional affects people who already have progress.
    if (editing && (editing.status === "published" || editing.status === "review")) {
      const impact = analyzeEdit(editing, item);
      if (hasImpact(impact)) {
        const people = await countAffectedParticipants(item.id, affectedLessonIds(impact));
        const lines = describeImpact(impact, people ?? 0);
        const note = people === null ? ["Кількість учасників з прогресом визначити не вдалося."] : [];
        if (!(await askConfirm("Зберегти ці зміни?", [...lines, ...note], "Зберегти"))) return false;
      }
    }

    if (type === "program" && editing?.status === "published" && nextStatus === "published") {
      const c = { from: Number(editing.price) || 0, to: Number(price || 0) };
      if (c.from !== c.to && !(await askConfirm("Зберегти нову ціну?", priceChangeLines(c), "Зберегти ціну"))) return false;
    }

    setSaving(true);
    try {
      await onSave(item, opts?.stay ? { stay: true } : undefined);
      sweepStaleCovers(coverUrl, coverFocus);
      if (opts?.stay) initialSnapshot.current = snapshot; // saved: the unsaved-work guard starts from here
      // A genuine first-time publish only — not a re-save of content
      // that was already live (isPublishedEdit), and not the
      // archive/republish toggle in AuthorContentList.tsx, which is a
      // different action entirely.
      if (nextStatus === "published" && !isPublishedEdit) {
        notifyNewContent(item.id);
      }
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не вдалося зберегти — спробуйте ще раз.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  // Unsaved-work guard: compare what is typed now with what the editor opened with.
  const snapshot = JSON.stringify([type, title, description, price, allTags, riskTopics, coverUrl, coverFocus, introVideoUrl, mainFileUrl, modules, guidePages, guideReadMinutes, guideRelevantText, guideOutcomesText, durationMinutes, whenItems, transcriptText, !isPublishedEdit ? step : 0, priceMode]);
  const initialSnapshot = useRef(snapshot);
  const dirty = snapshot !== initialSnapshot.current;
  const saveRef = useRef(handleSave);
  saveRef.current = handleSave;
  const saveForGuard = useCallback(() => saveRef.current(isPublishedEdit ? "published" : "draft"), [isPublishedEdit]);
  useEffect(() => {
    // A NEW item always asks before leaving (even when nothing is typed yet); an existing one only when changed.
    onGuardChange?.({ dirty: dirty || !editing, save: saveForGuard, published: isPublishedEdit, noun: typeLowerLabel[type], hasTitle: title.trim().length > 0 });
  }, [dirty, editing, title, saveForGuard, isPublishedEdit, type, onGuardChange]);
  useEffect(() => () => onGuardChange?.(null), [onGuardChange]);

  // The author's own published meditations / guides that can be given to buyers of this program.
  const giftCandidates = content.filter((c) => (c.type === "meditation" || c.type === "guide") && c.status === "published" && c.id !== draftId);
  // Which module's "add a gift material" picker is open.
  const [giftPickerFor, setGiftPickerFor] = useState<number | null>(null);
  const [modIdx, setModIdx] = useState(0);
  const [lessonIdx, setLessonIdx] = useState<Record<number, number>>({});
  const curMod = Math.min(modIdx, Math.max(0, modules.length - 1));
  const addGiftLesson = (mi: number, c: AuthoredContent) => {
    if (lessonLimitReached(modules, mi)) return;
    const newItem: AuthoredItem = { title: c.title, type: "mixed", isRequired: false, materialId: c.id, durationMinutes: c.durationMinutes };
    setModules((prev) => prev.map((m, i) => (i === mi ? { ...m, items: [...(m.items ?? []), newItem] } : m)));
    setLessonIdx((prev) => ({ ...prev, [mi]: modules[mi]?.items?.length ?? 0 }));
    setGiftPickerFor(null);
  };

  const stepProblems = (n: number): string[] => {
    const out: string[] = [];
    const key = STEP_KEYS[n - 1];
    if (key === "title") {
      const t = titleProblem(title); if (t) out.push(t);
      const d = descriptionProblem(description); if (d) out.push(d);
      if (type === "meditation") out.push(...meditationWhenProblems(whenItems));
    } else if (key === "price") {
      const p = priceModeProblem(priceMode, price, W); if (p) out.push(p);
    } else if (key === "categories") {
      const c = categoriesProblem(tags); if (c) out.push(c);
    } else if (key === "benefits") {
      { const bp = benefitsProblem(benefitsFromTags(allTags)); if (bp) out.push(bp); }
    } else if (key === "video") {
      if (!introVideoUrl.trim()) out.push("Оберіть відео-презентацію: відео з вашого профілю або нове посилання на YouTube.");
      else if (!isYoutubeUrl(introVideoUrl)) out.push("Посилання має бути з YouTube (youtu.be/… або youtube.com/watch?v=…).");
      else if (videoUnavailable) out.push(UNAVAILABLE_VIDEO_MESSAGE);
    } else if (key === "ai") {
      if (!aiDeclaration(tags)) out.push("Оберіть один варіант: ШІ використовувався чи ні.");
    } else if (key === "risk") {
      if (isSpecialist !== true && riskTopics.length > 0) out.push("Зніміть позначки тем ризику: без статусу «Фахівець» їх не можна публікувати.");
    } else if (key === "audio") {
      out.push(...meditationAudioProblems({ fileUrl: mainFileUrl, durationMinutes, price: Number(price) || 0 }));
    } else if (key === "practice") {
      out.push(...meditationTranscriptProblems(transcriptText));
    } else if (key === "file") {
      out.push(...guideFileProblems({ fileUrl: mainFileUrl, pages: guidePages, readMinutes: guideReadMinutes, price: Number(price) || 0, structured: editing?.guide?.source === "sensoria_structured" }));
    }
    return out;
  };
  // Editing a LIVE program: what changes when the price changes (existing buyers keep access, new buyers pay the new price).
  const livePriceChange = editing && editing.status === "published" && Number(editing.price) !== Number(price || 0)
    ? { from: Number(editing.price) || 0, to: Number(price || 0) }
    : null;
  const priceChangeLines = (c: { from: number; to: number }) => [
    c.from === 0 ? W.toPaid : c.to === 0 ? W.toFree : `Ціна зміниться з ${formatPrice(String(c.from))} на ${formatPrice(String(c.to))}.`,
    `Нова ціна діятиме для нових покупців. Ті, хто вже купив ${W.acc}, зберігають доступ і нічого не доплачують і не отримують назад.`,
    "У кошику ціна завжди береться актуальна.",
  ];
  const choosePriceMode = (value: "free" | "paid") => {
    if (value === priceMode) return;
    if (value === "free") paidPriceRef.current = price;
    setPriceMode(value);
    setPrice(value === "free" ? "0" : paidPriceRef.current);
    setStepErrors([]);
  };
  const goTo = (n: number) => {
    setStepErrors([]);
    setError(null);
    setStep(n);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  // Jumping forward checks every step on the way; it stops at the first one that is not filled in.
  const jumpTo = (n: number) => {
    if (n <= step) { if (n < step) goTo(n); return; }
    for (let k = step; k < n; k += 1) {
      const problems = stepProblems(k);
      if (problems.length > 0) {
        if (k !== step) goTo(k);
        setStepErrors(problems);
        focusInvalid();
        return;
      }
    }
    goTo(n);
  };
  // «Зберегти й далі» on the video step: the same check as «Далі», plus the draft is saved on the server first (editor stays open).
  const saveAndNext = async () => {
    setNavNote(null);
    const problems = stepProblems(step);
    if (problems.length > 0) { setStepErrors(problems); focusInvalid(); return; }
    if (!editing || editing.status === "draft") {
      const ok = await handleSave("draft", { stay: true, draftStep: Math.min(STEPS.length, step + 1) });
      if (!ok) { setNavNote("Не вдалося зберегти чернетку. Перевірте з'єднання й спробуйте ще раз."); return; }
    }
    goNext();
  };
  const goNext = () => {
    const problems = stepProblems(step);
    if (problems.length > 0) {
      setStepErrors(problems);
      focusInvalid();
      return;
    }
    setMaxStep((m) => Math.max(m, step + 1));
    goTo(Math.min(STEPS.length, step + 1));
  };

  // Risk topics are for verified specialists only; until that is known the block stays locked.
  const riskLocked = isSpecialist !== true;
  // What is still missing for moderation, shown live next to the actions.
  const missing = validatePublishable(
    {
      id: draftId, type, title, description, status: "draft", price, participants: 0, revenue: 0, rating: null, reviewsCount: 0,
      createdAt: "", updatedAt: "", tags: allTags, riskTopics, introVideoUrl: introVideoUrl.trim() || undefined, mainFileUrl: mainFileUrl ?? undefined,
      ...typeFields(),
      ...(type === "program" ? { modules: modules.filter((m) => m.title.trim() || m.id || (m.items?.length ?? 0) > 0) } : {}),
    },
    isSpecialist === null ? undefined : { isSpecialist }
  ).map((p) => p.message).concat(priceModeProblem(priceMode, price, W) ? [priceModeProblem(priceMode, price, W)!] : []);

  // High-risk topics block: the program wizard and guides / meditations show the same one (locked until the author is a «Фахівець»).
  const riskWords = riskKeywordWords(`${title} ${description}`);
  const renderRiskPanel = () => (
    <>
      <div className="relative overflow-hidden rounded-2xl border border-[#e3def9] bg-gradient-to-br from-[#f8f6ff] to-[#ece9fe] p-4 sm:p-6">
        <ShieldArt className="pointer-events-none absolute right-5 top-4 hidden h-[150px] w-[150px] xl:block" />
        <div className="relative flex items-start gap-3.5 xl:pr-44">
          <span aria-hidden="true" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white text-[#5b3df5] shadow-[0_6px_14px_-10px_rgba(91,61,245,0.55)]">
            <Icon name={riskLocked ? "lock" : "shield"} size={22} />
          </span>
          <div className="min-w-0">
            <h3 id="risk-heading" className="text-[17px] font-bold leading-tight text-[#1d1a3b]">{riskLocked ? "Доступно лише фахівцям" : "Оберіть теми"}</h3>
            <p className="mt-1 text-[14px] leading-relaxed text-[#4b4a66]">
              Позначте, якщо матеріал стосується цих тем. Їх можуть публікувати лише автори зі статусом «Фахівець»
              (Sensoria переглянула їхні документи про освіту).
            </p>
          </div>
        </div>
        <div className="relative mt-4 grid gap-2.5 sm:grid-cols-2 xl:mr-44 xl:grid-cols-3" role="group" aria-labelledby="risk-heading" aria-disabled={riskLocked}>
          {RISK_TOPICS.map((t) => {
            const on = riskTopics.includes(t.id);
            return (
              <button
                key={t.id}
                type="button"
                disabled={riskLocked}
                aria-pressed={on}
                onClick={() => setRiskTopics((cur) => (cur.includes(t.id) ? cur.filter((x) => x !== t.id) : [...cur, t.id]))}
                className={`flex min-h-[56px] items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left text-[14px] font-semibold leading-snug transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5b3df5]/50 ${
                  riskLocked
                    ? on
                      ? "cursor-not-allowed border-2 border-[#5b3df5] bg-white text-[#2d2a5c]"
                      : "cursor-not-allowed border-[#e3def9] bg-white/70 text-[#2d2a5c]"
                    : on
                      ? "border-2 border-[#5b3df5] bg-white text-[#2d2a5c] shadow-[0_8px_18px_-12px_rgba(91,61,245,0.8)]"
                      : "border-[#d9d4f5] bg-white text-[#2d2a5c] hover:border-[#b8abf7] hover:bg-[#faf9ff]"
                }`}
              >
                <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#ece9fe] text-[#5b3df5]">
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{RISK_TOPIC_ICONS[t.id] ?? <circle cx="12" cy="12" r="8" />}</svg>
                </span>
                <span className="min-w-0 flex-1">{t.label}</span>
                {riskLocked ? (
                  on ? <span className="shrink-0 rounded-full bg-[#ece9fe] px-2 py-0.5 text-[12px] font-semibold text-[#4a2fd0]">Позначено</span> : <span aria-hidden="true" className="shrink-0 text-[#9a93c9]"><Icon name="lock" size={16} /></span>
                ) : on ? (
                  <span aria-hidden="true" className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#5b3df5] text-white"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></span>
                ) : null}
              </button>
            );
          })}
          {unknownRiskTopics(riskTopics).map((id) => (
            <button
              key={id}
              type="button"
              disabled={riskLocked}
              aria-pressed
              onClick={() => setRiskTopics((cur) => cur.filter((x) => x !== id))}
              className={`flex min-h-[56px] items-center gap-3 rounded-xl border-2 border-[#5b3df5] bg-white px-3.5 py-2.5 text-left text-[14px] font-semibold leading-snug text-[#2d2a5c] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5b3df5]/50 ${riskLocked ? "cursor-not-allowed" : ""}`}
            >
              <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#ece9fe] text-[#5b3df5]"><Icon name="warning" size={18} /></span>
              <span className="min-w-0 flex-1">Раніше позначена тема: «{id}»</span>
              {riskLocked ? <span className="shrink-0 rounded-full bg-[#ece9fe] px-2 py-0.5 text-[12px] font-semibold text-[#4a2fd0]">Позначено</span> : <span className="shrink-0 text-[13px] font-semibold text-[#4a2fd0] underline">Зняти</span>}
            </button>
          ))}
        </div>
        {isSpecialist === false && riskTopics.length === 0 && riskWords.length > 0 && (
          <div role="status" className="relative mt-4 flex items-start gap-3 rounded-xl border border-[#f1d9a6] bg-[#fff9ec] px-4 py-3 text-[14px] leading-relaxed text-[#5c3b00]">
            <span aria-hidden="true" className="mt-0.5 shrink-0 text-[#b86e00]"><Icon name="warning" size={18} /></span>
            <p>
              У назві чи описі є слова на кшталт {riskWords.map((w) => `«${w}»`).join(", ")}. Це теми підвищеного ризику: без статусу «Фахівець»
              {W.suchAcc} не вдасться опублікувати. Змініть формулювання або надішліть документи про освіту в розділі «Модерація».
            </p>
          </div>
        )}
        {riskLocked && (
          <div className="relative mt-5 flex items-start gap-3 border-t border-[#e3def9] pt-4 text-[14px] leading-relaxed text-[#4b4a66]">
            <span aria-hidden="true" className="mt-0.5 shrink-0 text-[#5b3df5]"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8v.01" /></svg></span>
            <p role={isSpecialist === null ? "status" : undefined}>{isSpecialist === null ? "Перевіряємо ваш статус… " : ""}Цей блок відкриється тільки після того, як ви станете фахівцем: надішліть документи про освіту в розділі «Модерація».</p>
          </div>
        )}
        {riskLocked && riskTopics.length > 0 && (
          <div role="alert" className="relative mt-3 text-[14px] text-rose-700">
            Тут уже позначені теми ризику, а публікувати їх без статусу «Фахівець» не можна.{" "}
            <button type="button" data-focus-invalid={stepErrors.length > 0 ? "true" : undefined} onClick={() => setRiskTopics([])} className="inline-flex min-h-[44px] items-center font-semibold underline">Зняти всі позначки</button>
          </div>
        )}
      </div>
    </>
  );
  // The cover block (requirements, buttons, position editor): the program wizard and guides / meditations show the same one.
  const renderCoverPanel = () => (
    <>
      <div className="relative overflow-hidden rounded-2xl border border-[#e3def9] bg-gradient-to-r from-[#f6f4ff] to-[#ece9fe] p-4 sm:p-5">
        <CoverArt className="pointer-events-none absolute right-4 top-3 hidden h-[110px] w-[150px] lg:block" />
        <ul className="flex flex-col gap-2 text-[14px] leading-snug text-[#2d2a5c] lg:pr-44">
          {[
            "Від 1200 × 675 px (16:9), JPG або PNG, до 25 МБ. Великі файли ми самі зменшуємо для сайту, зберігаючи якість.",
            "Без дрібного тексту: обкладинка має читатись і в маленькому прев'ю.",
            "Зображення автоматично підлаштовується під кожне місце, результат показано нижче.",
          ].map((t) => (
            <li key={t} className="flex items-start gap-2.5">
              <span aria-hidden="true" className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#5b3df5] text-white"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></span>
              {t}
            </li>
          ))}
        </ul>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => setCoverMakerOpen(true)} disabled={coverUploading} className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-gradient-to-r from-[#5b3df5] to-[#8a63f7] px-5 text-[14px] font-semibold text-white transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5b3df5]/50 disabled:opacity-60">
            <Icon name="sparkle" size={16} /> {coverUrl ? "Створити нову обкладинку" : "Створити обкладинку"}
          </button>
          <span className="text-[14px] text-[#4b4a66]">або</span>
          <label className="inline-flex min-h-[44px] cursor-pointer items-center rounded-xl border border-[#d9d4f5] bg-white px-5 text-[14px] font-semibold text-[#2d2a5c] transition hover:bg-[#f3efff] focus-within:ring-2 focus-within:ring-[#5b3df5]/50">
            {coverUploading ? "Завантаження…" : coverUrl ? "Замінити зображення" : "Завантажити зображення"}
            <input
              type="file"
              accept="image/jpeg,image/png"
              disabled={coverUploading}
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleCoverUpload(file);
              }}
            />
          </label>
        </div>
        {coverUploading && <p role="status" className="mt-3 text-[14px] text-[#4b4a66]">Завантажуємо обкладинку…</p>}
        {error && <p role="alert" className="mt-3 text-[14px] text-rose-700">{error}</p>}
        {coverWarning && <p role="status" className="mt-3 rounded-xl bg-[#fff7e6] px-3.5 py-2.5 text-[14px] leading-snug text-[#7a4a00]">{coverWarning}</p>}
      </div>
      {!coverUrl && !coverUploading && (
        <div className="flex items-start gap-3 rounded-2xl border border-[#f1d9a6] bg-[#fff9ec] px-4 py-3.5">
          <span aria-hidden="true" className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white text-[#b86e00]"><Icon name="warning" size={18} /></span>
          <div className="min-w-0 text-[14px] leading-relaxed text-[#5c3b00]">
            <div className="font-semibold">Без власної обкладинки</div>
            <p className="mt-0.5">{W.coverNote}</p>
          </div>
        </div>
      )}
      {coverUrl && (
        <div className="flex flex-col gap-6">
          {(coverFocusOpen ? (
            <div>
              <CoverFocusPicker url={coverUrl} focus={coverFocus} onChange={changeCoverFocus} onUploadFrame={handleFrameUpload} />
              <button type="button" onClick={() => setCoverFocusOpen(false)} className="mt-4 inline-flex min-h-[44px] items-center rounded-xl border border-[#d9d4f5] bg-white px-4 text-[14px] font-semibold text-[#4a2fd0] transition hover:bg-[#f3efff] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5b3df5]/50">Згорнути</button>
            </div>
          ) : (
            <div>
              <button type="button" onClick={() => setCoverFocusOpen(true)} className="inline-flex min-h-[44px] items-center rounded-xl border border-[#d9d4f5] bg-white px-4 text-[14px] font-semibold text-[#4a2fd0] transition hover:bg-[#f3efff] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5b3df5]/50">
                Налаштувати, що видно в кадрі
              </button>
            </div>
          ))}
          {!coverFocusOpen && <CoverFramesPreview url={coverUrl} focus={coverFocus} />}
        </div>
      )}
    </>
  );
  // The main file of a guide (PDF) or of a meditation (audio): the same block in both.
  const whenBlock = type === "meditation" ? (
    <div id="med-when-block" className="rounded-2xl border border-[#e3def9] bg-[#faf9ff] p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#ece9fe] text-[#4a2fd0]"><Icon name="bulb" size={20} /></span>
        <div className="min-w-0 flex-1">
          <div id="med-when-label" className="text-[16px] font-semibold text-[#1d1a3b]">Коли підійде ця практика <span className="text-rose-600" aria-hidden="true">*</span></div>
          <p className="text-[13px] leading-snug text-black/65">Короткі ситуації, у яких практика допоможе. Учасники побачать їх списком на сторінці медитації.</p>
        </div>
        <span className="shrink-0 rounded-full bg-white px-3 py-1.5 text-[13px] font-semibold text-[#4a2fd0] ring-1 ring-[#e3def9]">
          {whenItems.filter((v) => v.trim()).length} з {WHEN_MAX_ITEMS} · мін. {WHEN_MIN_ITEMS}
        </span>
      </div>
      <ul aria-labelledby="med-when-label" className="mt-4 grid gap-3 md:grid-cols-2">
        {whenItems.map((item, i) => (
          <li key={i} className="flex items-center gap-3 rounded-xl border border-[#e3def9] bg-white p-2 pr-2">
            <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#f3efff] text-[14px] font-semibold text-[#4a2fd0]">{i + 1}</span>
            <input
              value={item}
              maxLength={WHEN_ITEM_MAX}
              aria-label={`Пункт ${i + 1}`}
              aria-invalid={stepErrors.length > 0 && item.trim().length > 0 && item.trim().length < 5 ? true : undefined}
              onChange={(e) => setWhenItems((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))}
              placeholder={["Думки йдуть по колу", "Потрібно заспокоїтися перед сном", "Хочеться перепочити між справами"][i] ?? "Ще одна ситуація"}
              className="min-h-[40px] min-w-0 flex-1 bg-transparent text-[14px] text-[#1d1a3b] placeholder:text-black/45 focus:outline-none"
            />
            {whenItems.length > WHEN_MIN_ITEMS && (
              <button
                type="button"
                onClick={() => setWhenItems((prev) => prev.filter((_, j) => j !== i))}
                aria-label={`Прибрати пункт ${i + 1}`}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-[#6b6a85] transition hover:bg-rose-50 hover:text-rose-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5b3df5]/50"
              >
                ✕
              </button>
            )}
          </li>
        ))}
        {whenItems.length < WHEN_MAX_ITEMS && (
          <li className="list-none">
            <button
              type="button"
              onClick={() => setWhenItems((prev) => [...prev, ""])}
              className="flex min-h-[58px] w-full items-center justify-center rounded-xl border border-dashed border-[#b9aef5] bg-white text-[14px] font-semibold text-[#4a2fd0] transition hover:bg-[#f6f4ff] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5b3df5]/50"
            >
              + Додати пункт
            </button>
          </li>
        )}
      </ul>
      <p className="mt-3 text-[13px] text-black/60">Кожен пункт від 5 до {WHEN_ITEM_MAX} символів.</p>
    </div>
  ) : null;

  const renderMainFilePanel = () => {
    const isGuide = type === "guide";
    const missingFile = stepErrors.length > 0 && !mainFileUrl;
    return (
      <div className="rounded-2xl border border-[#e3def9] bg-gradient-to-r from-[#f6f4ff] to-[#ece9fe] p-4 sm:p-5">
        <div className="text-[15px] font-semibold text-[#1d1a3b]">{isGuide ? "PDF-файл гайду" : "Аудіо медитації"} <span className="text-rose-600" aria-hidden="true">*</span></div>
        <ul className="mt-2 flex flex-col gap-1.5 text-[14px] leading-snug text-[#2d2a5c]">
          {(isGuide ? ["PDF, до 30 МБ", "Наскрізна структура: вступ → практика → підсумок"] : ["MP3 або WAV, до 200 МБ", "Чистий запис без фонового шуму, рівна гучність голосу"]).map((t) => (
            <li key={t} className="flex items-start gap-2.5">
              <span aria-hidden="true" className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#5b3df5] text-white"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></span>
              {t}
            </li>
          ))}
        </ul>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="inline-flex min-h-[44px] cursor-pointer items-center rounded-xl bg-gradient-to-r from-[#5b3df5] to-[#8a63f7] px-5 text-[14px] font-semibold text-white transition hover:brightness-110 focus-within:ring-2 focus-within:ring-[#5b3df5]/50">
            {mainFileUploading ? "Завантаження…" : mainFileUrl ? "Замінити файл" : "Завантажити файл"}
            <input
              type="file"
              accept={isGuide ? "application/pdf" : "audio/*"}
              disabled={mainFileUploading}
              aria-invalid={missingFile || undefined}
              aria-describedby={stepErrors.length > 0 ? "step-5-errors" : undefined}
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleMainFileUpload(file);
              }}
            />
          </label>
        </div>
        {mainFileUploading && <p role="status" className="mt-3 text-[14px] text-[#4b4a66]">Завантажуємо файл…</p>}
        {error && !mainFileUploading && <p role="alert" className="mt-3 text-[14px] text-rose-700">{error}</p>}
        {mainFileUrl && isPaidFileRef(mainFileUrl) && <p className="mt-3 text-[14px] font-medium text-[#2f7a4d]">✓ Файл завантажено. Він захищений: його бачать лише ті, хто купив.</p>}
        {mainFileUrl && !isPaidFileRef(mainFileUrl) && (
          <a href={mainFileUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex min-h-[44px] items-center truncate text-[14px] font-medium text-[#4a2fd0] underline">
            Переглянути завантажений файл ↗
          </a>
        )}
      </div>
    );
  };
  return (
    <div className="flex max-w-[1040px] flex-col gap-5">
      {confirmReq && (
        <ConfirmDialog
          title={confirmReq.title}
          lines={confirmReq.lines}
          confirmLabel={confirmReq.confirm}
          onConfirm={() => { confirmReq.resolve(true); setConfirmReq(null); }}
          onCancel={() => { confirmReq.resolve(false); setConfirmReq(null); }}
        />
      )}
      {coverMakerOpen && (
        <CoverMaker
          title={title}
          categoryId={primaryCategory(tags)}
          categoryIds={categoryTags(tags)}
          onClose={() => setCoverMakerOpen(false)}
          onDone={(file) => {
            setCoverMakerOpen(false);
            setCoverFocus(DEFAULT_COVER_FOCUS); // the title is centred, so the centre is the right focal point
            handleCoverUpload(file, true);
          }}
        />
      )}
      {agreementFor && (
        <AuthorAgreementDialog
          onCancel={() => setAgreementFor(null)}
          onAccept={async () => {
            await acceptAuthorAgreement();
            const next = agreementFor;
            setAgreementOk(true);
            setAgreementFor(null);
            await handleSave(next);
          }}
        />
      )}
      <div className="mb-3 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <button
            onClick={onCancel}
            className="text-[13px] text-black/45 hover:text-black/70 transition mb-2"
          >
            ← Назад до контенту
          </button>
          <h1 className="text-3xl font-bold">
            {editing
              ? `Редагування: ${typeLowerLabel[type]}`
              : lockedType
              ? { program: "Нова програма", meditation: "Нова медитація", guide: "Новий гайд" }[type]
              : "Новий контент"}
          </h1>
          {!editing && lockedType && (
            <p className="mt-1.5 text-[15px] text-black/55">
              {type === "program" ? "Створіть власну програму, яка допоможе учасникам у їхньому запиті." : type === "meditation" ? "Додайте запис і розкажіть, у яких ситуаціях він допоможе." : "Додайте PDF і розкажіть, кому він буде корисним."}
            </p>
          )}
        </div>
        {/* Step buttons live in the top-right corner: «Назад» from step 2, «Далі» until the last step. */}
        {(
          <div className="flex items-center gap-2 sm:pt-6">
            {step > 1 && (
              <button type="button" onClick={() => goTo(step - 1)} disabled={saving} className="min-h-[46px] rounded-xl border border-black/10 bg-white px-5 text-[14px] font-medium transition hover:bg-black/5 disabled:opacity-60">
                Назад
              </button>
            )}
            {step < STEPS.length && (
              <button type="button" onClick={goNext} disabled={saving} className="inline-flex min-h-[46px] items-center gap-2 rounded-xl bg-[#2b2a5a] px-6 text-[14px] font-semibold text-white shadow-[0_10px_20px_-14px_rgba(43,42,90,0.7)] transition hover:bg-[#23224b] disabled:opacity-60">
                Далі <span aria-hidden="true">→</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* TYPE — only when the editor was opened without a chosen type; «Створити медитацію» / «Створити гайд» /
          «Створити програму» each open their own form. */}
      {!lockedType && !editing && (
      <div>
        <div className="text-[13px] font-medium text-black/50 mb-2">Тип</div>
        <div className="flex gap-2">
          {(Object.keys(typeLabel) as ContentType[]).map((t) => (
            <button
              key={t}
              onClick={() => { setType(t); setStep(1); setMaxStep(1); setStepErrors([]); }}
              disabled={!!editing}
              className={`px-4 py-2.5 rounded-xl text-[14px] font-medium transition ${
                type === t
                  ? "bg-black text-white"
                  : "bg-white border border-black/10 text-black/60 hover:bg-black/5"
              } ${editing ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              {typeLabel[t]}
            </button>
          ))}
        </div>
      </div>
      )}

      <>
      <nav aria-label={`Кроки створення ${W.gen}`} className="mb-3 flex flex-col gap-3">
        <ol className="flex items-start lg:px-[30px] lg:pb-11">
          {STEPS.map((label, i) => {
            const n = i + 1;
            const reachable = n <= maxStep;
            const current = n === step;
            const done = n < step;
            const last = i === STEPS.length - 1;
            return (
              <li key={label} className={`flex items-center ${last ? "" : "flex-1"}`}>
                <button
                  type="button"
                  disabled={!reachable}
                  onClick={() => jumpTo(n)}
                  aria-label={`Крок ${n}: ${label}`}
                  aria-current={current ? "step" : undefined}
                  className="group relative shrink-0 disabled:cursor-not-allowed"
                >
                  <span
                    className={`flex h-8 w-8 lg:h-9 lg:w-9 items-center justify-center rounded-full text-[12px] lg:text-[13px] font-semibold transition ${
                      current
                        ? "bg-[#5b3df5] text-white shadow-[0_6px_16px_-6px_rgba(91,61,245,0.7)]"
                        : done
                        ? "bg-[#e9e6fc] text-[#5b3df5]"
                        : reachable
                        ? "bg-[#eef0fb] text-black/60 group-hover:bg-[#e3e6f7]"
                        : "bg-[#f1f2f8] text-black/35"
                    }`}
                  >
                    {done ? (
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                    ) : (
                      n
                    )}
                  </span>
                  {/* the label hangs centered under its circle without changing the row; the row is inset so the outer labels end flush with the edges */}
                  <span
                    className={`absolute left-1/2 top-[calc(100%+8px)] hidden w-[96px] -translate-x-1/2 text-center text-[12px] leading-tight lg:block ${current ? "font-semibold text-black" : "text-black/50"}`}
                  >
                    {label}
                  </span>
                </button>
                {!last && <span aria-hidden="true" className={`mx-2 h-[2px] min-w-[4px] flex-1 rounded-full lg:mx-3 ${done ? "bg-[#a89bf7]" : "bg-[#e3e6f4]"}`} />}
              </li>
            );
          })}
        </ol>
        <div className="text-[14px] font-semibold text-black lg:hidden">{STEPS[step - 1]}</div>
      </nav>
      <Step n={1} current={step} errors={stepErrors} title="Назва та опис" hint="Назва й короткий опис — перше, що побачить учасник у каталозі." icon={type === "program" ? "program" : type === "meditation" ? "headphones" : "guide"} below={whenBlock} aside={
        <div className="flex h-full flex-col gap-4 rounded-2xl bg-[#f1eefe] p-5">
          <div className="flex items-center gap-2 text-[15px] font-semibold text-[#2d2a5c]">
            <span className="text-[#7c5cf5]" aria-hidden="true"><Icon name="bulb" size={20} /></span>
            Порада
          </div>
          <ul className="flex flex-col gap-3">
            <li className="flex gap-3">
              <span aria-hidden="true" className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-[13px] font-semibold text-[#5b3df5]">1</span>
              <p className="text-[13px] leading-[1.5] text-black/65"><span className="font-semibold text-[#2d2a5c]">Назва.</span> Коротко і конкретно, без загальних слів.</p>
            </li>
            <li className="flex gap-3">
              <span aria-hidden="true" className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-[13px] font-semibold text-[#5b3df5]">2</span>
              <p className="text-[13px] leading-[1.5] text-black/65"><span className="font-semibold text-[#2d2a5c]">Опис.</span> {W.descTip}</p>
            </li>
          </ul>
          <div className="mt-auto rounded-xl bg-white/80 p-3.5">
            <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#7c5cf5]">Приклад</div>
            <div className="mt-1 text-[14px] font-semibold leading-snug text-[#2d2a5c]">{W.exampleTitle}</div>
            <p className="mt-1 text-[13px] leading-[1.5] text-black/60">{W.exampleText}</p>
          </div>
        </div>
      }>
      {/* BASIC INFO */}
      <div className="flex flex-1 flex-col gap-4">
        <div>
          <div className="mb-2 flex items-baseline justify-between text-[13px] font-medium text-black/60">
            <label htmlFor="program-title">Назва {W.gen} <span className="text-rose-600" aria-hidden="true">*</span></label>
            <span id="program-title-count" className={`text-[13px] font-normal ${charCount(title) > 0 && titleProblem(title) ? "text-rose-600" : "text-black/60"}`}>{charCount(title)} · від {CONTENT_LIMITS.title.min} до {CONTENT_LIMITS.title.max} символів</span>
          </div>
          <input
            id="program-title"
            aria-required="true"
            aria-invalid={stepErrors.length > 0 && !!titleProblem(title) ? true : undefined}
            aria-describedby={`program-title-count${stepErrors.length > 0 && titleProblem(title) ? " step-1-errors" : ""}`}
            maxLength={CONTENT_LIMITS.title.max}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={`Наприклад, «${W.exampleTitle}»`}
            className="w-full px-4 py-3 rounded-xl border border-[#d9d4f5] text-[14px] focus:outline-none focus:border-[#5b3df5]"
          />
        </div>

        <div className="flex flex-1 flex-col">
          <div className="mb-2 flex items-baseline justify-between text-[13px] font-medium text-black/60">
            <label htmlFor="program-description">Опис {W.gen} <span className="text-rose-600" aria-hidden="true">*</span></label>
            <span id="program-description-count" className={`text-[13px] font-normal ${charCount(description) > 0 && descriptionProblem(description) ? "text-rose-600" : "text-black/60"}`}>{charCount(description)} · від {CONTENT_LIMITS.description.min} до {CONTENT_LIMITS.description.max} символів</span>
          </div>
          <textarea
            id="program-description"
            aria-required="true"
            aria-invalid={stepErrors.length > 0 && !!descriptionProblem(description) ? true : undefined}
            aria-describedby={`program-description-count${stepErrors.length > 0 && descriptionProblem(description) ? " step-1-errors" : ""}`}
            maxLength={CONTENT_LIMITS.description.max}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={5}
            placeholder={W.descPlaceholder}
            className="w-full px-4 py-3 rounded-xl border border-[#d9d4f5] text-[14px] focus:outline-none focus:border-[#5b3df5] resize-none flex-1 min-h-[130px]"
          />
        </div>

      </div>
      </Step>

      <Step n={2} current={step} errors={stepErrors} title={`Вартість ${W.gen}`} hint={`Оберіть, як учасники отримуватимуть доступ до ${W.gen}.`} icon="card" aside={
        <div className="flex h-full flex-col justify-between gap-4 rounded-2xl bg-[#f1eefe] p-4">
          <div className="flex items-center gap-2 text-[15px] font-semibold text-[#2d2a5c]">
            <span className="text-[#7c5cf5]" aria-hidden="true"><Icon name="search" size={18} /></span>
            Як це побачать учасники
          </div>
          <div className="rounded-xl bg-white px-4 py-4 shadow-[0_8px_20px_-16px_rgba(60,50,140,0.5)]">
            <div className="flex items-center gap-3">
              {coverUrl ? (
                <img src={coverUrl} alt="" className="h-[80px] w-[84px] shrink-0 rounded-lg object-cover" style={coverImageStyle(coverFocus)} />
              ) : (
                <div aria-hidden="true" className="relative h-[80px] w-[84px] shrink-0 overflow-hidden rounded-lg bg-gradient-to-br from-[#e4dcfe] to-[#bfd0fb]">
                  <svg viewBox="0 0 84 80" className="absolute inset-x-0 bottom-0 w-full" fill="none"><path d="M0 56c14-12 26-10 40-2s30 8 44-6v32H0z" fill="#fff" fillOpacity=".35" /><path d="M0 66c16-9 30-6 44 0s28 4 40-4v18H0z" fill="#fff" fillOpacity=".45" /></svg>
                </div>
              )}
              <div className="min-w-0">
                <div className="line-clamp-2 break-words text-[15px] font-semibold leading-snug text-[#1d1a3b] [overflow-wrap:anywhere]">{title.trim() || `Назва ${W.your}`}</div>
                <div className="mt-1.5 truncate text-[13px] text-black/60">{session?.profile?.name || "Ваше ім'я"}</div>
                <span className={`mt-2.5 inline-block rounded-full px-3 py-1 text-[13px] font-semibold ${priceMode === "free" ? "bg-emerald-100 text-emerald-700" : "bg-[#ede9fe] text-[#5b21b6]"}`}>
                  {priceMode === "free" ? "Безкоштовно" : price.trim() ? formatPrice(price) : "Вкажіть ціну"}
                </span>
              </div>
            </div>
          </div>
          {priceMode === "paid" && (
            <div className="flex items-center justify-between gap-3 rounded-xl bg-white/70 px-4 py-3 text-[13px] text-[#2d2a5c]">
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-[#7c5cf5]">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 4h2l2.2 10.2a1.5 1.5 0 0 0 1.5 1.2h8.1a1.5 1.5 0 0 0 1.5-1.1L20 8H6.2" /><circle cx="9" cy="19.5" r="1.3" /><circle cx="17" cy="19.5" r="1.3" /></svg>
                  У кошику
                </span>
                <span className="block truncate">{title.trim() || `Назва ${W.your}`}</span>
              </span>
              <span className="shrink-0 text-[15px] font-bold">{price.trim() ? formatPrice(price) : "—"}</span>
            </div>
          )}
          <p className="text-[13px] leading-snug text-black/55">Ви зможете змінити ціну пізніше, у редагуванні {W.gen}.</p>
        </div>
      }>
      <div className="flex flex-1 flex-col gap-6 pt-3">
        <div
          role="radiogroup"
          aria-label={`Вартість ${W.gen}`}
          className="grid gap-3 sm:grid-cols-2"
          onKeyDown={(e) => {
            const keys = ["ArrowLeft", "ArrowUp", "ArrowRight", "ArrowDown"];
            if (!keys.includes(e.key)) return;
            e.preventDefault();
            const next = priceMode === "free" ? "paid" : "free";
            choosePriceMode(next);
            e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]')[next === "free" ? 0 : 1]?.focus();
          }}
        >
          {([
            ["free", "Безкоштовно", "Учасники зможуть отримати доступ без оплати.", "gift"],
            ["paid", W.paid, `Вкажіть ціну, за якою учасники зможуть придбати ${W.acc}.`, "wallet"],
          ] as const).map(([value, label, text, glyph]) => {
            const active = priceMode === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={active}
                tabIndex={active ? 0 : -1}
                onClick={() => choosePriceMode(value)}
                className={`flex min-h-[112px] items-start gap-4 rounded-2xl border p-4 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5b3df5] ${
                  active ? "border-[#5b3df5] bg-[#f3efff]" : "border-[#e3e6f4] bg-white hover:bg-[#faf9ff]"
                }`}
              >
                <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#ebe7fd] text-[#5b3df5]">
                  {glyph === "gift" ? (
                    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3.5" y="9" width="17" height="4" rx="1" /><path d="M5 13v7h14v-7M12 9v11" /><path d="M12 9c-1.5-4-5.5-4-5.5-1.5S10 9 12 9ZM12 9c1.5-4 5.5-4 5.5-1.5S14 9 12 9Z" /></svg>
                  ) : (
                    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3" /><path d="M4 7.5V17a2 2 0 0 0 2 2h12a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1H6.5A2.5 2.5 0 0 1 4 7.5Z" /><circle cx="15.5" cy="13.5" r="1" fill="currentColor" /></svg>
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[16px] font-semibold text-[#1d1a3b]">{label}</span>
                  <span className="mt-1 block text-[13px] leading-snug text-black/55">{text}</span>
                </span>
                <span aria-hidden="true" className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${active ? "border-[#6d4cf5]" : "border-[#c9cde2]"}`}>
                  {active && <span className="h-3 w-3 rounded-full bg-[#6d4cf5]" />}
                </span>
              </button>
            );
          })}
        </div>

        {livePriceChange && (
          <div role="note" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] leading-snug text-amber-900">
            <div className="mb-1 font-semibold">{W.publishedNote}</div>
            <ul className="list-disc pl-4 flex flex-col gap-0.5">
              {priceChangeLines(livePriceChange).slice(0, 2).map((l) => <li key={l}>{l}</li>)}
            </ul>
          </div>
        )}

        {priceMode === "paid" && (
          <div className="grid gap-4 sm:grid-cols-[260px_minmax(0,1fr)] sm:items-stretch">
          <div>
            <label htmlFor="program-price" className="mb-2 block text-[13px] font-medium text-black/60">Вартість {W.gen} <span className="text-rose-600" aria-hidden="true">*</span></label>
            <div className="relative w-full sm:w-[260px]">
              <input
                id="program-price"
                aria-required="true"
                aria-invalid={stepErrors.length > 0 && (!price.trim() || Number(price) < 1) ? true : undefined}
                aria-describedby={stepErrors.length > 0 ? "step-2-errors" : undefined}
                inputMode="numeric"
                autoComplete="off"
                value={price}
                maxLength={6}
                placeholder="Наприклад, 450"
                onChange={(e) => setPrice(e.target.value.replace(/[^\d]/g, ""))}
                className="w-full rounded-xl border border-[#d9d4f5] bg-white py-3 pl-4 pr-10 text-[15px] focus:outline-none focus:border-[#5b3df5]"
              />
              <span aria-hidden="true" className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[15px] text-black/60">₴</span>
            </div>
            <p className="mt-1.5 text-[13px] text-black/60">Цілі гривні, від 1 до 100 000.</p>
          </div>
          <div
            title="Частка автора від ціни за стандартними ставками авторського договору. Комісію банку за приймання платежу сплачує Sensoria, з цієї частки її не віднімають."
            className="flex items-center gap-4 rounded-2xl bg-gradient-to-br from-white to-[#f4f0ff] px-4 py-1.5 shadow-[inset_0_0_0_1px_rgba(120,100,220,0.18)]"
          >
            <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#ebe7fd] text-[#5b3df5]">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="13" width="3.5" height="7" rx="1" /><rect x="10.25" y="9" width="3.5" height="11" rx="1" /><rect x="16.5" y="4" width="3.5" height="16" rx="1" /></svg>
            </span>
            <span aria-hidden="true" className="hidden h-12 w-px bg-[#ddd6f7] sm:block" />
            <div className="min-w-0">
              <div className="text-[14px] font-semibold leading-tight text-[#1d1a3b]">Ваш дохід з кожного продажу</div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <span className="rounded-full bg-[#ece9fb] px-3 py-0.5 text-[13px] text-[#3b3770]">Каталог Sensoria: <b>{100 - DEFAULT_SETTINGS.commissionBps / 100}%</b></span>
                <span className="rounded-full bg-[#ddd3fb] px-3 py-0.5 text-[13px] text-[#4c2fb8]">Ваше посилання: <b>{100 - DEFAULT_SETTINGS.referralCommissionBps / 100}%</b></span>
              </div>
            </div>
          </div>
          </div>
        )}

        {priceMode === "free" && (
          <div role="status" className="mt-auto flex items-center gap-3 rounded-xl bg-emerald-50 px-4 py-3 text-[14px] font-medium text-emerald-800">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
            {W.freeNote}
          </div>
        )}
      </div>
      </Step>

      <Step n={3} current={step} errors={stepErrors} icon="library" title="Категорії" hint={`Оберіть до трьох категорій, які найкраще описують ${W.acc}. За ними ${W.pron} знаходять у каталозі.`}>
      <div className="flex flex-col gap-5">
        <div role="group" aria-label={`Категорії ${W.gen}`} className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Object.entries(categoryLabels).map(([id, label]) => {
            const on = tags.includes(id);
            const full = !on && catCount >= MAX_CATEGORIES;
            const primary = on && categoryTags(tags)[0] === id;
            return (
              <button
                key={id}
                type="button"
                data-focus-invalid={stepErrors.length > 0 && catCount === 0 && id === Object.keys(categoryLabels)[0] ? "true" : undefined}
                aria-pressed={on}
                aria-disabled={full || undefined}
                onClick={() => pickCategory(id)}
                className={`flex min-h-[72px] items-center gap-3 rounded-2xl border p-3 text-left transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5b3df5]/50 ${
                  on ? "border-[#5b3df5] bg-[#f3efff]" : full ? "cursor-not-allowed border-[#e3e6f4] bg-white opacity-55" : "border-[#e3e6f4] bg-white hover:bg-[#faf9ff]"
                }`}
              >
                <span aria-hidden="true" className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors ${on ? "bg-white text-[#5b3df5]" : "bg-[#ece9fe] text-[#5b3df5]"}`}>
                  <CategoryGlyph id={id} size={22} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-semibold leading-tight text-[#1d1a3b]">{label}</span>
                  {primary && <span className="mt-0.5 block text-[12px] font-semibold text-[#5b3df5]">Основна</span>}
                </span>
                <span aria-hidden="true" className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-all ${on ? "border-[#5b3df5] bg-[#5b3df5] text-white" : "border-[#c9cde2] bg-white text-transparent"}`}>
                  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                </span>
              </button>
            );
          })}
        </div>
        <div role="status" aria-live="polite">
          {limitNote && <p className="rounded-xl bg-amber-50 px-4 py-2.5 text-[13px] text-amber-900">{limitNote}</p>}
        </div>
        <div className="rounded-2xl border border-[#e6e8f6] bg-[#fbfbff] px-4 py-3.5">
          <div aria-live="polite" className="text-[13px] font-medium text-black/65">
            {catCount > 0 ? `Обрано: ${catCount} з ${MAX_CATEGORIES}` : "Ще нічого не обрано"}
          </div>
          {catCount > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-2">
              {categoryTags(tags).map((id, i) => {
                const name = categoryLabels[id as keyof typeof categoryLabels];
                return (
                  <span key={id} className={`inline-flex items-center gap-1 rounded-full py-1 pl-3 pr-1.5 text-[13px] font-medium ${i === 0 ? "bg-[#5b3df5] text-white" : "bg-[#ece9fe] text-[#4a2fd0]"}`}>
                    {i === 0 ? (
                      <span>{name} · основна</span>
                    ) : (
                      <button type="button" onClick={() => makePrimary(id)} title="Зробити основною" aria-label={`Зробити категорію ${name} основною`} className="rounded hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5b3df5]/50">{name}</button>
                    )}
                    <button type="button" aria-label={`Прибрати категорію ${name}`} onClick={() => { setLimitNote(""); toggleTag(id); }} className={`flex h-5 w-5 items-center justify-center rounded-full ${i === 0 ? "hover:bg-white/25" : "hover:bg-[#5b3df5]/15"}`}>
                      <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
                    </button>
                  </span>
                );
              })}
            </div>
          )}
          {catCount > 1 && (
            <p className="mt-2.5 text-[13px] leading-snug text-black/60">
              Основна категорія видна на картці {W.gen} в каталозі. За іншими {W.acc} знайдуть через фільтри. Щоб змінити основну, натисніть на назву категорії.
            </p>
          )}
        </div>
      </div>
      </Step>

      {type === "program" && (
      <Step n={4} current={step} errors={stepErrors} icon="sparkle" tight title="Що ви отримаєте" hint={`Три короткі переваги по ${MIN_BENEFIT_CHARS}–${MAX_BENEFIT_CHARS} символів, які показуються на сторінці програми поруч із ціною.`} aside={
        <div className="flex h-full flex-col gap-4 rounded-2xl bg-[#f1eefe] p-5">
          <div className="flex items-center gap-2 text-[15px] font-semibold text-[#2d2a5c]">
            <span className="shrink-0 text-[#5b3df5]" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="3" /></svg>
            </span>
            Як це побачать учасники
          </div>
          {/* A visual copy of a tile on the program page, one at a time (the fields on the left are what screen readers use). */}
          <div className="flex flex-col gap-3">
            <div aria-hidden="true">
              {previewBenefits.length > 0 ? (
                <div key={previewBenefits[shownIndex]} className="relative flex min-h-[140px] min-w-0 overflow-hidden rounded-[22px] bg-gradient-to-b from-[#f6f7ff] to-[#edf0ff] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.9)]">
                  <div className="relative z-10 flex min-w-0 items-start gap-3 px-4 pb-[52px] pt-4">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#e9e6fc]">
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#5b3df5" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                    </span>
                    <span className="line-clamp-3 min-w-0 break-words pt-0.5 text-[16px] font-semibold leading-snug text-[#1d1a3b]">{previewBenefits[shownIndex]}</span>
                  </div>
                  <BenefitWaves />
                </div>
              ) : (
                <div className="flex min-h-[140px] items-center gap-3 rounded-[22px] border border-dashed border-[#cfc6fa] bg-white/50 px-4 py-6">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-dashed border-[#b8abf7] text-[#5b3df5]">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                  </span>
                  <span className="text-[13px] leading-snug text-black/60">Тут з'являться ваші переваги, щойно ви їх напишете.</span>
                </div>
              )}
            </div>
            {previewBenefits.length > 1 && (
              <div className="flex items-center justify-between gap-3">
                <button type="button" aria-label="Попередня перевага" onClick={() => setPreviewIndex((shownIndex + previewBenefits.length - 1) % previewBenefits.length)} className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-[#5b3df5] shadow-[0_4px_12px_-8px_rgba(60,50,140,0.6)] transition hover:bg-[#ece9fe] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5b3df5]/50">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
                </button>
                <div className="flex items-center gap-1.5" aria-hidden="true">
                  {previewBenefits.map((b, k) => (
                    <span key={b} className={`h-2 rounded-full transition-all ${k === shownIndex ? "w-5 bg-[#5b3df5]" : "w-2 bg-[#cfc6fa]"}`} />
                  ))}
                </div>
                <button type="button" aria-label="Наступна перевага" onClick={() => setPreviewIndex((shownIndex + 1) % previewBenefits.length)} className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-[#5b3df5] shadow-[0_4px_12px_-8px_rgba(60,50,140,0.6)] transition hover:bg-[#ece9fe] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5b3df5]/50">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
                </button>
              </div>
            )}
          </div>
        </div>
      }>
      <div className="flex flex-col gap-3" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) tidyBenefits(); }}>
        {benefitFields.map((value, i) => {
          const len = [...value].length;
          const short = [...cleanBenefit(value)].length < MIN_BENEFIT_CHARS;
          const invalid = stepErrors.length > 0 && (short || isDuplicateBenefit(i));
          const dup = isDuplicateBenefit(i);
          const note = benefitCut === i ? `Текст скорочено до ${MAX_BENEFIT_CHARS} символів.` : dup ? "Така перевага вже є вище, на сторінці вона не повторюватиметься." : null;
          return (
            <div key={i}>
              <div className="group flex items-center gap-3">
                <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#ece9fe] text-[14px] font-semibold text-[#5b3df5] transition group-focus-within:bg-[#5b3df5] group-focus-within:text-white">{i + 1}</span>
                <div className={`flex min-h-[52px] min-w-0 flex-1 items-center gap-3 rounded-xl border bg-white px-4 transition focus-within:border-[#5b3df5] focus-within:shadow-[0_0_0_3px_rgba(91,61,245,0.12)] ${invalid ? "border-rose-400" : value ? "border-black/15" : "border-[#e3e6f4]"}`}>
                  <input
                    id={`benefit-${i + 1}`}
                    type="text"
                    value={value}
                    lang="uk"
                    autoComplete="off"
                    spellCheck
                    enterKeyHint={i < MAX_BENEFITS - 1 ? "next" : "done"}
                    aria-label={`Перевага ${i + 1} (обов'язково)`}
                    aria-required="true"
                    aria-invalid={invalid || undefined}
                    aria-describedby={[invalid ? "step-4-errors" : "", note ? `benefit-${i + 1}-note` : ""].filter(Boolean).join(" ") || undefined}
                    placeholder={["Наприклад, «Менше напруги в щоденному житті»", "Наприклад, «Більше внутрішнього ресурсу»", "Наприклад, «Практики для щоденного спокою»"][i]}
                    onChange={(e) => setBenefit(i, e.target.value)}
                    onFocus={() => showBenefitOf(value)}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter") return;
                      e.preventDefault();
                      if (i < MAX_BENEFITS - 1) document.getElementById(`benefit-${i + 2}`)?.focus();
                    }}
                    className="min-w-0 flex-1 bg-transparent py-3 text-[15px] text-[#1d1a3b] placeholder:text-black/55 focus:outline-none"
                  />
                  <span className="hidden shrink-0 rounded-full bg-[#f1eefe] px-2.5 py-0.5 text-[12px] font-semibold text-[#5b3df5] sm:inline">Обов'язково</span>
                  <span className={`shrink-0 text-[13px] tabular-nums ${(invalid && short) || len >= MAX_BENEFIT_CHARS ? "font-semibold text-rose-700" : len >= MAX_BENEFIT_CHARS - 5 ? "font-semibold text-amber-700" : "text-black/60"}`}>{len}/{MAX_BENEFIT_CHARS}<span className="sr-only"> (від {MIN_BENEFIT_CHARS})</span></span>
                </div>
              </div>
              {note && <p id={`benefit-${i + 1}-note`} role="status" className="mt-1.5 pl-12 text-[13px] text-amber-800">{note}</p>}
            </div>
          );
        })}
        <p className="pl-12 text-[13px] text-black/60 sm:hidden">Усі три переваги обов'язкові, по 20–40 символів.</p>
      </div>
      </Step>
      )}

      <Step n={stepNo("cover")} current={step} errors={stepErrors} icon="image" title="Обкладинка" hint={`Картинка ${W.gen} в каталозі, кошику та на вашій сторінці.`}>
      {renderCoverPanel()}
      </Step>

      {type === "program" && (
      <Step n={6} current={step} errors={stepErrors} icon="video" title="Відео-презентація" hint="Допоможе учаснику познайомитися з вами та краще зрозуміти програму.">
      <div className="relative">
        <VideoArt kind="clapper" className="pointer-events-none absolute -top-[76px] right-0 hidden h-[80px] w-[124px] lg:block" />
      </div>

      <nav aria-label="Частини кроку" className="flex flex-wrap items-center gap-x-1.5 gap-y-2">
        {VIDEO_PARTS.slice(0, Math.max(videoParts, 2)).map((name, i) => {
          const n = i + 1;
          const locked = n > reachedMax || n > videoParts;
          const on = n === part;
          return (
            <span key={name} className="flex items-center gap-1.5">
              {i > 0 && <span aria-hidden="true" className="text-[#b8abf7]">→</span>}
              <button
                type="button"
                disabled={locked}
                aria-current={on ? "step" : undefined}
                onClick={() => goPartByUser(n)}
                className={`inline-flex min-h-[44px] items-center gap-2 rounded-full px-3.5 text-[13px] font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5b3df5]/50 ${on ? "bg-[#5b3df5] text-white shadow-[0_8px_18px_-10px_rgba(91,61,245,0.9)]" : locked ? "cursor-default bg-[#f4f2fe] text-[#6b5fc7]" : "bg-[#ece9fe] text-[#4a2fd0] hover:bg-[#e2ddfc]"}`}
              >
                <span aria-hidden="true" className={`grid h-5 w-5 place-items-center rounded-full text-[11px] ${on ? "bg-white/25" : n < part ? "bg-[#5b3df5] text-white" : "bg-white/70"}`}>{n < part ? "✓" : n}</span>
                <span className={on ? "" : "sr-only sm:not-sr-only"}>{name}</span>
              </button>
            </span>
          );
        })}
      </nav>

      {part === 1 && (
      <section aria-labelledby="video-source" className="rounded-2xl border border-[#e6e8f6] bg-white p-5 shadow-[0_18px_40px_-34px_rgba(60,50,140,0.5)] sm:p-6">
        <h3 id="video-source" tabIndex={-1} className="scroll-mt-24 focus:outline-none text-[17px] font-bold leading-tight text-[#1d1a3b]">Яке відео показувати?</h3>
        <p className="mt-1 max-w-[760px] text-[14px] leading-relaxed text-[#4b4a66]">Це ваша відео-презентація. Можна взяти одне й те саме відео з профілю для всіх матеріалів або додати нове саме для цієї програми.</p>
        <div role="radiogroup" aria-label="Яке відео показувати" className="mt-4 grid gap-3 sm:grid-cols-2">
          {([
            ["profile", "Відео з мого профілю", !profileUrl,
              profileVideo.loading ? "Перевіряємо ваш профіль…"
                : profileUrl ? "Те саме відео, що в розділі «Кілька слів від мене» у вашому профілі. Одне відео для всіх ваших матеріалів."
                : profileVideo.notYoutube ? "У профілі відео не з YouTube, а для програми потрібне YouTube. Додайте нове відео."
                : "У профілі ще немає відео. Додайте його в профілі, у розділі «Кілька слів від мене», і воно з'явиться тут."],
            ["own", "Нове відео для цієї програми", false, "Окреме відео саме про цю програму. Його посилання ви вставите нижче."],
          ] as const).map(([key, head, disabled, text]) => {
            const on = videoMode === key;
            const thumbId = key === "profile" && profileUrl ? youtubeId(profileUrl) : null;
            return (
              <label key={key} className={`relative flex items-center gap-3 overflow-hidden rounded-2xl border-2 p-4 transition focus-within:ring-2 focus-within:ring-[#5b3df5]/50 ${on ? "border-[#5b3df5] bg-[#f6f4ff] shadow-[0_18px_36px_-28px_rgba(91,61,245,0.8)]" : "border-[#e6e8f6] bg-white"} ${disabled ? "cursor-not-allowed" : "cursor-pointer hover:border-[#cfc6fa] hover:bg-[#faf9ff]"}`}>
                <input type="radio" name="video-source" className="sr-only" checked={on} disabled={disabled} onChange={() => chooseVideo(key)} />
                <span aria-hidden="true" className={`grid h-5 w-5 shrink-0 place-items-center self-start rounded-full border-2 ${on ? "border-[#5b3df5]" : "border-black/25"}`}>{on && <span className="h-2.5 w-2.5 rounded-full bg-[#5b3df5]" />}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold leading-snug text-[#1d1a3b]">{head}</span>
                  <span className="mt-1 block text-[14px] leading-relaxed text-[#4b4a66]">{text}</span>
                  {key === "profile" && profileUrl && (
                    <span className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-[#ece9fe] px-2.5 py-0.5 text-[12px] font-semibold text-[#4a2fd0]">
                      <Icon name="check" size={14} /> {on ? "Буде використано це відео" : "У профілі є відео"}
                    </span>
                  )}
                </span>
                {thumbId ? (
                  <img src={`https://i.ytimg.com/vi/${thumbId}/hqdefault.jpg`} alt="" loading="lazy" className="hidden aspect-video w-[104px] shrink-0 rounded-xl border border-[#e6e8f6] object-cover sm:block" />
                ) : (
                  <VideoArt kind={key === "profile" ? "profile" : "player"} className="hidden h-[76px] w-[96px] shrink-0 sm:block" />
                )}
              </label>
            );
          })}
        </div>
        {videoMode === "profile" && introVideoId && (
          <div className="mt-4">
            <div className="aspect-video w-full max-w-[480px] overflow-hidden rounded-xl border border-black/10 bg-black">
              <iframe
                title="Попередній перегляд відео з профілю"
                src={`https://www.youtube-nocookie.com/embed/${introVideoId}`}
                loading="lazy"
                allow="encrypted-media; picture-in-picture"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
                className="h-full w-full"
              />
            </div>
            {videoUnavailable && (
              <div role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-[14px] leading-relaxed text-rose-800">{UNAVAILABLE_VIDEO_MESSAGE}</div>
            )}
            {profileSynced && (
              <p role="status" className="mt-3 rounded-xl bg-[#f1eefe] px-3.5 py-2.5 text-[14px] leading-relaxed text-[#2d2a5c]">Відео в профілі змінилося, тому тут показано актуальне. Збережіть програму, щоб зберегти зміну.</p>
            )}
            <p className="mt-2 text-[13px] leading-relaxed text-black/60">Відео береться з вашого профілю. Якщо ви змінете його в профілі, відкрийте програму знову: тут з'явиться нове відео.</p>
          </div>
        )}
      {videoNav}
      </section>
      )}

      {part === 2 && (
      <section aria-labelledby="video-content" className="rounded-2xl border border-[#e3def9] bg-[#f6f4ff] p-5 sm:p-6">
        <h3 id="video-content" tabIndex={-1} className="scroll-mt-24 focus:outline-none text-[17px] font-bold leading-tight text-[#1d1a3b]">Що має бути у відео?</h3>
        <p className="mt-1 text-[14px] leading-relaxed text-[#4b4a66]">Коротке відео допомагає учаснику побачити вас і відчути довіру до програми ще до початку занять.</p>
        <ol className="mt-4 grid gap-3 sm:grid-cols-2">
          {([
            ["01", "Представтеся", "Коротко розкажіть, хто ви, чим займаєтеся та який маєте досвід у темі програми.", "author"],
            ["02", "Розкажіть про програму", "Поясніть, якій темі присвячена програма, для кого вона створена та з яким запитом може допомогти.", "checklist"],
            ["03", "Покажіть цінність", "Розкажіть, що учасник отримає, чого навчиться та які інструменти або практики знайде всередині.", "target"],
            ["04", "Запросіть до участі", "Завершіть відео коротким дружнім зверненням і поясніть, чому варто пройти цю програму.", "megaphone"],
          ] as const).map(([num, head, text, art]) => (
            <li key={num} className="flex items-center gap-3 rounded-2xl border border-[#ece9fe] bg-white p-4 shadow-[0_8px_24px_-20px_rgba(60,50,140,0.5)]">
              <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center self-start rounded-xl bg-gradient-to-br from-[#7c5cf6] to-[#5b3df5] text-[14px] font-bold text-white">{num}</span>
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-semibold leading-snug text-[#1d1a3b]">{head}</div>
                <p className="mt-1 text-[14px] leading-relaxed text-[#4b4a66]">{text}</p>
              </div>
              <VideoPointArt kind={art} className="h-16 w-16 shrink-0 max-[399px]:hidden sm:h-[72px] sm:w-[72px]" />
            </li>
          ))}
        </ol>
        <div className="mt-4 flex items-start gap-3 rounded-xl border border-[#e3def9] bg-[#ece9fe] px-4 py-3.5">
          <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white text-[#5b3df5]" aria-hidden="true"><Icon name="clock" size={16} /></span>
          <div className="min-w-0">
            <div className="text-[14px] font-semibold text-[#2d2a5c]">Рекомендована тривалість — 1–3 хвилини.</div>
            <p className="mt-0.5 text-[14px] leading-relaxed text-[#4b4a66]">Не потрібно професійного обладнання чи монтажу. Найважливіше — ваша щирість і зрозуміле пояснення.</p>
          </div>
        </div>
      {videoNav}
      </section>
      )}

      {videoMode === "own" && part === 3 && (
      <section aria-labelledby="video-how" className="rounded-2xl border border-[#e3def9] bg-white p-5 shadow-[0_18px_40px_-34px_rgba(60,50,140,0.5)] sm:p-6">
        <h3 id="video-how" tabIndex={-1} className="scroll-mt-24 focus:outline-none text-[17px] font-bold leading-tight text-[#1d1a3b]">Як додати відео?</h3>
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-3 rounded-2xl bg-gradient-to-r from-[#5b3df5] to-[#8a63f7] px-5 py-4 text-white">
          <span aria-hidden="true" className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white/20 ring-1 ring-white/40">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M8 5.5v13l11-6.5z" /></svg>
          </span>
          <div className="min-w-0 flex-1 basis-[240px]">
            <div className="text-[17px] font-bold leading-snug">Подивіться відео-інструкцію</div>
            <p className="mt-0.5 text-[14px] leading-snug text-white/90">Усе показано крок за кроком: від завантаження на YouTube до вставки посилання.</p>
          </div>
          <a
            href="https://youtu.be/_bc0HnxvtZQ"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[48px] shrink-0 items-center gap-2 rounded-xl bg-white px-6 text-[15px] font-bold text-[#4a2fd0] transition hover:bg-[#f3efff] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#5b3df5]"
          >
            Дивитися відео
            <span aria-hidden="true">↗</span>
            <span className="sr-only"> (відкриється в новій вкладці)</span>
          </a>
        </div>
        <ol className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-stretch sm:gap-0">
          {([
            ["Завантажте відео на YouTube.", "upload"],
            [<>Оберіть видимість <strong>«Не для всіх»</strong> (Unlisted, «Приховане»).</>, "visibility"],
            ["Скопіюйте посилання та вставте його в поле на наступному кроці.", "link"],
          ] as const).map(([text, art], i) => (
            <li key={i} className="flex min-w-0 items-stretch sm:flex-1">
              <div className="flex min-w-0 flex-1 items-center gap-2.5 rounded-2xl border border-[#ece9fe] bg-[#f6f4ff] p-3.5 sm:gap-2">
                <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#5b3df5] text-[13px] font-bold text-white">{i + 1}</span>
                <span className="min-w-0 flex-1 text-[13.5px] leading-snug text-[#1d1a3b]">{text}</span>
                <VideoHowArt kind={art} className="h-12 w-14 shrink-0 sm:h-12 sm:w-14 md:h-14 md:w-16" />
              </div>
              {i < 2 && <span aria-hidden="true" className="hidden items-center px-1 text-[18px] text-[#8a63f7] sm:flex">→</span>}
            </li>
          ))}
        </ol>

        <h4 className="mt-6 text-[15px] font-bold text-[#1d1a3b]">Чим відрізняються варіанти видимості?</h4>
        <ul className="mt-2 grid gap-3 sm:grid-cols-3">
          <li className="rounded-2xl border border-[#e6e8f6] bg-white p-4">
            <div className="flex items-center gap-2 text-[15px] font-semibold text-[#1d1a3b]">
              <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-black/50"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" /></svg>
              Публічне
            </div>
            <div className="mt-0.5 text-[13px] text-black/60">У YouTube: «Для всіх»</div>
            <p className="mt-1.5 text-[14px] leading-relaxed text-[#4b4a66]">Відео можуть знайти всі користувачі YouTube.</p>
            <span className="mt-2.5 inline-flex items-center gap-1 rounded-full bg-rose-50 px-3 py-1 text-[13px] font-semibold text-rose-700"><span aria-hidden="true">✕</span> Не підходить</span>
          </li>
          <li className="relative rounded-2xl border-2 border-[#5b3df5] bg-[#f6f4ff] p-4 shadow-[0_12px_28px_-20px_rgba(91,61,245,0.8)]">
            <span aria-hidden="true" className="absolute right-3 top-3 grid h-6 w-6 place-items-center rounded-full bg-[#5b3df5] text-[13px] font-bold text-white">✓</span>
            <div className="flex items-center gap-2 pr-8 text-[15px] font-semibold text-[#1d1a3b]">
              <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-[#5b3df5]"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1" /></svg>
              Приховане
            </div>
            <div className="mt-0.5 text-[13px] text-black/65">У YouTube: «Не для всіх» (Unlisted)</div>
            <p className="mt-1.5 text-[14px] leading-relaxed text-[#4b4a66]">Відео доступне тим, хто має посилання.</p>
            <span className="mt-2.5 inline-flex items-center gap-1 rounded-full bg-[#5b3df5] px-3 py-1 text-[13px] font-semibold text-white"><span aria-hidden="true">✓</span> Підходить</span>
          </li>
          <li className="rounded-2xl border border-[#e6e8f6] bg-white p-4">
            <div className="flex items-center gap-2 text-[15px] font-semibold text-[#1d1a3b]">
              <span className="shrink-0 text-black/50" aria-hidden="true"><Icon name="lock" size={20} /></span>
              Приватне
            </div>
            <div className="mt-0.5 text-[13px] text-black/60">У YouTube: «Приватне»</div>
            <p className="mt-1.5 text-[14px] leading-relaxed text-[#4b4a66]">Учасники програми не зможуть відкрити відео.</p>
            <span className="mt-2.5 inline-flex items-center gap-1 rounded-full bg-rose-50 px-3 py-1 text-[13px] font-semibold text-rose-700"><span aria-hidden="true">✕</span> Не підходить</span>
          </li>
        </ul>
        <div className="mt-4 flex items-start gap-3 rounded-xl border border-[#e3def9] bg-[#f1eefe] px-4 py-3">
          <span className="mt-0.5 shrink-0 text-[#5b3df5]" aria-hidden="true"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8v.01" /></svg></span>
          <p className="text-[14px] leading-relaxed text-[#4b4a66]"><strong className="text-[#2d2a5c]">Так само додаються й відео в уроках:</strong> на YouTube воно має бути «Приховане», а сюди вставляється лише посилання.</p>
        </div>
      {videoNav}
      </section>
      )}

      {videoMode === "own" && part === 4 && (
      <section aria-labelledby="video-link-label" className="rounded-2xl border border-[#e6e8f6] bg-white p-5 shadow-[0_18px_40px_-34px_rgba(60,50,140,0.5)] sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <label id="video-link-label" tabIndex={-1} htmlFor="intro-video-url" className="scroll-mt-24 text-[16px] focus:outline-none font-bold text-[#1d1a3b]">Посилання на відео</label>
          <span className="rounded-full bg-[#f1eefe] px-2.5 py-0.5 text-[12px] font-semibold text-[#4a2fd0]">Обов'язково</span>
        </div>
        <input
          id="intro-video-url"
          value={introVideoUrl}
          onChange={(e) => { setIntroVideoUrl(e.target.value); ownVideoRef.current = e.target.value; setFromProfile(false); }}
          onBlur={() => setLinkTouched(true)}
          placeholder="https://youtu.be/..."
          inputMode="url"
          aria-required="true"
          aria-invalid={(stepErrors.length > 0 && !introVideoUrl.trim()) || (introVideoUrl.trim() !== "" && !isYoutubeUrl(introVideoUrl)) ? true : undefined}
          aria-describedby={showBadLink ? "intro-video-help intro-video-bad" : "intro-video-help"}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          className="mt-3 w-full min-h-[48px] rounded-xl border border-black/15 bg-white px-4 py-2.5 text-[15px] text-[#1d1a3b] placeholder:text-black/50 transition focus:border-[#5b3df5] focus:outline-none focus:shadow-[0_0_0_3px_rgba(91,61,245,0.12)]"
        />
        <p id="intro-video-help" className="mt-2 text-[14px] text-black/60">Вставте посилання на ваше відео з YouTube.</p>
        {showBadLink && (
          <div id="intro-video-bad" role="alert" className="mt-2 text-[13px] text-rose-700">Це не схоже на посилання YouTube. Приклад: https://youtu.be/…</div>
        )}
        {videoUnavailable && (
          <div role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-[14px] leading-relaxed text-rose-800">{UNAVAILABLE_VIDEO_MESSAGE}</div>
        )}
        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] xl:items-stretch">
          {introVideoId ? (
            <div className="relative w-full max-w-[680px] overflow-hidden rounded-2xl border border-black/10 bg-black xl:max-w-none">
              <div aria-hidden="true" className="aspect-video w-full" />
              <iframe
                title="Попередній перегляд відео-презентації"
                src={`https://www.youtube-nocookie.com/embed/${introVideoId}`}
                loading="lazy"
                allow="encrypted-media; picture-in-picture"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
                className="absolute inset-0 h-full w-full"
              />
            </div>
          ) : (
            <div className="flex aspect-video w-full max-w-[680px] flex-col items-center justify-center gap-2 rounded-2xl xl:max-w-none border border-dashed border-[#c9bdfb] bg-[#faf9ff] px-4 text-center">
              <VideoArt kind="player" className="h-20 w-28" />
              <p className="text-[14px] text-[#4b4a66]">Тут з'явиться попередній перегляд вашого відео</p>
            </div>
          )}
          <aside aria-labelledby="video-next-title" className="relative flex w-full max-w-[680px] flex-col gap-3 overflow-hidden rounded-2xl border border-[#e3def9] bg-gradient-to-br from-[#f6f4ff] to-[#ece9fe] p-4 xl:max-w-none">
            <div className="flex min-h-[40px] items-center justify-between gap-3">
              <div className="min-w-0">
                <h4 id="video-next-title" className="flex items-center gap-2 text-[16px] font-bold leading-tight text-[#1d1a3b]">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white text-[#5b3df5]" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8v.01" /></svg>
                  </span>
                  Що буде далі?
                </h4>
              </div>
              <VideoArt kind="player" className="-my-4 h-[60px] w-[86px] shrink-0" />
            </div>
            <ul className="flex flex-1 flex-col gap-2">
              {[
                "Відео зберігається у вашій програмі.",
                "Учасники зможуть переглядати його на платформі Sensoria.",
                "Ви зможете у будь-який момент змінити посилання.",
              ].map((t) => (
                <li key={t} className="flex min-h-[56px] flex-1 items-center gap-3 rounded-xl bg-white/90 px-3.5 py-2.5">
                  <span aria-hidden="true" className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#ece9fe] text-[#5b3df5]">
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                  </span>
                  <span className="text-[14px] leading-snug text-[#1d1a3b]">{t}</span>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      {videoNav}
      </section>
      )}
      </Step>
      )}

      {type === "program" && (
      <Step n={7} current={step} errors={stepErrors} icon="sparkle" tight title="Використання ШІ" hint="Покупці побачать, чи використовували ви ШІ.">
      <div className="grid items-stretch gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,400px)]">
      <div className="flex h-full flex-col justify-between gap-5 rounded-2xl border border-[#e6e8f6] bg-white p-5 sm:p-6">
        <div>
          <h3 id="ai-usage-label" className="text-[17px] font-bold leading-tight text-[#1d1a3b]">Використання ШІ</h3>
          <p className="mt-2 text-[14px] leading-relaxed text-[#4b4a66]">
            Обов'язково для кожної програми. Якщо під час створення використовували ШІ (тексти, зображення, аудіо), покупці бачитимуть
            позначку «AI» на картці програми. Обирайте чесно: це питання довіри.
          </p>
        </div>
        <div
          className="grid gap-3 sm:grid-cols-2"
          role="radiogroup"
          aria-labelledby="ai-usage-label"
          aria-required="true"
          aria-describedby={step === 7 && stepErrors.length > 0 ? "step-7-errors" : undefined}
          onKeyDown={(e) => {
            // a radio group is one tab stop; the arrows move between its options (and choose them)
            const order = ["none", "used"] as const;
            const cur = order.indexOf((aiDeclaration(tags) as (typeof order)[number]) ?? "none");
            const move = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
            if (!move) return;
            e.preventDefault();
            const next = order[(cur + move + order.length) % order.length];
            setTags((t) => withAiDeclaration(t, next));
            window.setTimeout(() => document.getElementById(`ai-option-${next}`)?.focus(), 0);
          }}
        >
          {([
            ["none", "ШІ не використовувався"],
            ["used", "Використовувався ШІ"],
          ] as const).map(([value, label]) => {
            const chosen = aiDeclaration(tags);
            const active = chosen === value;
            const tabStop = chosen ? active : value === "none"; // nothing chosen yet: the first option is the tab stop
            return (
              <button
                key={value}
                id={`ai-option-${value}`}
                type="button"
                role="radio"
                aria-checked={active}
                tabIndex={tabStop ? 0 : -1}
                aria-invalid={tabStop && !chosen && stepErrors.length > 0 && step === 7 ? true : undefined}
                onClick={() => setTags((cur) => withAiDeclaration(cur, value))}
                className={`relative flex min-h-[64px] items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left text-[15px] font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5b3df5]/50 ${
                  active ? "border-[#5b3df5] bg-[#f6f4ff] text-[#2d2a5c]" : "border-[#e3def9] bg-white text-[#2d2a5c] hover:border-[#b8abf7] hover:bg-[#faf9ff]"
                }`}
              >
                <span aria-hidden="true" className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 ${active ? "border-[#5b3df5] bg-[#5b3df5] text-white" : "border-[#b8b3d8] bg-white"}`}>
                  {active && <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}
                </span>
                <span className="min-w-0 flex-1">{label}</span>
              </button>
            );
          })}
        </div>
        {/* a live example of what the choice means on a program card (only reads the current choice) */}
        <div className="flex items-center gap-4 rounded-2xl border border-[#e3def9] bg-[#f6f4ff] p-3.5">
          <div aria-hidden="true" className="relative h-[60px] w-[104px] shrink-0 overflow-hidden rounded-xl bg-gradient-to-br from-[#b8abf7] to-[#6d4df5]">
            <span className="absolute bottom-2 left-2 h-1.5 w-12 rounded-full bg-white/60" />
            <span className="absolute bottom-5 left-2 h-1.5 w-8 rounded-full bg-white/40" />
            {aiDeclaration(tags) === "used" && <span className="absolute right-1.5 top-1.5 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-bold tracking-wide text-violet-700">AI</span>}
          </div>
          <p className="min-w-0 text-[14px] leading-snug text-[#2d2a5c]" aria-live="polite">
            <span className="font-semibold">Так це побачать покупці. </span>
            {aiDeclaration(tags) === "used"
              ? "На картці програми буде позначка «AI»."
              : aiDeclaration(tags) === "none"
                ? "На картці програми не буде позначки «AI»."
                : "Оберіть варіант, і тут з'явиться приклад картки."}
          </p>
        </div>
      </div>
        <aside aria-labelledby="ai-meaning" className="relative flex h-full flex-col gap-3 overflow-hidden rounded-2xl border border-[#e3def9] bg-gradient-to-br from-[#f6f4ff] to-[#ece9fe] p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 id="ai-meaning" className="flex min-w-0 items-center gap-2 text-[16px] font-bold leading-tight text-[#1d1a3b]">
              <span className="shrink-0 text-[#5b3df5]" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8v.01" /></svg>
              </span>
              <span className="min-w-0">Що означає ця позначка?</span>
            </h3>
            <AiArt className="pointer-events-none -my-3 hidden h-[60px] w-[70px] shrink-0 min-[420px]:block" />
          </div>
          <ul className="flex flex-1 flex-col gap-2">
            {[
              ["Прозорість і чесність", "Учасники бачать, як створювався матеріал."],
              ["Усвідомлений вибір", "Людина може краще оцінити програму перед придбанням."],
              ["Довіра до автора", "Відкрите повідомлення про використання ШІ допомагає будувати довіру."],
            ].map(([t, d]) => (
              <li key={t} className="flex flex-1 items-center gap-3 rounded-xl bg-white/90 px-3 py-2.5">
                <span aria-hidden="true" className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#ece9fe] text-[#5b3df5]">
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                </span>
                <div className="min-w-0">
                  <div className="text-[15px] font-semibold leading-snug text-[#1d1a3b]">{t}</div>
                  <p className="mt-0.5 text-[14px] leading-snug text-[#4b4a66]">{d}</p>
                </div>
              </li>
            ))}
          </ul>
        </aside>
      </div>
      </Step>
      )}

      <Step n={stepNo("risk")} current={step} errors={stepErrors} icon="shield" title="Теми підвищеного ризику" hint="Позначте, якщо матеріал їх торкається.">
      {renderRiskPanel()}
      </Step>

      {type === "program" && (
      <Step n={9} current={step} errors={stepErrors} icon="guide" title="Модулі та уроки" hint="Складіть програму з модулів. У кожному модулі — уроки.">
        <div>
          <p className="mb-4 text-[14px] leading-relaxed text-[#4b4a66]">
            Модуль — це розділ програми. Відео (YouTube «Приховане»), аудіо,
            PDF і текст додаються в уроках усередині модуля. Кількість уроків рахується автоматично. Максимум: {MAX_MODULES} модулів, до {MAX_LESSONS_PER_MODULE} уроків у кожному.
          </p>

          <nav aria-label="Модулі програми" className="mb-4 flex flex-wrap items-center gap-1.5">
            {modules.map((m, i) => {
              const active = i === curMod;
              const lessonsN = m.items?.length ?? 0;
              return (
                <Fragment key={i}>
                  {i > 0 && <span aria-hidden="true" className="text-[#8b84c9]">→</span>}
                  <button
                    type="button"
                    onClick={() => setModIdx(i)}
                    aria-current={active ? "step" : undefined}
                    className={`inline-flex min-h-[44px] max-w-[220px] items-center gap-2 rounded-full px-4 text-[14px] font-semibold transition ${
                      active ? "bg-[#5b3df5] text-white" : "bg-[#ece9fe] text-[#4a2fd0] hover:bg-[#e3def9]"
                    }`}
                  >
                    <span aria-hidden="true" className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[13px] ${active ? "bg-white/20" : "bg-white"}`}>{i + 1}</span>
                    <span className="truncate">{m.title.trim() || `Модуль ${i + 1}`}</span>
                    {publishProblems.length > 0 && (!m.title.trim() || (m.items?.length ?? 0) === 0 || (m.items ?? []).some((x) => lessonChecks(x).length > 0)) && (
                      <span className="shrink-0 rounded-full bg-rose-600 px-2 text-[12px] font-bold text-white" title="Потребує уваги">!<span className="sr-only"> потребує уваги</span></span>
                    )}
                    {lessonsN > 0 && <span className={`shrink-0 text-[14px] font-medium ${active ? "text-white/80" : "text-[#6b5fc7]"}`}>· {lessonsN}</span>}
                  </button>
                </Fragment>
              );
            })}
            <span aria-hidden="true" className="text-[#8b84c9]">→</span>
            <button
              type="button"
              onClick={() => { setModules((prev) => [...prev, emptyModule()]); setModIdx(modules.length); }}
              disabled={modules.length >= MAX_MODULES}
              className="inline-flex min-h-[44px] items-center rounded-full border border-dashed border-[#b9aef5] bg-white px-4 text-[14px] font-semibold text-[#4a2fd0] hover:bg-[#f6f4ff] disabled:opacity-40"
            >
              + Додати модуль
            </button>
          </nav>

          <div className="flex flex-col gap-3">
            {modules.map((m, i) => (
              <div
                key={i}
                className={`${i === curMod ? "flex" : "hidden"} flex-col gap-4 rounded-2xl border border-[#e3def9] bg-[#f6f4ff] p-3 sm:p-5`}
              >
                <div className="flex flex-col gap-3">
                  <div className="grid gap-3">
                    <label className="flex flex-col gap-1 text-[13px] font-medium text-[#1d1a3b]">
                      <span className="flex flex-wrap items-baseline justify-between gap-2">Назва модуля <LimitHint value={m.title} limit={CONTENT_LIMITS.moduleTitle} /></span>
                      <input
                        value={m.title}
                        maxLength={CONTENT_LIMITS.moduleTitle.max}
                        onChange={(e) => updateModule(i, { title: e.target.value })}
                        placeholder={`Модуль ${i + 1}: назва`}
                        className="min-h-[44px] rounded-xl border border-[#d9d4f5] bg-white px-3 text-[14px] font-normal focus:border-[#5b3df5] focus:outline-none"
                      />
                    </label>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => { moveModule(i, -1); setModIdx(i - 1); }}
                      disabled={i === 0}
                      className="min-h-[44px] rounded-full border border-[#d9d4f5] bg-white px-4 text-[13px] font-semibold text-[#4a2fd0] hover:bg-[#ece9fe] disabled:opacity-40"
                    >
                      ← Перемістити раніше
                    </button>
                    <button
                      type="button"
                      onClick={() => { moveModule(i, 1); setModIdx(i + 1); }}
                      disabled={i === modules.length - 1}
                      className="min-h-[44px] rounded-full border border-[#d9d4f5] bg-white px-4 text-[13px] font-semibold text-[#4a2fd0] hover:bg-[#ece9fe] disabled:opacity-40"
                    >
                      Перемістити пізніше →
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setModules((prev) => prev.filter((_, idx) => idx !== i));
                        setModIdx(Math.max(0, i - 1));
                        setExpandedItems({});
                        setLessonIdx({});
                        setGiftPickerFor(null);
                      }}
                      disabled={modules.length === 1}
                      className="min-h-[44px] rounded-full px-4 text-[13px] font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-40 sm:ml-auto"
                    >
                      Видалити модуль
                    </button>
                  </div>
                </div>

                {/* LESSONS — individual content_items inside this
                    module. This is the layer that actually gets
                    rendered as separate "уроки" one at a time in the
                    Lesson Player (ProgramExperience.tsx). Video links live
                    on lessons only, never on the module. */}
                <div className="flex flex-col gap-3 border-t border-[#e3def9] pt-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[15px] font-semibold text-[#1d1a3b]">
                      Уроки{m.items && m.items.length > 0 ? ` (${m.items.length})` : ""}
                    </span>
                    <button
                      type="button"
                      onClick={() => setGiftPickerFor((cur) => (cur === i ? null : i))}
                      disabled={lessonLimitReached(modules, i)}
                      className="inline-flex min-h-[44px] items-center rounded-full px-3 text-[14px] font-semibold text-[#6d28d9] hover:bg-[#ece9fe] disabled:opacity-40"
                    >
                      + Подарунок
                    </button>
                  </div>

                  <nav aria-label="Уроки модуля" className="flex flex-wrap items-center gap-1.5">
                    {(m.items ?? []).map((it, ii) => {
                      const active = ii === Math.min(lessonIdx[i] ?? 0, (m.items?.length ?? 1) - 1);
                      return (
                        <Fragment key={ii}>
                          {ii > 0 && <span aria-hidden="true" className="text-[#8b84c9]">→</span>}
                          <button
                            type="button"
                            onClick={() => setLessonIdx((prev) => ({ ...prev, [i]: ii }))}
                            aria-current={active ? "step" : undefined}
                            className={`inline-flex min-h-[44px] max-w-[220px] items-center gap-2 rounded-full px-4 text-[14px] font-semibold transition ${
                              active ? "bg-[#5b3df5] text-white" : "bg-[#ece9fe] text-[#4a2fd0] hover:bg-[#e3def9]"
                            }`}
                          >
                            <span aria-hidden="true" className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[13px] ${active ? "bg-white/20" : "bg-white"}`}>{ii + 1}</span>
                            <span className="truncate">{it.title.trim() || (it.materialId ? "Подарунок" : `Урок ${ii + 1}`)}</span>
                            {publishProblems.length > 0 && lessonChecks(it).length > 0 && (
                              <span className="shrink-0 rounded-full bg-rose-600 px-2 text-[12px] font-bold text-white" title="Потребує уваги">!<span className="sr-only"> потребує уваги</span></span>
                            )}
                          </button>
                        </Fragment>
                      );
                    })}
                    {(m.items?.length ?? 0) > 0 && <span aria-hidden="true" className="text-[#8b84c9]">→</span>}
                    <button
                      type="button"
                      onClick={() => addItem(i)}
                      disabled={lessonLimitReached(modules, i)}
                      className="inline-flex min-h-[44px] items-center rounded-full border border-dashed border-[#b9aef5] bg-white px-4 text-[14px] font-semibold text-[#4a2fd0] hover:bg-[#f6f4ff] disabled:opacity-40"
                    >
                      + Додати урок
                    </button>
                  </nav>

                  {giftPickerFor === i && (
                    <div className="rounded-lg border border-[#c4b5fd] bg-[#f5f3ff] p-3 flex flex-col gap-2">
                      <div className="text-[14px] text-[#5b21b6]">
                        Оберіть свою медитацію чи гайд. Учасники цієї програми отримають її як окремий урок безкоштовно, навіть якщо окремо вона платна.
                      </div>
                      {giftCandidates.filter((c) => !(m.items ?? []).some((x) => x.materialId === c.id)).length === 0 ? (
                        <div className="text-[14px] text-black/60">Немає доступних матеріалів: потрібна опублікована медитація чи гайд (і не доданий уже в цей модуль).</div>
                      ) : (
                        giftCandidates
                          .filter((c) => !(m.items ?? []).some((x) => x.materialId === c.id))
                          .map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => addGiftLesson(i, c)}
                              className="flex min-h-[44px] items-center justify-between gap-3 rounded-lg border border-[#d9d4f5] bg-white px-3 py-2 text-left hover:bg-black/[0.02]"
                            >
                              <span className="min-w-0">
                                <span className="block truncate text-[13px] font-medium text-black">{c.title}</span>
                                <span className="block text-[13px] text-black/60">{c.type === "meditation" ? "Медитація" : "Гайд"} · {Number(c.price) > 0 ? `окремо ${c.price} ₴` : "безкоштовно"}</span>
                              </span>
                              <span className="shrink-0 text-[14px] text-[#6d28d9]">Додати</span>
                            </button>
                          ))
                      )}
                    </div>
                  )}

                  {(m.items ?? []).map((it, ii) => {
                    const key = `${i}:${ii}`;
                    const expanded = true;
                    const shown = ii === Math.min(lessonIdx[i] ?? 0, (m.items?.length ?? 1) - 1);
                    if (it.materialId) {
                      const src = content.find((c) => c.id === it.materialId);
                      return (
                        <div key={ii} className={`${shown ? "" : "hidden"} rounded-2xl border border-[#d9d4f5] bg-white`}>
                          <div className="flex flex-col gap-4 p-4 sm:p-5">
                            <div className="flex items-start gap-3">
                              <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#ece9fe] text-[#5b3df5]">
                                <Icon name={src?.type === "meditation" ? "headphones" : "guide"} size={22} />
                              </span>
                              <div className="min-w-0 flex-1">
                                <span className="inline-flex items-center rounded-full bg-[#ece9fe] px-3 py-1 text-[13px] font-semibold text-[#4a2fd0]">Подарунок учасникам</span>
                                <div className="mt-1.5 break-words text-[16px] font-semibold text-[#1d1a3b]">{src?.title ?? it.title}</div>
                                <div className="text-[14px] text-black/60">
                                  {src ? `${src.type === "meditation" ? "Медитація" : "Гайд"}${Number(src.price) > 0 ? ` · окремо ${src.price} ₴, у програмі безкоштовно` : ""}` : "Матеріал не знайдено серед ваших опублікованих"}
                                </div>
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e3def9] pt-4">
                              <div className="flex flex-wrap items-center gap-2">
                                <button type="button" onClick={() => { moveItem(i, ii, -1); setLessonIdx((prev) => ({ ...prev, [i]: ii - 1 })); }} disabled={ii === 0} className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-[#d9d4f5] bg-white px-4 text-[13px] font-semibold text-[#4a2fd0] hover:bg-[#ece9fe] disabled:opacity-40">← Раніше</button>
                                <button type="button" onClick={() => { moveItem(i, ii, 1); setLessonIdx((prev) => ({ ...prev, [i]: ii + 1 })); }} disabled={ii === (m.items?.length ?? 0) - 1} className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-[#d9d4f5] bg-white px-4 text-[13px] font-semibold text-[#4a2fd0] hover:bg-[#ece9fe] disabled:opacity-40">Пізніше →</button>
                              </div>
                              <button type="button" onClick={() => removeItem(i, ii)} className="min-h-[44px] rounded-full px-4 text-[14px] font-semibold text-rose-700 hover:bg-rose-50">Прибрати подарунок</button>
                            </div>
                          </div>
                        </div>
                      );
                    }
                    const hasText = (v?: string) => !!v && v.trim().length > 0;
                    const cwKey = `${key}:cw`;
                    const clKey = `${key}:cl`;
                    const cwOn = expandedItems[cwKey] ?? hasText(it.contentWarning);
                    const clOn = expandedItems[clKey] ?? checklistItems(it.checklist).length > 0;
                    const clParts = splitChecklist(it.checklist);
                    const clRows = clParts.items.length > 0 ? clParts.items : [""];
                    const setCl = (title: string, items: string[]) => updateItem(i, ii, { checklist: title.trim() ? [`# ${title}`, ...items] : items });
                    const setExtra = (k: string, on: boolean) => setExpandedItems((prev) => ({ ...prev, [k]: on }));
                    const chips: string[] = [];
                    const firstWarning = parseWarning(it.contentWarning).topics[0];
                    const mainWarning = firstWarning ?? parseWarning(it.contentWarning).custom.trim();
                    if (mainWarning) chips.push(`⚠ ${mainWarning}`);
                    if (hasText(it.videoUrl)) chips.push("Відео");
                    if (it.audioUrl) chips.push(it.durationMinutes ? `Аудіо · ${it.durationMinutes} хв` : "Аудіо");
                    if (it.fileUrl) chips.push("PDF");
                    if (it.imageUrl) chips.push("Зображення");
                    if (hasText(it.body)) chips.push("Текст");
                    const fieldCls = "min-h-[44px] w-full rounded-xl border border-[#d9d4f5] bg-white px-3 text-[14px] text-black placeholder:text-black/55 focus:border-[#5b3df5] focus:outline-none";
                    const areaCls = "w-full resize-none rounded-xl border border-[#d9d4f5] bg-white px-3 py-2.5 text-[14px] text-black placeholder:text-black/55 focus:border-[#5b3df5] focus:outline-none";
                    const pillBtn = "inline-flex min-h-[44px] items-center justify-center rounded-full border border-[#d9d4f5] bg-white px-4 text-[13px] font-semibold text-[#4a2fd0] hover:bg-[#ece9fe]";
                    return (
                      <div key={ii} className={`${shown ? "" : "hidden"} rounded-2xl border border-[#d9d4f5] bg-white`}>
                        {expanded && (
                          <div className="flex flex-col gap-6 p-3 sm:p-5">
                            <section className="flex flex-col gap-3">
                              <h4 className="text-[15px] font-semibold text-[#1d1a3b]">1. Про урок</h4>
                              <label className="flex flex-col gap-1.5 text-[14px] font-medium text-[#1d1a3b]">
                                <span className="flex flex-wrap items-baseline justify-between gap-2">Назва уроку <LimitHint value={it.title} limit={CONTENT_LIMITS.lessonTitle} /></span>
                                <input
                                  value={it.title}
                                  maxLength={CONTENT_LIMITS.lessonTitle.max}
                                  data-lesson-title={key}
                                  onChange={(e) => updateItem(i, ii, { title: e.target.value })}
                                  placeholder={`Наприклад: Урок ${ii + 1}. Вступ`}
                                  className={fieldCls}
                                />
                              </label>
                              <label className="flex flex-col gap-1.5 text-[14px] font-medium text-[#1d1a3b]">
                                <span className="flex flex-wrap items-baseline justify-between gap-2">Текст або опис <LimitHint value={it.body ?? ""} limit={CONTENT_LIMITS.lessonBody} optional /></span>
                                <span className="-mt-1 text-[13px] font-normal text-black/60">Що учасник прочитає в цьому уроці</span>
                                <textarea
                                  value={it.body ?? ""}
                                  maxLength={CONTENT_LIMITS.lessonBody.max}
                                  onChange={(e) => updateItem(i, ii, { body: e.target.value })}
                                  rows={4}
                                  placeholder="Напишіть текст уроку або короткий опис практики"
                                  className={areaCls}
                                />
                              </label>
                            </section>

                            <section className="flex flex-col gap-3">
                              <div>
                                <h4 className="text-[15px] font-semibold text-[#1d1a3b]">2. Матеріали</h4>
                                <p className="text-[13px] text-black/60">Додайте те, що потрібно уроку. Усе необов'язково, але в уроці має бути хоча б щось одне.</p>
                              </div>
                              <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2">
                                <MaterialTile icon="video" title="Відео YouTube" state={hasText(it.videoUrl) ? "Посилання додано" : "Ще не додано"} done={hasText(it.videoUrl)}>
                                  <input
                                    value={it.videoUrl ?? ""}
                                    onChange={(e) => updateItem(i, ii, { videoUrl: e.target.value })}
                                    placeholder="https://youtu.be/..."
                                    aria-label="Посилання на відео YouTube"
                                    className={fieldCls}
                                  />
                                </MaterialTile>

                                <MaterialTile icon="headphones" error={itemErrors[`${key}:audio`]} title="Аудіо" state={itemUploading === `${i}:${ii}:audio` ? "Завантаження…" : it.audioUrl ? (it.durationMinutes ? `Завантажено · ${it.durationMinutes} хв` : "Завантажено") : "Файл mp3 · тривалість визначиться сама"} done={!!it.audioUrl}>
                                  <div className="flex flex-wrap gap-2">
                                    <label className={`${pillBtn} cursor-pointer`}>
                                      {it.audioUrl ? "Замінити файл" : "Обрати файл"}
                                      <input type="file" accept="audio/*" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) handleItemAudioUpload(i, ii, file); }} />
                                    </label>
                                    {it.audioUrl && (
                                      <button type="button" onClick={() => updateItem(i, ii, { audioUrl: undefined, durationMinutes: undefined })} className="min-h-[44px] rounded-full px-3 text-[13px] font-semibold text-rose-700 hover:bg-rose-50">Прибрати</button>
                                    )}
                                  </div>
                                </MaterialTile>

                                <MaterialTile icon="guide" error={itemErrors[`${key}:file`]} title="PDF-матеріал" state={itemUploading === `${i}:${ii}:file` ? "Завантаження…" : it.fileUrl ? (it.fileName ?? "Завантажено") : "Не додано"} done={!!it.fileUrl}>
                                  <div className="flex flex-wrap gap-2">
                                    <label className={`${pillBtn} cursor-pointer`}>
                                      {it.fileUrl ? "Замінити файл" : "Обрати файл"}
                                      <input type="file" accept=".pdf" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) handleItemFileUpload(i, ii, file); }} />
                                    </label>
                                    {it.fileUrl && (
                                      <button type="button" onClick={() => updateItem(i, ii, { fileUrl: undefined, fileName: undefined, fileSizeLabel: undefined })} className="min-h-[44px] rounded-full px-3 text-[13px] font-semibold text-rose-700 hover:bg-rose-50">Прибрати</button>
                                    )}
                                  </div>
                                </MaterialTile>

                                <MaterialTile icon="image" error={itemErrors[`${key}:image`]} title="Зображення" state={itemUploading === `${i}:${ii}:image` ? "Завантаження…" : it.imageUrl ? "Завантажено" : "Не додано"} done={!!it.imageUrl}>
                                  <div className="flex flex-wrap items-center gap-2">
                                    {it.imageUrl && <img src={it.imageUrl} alt="" className="h-11 w-11 rounded-lg border border-[#d9d4f5] object-cover" />}
                                    <label className={`${pillBtn} cursor-pointer`}>
                                      {it.imageUrl ? "Замінити" : "Обрати файл"}
                                      <input type="file" accept="image/*" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) handleItemImageUpload(i, ii, file); }} />
                                    </label>
                                    {it.imageUrl && (
                                      <button type="button" onClick={() => updateItem(i, ii, { imageUrl: undefined })} className="min-h-[44px] rounded-full px-3 text-[13px] font-semibold text-rose-700 hover:bg-rose-50">Прибрати</button>
                                    )}
                                  </div>
                                </MaterialTile>
                              </div>
                            </section>

                            <section className="flex flex-col gap-3">
                              <div>
                                <h4 className="text-[15px] font-semibold text-[#1d1a3b]">3. Додатково</h4>
                                <p className="text-[13px] text-black/60">Увімкніть лише те, що потрібно.</p>
                              </div>

                              <div className="rounded-xl border border-[#e3def9] bg-[#f6f4ff] p-3">
                                <label className="flex min-h-[44px] cursor-pointer items-center gap-3 text-[14px] font-semibold text-[#1d1a3b]">
                                  <input type="checkbox" className="h-5 w-5 accent-[#5b3df5]" checked={cwOn} onChange={(e) => { setExtra(cwKey, e.target.checked); if (!e.target.checked) updateItem(i, ii, { contentWarning: undefined }); }} />
                                  <span>Попередження про зміст <span className="block text-[13px] font-normal text-black/60">Учасник побачить його перед уроком і має натиснути «Готовий продовжити»</span></span>
                                </label>
                                {cwOn && (
                                  <div className="mt-2 flex flex-col gap-3">
                                    <p className="text-[13px] text-black/60">Оберіть одну тему зі списку або напишіть свій варіант.</p>
                                    <div role="group" aria-label="Теми попередження" className="flex flex-wrap gap-2">
                                      {WARNING_TOPICS.map((topic) => {
                                        const on = parseWarning(it.contentWarning).topics[0] === topic;
                                        return (
                                          <button
                                            key={topic}
                                            type="button"
                                            aria-pressed={on}
                                            onClick={() => { setExtra(cwKey, true); updateItem(i, ii, { contentWarning: toggleWarningTopic(it.contentWarning, topic) }); }}
                                            className={`min-h-[44px] rounded-full border px-4 text-[14px] font-medium transition ${on ? "border-[#5b3df5] bg-[#5b3df5] text-white" : "border-[#d9d4f5] bg-white text-[#1d1a3b] hover:bg-[#ece9fe]"}`}
                                          >
                                            {on ? "✓ " : ""}{topic}
                                          </button>
                                        );
                                      })}
                                    </div>
                                    <label className="flex flex-col gap-1.5 text-[14px] font-medium text-[#1d1a3b]">
                                      Свій варіант <span className="-mt-1 text-[13px] font-normal text-black/60">До {MAX_WARNING_CUSTOM_CHARS} символів. Замінює вибрану тему.</span>
                                      <input
                                        value={parseWarning(it.contentWarning).custom}
                                        maxLength={MAX_WARNING_CUSTOM_CHARS}
                                        onChange={(e) => { setExtra(cwKey, true); updateItem(i, ii, { contentWarning: setCustomWarning(e.target.value) }); }}
                                        placeholder="Напр.: розлучення"
                                        className={fieldCls}
                                      />
                                    </label>
                                  </div>
                                )}
                              </div>

                              <div className="rounded-xl border border-[#e3def9] bg-[#f6f4ff] p-3">
                                <label className="flex min-h-[44px] cursor-pointer items-center gap-3 text-[14px] font-semibold text-[#1d1a3b]">
                                  <input type="checkbox" className="h-5 w-5 accent-[#5b3df5]" checked={clOn} onChange={(e) => { setExtra(clKey, e.target.checked); if (!e.target.checked) updateItem(i, ii, { checklist: undefined }); }} />
                                  <span>Чек-лист <span className="block text-[13px] font-normal text-black/60">Список кроків, які учасник відзначає сам</span></span>
                                </label>
                                {clOn && (
                                  <div className="mt-2 flex flex-col gap-3">
                                    <label className="flex flex-col gap-1.5 text-[14px] font-medium text-[#1d1a3b]">
                                      <span>Назва чек-листа <span className="font-normal text-black/60">(необов'язково, до {CHECKLIST_TITLE_MAX} символів)</span></span>
                                      <input
                                        value={clParts.title}
                                        maxLength={CHECKLIST_TITLE_MAX}
                                        onChange={(e) => setCl(e.target.value, clRows)}
                                        placeholder="Напр.: Мій план на тиждень"
                                        className={fieldCls}
                                      />
                                    </label>
                                    <div className="flex flex-col gap-2">
                                      <span className="text-[14px] font-medium text-[#1d1a3b]">Пункти <span className="font-normal text-black/60">(від {CHECKLIST_ITEMS_MIN} до {CHECKLIST_ITEMS_MAX}, кожен {CHECKLIST_ITEM_MIN}–{CHECKLIST_ITEM_MAX} символів)</span></span>
                                      <ul className="flex flex-col gap-2">
                                        {clRows.map((row, ri) => (
                                          <li key={ri} className="flex items-center gap-2">
                                            <span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 border-[#b9aef5] bg-white" />
                                            <input
                                              value={row}
                                              maxLength={CHECKLIST_ITEM_MAX}
                                              data-cl-row={`${key}:${ri}`}
                                              onChange={(e) => setCl(clParts.title, clRows.map((r, rj) => (rj === ri ? e.target.value : r)))}
                                              onKeyDown={(e) => {
                                                if (e.key === "Enter") {
                                                  e.preventDefault();
                                                  if (clRows.length >= CHECKLIST_ITEMS_MAX) return;
                                                  setCl(clParts.title, [...clRows.slice(0, ri + 1), "", ...clRows.slice(ri + 1)]);
                                                  setTimeout(() => document.querySelector<HTMLInputElement>(`[data-cl-row="${key}:${ri + 1}"]`)?.focus(), 0);
                                                }
                                              }}
                                              aria-label={`Пункт ${ri + 1}`}
                                              placeholder={`Пункт ${ri + 1}`}
                                              className={fieldCls}
                                            />
                                            <button
                                              type="button"
                                              onClick={() => setCl(clParts.title, clRows.filter((_, rj) => rj !== ri))}
                                              disabled={clRows.length === 1 && !row}
                                              aria-label={`Видалити пункт ${ri + 1}`}
                                              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-black/50 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-30"
                                            >
                                              ✕
                                            </button>
                                          </li>
                                        ))}
                                      </ul>
                                      <button
                                        type="button"
                                        onClick={() => setCl(clParts.title, [...clRows, ""])}
                                        disabled={clRows.length >= CHECKLIST_ITEMS_MAX}
                                        className="inline-flex min-h-[44px] items-center self-start rounded-full border border-dashed border-[#b9aef5] bg-white px-4 text-[14px] font-semibold text-[#4a2fd0] hover:bg-[#f6f4ff] disabled:opacity-40"
                                      >
                                        + Додати пункт
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>

                              <div className="rounded-xl border border-[#e3def9] bg-[#f6f4ff] p-3">
                                <label className="flex min-h-[44px] cursor-pointer items-center gap-3 text-[14px] font-semibold text-[#1d1a3b]">
                                  <input
                                    type="checkbox"
                                    className="h-5 w-5 accent-[#5b3df5]"
                                    checked={!!it.practice}
                                    onChange={(e) => updateItem(i, ii, { practice: e.target.checked ? { type: "text", prompt: "" } : undefined })}
                                  />
                                  <span>Практика «Спробуйте зараз» <span className="block text-[13px] font-normal text-black/60">Питання чи вправа після уроку</span></span>
                                </label>
                                <div className="mt-2">
                                  {it.practice && (() => {
                                    const pr = it.practice;
                                    const setPr = (patch: Partial<typeof pr>) => updateItem(i, ii, { practice: { ...pr, ...patch } });
                                    const opts = pr.options && pr.options.length > 0 ? pr.options : [""];
                                    const OPT_MAX = pr.type === "choice" ? 4 : 6;
                                    return (
                                      <div className="flex flex-col gap-4">
                                        <div className="flex flex-col gap-2">
                                          <span id={`pt-${key}`} className="text-[14px] font-medium text-[#1d1a3b]">Яку відповідь дасте учаснику?</span>
                                          <div role="radiogroup" aria-labelledby={`pt-${key}`} className="grid gap-3 sm:grid-cols-2">
                                            {(Object.keys(practiceTypeLabel) as PracticeType[]).map((t) => {
                                              const on = pr.type === t;
                                              return (
                                                <button
                                                  key={t}
                                                  type="button"
                                                  role="radio"
                                                  aria-checked={on}
                                                  onClick={() =>
                                                    setPr(
                                                      t === "scale"
                                                        ? { type: t, scaleMin: 1, scaleMax: pr.scaleMax === 10 ? 10 : 5 }
                                                        : t === "choice" || t === "checkboxes"
                                                        ? { type: t, options: pr.options?.slice(0, t === "choice" ? 4 : 6) }
                                                        : { type: t },
                                                    )
                                                  }
                                                  className={`flex min-h-[88px] items-center gap-3 rounded-2xl border-2 p-3 text-left transition ${on ? "border-[#5b3df5] bg-white shadow-[0_8px_20px_-14px_rgba(91,61,245,0.7)]" : "border-[#e3def9] bg-white hover:border-[#b9aef5]"}`}
                                                >
                                                  <PracticeGlyph type={t} on={on} />
                                                  <span className="min-w-0">
                                                    <span className="block text-[15px] font-semibold text-[#1d1a3b]">{practiceTypeLabel[t]}</span>
                                                    <span className="block text-[13px] text-black/60">{practiceTypeHint[t]}</span>
                                                  </span>
                                                  <span aria-hidden="true" className={`ml-auto flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[13px] ${on ? "bg-[#5b3df5] text-white" : "border-2 border-[#d9d4f5]"}`}>{on ? "✓" : ""}</span>
                                                </button>
                                              );
                                            })}
                                          </div>
                                        </div>

                                        <label className="flex flex-col gap-1.5 text-[14px] font-medium text-[#1d1a3b]">
                                          <span className="flex flex-wrap items-baseline justify-between gap-2">Питання або інструкція <LimitHint value={pr.prompt} limit={CONTENT_LIMITS.practicePrompt} /></span>
                                          <input
                                            value={pr.prompt}
                                            maxLength={CONTENT_LIMITS.practicePrompt.max}
                                            onChange={(e) => setPr({ prompt: e.target.value })}
                                            placeholder="Напр.: Наскільки напружено ви почуваєтесь зараз?"
                                            className={fieldCls}
                                          />
                                        </label>

                                        {(pr.type === "choice" || pr.type === "checkboxes") && (
                                          <div className="flex flex-col gap-2">
                                            <span className="text-[14px] font-medium text-[#1d1a3b]">Варіанти відповіді <span className="font-normal text-black/60">(до {OPT_MAX})</span></span>
                                            <ul className="flex flex-col gap-2">
                                              {opts.map((o, oi) => (
                                                <li key={oi} className="flex items-center gap-2">
                                                  <span aria-hidden="true" className={`flex h-6 w-6 shrink-0 border-2 border-[#b9aef5] bg-white ${pr.type === "choice" ? "rounded-full" : "rounded-md"}`} />
                                                  <input
                                                    value={o}
                                                    maxLength={60}
                                                    data-po-row={`${key}:${oi}`}
                                                    onChange={(e) => setPr({ options: opts.map((x, xj) => (xj === oi ? e.target.value : x)) })}
                                                    onKeyDown={(e) => {
                                                      if (e.key === "Enter") {
                                                        e.preventDefault();
                                                        if (opts.length >= OPT_MAX) return;
                                                        setPr({ options: [...opts.slice(0, oi + 1), "", ...opts.slice(oi + 1)] });
                                                        setTimeout(() => document.querySelector<HTMLInputElement>(`[data-po-row="${key}:${oi + 1}"]`)?.focus(), 0);
                                                      }
                                                    }}
                                                    aria-label={`Варіант ${oi + 1}`}
                                                    placeholder={`Варіант ${oi + 1}`}
                                                    className={fieldCls}
                                                  />
                                                  <button
                                                    type="button"
                                                    onClick={() => setPr({ options: opts.filter((_, xj) => xj !== oi) })}
                                                    disabled={opts.length === 1 && !o}
                                                    aria-label={`Видалити варіант ${oi + 1}`}
                                                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-black/50 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-30"
                                                  >
                                                    ✕
                                                  </button>
                                                </li>
                                              ))}
                                            </ul>
                                            <button
                                              type="button"
                                              onClick={() => setPr({ options: [...opts, ""] })}
                                              disabled={opts.length >= OPT_MAX}
                                              className="inline-flex min-h-[44px] items-center self-start rounded-full border border-dashed border-[#b9aef5] bg-white px-4 text-[14px] font-semibold text-[#4a2fd0] hover:bg-[#f6f4ff] disabled:opacity-40"
                                            >
                                              + Додати варіант
                                            </button>
                                          </div>
                                        )}

                                        {pr.type === "scale" && (
                                          <div className="flex flex-col gap-4">
                                            <div className="flex flex-col gap-2">
                                              <span id={`ps-${key}`} className="text-[14px] font-medium text-[#1d1a3b]">Скільки значень на шкалі?</span>
                                              <div role="radiogroup" aria-labelledby={`ps-${key}`} className="flex flex-wrap gap-2">
                                                {[5, 10].map((n) => {
                                                  const on = (pr.scaleMax ?? 5) === n;
                                                  return (
                                                    <button
                                                      key={n}
                                                      type="button"
                                                      role="radio"
                                                      aria-checked={on}
                                                      onClick={() => setPr({ scaleMin: 1, scaleMax: n })}
                                                      className={`min-h-[44px] min-w-[120px] rounded-full border-2 px-5 text-[14px] font-semibold transition ${on ? "border-[#5b3df5] bg-[#5b3df5] text-white" : "border-[#d9d4f5] bg-white text-[#1d1a3b] hover:border-[#b9aef5]"}`}
                                                    >
                                                      {on ? "✓ " : ""}від 1 до {n}
                                                    </button>
                                                  );
                                                })}
                                              </div>
                                            </div>
                                            <div className="grid gap-3 sm:grid-cols-2">
                                              <label className="flex flex-col gap-1.5 text-[14px] font-medium text-[#1d1a3b]">
                                                Підпис для «1»
                                                <input
                                                  value={pr.scaleLabels?.[0] ?? ""}
                                                  maxLength={30}
                                                  onChange={(e) => setPr({ scaleLabels: [e.target.value, pr.scaleLabels?.[1] ?? ""] })}
                                                  placeholder="Напр.: Спокійно"
                                                  className={fieldCls}
                                                />
                                              </label>
                                              <label className="flex flex-col gap-1.5 text-[14px] font-medium text-[#1d1a3b]">
                                                Підпис для «{pr.scaleMax ?? 5}»
                                                <input
                                                  value={pr.scaleLabels?.[1] ?? ""}
                                                  maxLength={30}
                                                  onChange={(e) => setPr({ scaleLabels: [pr.scaleLabels?.[0] ?? "", e.target.value] })}
                                                  placeholder="Напр.: Дуже напружено"
                                                  className={fieldCls}
                                                />
                                              </label>
                                            </div>
                                          </div>
                                        )}

                                        <PracticePreview practice={pr} />
                                      </div>
                                    );
                                  })()}

                                </div>
                              </div>
                            </section>

                            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e3def9] pt-4">
                              <label className="flex min-h-[44px] cursor-pointer items-center gap-3 text-[14px] font-semibold text-[#1d1a3b]">
                                <input type="checkbox" className="h-5 w-5 accent-[#5b3df5]" checked={it.isRequired} onChange={(e) => updateItem(i, ii, { isRequired: e.target.checked })} />
                                Обов'язковий урок
                              </label>
                              <div className="flex flex-wrap items-center gap-2">
                                <button type="button" onClick={() => { moveItem(i, ii, -1); setLessonIdx((prev) => ({ ...prev, [i]: ii - 1 })); }} disabled={ii === 0} className={`${pillBtn} disabled:opacity-40`}>← Раніше</button>
                                <button type="button" onClick={() => { moveItem(i, ii, 1); setLessonIdx((prev) => ({ ...prev, [i]: ii + 1 })); }} disabled={ii === (m.items?.length ?? 0) - 1} className={`${pillBtn} disabled:opacity-40`}>Пізніше →</button>
                                <button type="button" onClick={() => removeItem(i, ii)} className="min-h-[44px] rounded-full px-4 text-[14px] font-semibold text-rose-700 hover:bg-rose-50">Видалити урок</button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setModIdx(Math.max(0, curMod - 1))}
              disabled={curMod === 0}
              className="inline-flex min-h-[44px] items-center rounded-full border border-[#d9d4f5] bg-white px-5 text-[14px] font-semibold text-[#4a2fd0] hover:bg-[#ece9fe] disabled:invisible"
            >
              ← Модуль {curMod}
            </button>
            {curMod < modules.length - 1 ? (
              <button
                type="button"
                onClick={() => setModIdx(curMod + 1)}
                className="inline-flex min-h-[44px] items-center rounded-full bg-gradient-to-r from-[#5b3df5] to-[#8a63f7] px-5 text-[14px] font-semibold text-white"
              >
                Далі: модуль {curMod + 2} →
              </button>
            ) : (
              <button
                type="button"
                onClick={() => { setModules((prev) => [...prev, emptyModule()]); setModIdx(modules.length); }}
              disabled={modules.length >= MAX_MODULES}
                className="inline-flex min-h-[44px] items-center rounded-full border border-dashed border-[#b9aef5] bg-white px-5 text-[14px] font-semibold text-[#4a2fd0] hover:bg-[#f6f4ff] disabled:opacity-40"
              >
                + Додати наступний модуль
              </button>
            )}
          </div>
        </div>
      </Step>
      )}
      {type !== "program" && (
      <>
      {type === "meditation" && (
      <Step n={stepNo("audio")} current={step} errors={stepErrors} icon="headphones" title="Аудіо та про запис" hint="Завантажте запис і розкажіть, що в ньому звучить.">
        {renderMainFilePanel()}
        <div className="grid gap-3 sm:grid-cols-[260px_minmax(0,1fr)]">
          <div className="flex flex-col rounded-2xl border border-[#e3def9] bg-white p-4">
            <label htmlFor="med-duration" className="flex items-center gap-2 text-[14px] font-semibold text-[#1d1a3b]">
              <span aria-hidden="true" className="grid h-8 w-8 place-items-center rounded-lg bg-[#ece9fe] text-[#4a2fd0]"><Icon name="clock" size={18} /></span>
              Тривалість <span className="text-rose-600" aria-hidden="true">*</span>
            </label>
            <div className="relative mt-3">
              <input
                id="med-duration"
                inputMode="numeric"
                autoComplete="off"
                maxLength={3}
                aria-required="true"
                aria-invalid={stepErrors.length > 0 && (!durationMinutes.trim() || Number(durationMinutes) < 1 || Number(durationMinutes) > MEDITATION_MAX_MINUTES) ? true : undefined}
                aria-describedby={stepErrors.length > 0 ? "step-5-errors" : undefined}
                value={durationMinutes}
                placeholder="Наприклад, 10"
                onChange={(e) => { setDurationAuto(false); setDurationMinutes(e.target.value.replace(/[^\d]/g, "").replace(/^0+/, "").slice(0, 3)); }}
                onBlur={() => { const n = Number(durationMinutes); if (n > MEDITATION_MAX_MINUTES) setDurationMinutes(String(MEDITATION_MAX_MINUTES)); }}
                className="w-full rounded-xl border border-[#d9d4f5] bg-[#faf9ff] py-2.5 pl-4 pr-12 text-[15px] focus:border-[#5b3df5] focus:bg-white focus:outline-none"
              />
              <span aria-hidden="true" className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[14px] font-medium text-black/60">хв</span>
            </div>
            <p className="mt-2 text-[13px] text-black/60">{durationAuto ? "Визначено за записом, за потреби виправте." : `Від 1 до ${MEDITATION_MAX_MINUTES} хвилин.`}</p>
          </div>
          <div className="flex flex-col rounded-2xl border border-[#e3def9] bg-white p-4">
            <div id="med-offline-label" className="flex items-center gap-2 text-[14px] font-semibold text-[#1d1a3b]">
              <span aria-hidden="true" className="grid h-8 w-8 place-items-center rounded-lg bg-[#ece9fe] text-[#4a2fd0]"><Icon name="headphones" size={18} /></span>
              Слухати без інтернету
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={offlineDownload}
              aria-labelledby="med-offline-label"
              onClick={() => setOfflineDownload(!offlineDownload)}
              className={`mt-3 flex min-h-[46px] w-full items-center justify-between gap-3 rounded-xl border px-4 py-2 text-left text-[15px] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5b3df5]/50 ${offlineDownload ? "border-[#5b3df5] bg-[#f3efff] font-semibold text-[#4a2fd0]" : "border-[#d9d4f5] bg-[#faf9ff] text-[#2d2a5c]"}`}
            >
              {offlineDownload ? "Дозволено" : "Лише онлайн"}
              <span aria-hidden="true" className={`relative h-7 w-12 shrink-0 rounded-full transition ${offlineDownload ? "bg-[#5b3df5]" : "bg-[#cfc8f3]"}`}>
                <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${offlineDownload ? "left-[22px]" : "left-0.5"}`} />
              </span>
            </button>
            <p className="mt-2 text-[13px] text-black/60">Учасник зможе завантажити практику й слухати без з'єднання.</p>
          </div>
        </div>

        <div>
          <div id="med-music-label" className="mb-2 text-[14px] font-semibold text-[#1d1a3b]">Фонова музика</div>
          <div role="radiogroup" aria-labelledby="med-music-label" className="grid gap-3 sm:grid-cols-2">
            {([
              [false, "headphones", "Додати музику Sensoria", "У записі лише голос. Слухач зможе увімкнути нашу музику та звуки природи."],
              [true, "meditation", "Музика вже є в записі", "Нашої музики в плеєрі не буде, лише звуки природи: дощ, море, ліс, вогонь."],
            ] as const).map(([val, icon, label, note]) => {
              const on = hasEmbeddedMusic === val;
              return (
                <button
                  key={label}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setHasEmbeddedMusic(val)}
                  className={`relative flex min-h-[120px] flex-col items-start gap-3 rounded-2xl border-2 p-4 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5b3df5]/50 ${on ? "border-[#5b3df5] bg-[#f3efff] shadow-[0_10px_24px_-16px_rgba(91,61,245,0.8)]" : "border-[#e3def9] bg-white hover:bg-[#faf9ff]"}`}
                >
                  <span className="flex w-full items-center justify-between">
                    <span aria-hidden="true" className={`grid h-11 w-11 place-items-center rounded-xl ${on ? "bg-[#5b3df5] text-white" : "bg-[#ece9fe] text-[#4a2fd0]"}`}><Icon name={icon} size={22} /></span>
                    <span aria-hidden="true" className={`grid h-6 w-6 place-items-center rounded-full border-2 ${on ? "border-[#5b3df5] bg-[#5b3df5] text-white" : "border-[#b9aef5] bg-white"}`}>{on && <Icon name="check" size={14} />}</span>
                  </span>
                  <span>
                    <span className="block text-[15px] font-semibold text-[#1d1a3b]">{label}</span>
                    <span className="mt-0.5 block text-[13px] leading-snug text-black/70">{note}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

      </Step>
      )}

      {type === "meditation" && (
      <Step n={stepNo("practice")} current={step} errors={stepErrors} icon="note" title="Текст практики" hint="Необов’язково: текст допомагає тим, хто погано чує, і тим, кому зручніше читати.">
        <div>
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <label htmlFor="med-transcript" className="text-[14px] font-semibold text-[#1d1a3b]">Текст практики <span className="text-[13px] font-normal text-black/60">(необов’язково)</span></label>
            <span className={`text-[13px] ${transcriptText.trim() && meditationTranscriptProblems(transcriptText).length ? "text-rose-600" : "text-black/60"}`}>{charCount(transcriptText)} з {TRANSCRIPT_MAX_CHARS}</span>
          </div>
          <textarea
            id="med-transcript"
            rows={7}
            maxLength={TRANSCRIPT_MAX_CHARS}
            aria-invalid={stepErrors.length > 0 && meditationTranscriptProblems(transcriptText).length > 0 ? true : undefined}
            aria-describedby={stepErrors.length > 0 ? "step-6-errors" : "med-transcript-hint"}
            value={transcriptText}
            onChange={(e) => setTranscriptText(e.target.value)}
            placeholder="Те, що звучить у записі. Абзаци розділяйте порожнім рядком."
            className="w-full rounded-xl border border-[#d9d4f5] px-4 py-3 text-[15px] leading-relaxed focus:border-[#5b3df5] focus:outline-none"
          />
          <p id="med-transcript-hint" className="mt-2 rounded-xl border border-[#e3def9] bg-[#f3efff] px-4 py-2.5 text-[13px] leading-snug text-[#2d2a5c]">Текст допомагає тим, хто погано чує, і тим, кому зручніше читати. Учасники побачать його під плеєром.</p>
        </div>
      </Step>
      )}

      {type === "guide" && (
      <Step n={stepNo("file")} current={step} errors={stepErrors} icon="guide" title="PDF та про гайд" hint="Завантажте файл і вкажіть, який це гайд і скільки в ньому сторінок.">
        {editing?.guide?.source === "sensoria_structured" ? (
          <p className="rounded-xl bg-[#f6f4ff] px-4 py-3 text-[14px] leading-relaxed text-[#2d2a5c]">Цей гайд створено Sensoria, тому PDF-файл завантажувати не потрібно.</p>
        ) : (
          renderMainFilePanel()
        )}
        <div>
          <div id="guide-type-label" className="mb-2 text-[13px] font-medium text-black/60">Тип гайду</div>
          <div role="group" aria-labelledby="guide-type-label" className="flex flex-wrap gap-2">
            {guideTypeOrder.map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={guideType === t}
                onClick={() => setGuideType(t)}
                className={`min-h-[44px] rounded-xl px-4 text-[14px] font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5b3df5]/50 ${guideType === t ? "bg-[#5b3df5] text-white shadow-[0_8px_18px_-10px_rgba(91,61,245,0.9)]" : "border border-[#d9d4f5] bg-white text-[#2d2a5c] hover:bg-[#f3efff]"}`}
              >
                {guideTypeInfo[t].label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[13px] leading-snug text-black/60">{guideTypeInfo[guideType].description}</p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="guide-pages" className="mb-2 block text-[13px] font-medium text-black/60">Сторінок <span className="text-rose-600" aria-hidden="true">*</span></label>
            <input
              id="guide-pages"
              inputMode="numeric"
              autoComplete="off"
              maxLength={3}
              aria-required="true"
              aria-invalid={stepErrors.length > 0 && editing?.guide?.source !== "sensoria_structured" && (!guidePages.trim() || Number(guidePages) < 1 || Number(guidePages) > GUIDE_MAX_PAGES) ? true : undefined}
              aria-describedby={stepErrors.length > 0 ? "step-5-errors" : undefined}
              value={guidePages}
              placeholder="Наприклад, 24"
              onChange={(e) => setGuidePages(e.target.value.replace(/[^\d]/g, "").slice(0, 3))}
              className="w-full rounded-xl border border-[#d9d4f5] bg-white px-4 py-3 text-[15px] focus:outline-none focus:border-[#5b3df5]"
            />
            <p className="mt-1.5 text-[13px] text-black/60">Від 1 до {GUIDE_MAX_PAGES}.</p>
          </div>
          <div>
            <label htmlFor="guide-read" className="mb-2 block text-[13px] font-medium text-black/60">Читання, хвилин <span className="text-rose-600" aria-hidden="true">*</span></label>
            <input
              id="guide-read"
              inputMode="numeric"
              autoComplete="off"
              maxLength={3}
              aria-required="true"
              aria-invalid={stepErrors.length > 0 && editing?.guide?.source !== "sensoria_structured" && (!guideReadMinutes.trim() || Number(guideReadMinutes) < 1 || Number(guideReadMinutes) > GUIDE_MAX_READ_MINUTES) ? true : undefined}
              aria-describedby={stepErrors.length > 0 ? "step-5-errors" : undefined}
              value={guideReadMinutes}
              placeholder="Наприклад, 30"
              onChange={(e) => setGuideReadMinutes(e.target.value.replace(/[^\d]/g, "").slice(0, 3))}
              className="w-full rounded-xl border border-[#d9d4f5] bg-white px-4 py-3 text-[15px] focus:outline-none focus:border-[#5b3df5]"
            />
            <p className="mt-1.5 text-[13px] text-black/60">Від 1 до {GUIDE_MAX_READ_MINUTES}.</p>
          </div>
        </div>
      </Step>
      )}

      {type === "guide" && (
      <Step n={stepNo("about")} current={step} errors={stepErrors} icon="bulb" title="Для кого й результат" hint="Необов’язково, але допомагає читачеві зрозуміти, чи підходить йому гайд.">
        <div>
          <label htmlFor="guide-relevant" className="mb-2 block text-[13px] font-medium text-black/60">Гайд буде корисним, якщо ви зараз… <span className="font-normal">(кожен пункт з нового рядка)</span></label>
          <textarea
            id="guide-relevant"
            rows={4}
            value={guideRelevantText}
            onChange={(e) => setGuideRelevantText(e.target.value)}
            placeholder={"Тривожитесь перед важливою подією\nНе можете заснути через думки"}
            className="w-full rounded-xl border border-[#d9d4f5] px-4 py-3 text-[14px] focus:outline-none focus:border-[#5b3df5]"
          />
        </div>
        <div>
          <label htmlFor="guide-outcomes" className="mb-2 block text-[13px] font-medium text-black/60">Що ви отримаєте <span className="font-normal">(кожен пункт з нового рядка)</span></label>
          <textarea
            id="guide-outcomes"
            rows={4}
            value={guideOutcomesText}
            onChange={(e) => setGuideOutcomesText(e.target.value)}
            placeholder={"Прості вправи для щоденного спокою\nПлан дій на тривожний день"}
            className="w-full rounded-xl border border-[#d9d4f5] px-4 py-3 text-[14px] focus:outline-none focus:border-[#5b3df5]"
          />
        </div>
      </Step>
      )}

      </>
      )}
      </>

      {step === STEPS.length && missing.length > 0 && (
        <div role={publishProblems.length > 0 ? "alert" : undefined} className={`rounded-xl border bg-white p-5 ${publishProblems.length > 0 ? "border-rose-300" : "border-black/10"}`}>
          <div className={`text-[13px] font-medium mb-2 ${publishProblems.length > 0 ? "text-rose-700" : "text-black/70"}`}>{publishProblems.length > 0 ? "Перед тим як надіслати або опублікувати, виправте:" : "Щоб надіслати на модерацію, лишилось:"}</div>
          <ul className="text-[13px] text-black/60 list-disc pl-5 flex flex-col gap-1">
            {missing.map((m) => <li key={m}>{m}</li>)}
          </ul>
          <p className="text-[12px] text-black/40 mt-2">Чернетку можна зберегти в будь-який момент і дописати пізніше.</p>
        </div>
      )}
      {/* On the last program step the checklist card above already lists these, so they are not repeated. */}
      {error && !(publishProblems.length > 0 && step === STEPS.length && missing.length > 0) && <div className="text-[13px] text-red-500">{error}</div>}
      {publishProblems.length > 0 && !(step === STEPS.length && missing.length > 0) && (
        <ul className="text-[13px] text-red-500 list-disc pl-5 flex flex-col gap-1">
          {publishProblems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}

      {/* Saving the draft stays at the bottom; «Назад» / «Далі» are in the top-right corner. */}
      {step < STEPS.length && (
        <div className="flex flex-wrap items-center gap-3 border-t border-black/5 pt-3">
          {isPublishedEdit ? (
            <button type="button" onClick={() => handleSave("published")} disabled={saving} className="min-h-[40px] px-1 rounded-xl text-[14px] font-medium text-black/60 hover:text-black transition disabled:opacity-60">
              {saving ? "Зберігаємо…" : "Зберегти зміни"}
            </button>
          ) : (
            <button type="button" onClick={() => handleSave("draft")} disabled={saving} className="min-h-[40px] px-1 rounded-xl text-[14px] font-medium text-black/60 hover:text-black transition disabled:opacity-60">
              {saving ? "Зберігаємо…" : "Зберегти як чернетку"}
            </button>
          )}
        </div>
      )}

      {/* ACTIONS */}
      {step === STEPS.length && (
      <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-black/5">
        {isPublishedEdit ? (
          <button
            onClick={() => handleSave("published")}
            disabled={saving}
            className="px-5 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 text-white text-[14px] font-medium hover:opacity-90 transition mt-6 disabled:opacity-60"
          >
            {saving ? "Зберігаємо…" : "Зберегти зміни"}
          </button>
        ) : (
          <>
            <button
              onClick={() => handleSave("draft")}
              disabled={saving}
              className="px-5 py-3 rounded-xl bg-white border border-black/10 text-[14px] font-medium hover:bg-black/5 transition mt-6 disabled:opacity-60"
            >
              {saving ? "Зберігаємо…" : "Зберегти чернетку"}
            </button>
            <button
              onClick={() => handleSave("review")}
              disabled={saving}
              className="px-5 py-3 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 text-white text-[14px] font-medium hover:opacity-90 transition mt-6 disabled:opacity-60"
            >
              {saving ? "Зберігаємо…" : "Опублікувати"}
            </button>
          </>
        )}
        <button
          onClick={onCancel}
          disabled={saving}
          className="px-5 py-3 rounded-xl text-[14px] font-medium text-black/45 hover:text-black/70 transition mt-6 disabled:opacity-60"
        >
          Скасувати
        </button>
      </div>
      )}
    </div>
  );
}


// Free = "0". Paid needs a real amount: an empty field must never pass as 0.
function priceModeProblem(mode: "free" | "paid", price: string, w: { gen: string; paid: string } = { gen: "програми", paid: "Платна програма" }): string | null {
  if (mode === "free") return null;
  if (price.trim() === "") return `Вкажіть вартість ${w.gen}.`;
  const base = priceProblem(price);
  if (base) return base;
  if (Number(price) < 1) return `${w.paid} має коштувати щонайменше 1 ₴. Для безкоштовної оберіть «Безкоштовно».`;
  return null;
}

export const PROGRAM_STEPS = [
  "Назва та опис", "Вартість", "Категорії", "Що ви отримаєте", "Обкладинка",
  "Відео-презентація", "Використання ШІ", "Теми ризику", "Модулі та уроки",
] as const;

// Quiet violet/lavender illustrations for step 6 (decorative only).
function CoverArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 150 110" fill="none" className={className} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="ca-a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#b8abf7" /><stop offset="1" stopColor="#7c5cf6" /></linearGradient>
        <linearGradient id="ca-b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#f1eefe" /><stop offset="1" stopColor="#dfe6ff" /></linearGradient>
      </defs>
      <rect x="62" y="14" width="76" height="62" rx="9" transform="rotate(10 100 45)" fill="url(#ca-a)" />
      <rect x="14" y="26" width="86" height="64" rx="10" fill="url(#ca-b)" stroke="#b8abf7" strokeWidth="2.5" />
      <circle cx="40" cy="48" r="8" fill="#8a63f7" />
      <path d="M20 84l24-26 16 16 12-12 22 22z" fill="url(#ca-a)" />
      <path d="M118 12l4-8M130 20l8-5M134 34l8 2" stroke="#8a63f7" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function AiArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 104" fill="none" className={className} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="ai-a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#b8abf7" /><stop offset="1" stopColor="#6d4df5" /></linearGradient>
        <linearGradient id="ai-b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#f1eefe" /><stop offset="1" stopColor="#dfe6ff" /></linearGradient>
      </defs>
      <rect x="40" y="38" width="62" height="56" rx="12" transform="rotate(8 71 66)" fill="url(#ai-b)" stroke="#cfc6fa" strokeWidth="2" />
      <rect x="26" y="30" width="62" height="58" rx="13" fill="url(#ai-a)" />
      <text x="57" y="68" textAnchor="middle" fontSize="26" fontWeight="800" fill="#fff" fontFamily="Inter, system-ui, sans-serif">AI</text>
      <path d="M60 8v10M82 14l-6 8M96 26l-8 5M38 14l5 8" stroke="#8a63f7" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

// One small line icon per high-risk topic (decorative: the topic name is always written next to it).
const RISK_TOPIC_ICONS: Record<string, React.ReactNode> = {
  trauma: <><path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 2.8A3 3 0 0 0 5 13a3 3 0 0 0 4 3.6V4z" /><path d="M15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 2.8 3 3 0 0 1-1 3.2 3 3 0 0 1-4 3.6V4z" /></>,
  suicide: <><circle cx="12" cy="12" r="9" /><path d="M9 10h.01M15 10h.01M8.5 16c1-1.4 2.2-2 3.5-2s2.5.6 3.5 2" /></>,
  eating: <><path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10" /><path d="M17 3c-2 1.5-2.5 4-2.5 7H17v11" /></>,
  addiction: <><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1" /></>,
  clinical: <><rect x="4" y="7" width="16" height="13" rx="2.5" /><path d="M9 7V5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5v2M12 11v5M9.5 13.5h5" /></>,
  children: <><circle cx="9" cy="8" r="3" /><path d="M3.5 19c.5-3 2.6-4.5 5.5-4.5s5 1.5 5.5 4.5" /><circle cx="17" cy="9.5" r="2.2" /><path d="M16 14.5c2.6-.1 4.2 1.2 4.7 3.5" /></>,
};

function ShieldArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 150 150" fill="none" className={className} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="sh-a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#c9bdfb" /><stop offset="1" stopColor="#7c5cf6" /></linearGradient>
        <radialGradient id="sh-g" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stopColor="#b8abf7" stopOpacity="0.55" /><stop offset="1" stopColor="#b8abf7" stopOpacity="0" /></radialGradient>
      </defs>
      <circle cx="78" cy="78" r="68" fill="url(#sh-g)" />
      <rect x="22" y="40" width="68" height="78" rx="14" transform="rotate(-8 56 79)" fill="#fff" opacity="0.7" />
      <path d="M78 22l40 14v34c0 26-16 44-40 56-24-12-40-30-40-56V36z" fill="url(#sh-a)" />
      <circle cx="78" cy="62" r="11" fill="#fff" opacity="0.95" />
      <path d="M58 98c2-12 10-17 20-17s18 5 20 17z" fill="#fff" opacity="0.95" />
      <path d="M120 18l-4 8M132 28l-8 4M136 44l-8 0" stroke="#8a63f7" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function VideoArt({ kind, className }: { kind: "clapper" | "profile" | "player"; className?: string }) {
  const sparks = (
    <g stroke="#8a63f7" strokeWidth="3" strokeLinecap="round" opacity="0.85">
      <path d="M118 14l5-8M130 20l9-4M134 34l9 2" />
    </g>
  );
  return (
    <svg viewBox="0 0 160 110" fill="none" className={className} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`va-${kind}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#b8abf7" />
          <stop offset="1" stopColor="#7c5cf6" />
        </linearGradient>
        <linearGradient id={`vb-${kind}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f1eefe" />
          <stop offset="1" stopColor="#dfe6ff" />
        </linearGradient>
      </defs>
      {kind === "clapper" && (
        <g>
          <rect x="30" y="46" width="94" height="56" rx="10" fill={`url(#va-${kind})`} />
          <path d="M26 24l86-14 6 26-86 14z" fill="#ece9fe" />
          <path d="M44 18l14-3-10 26-14 3zM74 13l14-3-10 26-14 3zM104 8l12-2-8 24-12 3z" fill="#8a63f7" opacity="0.85" />
          <path d="M70 62v28l24-14z" fill="#fff" />
          {sparks}
        </g>
      )}
      {kind === "profile" && (
        <g>
          <rect x="22" y="12" width="104" height="70" rx="9" fill={`url(#vb-${kind})`} stroke="#b8abf7" strokeWidth="2.5" />
          <circle cx="44" cy="34" r="9" fill="#b8abf7" />
          <path d="M30 56c2-9 8-12 14-12s12 3 14 12z" fill="#b8abf7" />
          <rect x="66" y="26" width="42" height="5" rx="2.5" fill="#cfc6fa" />
          <rect x="66" y="37" width="30" height="5" rx="2.5" fill="#cfc6fa" />
          <rect x="70" y="52" width="46" height="22" rx="5" fill="#8a63f7" />
          <path d="M88 57v12l10-6z" fill="#fff" />
          <path d="M10 86h128l-8 10H18z" fill="#cfc6fa" />
          {sparks}
        </g>
      )}
      {kind === "player" && (
        <g>
          <rect x="18" y="26" width="104" height="68" rx="11" fill={`url(#va-${kind})`} />
          <circle cx="70" cy="56" r="17" fill="#fff" opacity="0.95" />
          <path d="M64 47v18l16-9z" fill="#7c5cf6" />
          <rect x="30" y="80" width="80" height="5" rx="2.5" fill="#fff" opacity="0.45" />
          <rect x="30" y="80" width="30" height="5" rx="2.5" fill="#fff" />
          <circle cx="122" cy="30" r="17" fill="#7c5cf6" />
          <rect x="113" y="24" width="14" height="12" rx="3" fill="#fff" />
          <path d="M127 28l7-4v12l-7-4z" fill="#fff" />
          {sparks}
        </g>
      )}
    </svg>
  );
}

function VideoPointArt({ kind, className }: { kind: "author" | "checklist" | "target" | "megaphone"; className?: string }) {
  const id = `vp-${kind}`;
  return (
    <svg viewBox="0 0 80 80" fill="none" className={className} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${id}-a`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#b8abf7" />
          <stop offset="1" stopColor="#7c5cf6" />
        </linearGradient>
        <linearGradient id={`${id}-b`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f1eefe" />
          <stop offset="1" stopColor="#d9d4f5" />
        </linearGradient>
      </defs>
      <circle cx="40" cy="42" r="34" fill="#f1eefe" />
      {kind === "author" && (
        <g>
          <path d="M14 72c1-16 11-23 26-23s25 7 26 23z" fill={`url(#${id}-a)`} />
          <circle cx="40" cy="31" r="14" fill={`url(#${id}-b)`} stroke="#b8abf7" strokeWidth="2" />
          <path d="M26 30c2-10 8-14 15-14 8 0 12 5 13 14-4-5-9-7-15-7-5 0-9 2-13 7z" fill="#7c5cf6" />
          <path d="M33 58l7 8 7-8" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )}
      {kind === "checklist" && (
        <g>
          <rect x="17" y="10" width="46" height="60" rx="8" fill="#fff" stroke="#b8abf7" strokeWidth="2.5" />
          <rect x="30" y="6" width="20" height="9" rx="4.5" fill={`url(#${id}-a)`} />
          <path d="M24 30l4 4 7-8M24 45l4 4 7-8" stroke="#7c5cf6" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="40" y="29" width="16" height="4" rx="2" fill="#cfc6fa" />
          <rect x="40" y="44" width="16" height="4" rx="2" fill="#cfc6fa" />
          <circle cx="29" cy="60" r="4" fill="#fff" stroke="#b8abf7" strokeWidth="2" />
          <rect x="40" y="58" width="12" height="4" rx="2" fill="#e3def9" />
        </g>
      )}
      {kind === "target" && (
        <g>
          <circle cx="36" cy="44" r="26" fill={`url(#${id}-b)`} stroke="#b8abf7" strokeWidth="2.5" />
          <circle cx="36" cy="44" r="17" fill="#fff" stroke="#b8abf7" strokeWidth="2.5" />
          <circle cx="36" cy="44" r="8" fill={`url(#${id}-a)`} />
          <path d="M36 44L62 18" stroke="#5b3df5" strokeWidth="3.5" strokeLinecap="round" />
          <path d="M62 18l1-9M62 18l9-1M56 24l1-7M56 24l7-1" stroke="#8a63f7" strokeWidth="3" strokeLinecap="round" />
        </g>
      )}
      {kind === "megaphone" && (
        <g>
          <path d="M16 34h14l28-16v44L30 46H16z" fill={`url(#${id}-a)`} />
          <rect x="12" y="32" width="10" height="16" rx="3" fill="#5b3df5" />
          <path d="M26 48l4 18h9l-4-17z" fill="#8a63f7" />
          <path d="M64 30c4 3 4 15 0 18M70 24c7 6 7 24 0 30" stroke="#8a63f7" strokeWidth="3" strokeLinecap="round" />
        </g>
      )}
    </svg>
  );
}

function VideoHowArt({ kind, className }: { kind: "upload" | "visibility" | "link"; className?: string }) {
  const id = `vh-${kind}`;
  return (
    <svg viewBox="0 0 80 72" fill="none" className={className} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#b8abf7" />
          <stop offset="1" stopColor="#7c5cf6" />
        </linearGradient>
      </defs>
      {kind === "upload" && (
        <g>
          <rect x="10" y="14" width="52" height="36" rx="5" fill="#fff" stroke="#b8abf7" strokeWidth="2.5" />
          <rect x="22" y="23" width="28" height="19" rx="5" fill="#e0382f" />
          <path d="M33 28v9l8-4.5z" fill="#fff" />
          <path d="M4 56h64l-5 6H9z" fill="#cfc6fa" />
          <circle cx="62" cy="16" r="12" fill={`url(#${id})`} />
          <path d="M62 22V11M57 15l5-5 5 5" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )}
      {kind === "visibility" && (
        <g>
          <rect x="6" y="8" width="62" height="52" rx="7" fill="#fff" stroke="#b8abf7" strokeWidth="2.5" />
          <rect x="13" y="15" width="48" height="9" rx="4.5" fill="#e3def9" />
          <rect x="13" y="29" width="48" height="12" rx="6" fill={`url(#${id})`} />
          <path d="M20 35l3 3 5-6" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="33" y="33" width="22" height="4" rx="2" fill="#fff" />
          <rect x="13" y="46" width="48" height="9" rx="4.5" fill="#e3def9" />
          <path d="M70 6l1.5 4M75 12l4 1M66 4l-1-4" stroke="#8a63f7" strokeWidth="2.5" strokeLinecap="round" />
        </g>
      )}
      {kind === "link" && (
        <g>
          <rect x="14" y="10" width="46" height="56" rx="8" fill="#fff" stroke="#b8abf7" strokeWidth="2.5" />
          <rect x="27" y="5" width="20" height="10" rx="5" fill={`url(#${id})`} />
          <path d="M33 38a6 6 0 0 0 8.5 0l4-4a6 6 0 0 0-8.5-8.5l-1.5 1.5M41 34a6 6 0 0 0-8.5 0l-4 4a6 6 0 0 0 8.5 8.5l1.5-1.5" stroke="#7c5cf6" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="24" y="54" width="26" height="4" rx="2" fill="#e3def9" />
        </g>
      )}
    </svg>
  );
}

// Reads an audio file's length in the browser (rounded up to whole minutes); null if it cannot be read.
function audioMinutes(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const src = URL.createObjectURL(file);
    const a = new Audio();
    const done = (v: number | null) => {
      URL.revokeObjectURL(src);
      resolve(v);
    };
    a.preload = "metadata";
    a.onloadedmetadata = () => done(Number.isFinite(a.duration) && a.duration > 0 ? Math.max(1, Math.ceil(a.duration / 60)) : null);
    a.onerror = () => done(null);
    setTimeout(() => done(null), 8000);
    a.src = src;
  });
}

// Small picture of each practice type, drawn instead of explained.
function PracticeGlyph({ type, on }: { type: PracticeType; on: boolean }) {
  const fg = on ? "#5b3df5" : "#8b84c9";
  return (
    <span aria-hidden="true" className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl ${on ? "bg-[#ece9fe]" : "bg-[#f6f4ff]"}`}>
      <svg width="34" height="34" viewBox="0 0 34 34" fill="none">
        {type === "text" && (
          <>
            <rect x="5" y="8" width="24" height="3" rx="1.5" fill={fg} />
            <rect x="5" y="15" width="24" height="3" rx="1.5" fill={fg} opacity=".6" />
            <rect x="5" y="22" width="14" height="3" rx="1.5" fill={fg} opacity=".35" />
          </>
        )}
        {type === "scale" && (
          <>
            <rect x="4" y="16" width="26" height="2" rx="1" fill={fg} opacity=".35" />
            {[6, 12, 18, 24, 30].map((x, i) => (
              <circle key={x} cx={x - 1} cy="17" r={i === 3 ? 4.5 : 3} fill={i === 3 ? fg : "#fff"} stroke={fg} strokeWidth="1.5" />
            ))}
          </>
        )}
        {type === "choice" && (
          <>
            {[8, 17, 26].map((y, i) => (
              <g key={y}>
                <circle cx="9" cy={y} r="3.5" fill={i === 1 ? fg : "#fff"} stroke={fg} strokeWidth="1.5" />
                <rect x="16" y={y - 1.5} width="13" height="3" rx="1.5" fill={fg} opacity={i === 1 ? 0.9 : 0.35} />
              </g>
            ))}
          </>
        )}
        {type === "checkboxes" && (
          <>
            {[8, 17, 26].map((y, i) => (
              <g key={y}>
                <rect x="5.5" y={y - 3.5} width="7" height="7" rx="2" fill={i !== 1 ? fg : "#fff"} stroke={fg} strokeWidth="1.5" />
                <rect x="16" y={y - 1.5} width="13" height="3" rx="1.5" fill={fg} opacity={i !== 1 ? 0.9 : 0.35} />
              </g>
            ))}
          </>
        )}
      </svg>
    </span>
  );
}

// Live, clickable preview of what the participant will see for this practice.
function PracticePreview({ practice }: { practice: NonNullable<AuthoredItem["practice"]> }) {
  const [picked, setPicked] = useState<number[]>([]);
  const [text, setText] = useState("");
  const opts = (practice.options ?? []).filter((o) => o.trim());
  const min = practice.scaleMin ?? 1;
  const max = practice.scaleMax ?? 5;
  const toggle = (k: number) =>
    setPicked((p) => (practice.type === "choice" ? [k] : p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));
  return (
    <div className="rounded-2xl border border-dashed border-[#b9aef5] bg-white p-4">
      <div className="mb-3 text-[13px] font-semibold uppercase tracking-[0.08em] text-[#6b5fc7]">Так це побачить учасник · спробуйте</div>
      <p className="mb-3 text-[15px] font-semibold text-[#1d1a3b]">{practice.prompt.trim() || "Тут буде ваше питання"}</p>
      {practice.type === "text" && (
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="Місце для відповіді учасника" className="w-full resize-none rounded-xl border border-[#d9d4f5] px-3 py-2.5 text-[14px] focus:border-[#5b3df5] focus:outline-none" />
      )}
      {practice.type === "scale" && (() => {
        const hi = max > min ? max : min + 1;
        const value = picked[0] ?? null;
        const pct = value === null ? 0 : ((value - min) / (hi - min)) * 100;
        const ticks = Array.from({ length: hi - min + 1 }, (_, k) => min + k);
        return (
          <div className="px-1">
            <div className="mb-4 flex justify-center">
              <span className="min-w-[3rem] rounded-full bg-gradient-to-r from-[#5b3df5] to-[#8a63f7] px-4 py-1.5 text-center text-[16px] font-bold text-white">{value ?? "—"}</span>
            </div>
            <input
              type="range"
              min={min}
              max={hi}
              value={value ?? min}
              onChange={(e) => setPicked([Number(e.target.value)])}
              aria-label={`Оцінка від ${min} до ${hi}`}
              aria-valuetext={value === null ? "ще не обрано" : String(value)}
              style={{ background: `linear-gradient(to right, #5b3df5 0%, #8a63f7 ${pct}%, #e3def9 ${pct}%, #e3def9 100%)` }}
              className="h-3 w-full cursor-pointer appearance-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[#5b3df5] focus-visible:ring-offset-4
                [&::-webkit-slider-runnable-track]:h-3 [&::-webkit-slider-runnable-track]:appearance-none [&::-webkit-slider-runnable-track]:bg-transparent
                [&::-webkit-slider-thumb]:-mt-[6px] [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-[4px] [&::-webkit-slider-thumb]:border-[#5b3df5] [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-md
                [&::-moz-range-track]:h-3 [&::-moz-range-track]:bg-transparent
                [&::-moz-range-thumb]:h-6 [&::-moz-range-thumb]:w-6 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-[4px] [&::-moz-range-thumb]:border-[#5b3df5] [&::-moz-range-thumb]:bg-white"
            />
            <div aria-hidden="true" className="mt-2 flex justify-between px-[2px] text-[13px] font-medium text-[#6b5fc7]">
              {ticks.map((n) => <span key={n} className="w-4 text-center">{n}</span>)}
            </div>
            {(practice.scaleLabels?.[0] || practice.scaleLabels?.[1]) && (
              <div className="mt-2 flex justify-between gap-3 text-[14px] font-medium text-[#1d1a3b]">
                <span>{practice.scaleLabels?.[0]}</span>
                <span className="text-right">{practice.scaleLabels?.[1]}</span>
              </div>
            )}
          </div>
        );
      })()}
      {(practice.type === "choice" || practice.type === "checkboxes") && (
        opts.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {opts.map((o, k) => {
              const on = picked.includes(k);
              return (
                <li key={`${k}-${o}`}>
                  <button type="button" role={practice.type === "choice" ? "radio" : "checkbox"} aria-checked={on} onClick={() => toggle(k)} className={`flex min-h-[44px] w-full items-center gap-3 rounded-xl border-2 px-3 text-left text-[14px] transition ${on ? "border-[#5b3df5] bg-[#f6f4ff]" : "border-[#e3def9] hover:border-[#b9aef5]"}`}>
                    <span aria-hidden="true" className={`flex h-5 w-5 shrink-0 items-center justify-center border-2 text-[11px] text-white ${practice.type === "choice" ? "rounded-full" : "rounded-md"} ${on ? "border-[#5b3df5] bg-[#5b3df5]" : "border-[#b9aef5] bg-white"}`}>{on && practice.type === "checkboxes" ? "✓" : ""}</span>
                    {o}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-[13px] text-black/60">Додайте варіанти, і вони з'являться тут.</p>
        )
      )}
    </div>
  );
}

// "23 · від 5 до 80 символів" under a field; turns red when out of range.
function LimitHint({ value, limit, optional = false }: { value: string; limit: { min: number; max: number }; optional?: boolean }) {
  const n = charCount(value);
  const bad = optional ? n > 0 && (n < limit.min || n > limit.max) : n < limit.min || n > limit.max;
  return (
    <span className={`text-[13px] font-normal ${bad && n > 0 ? "text-rose-600" : "text-black/60"}`}>
      {n} · від {limit.min} до {limit.max} символів
    </span>
  );
}

function MaterialTile({ icon, title, state, done, error, children }: { icon: React.ComponentProps<typeof Icon>["name"]; title: string; state: string; done: boolean; error?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-2xl border border-dashed border-[#b9aef5] bg-white p-3 sm:p-4">
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#ece9fe] text-[#5b3df5]">
          <Icon name={icon} size={20} />
        </span>
        <div className="min-w-0">
          <div className="text-[14px] font-semibold text-[#1d1a3b]">{title}</div>
          <div className={`truncate text-[13px] ${done ? "font-medium text-[#2f7a4d]" : "text-black/60"}`}>{done ? "✓ " : ""}{state}</div>
        </div>
      </div>
      {children}
      {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-[13px] font-medium text-rose-700">{error}</p>}
    </div>
  );
}

function Step({ n, current, errors, title, hint, children, icon, aside, tight, below }: { n: number; current: number; errors: string[]; title: string; hint: string; children: React.ReactNode; icon?: IconName; aside?: React.ReactNode; tight?: boolean; below?: React.ReactNode }) {
  if (n !== current) return null;
  const errorList = errors.length > 0 && (
    <ul id={`step-${n}-errors`} role="alert" className="list-disc pl-5 text-[13px] text-rose-700 flex flex-col gap-1">
      {errors.map((e) => <li key={e}>{e}</li>)}
    </ul>
  );
  // Redesigned look (first step for now): a soft card with an icon tile, the form on the left, a quiet tip on the right.
  if (icon) {
    return (
      <section aria-labelledby={`step-${n}`} className={`rounded-[28px] border border-[#e6e8f6] bg-white/80 p-5 shadow-[0_18px_40px_-30px_rgba(60,50,140,0.35)] sm:p-7 grid gap-x-6 gap-y-3 ${tight ? "lg:grid-rows-[auto_1fr_auto]" : ""} ${aside ? "lg:grid-cols-[minmax(0,1fr)_270px]" : ""}`}>
        <div className="flex items-start gap-4 lg:col-start-1">
          <span aria-hidden="true" className="flex h-[60px] w-[60px] shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#ece9fe] to-[#dfe6ff] text-[#5b3df5]">
            <Icon name={icon} size={28} />
          </span>
          <div className="min-w-0">
            <h2 id={`step-${n}`} className="text-[22px] font-bold leading-tight text-black">{title}</h2>
            <p className="mt-1 text-[14px] text-black/55">{hint}</p>
          </div>
        </div>
        {aside && <aside className={`lg:col-start-2 lg:row-start-1 lg:row-span-2 ${icon === "card" ? "" : "lg:mt-1"} lg:self-stretch order-last lg:order-none`}>{aside}</aside>}
        <div className="flex min-w-0 flex-col gap-4 lg:col-start-1 lg:row-start-2">
          {children}
        </div>
        {/* A full-width block under both columns (the tip stays attached to the fields above it). */}
        {below && <div className="min-w-0 lg:col-span-full lg:row-start-3">{below}</div>}
        {/* Errors sit in their own row below, so they never change the height of the form / tip row above. */}
        {errors.length > 0 && <div className={`min-w-0 lg:col-start-1 ${below ? "lg:row-start-4" : "lg:row-start-3"}`}>{errorList}</div>}
      </section>
    );
  }
  return (
    <section aria-labelledby={`step-${n}`} className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-black text-[13px] font-semibold text-white">{n}</span>
        <div>
          <h2 id={`step-${n}`} className="text-[17px] font-semibold leading-tight text-black">{title}</h2>
          <p className="mt-0.5 text-[13px] text-black/50">{hint}</p>
        </div>
      </div>
      <div className="sm:pl-10 flex flex-col gap-4">{children}</div>
      {errors.length > 0 && <div className="sm:ml-10">{errorList}</div>}
    </section>
  );
}
