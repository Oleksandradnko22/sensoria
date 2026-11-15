// «Професійний бекграунд»: only what the author stated in their own public
// records. A column with no basis is simply left out.
//   education     highest degree the author named (Бакалавр / Магістр …) and
//                 the field from the record's title; without a named degree
//                 the column says «Освіта» + the title
//   years         earliest start year of the author's PUBLIC experience → this
//                 year (never guessed from the sign-up date; < 1 year hidden)
//   certificates  public certificates
//   courses       public courses / trainings
// Any one of education, certificates or courses is enough for the block; all of them is ideal.
import { pluralUk } from "./plural.ts";
import { DEGREE_LABEL, DEGREE_RANK, plainTitle, type AuthorCredential } from "./authorCredentials.ts";

export type BackgroundFact = { key: "education" | "years" | "certificates" | "courses"; value: string; label: string };

export function backgroundFacts(input: {
  credentials: Pick<AuthorCredential, "kind" | "title" | "degree">[];
  experience: { startYear: number | null; isPublic?: boolean }[];
  year: number;
}): BackgroundFact[] {
  const facts: BackgroundFact[] = [];

  const edu = input.credentials.filter((c) => c.kind === "education");
  if (edu.length) {
    const best = [...edu].sort((a, b) => (b.degree ? DEGREE_RANK[b.degree] : 0) - (a.degree ? DEGREE_RANK[a.degree] : 0))[0];
    facts.push({ key: "education", value: best.degree ? DEGREE_LABEL[best.degree] : "Освіта", label: plainTitle(best.title) });
  }

  const starts = input.experience
    .filter((e) => e.isPublic !== false && e.startYear && e.startYear >= 1950 && e.startYear <= input.year)
    .map((e) => e.startYear as number);
  if (starts.length) {
    const years = input.year - Math.min(...starts);
    if (years >= 1) facts.push({ key: "years", value: `${years} ${pluralUk(years, "рік", "роки", "років")}`, label: "Професійного досвіду" });
  }

  const certs = input.credentials.filter((c) => c.kind === "certificate").length;
  if (certs > 0) facts.push({ key: "certificates", value: String(certs), label: pluralUk(certs, "Сертифікат", "Сертифікати", "Сертифікатів") });
  const courses = input.credentials.filter((c) => c.kind === "training").length;
  if (courses > 0) facts.push({ key: "courses", value: String(courses), label: pluralUk(courses, "Курс", "Курси", "Курсів") });

  // shown once there is at least one diploma, certificate or course
  return facts.some((f) => f.key !== "years") ? facts : [];
}

// What the author still has to add (public records) for the block to appear.
export function backgroundMissing(input: Parameters<typeof backgroundFacts>[0]): string[] {
  return backgroundFacts(input).length ? [] : ["диплом, курс або сертифікат"];
}
