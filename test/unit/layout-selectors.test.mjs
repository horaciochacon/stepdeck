// splitSelectors and scopeSelector (engine/core/layout.js): the two pure helpers that keep a slide's `style` inside
// its own slide. scopeCss, which walks a real CSSStyleSheet with them, is tested in the browser suite.
import { test } from "node:test";
import assert from "node:assert/strict";
import { splitSelectors, scopeSelector } from "#engine/core/layout.js";

const S = '[data-slide="s"]';

test("splitSelectors splits on top-level commas only", () => {
  assert.deepEqual(splitSelectors("a, b"), ["a", "b"]);
  assert.deepEqual(splitSelectors(':is(a, b) c, d[x="1,2"]'), [":is(a, b) c", 'd[x="1,2"]']);
  assert.deepEqual(splitSelectors(":not(:is(a, b), c) d"), [":not(:is(a, b), c) d"]);
  assert.deepEqual(splitSelectors("a[t='x,y'], b"), ["a[t='x,y']", "b"]);
});

test("splitSelectors: an escaped quote does not end a string", () => {
  assert.deepEqual(splitSelectors('a[t="x\\",y"], b'), ['a[t="x\\",y"]', "b"]);
  assert.deepEqual(splitSelectors("a[t='x\\',y'], b"), ["a[t='x\\',y']", "b"]);
});

test("splitSelectors trims each selector and drops empty ones", () => {
  assert.deepEqual(splitSelectors("  a ,\n  b  "), ["a", "b"]);
  assert.deepEqual(splitSelectors("a,, b,"), ["a", "b"]);
  assert.deepEqual(splitSelectors(""), []);
});

test("scopeSelector prefixes a selector with the scope", () => {
  assert.equal(scopeSelector("p", S), `${S} p`);
  assert.equal(scopeSelector(".sd-el > p", S), `${S} .sd-el > p`);
});

test("scopeSelector: a leading :scope or & is the scope itself", () => {
  assert.equal(scopeSelector(":scope > p", S), `${S} > p`);
  assert.equal(scopeSelector(":scope", S), S);
  assert.equal(scopeSelector("&.x", S), `${S}.x`);
  assert.equal(scopeSelector("& p", S), `${S} p`);
});

test("scopeSelector: a name that only starts with :scope is an ordinary selector", () => {
  assert.equal(scopeSelector(":scope-x", S), `${S} :scope-x`);
  assert.equal(scopeSelector(":scoped p", S), `${S} :scoped p`);
});
