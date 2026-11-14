import test from "node:test";
import assert from "node:assert/strict";
import { verdictFrom } from "./imageSafety.ts";

test("explicit photos are refused, ordinary ones pass", () => {
  assert.equal(verdictFrom([{ className: "Neutral", probability: 0.9 }, { className: "Porn", probability: 0.05 }]).ok, true);
  assert.equal(verdictFrom([{ className: "Porn", probability: 0.4 }, { className: "Hentai", probability: 0.2 }]).ok, false);
  assert.equal(verdictFrom([{ className: "Sexy", probability: 0.6 }]).ok, true, "only when the model is sure");
  assert.equal(verdictFrom([{ className: "Sexy", probability: 0.9 }]).ok, false);
});

test("links and contacts are refused everywhere, @[author] mentions are allowed", async () => {
  const { checkPublicText } = await import("./authorPosts.ts");
  for (const bad of ["Мій сайт olena.com.ua", "пишіть на olena@gmail.com", "мій інстаграм @olena_psy", "https://site.ua", "www.test.com", "t.me/olena"]) {
    assert.equal(checkPublicText(bad, 1000).ok, false, bad);
  }
  assert.equal(checkPublicText("Дякую @[Олена Коваль] за практику!", 1000).ok, true);
  assert.equal(checkPublicText("Техніка 4-7-8 і 10 хвилин тиші. Node.js тут ні до чого.", 1000).ok, true);
});
