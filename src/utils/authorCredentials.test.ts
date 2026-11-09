import test from "node:test";
import assert from "node:assert/strict";
import { credentialErrors, credentialIssue, experienceErrors, experienceIssue, publishableCredentials, publishableExperience, periodLines, composeExperienceText, parseExperienceText, validateExperienceInput, isMeaningfulText,
  periodLabel,
  sortCredentials,
  sortExperience,
  splitCredentials,
  validateCaseInput,
  validateCredentialImage,
  validateCredentialInput,
  type AuthorCredential,
  type AuthorExperience,
  type CredentialInput,
  type ExperienceInput,
} from "./authorCredentials.ts";

test("periodLabel covers every combination without inventing dates", () => {
  assert.equal(periodLabel({ startYear: 2019, endYear: null, isCurrent: true }), "2019 — зараз");
  assert.equal(periodLabel({ startYear: null, endYear: null, isCurrent: true }), "Зараз");
  assert.equal(periodLabel({ startYear: 2016, endYear: 2019, isCurrent: false }), "2016 — 2019");
  assert.equal(periodLabel({ startYear: 2020, endYear: 2020, isCurrent: false }), "2020");
  assert.equal(periodLabel({ startYear: 2020, endYear: null, isCurrent: false }), "з 2020");
  assert.equal(periodLabel({ startYear: null, endYear: 2018, isCurrent: false }), "до 2018");
  assert.equal(periodLabel({ startYear: null, endYear: null, isCurrent: false }), "");
});

test("sortExperience: current first, then newest", () => {
  const list = [
    { id: "a", startYear: 2010, endYear: 2014, isCurrent: false },
    { id: "b", startYear: 2018, endYear: null, isCurrent: true },
    { id: "c", startYear: 2015, endYear: 2018, isCurrent: false },
    { id: "d", startYear: null, endYear: null, isCurrent: false },
  ];
  assert.deepEqual(sortExperience(list).map((x) => x.id), ["b", "c", "a", "d"]);
});

test("sortCredentials: education → training → certificate, newest first", () => {
  const list = [
    { id: "1", kind: "certificate" as const, year: 2024 },
    { id: "2", kind: "education" as const, year: 2012 },
    { id: "3", kind: "training" as const, year: 2020 },
    { id: "4", kind: "education" as const, year: 2016 },
  ];
  assert.deepEqual(sortCredentials(list).map((x) => x.id), ["4", "2", "3", "1"]);
});

test("validation of images", () => {
  assert.equal(validateCredentialImage({ type: "application/pdf", size: 10 }).ok, false);
  assert.equal(validateCredentialImage({ type: "image/png", size: 6 * 1024 * 1024 }).ok, false);
  assert.equal(validateCredentialImage({ type: "image/webp", size: 1000 }).ok, true);
});

const NOW = 2026;
const DESC = "Практична психологія та терапія."; // 32 characters
const WORK = "Індивідуальні консультації, групові практики та супровід клієнтів."; // 66 characters
const cred = (over: Partial<CredentialInput> = {}): CredentialInput => ({ kind: "education", title: "Магістр психології", issuer: "Університет", description: DESC, year: 2015, hasDocument: true, ...over });
const exp = (over: Partial<ExperienceInput> = {}): ExperienceInput => ({ organization: "Центр", role: "Психологиня", startYear: 2018, endYear: null, isCurrent: true, description: WORK, areas: ["Консультації", "Групові практики"], ...over });
const s = (n: number) => "а".repeat(n);
const ok = (r: { ok: boolean }) => r.ok;

test("credentials: valid records of each kind", () => {
  assert.equal(ok(validateCredentialInput(cred(), NOW)), true);
  assert.equal(ok(validateCredentialInput(cred({ kind: "training", title: "Робота зі стресом: базовий курс", issuer: "Школа практик" }), NOW)), true);
  assert.equal(ok(validateCredentialInput(cred({ kind: "certificate", title: "Практики уважності (MBSR)", issuer: "Центр уважності" }), NOW)), true);
});

