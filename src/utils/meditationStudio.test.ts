import { test } from "node:test";
import assert from "node:assert/strict";
import { STUDIO_FRAGMENT_MAX_CHARS, STUDIO_LEAD_IN, splitTranscript, totalSeconds, voiceBounds, formatClock } from "./meditationStudio.ts";

test("paragraphs become fragments; single lines when there are no blank lines", () => {
  assert.deepEqual(splitTranscript("Вдих.\n\nВидих.\n\n\nТиша.").map((f) => f.text), ["Вдих.", "Видих.", "Тиша."]);
  assert.deepEqual(splitTranscript("Перше\nДруге").map((f) => f.text), ["Перше", "Друге"]);
  assert.deepEqual(splitTranscript("   "), []);
});

test("a long paragraph is cut at sentence ends; ids follow the words", () => {
  const long = Array.from({ length: 20 }, (_, i) => `Речення номер ${i} про спокійне дихання.`).join(" ");
  const parts = splitTranscript(long);
  assert.ok(parts.length > 1);
  assert.ok(parts.every((p) => p.text.length <= STUDIO_FRAGMENT_MAX_CHARS));
  const a = splitTranscript("Один.\n\nДва.");
  const b = splitTranscript("Нуль.\n\nОдин.\n\nДва.");
  assert.equal(a[0].id, b[1].id, "the same words keep their take");
  const twice = splitTranscript("Вдих.\n\nВдих.");
  assert.notEqual(twice[0].id, twice[1].id);
});

test("total length: lead-in, voice, pauses, quiet ending", () => {
  const f = splitTranscript("А.\n\nБ.");
  const blob = new Blob([]);
  const takes = { [f[0].id]: { blob, start: 0, end: 4 }, [f[1].id]: { blob, start: 1, end: 3 } };
  assert.equal(totalSeconds(f, takes, { [f[0].id]: 10 }, 5), STUDIO_LEAD_IN + 4 + 10 + 2 + 5);
  assert.equal(totalSeconds(f, {}, {}, 5), 0);
  assert.equal(formatClock(75), "1:15");
});

test("voice bounds: silence around the voice is cut, pure silence is no take", () => {
  const rate = 1000;
  const s = new Float32Array(3000);
  for (let i = 1000; i < 2000; i++) s[i] = Math.sin(i) * 0.5;
  const b = voiceBounds(s, rate);
  assert.ok(b && b.start > 0.7 && b.start < 1 && b.end > 2 && b.end < 2.4);
  assert.equal(voiceBounds(new Float32Array(3000), rate), null);
});
