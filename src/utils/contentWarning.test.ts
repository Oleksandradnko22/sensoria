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
