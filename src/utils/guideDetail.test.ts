import test from "node:test";
import assert from "node:assert/strict";
import { interactiveSummary } from "./guideDetail.ts";

const blocks = (...types: string[]) => types.map((type) => ({ type }));

test("nothing interactive, or no content: no summary", () => {
  assert.deepEqual(interactiveSummary(undefined), []);
  assert.deepEqual(interactiveSummary([]), []);
  assert.deepEqual(interactiveSummary(blocks("heading", "rich_text", "divider")), []);
});

test("counts only the interactive types the guide has, in a fixed order", () => {
  const s = interactiveSummary(blocks("heading", "reflection", "checklist", "checklist", "timer_practice", "rich_text"));
  assert.deepEqual(s.map((x) => x.label), ["2 чеклісти", "1 запитання для рефлексії", "1 практика з таймером"]);
});

test("Ukrainian plural forms", () => {
  const labels = (n: number) => interactiveSummary(blocks(...Array<string>(n).fill("checklist")))[0].label;
  assert.equal(labels(1), "1 чекліст");
  assert.equal(labels(3), "3 чеклісти");
  assert.equal(labels(5), "5 чеклістів");
  assert.equal(labels(21), "21 чекліст");
  assert.equal(labels(22), "22 чеклісти");
});
