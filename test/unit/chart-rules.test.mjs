// core/chart-rules.js: the pure findings `validate` reports for the chart components (no DOM, no imports).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chartProblems } from "#engine/core/chart-rules.js";

test("chartProblems: ticker without until warns; with until it is clean", () => {
  const found = chartProblems("chart.line", { data: "data/t.csv", x: "year", y: "rate", ticker: true });
  assert.equal(found.length, 1);
  const [item] = found;
  assert.equal(item.rule, "chart-prop-unused");
  assert.equal(item.severity, "warning");
  assert.equal(item.message, "`ticker` does nothing without `until`");
  assert.match(item.limit, /until/);
  assert.match(item.fix, /until/);
  assert.deepEqual(chartProblems("chart.line", { ticker: true, until: 2030 }), []);
  assert.deepEqual(chartProblems("chart.line", { ticker: true, until: 0 }), [], "0 is a value");
  assert.deepEqual(chartProblems("chart.line", { ticker: false }), [], "ticker off does nothing and says nothing");
  assert.deepEqual(chartProblems("chart.line", { until: 2030 }), []);
});

test("chartProblems: invert and total outside waterfall warn", () => {
  const bar = { data: "data/flow.csv", x: "item", y: "change" };
  const found = chartProblems("chart.bar", { ...bar, invert: true, total: true });
  assert.deepEqual(found.map((p) => p.rule), ["chart-prop-unused", "chart-prop-unused"]);
  assert.ok(found.every((p) => p.severity === "warning"));
  assert.deepEqual(found.map((p) => p.message), [
    '`invert` does nothing without `mode: "waterfall"`',
    '`total` does nothing without `mode: "waterfall"`',
  ]);
  for (const p of found) {
    assert.match(p.limit, /mode: "waterfall"/);
    assert.match(p.fix, /mode: "waterfall"/);
  }
  assert.deepEqual(chartProblems("chart.bar", { ...bar, mode: "bars", total: "Net" }).map((p) => p.message), ['`total` does nothing without `mode: "waterfall"`'], "a label is a total too");
  assert.deepEqual(chartProblems("chart.bar", { ...bar, mode: "waterfall", invert: true, total: "Net" }), [], "in a waterfall they do something");
  assert.deepEqual(chartProblems("chart.bar", { ...bar, invert: false, total: false }), [], "switched off, they say nothing");
  assert.deepEqual(chartProblems("chart.bar", { ...bar, invert: null, total: null }), [], "cleared, they say nothing");
});

test("chartProblems: back-to-back vertical is an error", () => {
  const pyramid = { data: "data/pyramid.csv", x: "age", y: "share", mode: "back-to-back", group: "group" };
  const found = chartProblems("chart.bar", { ...pyramid, orient: "vertical" });
  assert.equal(found.length, 1);
  const [item] = found;
  assert.equal(item.rule, "chart-orient");
  assert.equal(item.severity, "error");
  assert.equal(item.message, "back-to-back bars are horizontal only");
  assert.match(item.limit, /horizontal/);
  assert.match(item.fix, /orient/);
  assert.deepEqual(chartProblems("chart.bar", pyramid), [], "horizontal by default");
  assert.deepEqual(chartProblems("chart.bar", { ...pyramid, orient: "horizontal" }), []);
  assert.deepEqual(chartProblems("chart.bar", { ...pyramid, mode: "bars", orient: "vertical" }), [], "plain bars may stand up");
  assert.deepEqual(chartProblems("chart.bar", { ...pyramid, mode: "waterfall", orient: "vertical" }), [], "and so may a waterfall");
  assert.deepEqual(chartProblems("chart.points", { ...pyramid, orient: "vertical" }), [], "only chart.bar has the mode");
});

test("chartProblems: unknown types and odd props give nothing", () => {
  assert.deepEqual(chartProblems("text", { ticker: true }), []);
  assert.deepEqual(chartProblems("text", { invert: true, total: true }), []);
  assert.deepEqual(chartProblems("chart.bar", { ticker: true }), []);
  assert.deepEqual(chartProblems("chart.line", { invert: true, total: true }), []);
  assert.deepEqual(chartProblems("chart.line", {}), []);
  assert.deepEqual(chartProblems("chart.line", null), []);
  assert.deepEqual(chartProblems(undefined, undefined), []);
});

test("chart-rules.js has no imports: validate loads it in plain Node", async () => {
  const source = await readFile(new URL("../../engine/core/chart-rules.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /^\s*import\s/m);
});