test("credentials: exact minimum and maximum per field and kind (spaces count, ends trimmed)", () => {
  for (const kind of ["education", "training", "certificate"] as const) {
    const max = kind === "education" ? 80 : 100;
    assert.equal(ok(validateCredentialInput(cred({ kind, title: s(9) }), NOW)), false, `${kind} title 9`);
    assert.equal(ok(validateCredentialInput(cred({ kind, title: s(10) }), NOW)), true, `${kind} title 10`);
    assert.equal(ok(validateCredentialInput(cred({ kind, title: s(max) }), NOW)), true, `${kind} title max`);
    assert.equal(ok(validateCredentialInput(cred({ kind, title: s(max + 1) }), NOW)), false, `${kind} title max+1`);
    assert.equal(ok(validateCredentialInput(cred({ kind, issuer: "А" }), NOW)), false);
    assert.equal(ok(validateCredentialInput(cred({ kind, issuer: "КН" }), NOW)), true);
    assert.equal(ok(validateCredentialInput(cred({ kind, issuer: s(100) }), NOW)), true);
    assert.equal(ok(validateCredentialInput(cred({ kind, issuer: s(101) }), NOW)), false);
    assert.equal(ok(validateCredentialInput(cred({ kind, description: s(29) }), NOW)), false);
    assert.equal(ok(validateCredentialInput(cred({ kind, description: s(30) }), NOW)), true);
    assert.equal(ok(validateCredentialInput(cred({ kind, description: s(160) }), NOW)), true);
    assert.equal(ok(validateCredentialInput(cred({ kind, description: s(161) }), NOW)), false);
  }
  assert.equal(ok(validateCredentialInput(cred({ title: "   abcdefghi   " }), NOW)), false); // trimmed first: 9 characters
});

test("credentials: every field is required — empty and whitespace-only values are rejected", () => {
  for (const over of [{ title: "" }, { title: "      " }, { issuer: "" }, { issuer: "     " }, { description: "" }, { description: "          " }, { year: null }, { hasDocument: false }] as Partial<CredentialInput>[]) {
    assert.equal(ok(validateCredentialInput(cred(over), NOW)), false, JSON.stringify(over));
  }
  assert.match(credentialErrors(cred({ title: "" }), NOW).title ?? "", /назву кваліфікації/);
  assert.match(credentialErrors(cred({ kind: "training", title: "" }), NOW).title ?? "", /назву курсу/);
  assert.match(credentialErrors(cred({ kind: "certificate", issuer: "" }), NOW).issuer ?? "", /видала сертифікат/);
  assert.match(credentialErrors(cred({ issuer: "" }), NOW).issuer ?? "", /навчального закладу/);
  assert.match(credentialErrors(cred({ hasDocument: false }), NOW).document ?? "", /документ/);
  // no semantic guessing: a short real title or abbreviation is accepted
  assert.equal(ok(validateCredentialInput(cred({ title: "Магістр ІТ", issuer: "КНУ" }), NOW)), true);
});

test("credentials: the year is a real four-digit year, never in the future (creating and editing alike)", () => {
  assert.equal(ok(validateCredentialInput(cred({ year: 1900 }), NOW)), false);
  assert.equal(ok(validateCredentialInput(cred({ year: NOW }), NOW)), true);
  assert.equal(ok(validateCredentialInput(cred({ year: NOW + 1 }), NOW)), false);
  assert.equal(ok(validateCredentialInput(cred({ year: 2015.5 }), NOW)), false);
  // editing a stored record uses the same rules: fixing the broken field makes it valid again
  const stored = cred({ issuer: "" });
  assert.equal(ok(validateCredentialInput(stored, NOW)), false);
  assert.equal(ok(validateCredentialInput({ ...stored, issuer: "Університет" }, NOW)), true);
});

