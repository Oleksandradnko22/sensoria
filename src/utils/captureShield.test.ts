import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyKey, isEditableTarget, shouldCoverOnBlur, type KeyInfo } from "./captureShield.ts";

const k = (o: Partial<KeyInfo> & { key: string }): KeyInfo => ({ metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...o });

test("screenshot shortcuts are recognised: PrintScreen, and Meta+Shift (macOS Cmd+Shift+3/4/5, Windows Win+Shift+S) as soon as both modifiers are down", () => {
  assert.equal(classifyKey(k({ key: "PrintScreen" }), false), "capture");
  assert.equal(classifyKey(k({ key: "$", code: "Digit4", metaKey: true, shiftKey: true }), false), "capture");
  assert.equal(classifyKey(k({ key: "Shift", metaKey: true, shiftKey: true }), false), "capture");
  assert.equal(classifyKey(k({ key: "S", metaKey: true, shiftKey: true }), true), "capture");
});

test("print, save and view-source are always cancelled", () => {
  for (const key of ["p", "s", "u"]) {
    assert.equal(classifyKey(k({ key, ctrlKey: true }), false), "blocked");
    assert.equal(classifyKey(k({ key, metaKey: true }), true), "blocked");
  }
});

test("copy / cut / select-all are cancelled on content but never inside a text field", () => {
  for (const key of ["c", "x", "a"]) {
    assert.equal(classifyKey(k({ key, ctrlKey: true }), false), "blocked");
    assert.equal(classifyKey(k({ key, ctrlKey: true }), true), null);
  }
});

test("ordinary typing and unrelated shortcuts pass through", () => {
  assert.equal(classifyKey(k({ key: "a" }), false), null);
  assert.equal(classifyKey(k({ key: "z", ctrlKey: true }), false), null);
  assert.equal(classifyKey(k({ key: "Shift", shiftKey: true }), true), null);
  assert.equal(classifyKey(k({ key: "Enter" }), true), null);
});

test("editable targets", () => {
  assert.equal(isEditableTarget("textarea", false), true);
  assert.equal(isEditableTarget("INPUT", false), true);
  assert.equal(isEditableTarget("div", true), true);
  assert.equal(isEditableTarget("div", false), false);
  assert.equal(isEditableTarget(undefined, undefined), false);
});

test("clicking into an iframe is not 'leaving the page'", () => {
  assert.equal(shouldCoverOnBlur("IFRAME"), false);
  assert.equal(shouldCoverOnBlur("iframe"), false);
  assert.equal(shouldCoverOnBlur("BODY"), true);
  assert.equal(shouldCoverOnBlur(undefined), true);
});
