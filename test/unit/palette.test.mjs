// Palette checker (spec §7): marks need at least 3:1 WCAG contrast against the theme background,
// and categorical colors must stay apart under simulated color-vision deficiency.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkPalette, contrast, simulateCvd, deltaE } from "../../cli/palettes.js";
import { formatProblem } from "../../cli/problems.js";

const theme = new URL("../../themes/academic-light/", import.meta.url);
const palettes = JSON.parse(readFileSync(new URL("palettes.json", theme), "utf8"));
const tokens = readFileSync(new URL("tokens.css", theme), "utf8");
const token = (name) => new RegExp(`${name}:\\s*([^;]+);`).exec(tokens)?.[1].trim();
const background = token("--sd-color-background");

// Okabe and Ito (2008), as published.
const RAW_OKABE_ITO = [
  { id: "orange", value: "#E69F00", names: { en: "orange", es: "naranja" } },
  { id: "sky", value: "#56B4E9", names: { en: "sky blue", es: "celeste" } },
  { id: "green", value: "#009E73", names: { en: "bluish green", es: "verde azulado" } },
  { id: "yellow", value: "#F0E442", names: { en: "yellow", es: "amarillo" } },
  { id: "blue", value: "#0072B2", names: { en: "blue", es: "azul" } },
  { id: "vermillion", value: "#D55E00", names: { en: "vermillion", es: "bermellón" } },
  { id: "purple", value: "#CC79A7", names: { en: "reddish purple", es: "púrpura rojizo" } },
];

test("WCAG contrast ratios", () => {
  assert.ok(Math.abs(contrast("#000000", "#ffffff") - 21) < 1e-9);
  assert.equal(contrast("#ffffff", "#ffffff"), 1);
  assert.ok(Math.abs(contrast("#777777", "#ffffff") - 4.48) < 0.01);
  assert.ok(Math.abs(contrast("#fff", "#000") - 21) < 1e-9, "short hex and argument order");
});

test("raw Okabe-Ito yellow fails on white", () => {
  const problems = checkPalette(["#F0E442"], "#ffffff");
  assert.equal(problems.length, 1);
  const [p] = problems;
  assert.equal(p.rule, "palette-contrast");
  assert.equal(p.measured, "1.3:1");
  assert.equal(p.limit, "3:1");
  assert.match(p.fix, /^darken #F0E442 to #[0-9a-f]{6} or darker/);
  assert.match(formatProblem(p), /palette-contrast · 1\.3:1 vs 3:1 · darken/);
});

test("raw Okabe-Ito on white: orange, sky blue and yellow fail 3:1, named in the problem", () => {
  const problems = checkPalette({ name: "okabe-ito", kind: "categorical", colors: RAW_OKABE_ITO }, "#ffffff", { cvd: false });
  assert.deepEqual(problems.map((p) => p.element), ["okabe-ito/orange", "okabe-ito/sky", "okabe-ito/yellow"]);
  assert.ok(problems.every((p) => p.rule === "palette-contrast"));
  assert.match(problems[0].fix, /^darken orange \(#E69F00\) to #[0-9a-f]{6} or darker/);
  // The suggested fix passes.
  for (const p of problems) {
    const suggested = /to (#[0-9a-f]{6})/.exec(p.fix)[1];
    assert.ok(contrast(suggested, "#ffffff") >= 3, `${p.fix}`);
  }
});

test("shipped categorical passes on academic-light background", () => {
  assert.equal(background, "#ffffff");
  const name = palettes.default.categorical;
  const palette = { name, ...palettes.palettes[name] };
  assert.equal(palette.kind, "categorical");
  assert.ok(palette.colors.length >= 6);
  assert.deepEqual(checkPalette(palette, background), []);
  for (const c of palette.colors) assert.ok(contrast(c.value, background) >= 3, `${c.id} ${c.value}`);
});

test("CVD: a red/green pair that deuteranopes confuse is flagged; the shipped pairs are not", () => {
  const pair = [
    { id: "red", value: "#b03a2e", names: { en: "red", es: "rojo" } },
    { id: "green", value: "#5f7a00", names: { en: "green", es: "verde" } },
  ];
  assert.ok(deltaE(simulateCvd("#b03a2e", "deuteranopia"), simulateCvd("#5f7a00", "deuteranopia")) < deltaE("#b03a2e", "#5f7a00"));
  const problems = checkPalette({ name: "rg", kind: "categorical", colors: pair }, "#ffffff");
  const cvd = problems.filter((p) => p.rule === "palette-cvd");
  assert.ok(cvd.length >= 1, JSON.stringify(problems));
  assert.equal(cvd[0].element, "rg/red+green");
  assert.match(cvd[0].measured, /^ΔE \d+(\.\d)? \((deuteranopia|protanopia|tritanopia)\)$/);
  assert.match(cvd[0].fix, /red.*green/);
});

test("simulateCvd leaves greys unchanged", () => {
  for (const type of ["protanopia", "deuteranopia", "tritanopia"]) {
    assert.ok(deltaE(simulateCvd("#777777", type), "#777777") < 1, type);
  }
});

test("sequential and diverging palettes are fills: contrast applies to categorical only", () => {
  for (const [name, p] of Object.entries(palettes.palettes)) {
    if (p.kind === "categorical") continue;
    assert.deepEqual(checkPalette({ name, ...p }, background), [], name);
  }
  // A plain list of colors is treated as marks.
  assert.equal(checkPalette(["#fde725"], background).length, 1);
});

test("palettes.json: kinds, citations, localized names, roles", () => {
  const { default: defaults, palettes: all } = palettes;
  assert.deepEqual(Object.keys(defaults).sort(), ["categorical", "diverging", "sequential"]);
  for (const [kind, name] of Object.entries(defaults)) assert.equal(all[name]?.kind, kind, name);
  assert.match(all[defaults.categorical].source, /Okabe.*Ito.*2008/);
  assert.match(all[defaults.sequential].source, /viridis.*CC0/);
  for (const [name, p] of Object.entries(all)) {
    const ids = p.colors.map((c) => c.id);
    assert.equal(new Set(ids).size, ids.length, `${name}: unique ids`);
    for (const c of p.colors) {
      assert.match(c.value, /^#[0-9a-f]{6}$/, `${name}/${c.id}`);
      assert.ok(c.names?.en && c.names?.es, `${name}/${c.id}: en and es names`);
    }
    for (const [role, id] of Object.entries(p.roles ?? {})) assert.ok(ids.includes(id), `${name}: role ${role} -> ${id}`);
  }
  // The accent and alert tokens are the palette colors the {{color:accent}} words name.
  const cat = all[defaults.categorical];
  const value = (id) => cat.colors.find((c) => c.id === id).value;
  assert.equal(token("--sd-color-accent"), value(cat.roles.accent));
  assert.equal(token("--sd-color-alert"), value(cat.roles.alert));
  assert.equal(cat.roles.accent, "blue");
  assert.equal(cat.roles.alert, "vermillion");
});
