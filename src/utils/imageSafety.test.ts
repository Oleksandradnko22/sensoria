import test from "node:test";
import assert from "node:assert/strict";
import { verdictFrom } from "./imageSafety.ts";

test("explicit photos are refused, ordinary ones pass", () => {
  assert.equal(verdictFrom([{ className: "Neutral", probability: 0.9 }, { className: "Porn", probability: 0.05 }]).ok, true);
  assert.equal(verdictFrom([{ className: "Porn", probability: 0.4 }, { className: "Hentai", probability: 0.2 }]).ok, false);
  assert.equal(verdictFrom([{ className: "Sexy", probability: 0.6 }]).ok, true, "only when the model is sure");
  assert.equal(verdictFrom([{ className: "Sexy", probability: 0.9 }]).ok, false);
});
