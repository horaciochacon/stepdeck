import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { deckTarget } from "../../cli/browser.js";

const repo = fileURLToPath(new URL("../../", import.meta.url));

test("deckTarget: a deck inside the engine repo is served from the repo root", () => {
  const t = deckTarget(resolve(repo, "examples/spike"));
  assert.equal(resolve(t.root), resolve(repo));
  assert.equal(t.url({ slide: "hello", step: "two" }), "core/render.html?deck=..%2Fexamples%2Fspike%2F&slide=hello&step=two");
});

test("deckTarget: a deck with a copied engine is served from the deck itself", () => {
  const deck = resolve(repo, "test/fixtures/decks/with-engine");
  const t = deckTarget(deck);
  assert.equal(t.root, deck);
  assert.equal(t.url({ slide: "a", capture: true }), "stepdeck/core/render.html?deck=..%2F..%2F&slide=a&capture");
});

test("deckTarget: a deck outside the repo without an engine copy is refused (never serve above the deck)", () => {
  const outside = resolve(repo, "..", "some-other-deck");
  assert.throws(() => deckTarget(outside), /has no engine copy; run `stepdeck new` or copy the engine to .*some-other-deck\/stepdeck\//);
});
