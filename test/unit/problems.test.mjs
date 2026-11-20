import { test } from "node:test";
import assert from "node:assert/strict";
import { problem, formatProblem, formatProblems } from "../../cli/problems.js";

test("formatProblem: slide/element/step · rule · measured vs limit · fix", () => {
  const p = problem({ slide: "trend", element: "n1", step: "annotate", rule: "min-font", measured: "22px", limit: "28px", fix: "use role body" });
  assert.deepEqual(Object.keys(p), ["slide", "element", "step", "rule", "measured", "limit", "fix"]);
  assert.equal(formatProblem(p), "trend/n1/annotate · min-font · 22px vs 28px · use role body");
});

test("formatProblem: missing location parts are left out", () => {
  assert.equal(formatProblem(problem({ slide: "a", step: "s", rule: "r", measured: "m", limit: "l", fix: "f" })), "a/s · r · m vs l · f");
  assert.equal(formatProblem(problem({ rule: "r", measured: "m", limit: "l", fix: "f" })), "deck · r · m vs l · f");
  assert.equal(formatProblems([problem({ slide: "a", rule: "r" }), problem({ slide: "b", rule: "r" })]).split("\n").length, 2);
});
