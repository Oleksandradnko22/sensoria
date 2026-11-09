import { test } from "node:test";
import assert from "node:assert/strict";
import {
  confirmTranscript,
  editTranscript,
  meditationsMissingTranscript,
  needsTranscript,
  publicTranscript,
  transcriptState,
  type MeditationTranscript,
} from "./meditationTranscript.ts";

const TEXT = "Зробіть повільний вдих.\n\nВідчуйте опору під ногами.";

test("voice-based formats require a transcript; a nearly silent one does not", () => {
  assert.equal(needsTranscript("guided"), true);
  assert.equal(needsTranscript("minimal"), true);
  assert.equal(needsTranscript("silent"), false);
});

test("state: missing → draft → confirmed", () => {
  assert.equal(transcriptState({ format: "guided" }), "missing");
  assert.equal(transcriptState({ format: "silent" }), "not_required");
  assert.equal(transcriptState({ format: "guided", transcript: { text: TEXT, status: "draft" } }), "draft");
  const ok = confirmTranscript({ text: TEXT, status: "draft" }, "Автор", "2026-10-06T10:00:00Z");
  assert.ok(ok.ok);
  assert.equal(transcriptState({ format: "guided", transcript: (ok as { transcript: MeditationTranscript }).transcript }), "confirmed");
});

test("a 'confirmed' flag without author/date/text does not count as confirmed", () => {
  assert.equal(transcriptState({ format: "guided", transcript: { text: TEXT, status: "confirmed" } }), "draft");
  assert.equal(
    transcriptState({ format: "guided", transcript: { text: "коротко", status: "confirmed", confirmedBy: "A", confirmedAt: "x" } }),
    "draft"
  );
});

test("confirming needs real text and a name", () => {
  assert.equal(confirmTranscript({ text: "  ", status: "draft" }, "Автор", "t").ok, false);
  assert.equal(confirmTranscript({ text: TEXT, status: "draft" }, " ", "t").ok, false);
});

test("participants only ever see a confirmed transcript, split into paragraphs", () => {
  assert.equal(publicTranscript({ format: "guided" }), null);
  assert.equal(publicTranscript({ format: "guided", transcript: { text: TEXT, status: "draft" } }), null);
  const confirmed: MeditationTranscript = { text: TEXT, status: "confirmed", confirmedBy: "Автор", confirmedAt: "2026-10-06T10:00:00Z" };
  assert.deepEqual(publicTranscript({ format: "guided", transcript: confirmed }), [
    "Зробіть повільний вдих.",
    "Відчуйте опору під ногами.",
  ]);
});

test("editing a confirmed transcript sends it back to draft until re-confirmed", () => {
  const confirmed: MeditationTranscript = { text: TEXT, status: "confirmed", confirmedBy: "Автор", confirmedAt: "t" };
  const edited = editTranscript(confirmed, TEXT + " Ще одне речення.");
  assert.equal(edited.status, "draft");
  assert.equal(edited.confirmedBy, undefined);
  assert.equal(publicTranscript({ format: "guided", transcript: edited }), null);
});

test("missing list: voice meditations without a confirmed transcript", () => {
  const list = [
    { id: "a", format: "guided" as const },
    { id: "b", format: "silent" as const },
    { id: "c", format: "minimal" as const, transcript: { text: TEXT, status: "draft" as const } },
    { id: "d", format: "guided" as const, transcript: { text: TEXT, status: "confirmed" as const, confirmedBy: "A", confirmedAt: "t" } },
  ];
  assert.deepEqual(meditationsMissingTranscript(list), ["a", "c"]);
});
