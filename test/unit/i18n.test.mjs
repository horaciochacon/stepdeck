import { test } from "node:test";
import assert from "node:assert/strict";
import { t } from "#engine/core/i18n.js";

test("ci95 is localized in en and es, and unknown languages fall back to English", () => {
  assert.equal(t("en", "ci95"), "95% CI");
  assert.equal(t("es", "ci95"), "IC 95%");
  assert.equal(t("fr", "ci95"), "95% CI");
});

test("forecast is localized in en and es", () => {
  assert.equal(t("en", "forecast"), "Forecast");
  assert.equal(t("es", "forecast"), "Proyección");
});
