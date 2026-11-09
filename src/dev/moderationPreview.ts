// DEV only: `?moderationDemo=1` fills the admin "Модерація" / "Користувачі"
// pages and the user-side chat-ban banner with SAMPLE data, so the
// populated screens can be reviewed before any real violations exist.
// Turn off with `?moderationDemo=0`. Never active in a production build,
// never mixed into real data; the sample state lives in memory only.
const KEY = "sensoria.moderationDemo";

export function moderationDemoOn(): boolean {
  if (!import.meta.env.DEV) return false;
  const q = new URLSearchParams(window.location.search).get("moderationDemo");
  if (q === "1") sessionStorage.setItem(KEY, "1");
  if (q === "0") sessionStorage.removeItem(KEY);
  return sessionStorage.getItem(KEY) === "1";
}

const D = 86_400_000;
const H = 3_600_000;
const t0 = Date.now();

type Ban = { permanent: boolean; until: string | null; count: number };
const state: Record<string, { name: string; email: string; ban: Ban; accountBanned?: boolean }> = {
  u1: { name: "Олена Кравчук", email: "olena.k@gmail.com", ban: { permanent: false, until: new Date(t0 + 2 * D + 14 * H + 5 * 60_000).toISOString(), count: 1 } },
  u2: { name: "Андрій Коваленко", email: "andrii.k@gmail.com", ban: { permanent: false, until: new Date(t0 + 9 * D).toISOString(), count: 2 } },
  u3: { name: "Ігор Петренко", email: "ihor.p@gmail.com", ban: { permanent: true, until: null, count: 5 } },
  u4: { name: "Марія Шевченко", email: "maria.sh@gmail.com", ban: { permanent: false, until: null, count: 0 } },
  u5: { name: "Дмитро Ткаченко", email: "dmytro.t@gmail.com", ban: { permanent: false, until: null, count: 1 } },
};

const LOG: [string, "WARN" | "BLOCK", string[]][] = [
  ["u3", "BLOCK", ["PROFANITY"]], ["u3", "BLOCK", ["CONTACT_PHONE"]], ["u3", "BLOCK", ["PROFANITY"]],
  ["u3", "BLOCK", ["EXTERNAL_PAYMENT"]], ["u3", "BLOCK", ["PROFANITY"]], ["u3", "BLOCK", ["CONTACT_WEBSITE"]],
  ["u3", "BLOCK", ["PROFANITY"]], ["u3", "BLOCK", ["CONTACT_PHONE"]], ["u3", "BLOCK", ["PROFANITY"]],
  ["u3", "BLOCK", ["PROFANITY"]], ["u3", "WARN", ["CONTACT_ADDRESS"]],
  ["u2", "BLOCK", ["OFF_PLATFORM_COMMUNICATION"]], ["u2", "BLOCK", ["CONTACT_EMAIL"]], ["u2", "BLOCK", ["PROFANITY"]],
  ["u2", "WARN", ["CONTACT_WEBSITE"]],
  ["u1", "BLOCK", ["CONTACT_SOCIAL"]], ["u1", "BLOCK", ["PROFANITY"]], ["u1", "BLOCK", ["CONTACT_PHONE"]],
  ["u5", "WARN", ["CONTACT_ADDRESS"]], ["u5", "BLOCK", ["PROFANITY"]],
  ["u4", "WARN", ["CONTACT_MESSENGER"]],
];

