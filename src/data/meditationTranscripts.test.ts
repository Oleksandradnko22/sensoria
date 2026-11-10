import { test } from "node:test";
import assert from "node:assert/strict";
import { meditations } from "./meditations.ts";
import { meditationsMissingTranscript } from "../utils/meditationTranscript.ts";

// Every voice-based meditation must have an author-confirmed transcript.
// Meditations that still lack one are listed HERE, explicitly, so that:
//  - a NEW voice meditation cannot be added without its transcript, and
//  - once an author supplies one, this list is cleaned up (the test below
//    fails if a listed id no longer lacks a transcript).
const KNOWN_MISSING: string[] = [];

test("no voice-based meditation is added without a confirmed transcript", () => {
  const missing = meditationsMissingTranscript(meditations);
  const unexpected = missing.filter((id) => !KNOWN_MISSING.includes(id));
  assert.deepEqual(unexpected, [], `add an author-confirmed transcript for: ${unexpected.join(", ")}`);
});

test("KNOWN_MISSING only lists meditations that really still lack a transcript", () => {
  const missing = new Set(meditationsMissingTranscript(meditations));
  const stale = KNOWN_MISSING.filter((id) => !missing.has(id));
  assert.deepEqual(stale, [], `transcript now exists — remove from KNOWN_MISSING: ${stale.join(", ")}`);
});
