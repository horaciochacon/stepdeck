// cli/check.js without a browser: the guard the played pass runs before every animated arrival.
import { test } from "node:test";
import assert from "node:assert/strict";
import { animateOn } from "../../cli/check.js";

/** A session as the played pass reads it: the page's flags and its visibility. */
const session = (flags, visibility = "visible") => ({ flags: async () => flags, visibility: async () => visibility });

test("animateOn: a visible page that animates passes", async () => {
  await animateOn(session({ animate: true }));
});

test("animateOn: animation off stops the played pass", async () => {
  await assert.rejects(animateOn(session({ animate: false, capture: true })), {
    message: 'animation is off on the page (flags {"animate":false,"capture":true}); check --played cannot test the animated path',
  });
});

test("animateOn: a hidden page stops the played pass, since a hidden page never animates", async () => {
  await assert.rejects(animateOn(session({ animate: true }, "hidden")), {
    message: "the page is hidden (document.visibilityState is 'hidden'), so it renders end states only; check --played cannot test the animated path",
  });
});