/** Sample answers for the admin-data actions these pages use; undefined = not mocked. */
export function demoAdmin(action: string, extra: Record<string, unknown>): unknown {
  if (action === "moderationLog") {
    return {
      allowedCount: 1284, // sample number — real pages show the exact COUNT from the database
      flaggedTotal: LOG.length,
      entries: LOG.map(([id, act, categories], i) => ({
        id: `demo-${i}`,
        senderId: id,
        senderName: state[id].name,
        senderEmail: state[id].email,
        senderChatBan: state[id].ban,
        senderAccountBanned: !!state[id].accountBanned,
        action: act,
        riskScore: act === "BLOCK" ? 70 : 45,
        categories,
        detectorsTriggered: [],
        createdAt: new Date(Date.now() - (i * 7 + 1) * H).toISOString(),
      })),
    };
  }
  if (action === "users") {
    return {
      total: Object.keys(state).length,
      users: Object.entries(state).map(([id, s]) => ({
        id, role: "participant", name: s.name, email: s.email, isAdmin: false, isBanned: !!s.accountBanned,
        chatBan: s.ban, createdAt: new Date(t0 - 30 * D).toISOString(), verified: null, reportCount: 0,
      })),
    };
  }
  if (action === "reports") {
    const mk = (id: string, source: string, targetType: string, targetLabel: string, snippet: string | null, owner: string | null, reason: string, details: string | null, h: number, status = "open") => ({
      id, source, targetType, targetLabel, snippet,
      reporterName: "Марія Коваль", reporterEmail: "maria.k@gmail.com",
      ownerName: owner, ownerEmail: owner ? "olena.k@gmail.com" : null,
      reason, details, status, createdAt: new Date(Date.now() - h * H).toISOString(),
    });
    return {
      reports: [
        mk("r1", "entity", "post", "Публікація: Сьогодні хочу поділитися…", "Сьогодні хочу поділитися тим, як я кинула ліки і вилікувалась самою медитацією.", "Олена Кравчук", "Введення в оману / шахрайство", "Радить відмовитися від ліків.", 2),
        mk("r2", "entity", "author", "Олена Кравчук", null, "Олена Кравчук", "Видає себе за іншу людину", null, 5),
        mk("r3", "entity", "review", "Відгук від Ігор П.", "Автор — шарлатан, краще не купуйте.", null, "Образи, агресія, цькування", null, 9),
        mk("r4", "post_comment", "comment", "Коментар до публікації автора", "Ти нікчема, не пиши більше сюди.", "Ігор Петренко", "Образи / агресія", null, 14),
        mk("r5", "lesson_comment", "comment", "Коментар до уроку", "Пишіть мені в телеграм, дам знижку.", "Олена Кравчук", "Реклама", null, 30),
        mk("r6", "content", "guide", "Гайд: Дихання без стресу", null, null, "Некоректні твердження", "Є помилка в розділі про пульс.", 50),
        mk("r7", "message", "person", "Користувач у чаті", null, "Ігор Петренко", "Просить особисті контакти", null, 70, "reviewed"),
      ],
    };
  }
  if (action === "markReportReviewed" || action === "reportAction" || action === "reviewVerification") return { ok: true };
  if (action === "verificationRequests") {
    return {
      requests: [
        {
          id: "v1", authorId: "a1", authorName: "Олена Кравчук", authorEmail: "olena.k@gmail.com", status: "pending",
          note: "Фото паспорта, номер закрила.", rejectReason: null, createdAt: new Date(Date.now() - 6 * H).toISOString(), reviewedAt: null,
          documents: [{ url: "#", name: "doc.jpg" }, { url: "#", name: "diploma.pdf" }],
          profile: { hasAvatar: true, title: "Психолог, КПТ", bio: "Працюю з тривожністю та вигоранням понад 8 років.", credentials: "КНУ ім. Шевченка, психологія" },
        },
        {
          id: "v2", authorId: "a2", authorName: "Ігор Петренко", authorEmail: "ihor.p@gmail.com", status: "rejected",
          note: null, rejectReason: "Не видно імені на документі", createdAt: new Date(Date.now() - 3 * D).toISOString(), reviewedAt: new Date(Date.now() - 2 * D).toISOString(),
          documents: [], profile: { hasAvatar: false, title: "", bio: "", credentials: "" },
        },
      ],
    };
  }
  if (action === "userDetail") {
    return {
      reports: [], actions: [{ id: "x1", action: "lift_chat_ban", createdAt: new Date(Date.now() - 5 * H).toISOString() }],
      verificationRequests: [], contentCount: 3, warnCount: 2, blockCount: 4,
    };
  }
  if (action === "liftChatBan") {
    const s = state[String(extra.profileId)];
    if (s) s.ban = { permanent: false, until: null, count: Math.max(0, s.ban.count - 1) };
    return { ok: true };
  }
  if (action === "adminActions") {
    return {
      actions: [
        { id: "a1", action: "lift_chat_ban", actorName: "Sasha Lebedenko", targetName: "Олена Кравчук", targetEmail: "olena.k@gmail.com", createdAt: new Date(Date.now() - 3 * H).toISOString() },
        { id: "a2", action: "ban_account", actorName: "Sasha Lebedenko", targetName: "Ігор Петренко", targetEmail: "ihor.p@gmail.com", createdAt: new Date(Date.now() - 26 * H).toISOString() },
        { id: "a3", action: "ticket_resolved", actorName: "Sasha Lebedenko", targetName: null, targetEmail: null, createdAt: new Date(Date.now() - 4 * D).toISOString() },
      ],
    };
  }
  if (action === "setBanned") {
    const s = state[String(extra.profileId)];
    if (s) s.accountBanned = !!extra.banned;
    return { ok: true };
  }
  return undefined;
}

/** Sample "my own chat ban" for the user-side banner (ends in 2 d 14 h). */
export const DEMO_MY_CHAT_BAN = {
  permanent: false,
  untilIso: new Date(t0 + 2 * D + 14 * H + 5 * 60_000).toISOString(),
};
