import { test } from "node:test";
import assert from "node:assert/strict";
import { parseUserAgent } from "./userAgent.ts";

test("Chrome on macOS", () => {
  const ua =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
  assert.equal(parseUserAgent(ua), "Chrome · macOS");
});

test("Safari on iPhone", () => {
  const ua =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
  assert.equal(parseUserAgent(ua), "Safari · iOS");
});

test("Firefox on Windows", () => {
  const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0";
  assert.equal(parseUserAgent(ua), "Firefox · Windows");
});

test("Edge is distinguished from Chrome", () => {
  const ua =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0";
  assert.equal(parseUserAgent(ua), "Edge · Windows");
});

test("Android Chrome", () => {
  const ua =
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";
  assert.equal(parseUserAgent(ua), "Chrome · Android");
});

test("unrecognized UA falls back gracefully", () => {
  assert.equal(parseUserAgent("some-weird-bot/1.0"), "Невідомий браузер");
});