test("experience: valid records and exact limits", () => {
  assert.equal(ok(validateExperienceInput(exp(), NOW)), true);
  assert.equal(ok(validateExperienceInput(exp({ role: "Тренер" }), NOW)), true); // a short but real role
  assert.equal(ok(validateExperienceInput(exp({ organization: "ГО" }), NOW)), true); // a legitimate abbreviation
  assert.equal(ok(validateExperienceInput(exp({ role: "" }), NOW)), false);
  assert.equal(ok(validateExperienceInput(exp({ role: "   " }), NOW)), false);
  assert.equal(ok(validateExperienceInput(exp({ role: s(4) }), NOW)), false);
  assert.equal(ok(validateExperienceInput(exp({ role: s(5) }), NOW)), true);
  assert.equal(ok(validateExperienceInput(exp({ role: s(80) }), NOW)), true);
  assert.equal(ok(validateExperienceInput(exp({ role: s(81) }), NOW)), false);
  assert.equal(ok(validateExperienceInput(exp({ organization: "А" }), NOW)), false);
  assert.equal(ok(validateExperienceInput(exp({ organization: s(100) }), NOW)), true);
  assert.equal(ok(validateExperienceInput(exp({ organization: s(101) }), NOW)), false);
  // the work description is required: 60–280
  assert.equal(ok(validateExperienceInput(exp({ description: "" }), NOW)), false);
  assert.equal(ok(validateExperienceInput(exp({ description: "          " }), NOW)), false);
  assert.equal(ok(validateExperienceInput(exp({ description: s(59) }), NOW)), false);
  assert.equal(ok(validateExperienceInput(exp({ description: s(60) }), NOW)), true);
  assert.equal(ok(validateExperienceInput(exp({ description: s(280) }), NOW)), true);
  assert.equal(ok(validateExperienceInput(exp({ description: s(281) }), NOW)), false);
  // main areas: required, 2–6 items of 3–40
  assert.equal(ok(validateExperienceInput(exp({ areas: [] }), NOW)), false);
  assert.equal(ok(validateExperienceInput(exp({ areas: ["  "] }), NOW)), false);
  assert.equal(ok(validateExperienceInput(exp({ areas: [s(5)] }), NOW)), false); // one is not enough
  assert.equal(ok(validateExperienceInput(exp({ areas: [s(3), s(40)] }), NOW)), true);
  assert.equal(ok(validateExperienceInput(exp({ areas: [s(2)] }), NOW)), false);
  assert.equal(ok(validateExperienceInput(exp({ areas: [s(41)] }), NOW)), false);
  assert.equal(ok(validateExperienceInput(exp({ areas: Array.from({ length: 7 }, () => s(5)) }), NOW)), false);
  assert.equal(ok(validateExperienceInput(exp({ areas: Array.from({ length: 6 }, () => s(5)) }), NOW)), true);
});

test("experience: dates — start required, end year or «зараз», no future, no reversed range", () => {
  assert.equal(ok(validateExperienceInput(exp({ startYear: null }), NOW)), false);
  assert.equal(ok(validateExperienceInput(exp({ startYear: NOW + 1 }), NOW)), false);
  assert.equal(ok(validateExperienceInput(exp({ startYear: NOW }), NOW)), true);
  assert.equal(ok(validateExperienceInput(exp({ isCurrent: false, endYear: null }), NOW)), false);
  assert.equal(ok(validateExperienceInput(exp({ isCurrent: false, endYear: 2016 }), NOW)), false); // before the start
  assert.match(experienceErrors(exp({ isCurrent: false, endYear: 2016 }), NOW).end ?? "", /раніше/);
  assert.equal(ok(validateExperienceInput(exp({ isCurrent: false, endYear: 2020 }), NOW)), true);
  assert.equal(ok(validateExperienceInput(exp({ isCurrent: false, endYear: NOW + 1 }), NOW)), false); // a past job cannot end in the future
  assert.equal(ok(validateExperienceInput(exp({ isCurrent: true, endYear: null }), NOW)), true); // current role: no end year needed
});

const legacyCred = (over: Partial<AuthorCredential> = {}): AuthorCredential => ({ id: "x", kind: "education", degree: null, title: "Магістр психології", issuer: "Університет", year: 2014, description: DESC, imageUrl: "/demo-docs/d.svg", isPublic: true, ...over });
const legacyExp = (over: Partial<AuthorExperience> = {}): AuthorExperience => ({ id: "y", organization: "Центр", role: "Психологиня", description: composeExperienceText(WORK, ["Консультації", "Групові практики"]), startYear: 2019, endYear: null, isCurrent: true, isPublic: true, ...over });

test("public profile: only complete records are shown (mixed list)", () => {
  const list = [
    legacyCred({ id: "ok" }),
    legacyCred({ id: "no-issuer", issuer: "" }),
    legacyCred({ id: "no-desc", description: "" }),
    legacyCred({ id: "no-doc", imageUrl: null }),
    legacyCred({ id: "short", kind: "certificate", title: "Сер" }),
    legacyCred({ id: "no-year", year: null }),
    legacyCred({ id: "short-title-ok", kind: "certificate", title: "Практики уважності (MBSR)" }),
  ];
  assert.deepEqual(publishableCredentials(list, NOW).map((c) => c.id), ["ok", "short-title-ok"]);
  const ex = [
    legacyExp({ id: "ok" }),
    legacyExp({ id: "no-role", role: "" }),
    legacyExp({ id: "no-start", startYear: null }),
    legacyExp({ id: "short-org", organization: "Г" }),
    legacyExp({ id: "no-desc", description: composeExperienceText("", ["Консультації", "Групові практики"]) }),
    legacyExp({ id: "no-areas", description: WORK })
    ,legacyExp({ id: "one-area", description: composeExperienceText(WORK, ["Консультації"]) }),
    legacyExp({ id: "kouch", role: "Тренер", organization: "ГО" }),
  ];
  assert.deepEqual(publishableExperience(ex, NOW).map((x) => x.id), ["ok", "kouch"]);
});

