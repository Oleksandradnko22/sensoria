import test from "node:test";
import assert from "node:assert/strict";
import { buildWarning, parseWarning, setCustomWarning, toggleWarningTopic } from "./contentWarning.ts";

test("only one topic at a time; the same one again clears it", () => {
  let t = toggleWarningTopic(undefined, "втрата та горе");
  assert.equal(t, "Урок може торкатися тем: втрата та горе.");
  t = toggleWarningTopic(t, "насильство");
  assert.deepEqual(parseWarning(t).topics, ["насильство"]);
  assert.equal(toggleWarningTopic(t, "насильство"), undefined);
});

test("own text replaces a topic and is limited to 30 characters", () => {
  assert.equal(setCustomWarning("розлучення"), "розлучення");
  assert.equal(parseWarning(setCustomWarning("x".repeat(100))).custom.length, 30);
  assert.equal(setCustomWarning("  "), undefined);
  assert.deepEqual(parseWarning("щось своє"), { topics: [], custom: "щось своє" });
  assert.equal(buildWarning([], ""), undefined);
});

test("specialist-only warning topics: locked for regular authors, removed ones count as specialist-only", async () => {
  const { WARNING_TOPICS, warningNeedsSpecialist, isSpecialistWarningTopic } = await import("./contentWarning.ts");
  for (const gone of ["самоушкодження", "суїцидальні думки", "залежності", "смерть і хвороба"]) assert.equal((WARNING_TOPICS as readonly string[]).includes(gone), false, gone);
  assert.equal(isSpecialistWarningTopic("втрата та горе"), true);
  assert.equal(warningNeedsSpecialist(toggleWarningTopic(undefined, "насильство")), true);
  assert.equal(warningNeedsSpecialist(toggleWarningTopic(undefined, "гучні звуки")), false);
  assert.equal(warningNeedsSpecialist("Урок може торкатися тем: суїцидальні думки."), true, "old data");
  assert.equal(warningNeedsSpecialist("смерть близької людини"), true, "own text");
  assert.equal(warningNeedsSpecialist("розлучення"), false);
  assert.equal(warningNeedsSpecialist(undefined), false);
});
