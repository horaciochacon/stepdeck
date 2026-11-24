// textColor (engine/core/color.js): the colour a palette colour takes when it is used for text. A palette colour
// only promises 3:1 on the theme background; text needs 4.5:1.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { TEXT_CONTRAST, contrast, luminance, parseHex, textColor } from "#engine/core/color.js";

const themes = new URL("../../engine/themes/", import.meta.url);
const ratio = (a, b) => contrast(luminance(parseHex(a)), luminance(parseHex(b)));

/** [{ theme, background, palette, id, value }] for every colour of every categorical palette of every theme. */
const categorical = readdirSync(themes, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .flatMap(({ name: theme }) => {
    const dir = new URL(`${theme}/`, themes);
    const tokens = readFileSync(new URL("tokens.css", dir), "utf8");
    const background = /--sd-color-background:\s*([^;]+);/.exec(tokens)[1].trim();
    const { palettes } = JSON.parse(readFileSync(new URL("palettes.json", dir), "utf8"));
    return Object.entries(palettes)
      .filter(([, p]) => p.kind === "categorical")
      .flatMap(([palette, p]) => p.colors.map((c) => ({ theme, background, palette, id: c.id, value: c.value })));
  });

test("both shipped themes have categorical colours to test", () => {
  assert.deepEqual([...new Set(categorical.map((c) => c.theme))].sort(), ["academic-light", "modern"]);
  assert.ok(categorical.length >= 8, `${categorical.length} colours`);
});

test("textColor reaches 4.5:1 on the theme background for every categorical colour of every theme", () => {
  for (const c of categorical) {
    const where = `${c.theme}/${c.palette}/${c.id} ${c.value} on ${c.background}`;
    const out = textColor(c.value, c.background);
    assert.match(out, /^#[0-9a-f]{6}$/, where);
    assert.ok(ratio(out, c.background) >= TEXT_CONTRAST, `${where}: ${out} is ${ratio(out, c.background).toFixed(2)}:1`);
    // A colour that already passes is not touched; one that does not is changed.
    if (ratio(c.value, c.background) >= TEXT_CONTRAST) assert.equal(out, c.value, where);
    else assert.notEqual(out, c.value, where);
  }
});

test("textColor: a passing colour comes back unchanged", () => {
  assert.equal(textColor("#1a1a1a", "#ffffff"), "#1a1a1a");
  assert.equal(textColor("#f5f5f5", "#101010"), "#f5f5f5");
});

test("textColor darkens on a light background and lightens on a dark one", () => {
  const onLight = textColor("#ffcc00", "#ffffff");
  assert.ok(ratio(onLight, "#ffffff") >= TEXT_CONTRAST, onLight);
  assert.ok(luminance(parseHex(onLight)) < luminance(parseHex("#ffcc00")), onLight);
  const onDark = textColor("#333366", "#101010");
  assert.ok(ratio(onDark, "#101010") >= TEXT_CONTRAST, onDark);
  assert.ok(luminance(parseHex(onDark)) > luminance(parseHex("#333366")), onDark);
});

test("textColor takes a lower minimum", () => {
  assert.equal(textColor("#888888", "#ffffff", 3), "#888888");
  assert.notEqual(textColor("#888888", "#ffffff"), "#888888");
});

test("textColor: a colour that is not hex comes back as given; a background that is not hex counts as white", () => {
  for (const color of ["rgb(1, 2, 3)", "var(--sd-color-accent)", "red", "", undefined, null]) {
    assert.equal(textColor(color, "#ffffff"), color, String(color));
  }
  assert.equal(textColor("#ffcc00", "var(--sd-color-background)"), textColor("#ffcc00", "#ffffff"));
});
