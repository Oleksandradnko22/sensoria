import { test } from "node:test";
import assert from "node:assert/strict";
import { checkYoutubeVideo } from "./youtubeAvailability.ts";

const resp = (status: number) => (async () => ({ ok: status >= 200 && status < 300, status }) as Response) as unknown as typeof fetch;

test("a viewable video is ok", async () => {
  assert.equal(await checkYoutubeVideo("_bc0HnxvtZQ", undefined, resp(200)), "ok");
});
test("private, removed or embed-disabled videos are unavailable", async () => {
  for (const s of [401, 403, 404]) assert.equal(await checkYoutubeVideo("_bc0HnxvtZQ", undefined, resp(s)), "unavailable");
});
test("server errors and network failures never block the author", async () => {
  assert.equal(await checkYoutubeVideo("_bc0HnxvtZQ", undefined, resp(500)), "unknown");
  const boom = (async () => { throw new TypeError("Failed to fetch"); }) as unknown as typeof fetch;
  assert.equal(await checkYoutubeVideo("_bc0HnxvtZQ", undefined, boom), "unknown");
});
test("the request asks oEmbed about the right video", async () => {
  let asked = "";
  const spy = (async (u: string) => { asked = u; return { ok: true, status: 200 } as Response; }) as unknown as typeof fetch;
  await checkYoutubeVideo("_bc0HnxvtZQ", undefined, spy);
  assert.ok(asked.startsWith("https://www.youtube.com/oembed?"));
  assert.ok(decodeURIComponent(asked).includes("watch?v=_bc0HnxvtZQ"));
});
