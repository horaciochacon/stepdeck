import { test } from "node:test";
import assert from "node:assert/strict";
import { t } from "#engine/core/i18n.js";

test("ci95 is localized in en and es, and unknown languages fall back to English", () => {
  assert.equal(t("en", "ci95"), "95% CI");
  assert.equal(t("es", "ci95"), "IC 95%");
  assert.equal(t("fr", "ci95"), "95% CI");
});

test("a regional tag reads its language; an unknown one is English", () => {
  assert.equal(t("es-PE", "noData"), "sin datos");
  assert.equal(t("es-419", "forecast"), "Proyección");
  assert.equal(t("en-GB", "noData"), "no data");
  assert.equal(t("fr-CA", "noData"), "no data");
  assert.equal(t("es-PE", "nope"), "nope");
});

test("forecast is localized in en and es", () => {
  assert.equal(t("en", "forecast"), "Forecast");
  assert.equal(t("es", "forecast"), "Proyección");
});

test("noData is localized in en and es", () => {
  assert.equal(t("en", "noData"), "no data");
  assert.equal(t("es", "noData"), "sin datos");
});

test("total is localized in en and es", () => {
  assert.equal(t("en", "total"), "Total");
  assert.equal(t("es", "total"), "Total");
  assert.equal(t("fr", "total"), "Total");
});
