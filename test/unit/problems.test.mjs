import { test } from "node:test";
import assert from "node:assert/strict";
import { problem, formatProblem, formatProblems } from "../../cli/problems.js";
import { canvasDifference } from "../../cli/check.js";

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

test("check --played: a canvas difference names the first differing attribute and shows both whole", () => {
  const fan = (signature, draws = "200") => ({ draws, until: "", seed: "1", signature });
  assert.deepEqual(canvasDifference([fan("9f8e7d6c")], [fan("1a2b3c4d")]), {
    measured: "signature 1a2b3c4d (draws=200 until= seed=1 signature=1a2b3c4d)",
    limit: "signature 9f8e7d6c (draws=200 until= seed=1 signature=9f8e7d6c)",
  });
  assert.deepEqual(canvasDifference([fan("a", "20")], [fan("b", "40")]), {
    measured: "draws 40 (draws=40 until= seed=1 signature=b)",
    limit: "draws 20 (draws=20 until= seed=1 signature=a)",
  }, "the first attribute that differs, in the arrival's order");
  assert.deepEqual(canvasDifference([{ n: "1" }], [{ n: "1", extra: "" }]), { measured: 'extra "" (n=1 extra=)', limit: "extra absent (n=1)" });
  assert.deepEqual(canvasDifference(undefined, [{ n: "2" }]), { measured: "n=2", limit: "none" });
  assert.deepEqual(canvasDifference([{ n: "1" }], undefined), { measured: "none", limit: "n=1" });
  assert.deepEqual(canvasDifference([{ n: "1" }, { m: "1" }], [{ n: "1" }, { m: "2" }]), { measured: "layer 2 m 2 (m=2)", limit: "layer 2 m 1 (m=1)" });
  assert.deepEqual(canvasDifference([{ n: "1" }, { m: "1" }], [{ n: "1" }]), { measured: "layer 2 missing", limit: "layer 2 m=1" });
  const long = "x".repeat(300);
  assert.ok(canvasDifference([{ s: "a" }], [{ s: long }]).measured.length < 340, "long values are cut");
});
