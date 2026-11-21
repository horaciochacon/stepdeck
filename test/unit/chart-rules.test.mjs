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

test("chartProblems: unknown types and odd props give nothing", () => {
  assert.deepEqual(chartProblems("text", { ticker: true }), []);
  assert.deepEqual(chartProblems("chart.bar", { ticker: true }), []);
  assert.deepEqual(chartProblems("chart.line", {}), []);
  assert.deepEqual(chartProblems("chart.line", null), []);
  assert.deepEqual(chartProblems(undefined, undefined), []);
});

test("chart-rules.js has no imports: validate loads it in plain Node", async () => {
  const source = await readFile(new URL("../../engine/core/chart-rules.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /^\s*import\s/m);
});