test("public profile: when every record is incomplete nothing is left to show", () => {
  assert.deepEqual(publishableCredentials([legacyCred({ title: "Сер" }), legacyCred({ issuer: "", title: "Ун" }), legacyCred({ imageUrl: null })], NOW), []);
  assert.deepEqual(publishableExperience([legacyExp({ role: "" }), legacyExp({ organization: "" })], NOW), []);
});

test("legacy: too LONG stored text never hides a record; the reason for hiding is reported to the author", () => {
  assert.equal(credentialIssue(legacyCred({ description: s(900) }), NOW), null);
  assert.equal(credentialIssue(legacyCred({ title: s(300) }), NOW), null);
  assert.equal(experienceIssue(legacyExp({ description: composeExperienceText(s(900), ["Консультації", "Групові практики"]) }), NOW), null);
  assert.match(credentialIssue(legacyCred({ issuer: "" }), NOW) ?? "", /навчального закладу/);
  assert.match(credentialIssue(legacyCred({ imageUrl: null }), NOW) ?? "", /документ/);
  assert.match(experienceIssue(legacyExp({ role: "" }), NOW) ?? "", /посаду/);
  assert.match(experienceIssue(legacyExp({ description: WORK }), NOW) ?? "", /напрям/);
});

test("legacy over-limit text is never cut when read, only checked when the author saves", () => {
  const long = s(500);
  assert.equal(parseExperienceText(long).text, long); // not truncated for display
  assert.equal(validateExperienceInput(exp({ description: long }), NOW).ok, false); // must be shortened before it is saved again
});

test("splitCredentials: education vs certificates & courses", () => {
  const r = splitCredentials([{ kind: "education" as const }, { kind: "training" as const }, { kind: "certificate" as const }]);
  assert.equal(r.education.length, 1);
  assert.equal(r.certificates.length, 2);
});

test("validateCaseInput", () => {
  assert.equal(validateCaseInput({ title: "", situation: "a", approach: "" }).ok, false);
  assert.equal(validateCaseInput({ title: "Т", situation: "", approach: "" }).ok, false);
  assert.equal(validateCaseInput({ title: "Т", situation: "Запит", approach: "" }).ok, true);
});

test("isMeaningfulText: only real descriptions are shown", () => {
  assert.equal(isMeaningfulText(null), false);
  assert.equal(isMeaningfulText(" - "), false);
  assert.equal(isMeaningfulText("ok"), false);
  assert.equal(isMeaningfulText("Практична психологія."), true);
});

test("experience text: paragraph + up to 5 direction tags in one field", () => {
  const raw = composeExperienceText("Індивідуальні консультації та групи.", ["Тривога", "Стрес"]);
  assert.deepEqual(parseExperienceText(raw), { text: "Індивідуальні консультації та групи.", areas: ["Тривога", "Стрес"] });
  assert.deepEqual(parseExperienceText("Просто абзац без тегів."), { text: "Просто абзац без тегів.", areas: [] });
  assert.deepEqual(parseExperienceText(""), { text: "", areas: [] });
  assert.equal(parseExperienceText("- а\n- б\n- в\n- г\n- д\n- е\n- ж").areas.length, 6);
});

test("periodLines: start and end on two lines", () => {
  assert.deepEqual(periodLines({ startYear: 2016, endYear: 2019, isCurrent: false }), ["2016 -", "2019"]);
  assert.deepEqual(periodLines({ startYear: 2019, endYear: null, isCurrent: true }), ["2019 -", "зараз"]);
  assert.deepEqual(periodLines({ startYear: 2021, endYear: 2021, isCurrent: false }), ["2021"]);
  assert.deepEqual(periodLines({ startYear: 2020, endYear: null, isCurrent: false }), ["з 2020"]);
  assert.deepEqual(periodLines({ startYear: null, endYear: null, isCurrent: false }), []);
});
