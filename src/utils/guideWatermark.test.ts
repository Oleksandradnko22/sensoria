import { test } from "node:test";
import assert from "node:assert/strict";
import { watermarkLabel } from "./guideWatermark.ts";

test("label: personalised with the account email, then name, else just the brand", () => {
  assert.equal(watermarkLabel({ name: "Саша", email: "a@b.com" }), "SENSORIA · a@b.com");
  assert.equal(watermarkLabel({ name: "Саша", email: " " }), "SENSORIA · Саша");
  assert.equal(watermarkLabel(null), "SENSORIA");
});
