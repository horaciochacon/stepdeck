// The `modern` theme: tokens, vendored Geist fonts, palettes, contrast.
// Also covers the optional tokens that academic-light now declares with today's values.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { brotliDecompressSync } from "node:zlib";
import { checkPalette, contrast } from "../../cli/palettes.js";
import { parseHex, luminance, contrast as ratio } from "#engine/core/color.js";

const modernUrl = new URL("../../engine/themes/modern/", import.meta.url);
const academicUrl = new URL("../../engine/themes/academic-light/", import.meta.url);
// A missing file reads as "" so each test fails on its own assertion instead of the whole file failing to load.
const read = (base, f) => (existsSync(new URL(f, base)) ? readFileSync(new URL(f, base), "utf8") : "");
const modernCss = read(modernUrl, "tokens.css");
const academicCss = read(academicUrl, "tokens.css");

/** Custom properties declared in the first :root block: name -> value. */
function rootTokens(css) {
  const body = /:root\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "";
  return Object.fromEntries([...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}
const modern = rootTokens(modernCss);
const academic = rootTokens(academicCss);

// Every token academic-light declared before the default-theme work. A theme must keep them all.
const REQUIRED = [
  "--sd-color-background", "--sd-color-surface", "--sd-color-ink", "--sd-color-muted", "--sd-color-accent",
  "--sd-color-alert", "--sd-color-rule", "--sd-color-letterbox",
  "--sd-font-body", "--sd-font-mono", "--sd-font-size-display", "--sd-font-size-cover", "--sd-font-size-statement",
  "--sd-font-size-title", "--sd-font-size-heading", "--sd-font-size-body", "--sd-font-size-note", "--sd-font-size-label",
  "--sd-font-size-source", "--sd-font-weight-body", "--sd-font-weight-title", "--sd-font-weight-strong",
  "--sd-line-height", "--sd-line-height-tight", "--sd-measure",
  "--min-audience-font", "--sd-min-audience-font",
  "--sd-grid", "--sd-space", "--sd-region-gap", "--sd-canvas-margin", "--sd-rule-width", "--sd-diagram-gap", "--sd-diagram-pad",
  "--sd-duration", "--sd-duration-fast", "--sd-easing",
];

// The optional tokens added by this task (each has a fallback in core rules) and what academic-light sets them to.
const NEW_TOKENS = {
  "--sd-color-title": "#1c1c1e", // = ink
  "--sd-color-grid": "#d4d4d8", // = rule
  "--sd-color-kicker": "#5b5b62", // = muted
  "--sd-letter-spacing-title": "normal",
  "--sd-letter-spacing-cover": "normal",
  "--sd-font-size-kicker": "28px", // = label
  "--sd-font-size-cover-figure": "88px", // = cover
};

test("modern defines every required token", () => {
  for (const name of REQUIRED) assert.ok(name in modern, `modern declares ${name}`);
  for (const name of Object.keys(NEW_TOKENS)) assert.ok(name in modern, `modern declares ${name}`);
  assert.equal(modern["--sd-min-audience-font"], "var(--min-audience-font)", "alias kept");
  assert.equal(modern["--min-audience-font"], "28px");
});

test("academic-light declares the new optional tokens with today's values", () => {
  for (const name of REQUIRED) assert.ok(name in academic, `academic-light still declares ${name}`);
  for (const [name, value] of Object.entries(NEW_TOKENS)) assert.equal(academic[name], value, name);
  assert.equal(academic["--sd-color-title"], academic["--sd-color-ink"]);
  assert.equal(academic["--sd-color-grid"], academic["--sd-color-rule"]);
  assert.equal(academic["--sd-color-kicker"], academic["--sd-color-muted"]);
  assert.equal(academic["--sd-font-size-kicker"], academic["--sd-font-size-label"]);
  assert.equal(academic["--sd-font-size-cover-figure"], academic["--sd-font-size-cover"]);
});

test("modern colour tokens: the approved values (tuned muted and alert), hex only", () => {
  const expected = {
    "--sd-color-background": "#ffffff", "--sd-color-surface": "#f4f4f5", "--sd-color-title": "#09090b",
    "--sd-color-ink": "#27272a", "--sd-color-rule": "#e4e4e7", "--sd-color-grid": "#f0f0f2", "--sd-color-accent": "#1d4ed8",
    // Tuned from the mockup's #71717a and #e11d48 for 4.5:1 on surface and on the chat user bubble.
    "--sd-color-muted": "#5f5f68", "--sd-color-alert": "#d81b45",
  };
  for (const [name, value] of Object.entries(expected)) assert.equal(modern[name], value, name);
  for (const name of Object.keys(modern).filter((n) => n.startsWith("--sd-color-"))) assert.match(modern[name], /^#[0-9a-f]{6}$/, name);
  assert.equal(modern["--sd-color-kicker"], modern["--sd-color-accent"], "kicker is accent-coloured");
  assert.ok(parseFloat(modern["--sd-font-size-kicker"]) >= parseFloat(modern["--min-audience-font"]), "kicker at or above the minimum font");
  assert.ok(parseFloat(modern["--sd-font-size-cover"]) >= 128, "cover title is much larger than academic-light's 88px");
  assert.ok(parseFloat(modern["--sd-font-size-cover-figure"]) < parseFloat(modern["--sd-font-size-cover"]));
  assert.equal(modern["--sd-letter-spacing-title"], "-0.03em");
  assert.equal(modern["--sd-letter-spacing-cover"], "-0.05em");
});

test("modern fonts exist and are OFL", () => {
  const urls = [...modernCss.matchAll(/url\("([^"]+)"\)/g)].map((m) => m[1]);
  assert.ok(urls.length >= 3, "Geist, Geist italic and Geist Mono");
  for (const u of urls) {
    assert.match(u, /^fonts\/(geist|geist-mono)\/[\w-]+\.woff2$/, u);
    assert.ok(existsSync(new URL(u, modernUrl)), u);
  }
  for (const f of ["geist", "geist-mono"]) {
    const ofl = read(modernUrl, `fonts/${f}/OFL.txt`);
    assert.match(ofl, /SIL Open Font License/);
    assert.match(ofl.split("\n")[0], /^Copyright \d{4} The Geist Project Authors/);
  }
  assert.match(modernCss, /font-display: block/);
  assert.doesNotMatch(modernCss, /font-display: (swap|fallback|optional|auto)/);
  assert.doesNotMatch(modernCss, /url\(\s*["']?(https?:)?\/\//, "no remote fonts");
  assert.match(modern["--sd-font-body"], /^"Geist",/);
  assert.match(modern["--sd-font-mono"], /^"Geist Mono",/);
  // A variable face covers the weights the engine asks for (400, 500, 600, 700).
  assert.match(modernCss, /font-family: "Geist"; font-style: normal; font-weight: 100 900/);
  assert.match(modernCss, /font-family: "Geist Mono"; font-style: normal; font-weight: 100 900/);
});

const palettes = JSON.parse(read(modernUrl, "palettes.json") || '{"default":{},"palettes":{}}');

test("modern palettes pass checkPalette", () => {
  const background = modern["--sd-color-background"];
  assert.equal(palettes.default.categorical, "modern");
  const categorical = palettes.palettes[palettes.default.categorical];
  assert.equal(categorical.kind, "categorical");
  assert.ok(categorical.colors.length >= 6);
  assert.equal(categorical.colors[0].value, "#1d4ed8", "deep blue first");
  assert.equal(categorical.colors[1].value, modern["--sd-color-alert"], "the tuned rose second");
  assert.equal(categorical.colors[2].value, "#0d9488", "teal third");
  assert.deepEqual(checkPalette(categorical, background), []);
  for (const c of categorical.colors) {
    assert.ok(c.names.en && c.names.es, `${c.id}: en and es names`);
    assert.ok(contrast(c.value, background) >= 3, `${c.id} >= 3:1`);
  }
  // The roles equal the tokens, so {{color:accent}} names the colour on screen.
  const byId = Object.fromEntries(categorical.colors.map((c) => [c.id, c.value]));
  assert.equal(byId[categorical.roles.accent], modern["--sd-color-accent"]);
  assert.equal(byId[categorical.roles.alert], modern["--sd-color-alert"]);
  // The other kinds exist and their defaults name palettes of the right kind.
  for (const kind of ["sequential", "diverging"]) {
    const p = palettes.palettes[palettes.default[kind]];
    assert.equal(p?.kind, kind);
    for (const c of p.colors) assert.ok(c.names.en && c.names.es);
  }
});

test("modern contrast pairs reach 4.5:1", () => {
  const surface = modern["--sd-color-surface"];
  const background = modern["--sd-color-background"];
  const text = (fg, bg) => ratio(luminance(parseHex(fg)), luminance(bg));
  // color-mix(in srgb, accent 14%, surface): the chat user bubble; mixed per channel in sRGB, like CSS.
  const a = parseHex(modern["--sd-color-accent"]);
  const s = parseHex(surface);
  const bubble = a.map((c, i) => c * 0.14 + s[i] * 0.86);
  const pairs = {
    "muted on surface": text(modern["--sd-color-muted"], s),
    "muted on background": text(modern["--sd-color-muted"], parseHex(background)),
    "alert on surface": text(modern["--sd-color-alert"], s),
    "alert on background": text(modern["--sd-color-alert"], parseHex(background)),
    "muted on chat user bubble": text(modern["--sd-color-muted"], bubble),
    "ink on chat user bubble": text(modern["--sd-color-ink"], bubble),
    "ink on surface": text(modern["--sd-color-ink"], s),
    "title on background": text(modern["--sd-color-title"], parseHex(background)),
    "accent on surface": text(modern["--sd-color-accent"], s),
    "kicker on background": text(modern["--sd-color-kicker"], parseHex(background)),
  };
  for (const [name, r] of Object.entries(pairs)) assert.ok(r >= 4.5, `${name}: ${r.toFixed(2)}:1`);
});

/** Feature tags in the GSUB table of a woff2 file. GSUB is not transformed in WOFF2, so it can be read after brotli. */
function woff2GsubFeatures(file) {
  const buf = readFileSync(file);
  assert.equal(buf.toString("latin1", 0, 4), "wOF2");
  const numTables = buf.readUInt16BE(12);
  const compressedSize = buf.readUInt32BE(20);
  const KNOWN = ["cmap", "head", "hhea", "hmtx", "maxp", "name", "OS/2", "post", "cvt ", "fpgm", "glyf", "loca", "prep", "CFF ", "VORG",
    "EBDT", "EBLC", "gasp", "hdmx", "kern", "LTSH", "PCLT", "VDMX", "vhea", "vmtx", "BASE", "GDEF", "GPOS", "GSUB"];
  let pos = 48;
  const base128 = () => {
    let v = 0;
    for (let i = 0; i < 5; i++) {
      const b = buf[pos++];
      v = v * 128 + (b & 0x7f);
      if (!(b & 0x80)) return v;
    }
    throw new Error("bad UIntBase128");
  };
  const tables = [];
  for (let i = 0; i < numTables; i++) {
    const flags = buf[pos++];
    let tag;
    if ((flags & 0x3f) === 0x3f) { tag = buf.toString("latin1", pos, pos + 4); pos += 4; } else tag = KNOWN[flags & 0x3f] ?? `#${flags & 0x3f}`;
    const version = flags >> 6;
    const origLength = base128();
    const transformed = tag === "glyf" || tag === "loca" ? version === 0 : version !== 0;
    tables.push({ tag, length: transformed ? base128() : origLength });
  }
  const data = brotliDecompressSync(buf.subarray(pos, pos + compressedSize));
  let offset = 0;
  for (const t of tables) {
    if (t.tag === "GSUB") {
      const gsub = data.subarray(offset, offset + t.length);
      const list = gsub.readUInt16BE(6);
      const count = gsub.readUInt16BE(list);
      return Array.from({ length: count }, (_, i) => gsub.toString("latin1", list + 2 + i * 6, list + 6 + i * 6));
    }
    offset += t.length;
  }
  return [];
}

test("the shipped (unsubsetted) Geist files carry the tnum feature in GSUB", () => {
  for (const f of ["geist-variable.woff2", "geist-italic-variable.woff2"]) {
    const features = woff2GsubFeatures(new URL(`fonts/geist/${f}`, modernUrl));
    assert.ok(features.includes("tnum"), `${f}: tnum in ${features.join(" ")}`);
  }
});

test("modern is the default theme: DEFAULT_THEME, the talk template and the kit; spike stays on academic-light", async () => {
  const { DEFAULT_THEME } = await import("#engine/core/constants.js");
  assert.equal(DEFAULT_THEME, "modern");
  const deck = async (p) => (await import(new URL(`../../${p}/deck.js`, import.meta.url).href)).default;
  assert.equal((await deck("templates/talk")).theme, "modern");
  assert.equal((await deck("examples/kit")).theme, "modern");
  assert.equal((await deck("examples/spike")).theme, "academic-light", "both themes stay exercised");
});

test("modern theme.css styles the hooks: kicker, title, accent, cover, meta rule on the region only, big number", () => {
  const css = read(modernUrl, "theme.css").replace(/\/\*[\s\S]*?\*\//g, "");
  for (const sel of [".sd-kicker", ".sd-title", ".sd-accent", '[data-kind="cover"] .sd-title', ".sd-region.sd-meta", ".sd-big-number-value"]) {
    assert.ok(css.includes(sel), `theme.css has a rule for ${sel}`);
  }
  // No title font-size or tracking override outside the cover rule: core's cover and cover-figure sizes must stay in charge.
  for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    if (m[1].includes(".sd-title")) assert.doesNotMatch(m[2], /font-size\s*:/, `no title font-size in theme.css: ${m[1].trim()}`);
  }
});

/** Splits on `sep` outside parentheses (selector lists and :is()/:has() arguments). */
function splitTop(text, sep) {
  const out = [];
  let depth = 0;
  let cur = "";
  for (const ch of text) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (depth === 0 && sep.test(ch)) { out.push(cur); cur = ""; } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim()).filter(Boolean);
}
const HOOK_CLASS = /\.sd-(title|kicker|lede|accent|subtitle|meta|statement)(?![\w-])/;
const BOX_PROPERTY = /(?:^|[;{\s])(border[\w-]*|padding[\w-]*|margin[\w-]*|background[\w-]*|outline[\w-]*|box-shadow)\s*:/;
/**
 * Rules in `css` that put a box property on a hook class that may sit on an element wrapper: core puts
 * .sd-<hook> on a region and on every wrapper in it, so a box there is drawn once per wrapper. A selector is
 * flagged when the last compound (the element it styles) carries a hook class and not .sd-region.
 */
function boxOnHook(css) {
  const out = [];
  for (const m of css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!BOX_PROPERTY.test(m[2])) continue;
    for (const sel of splitTop(m[1].trim(), /,/)) {
      const last = splitTop(sel, /[\s>+~]/).at(-1) ?? "";
      const own = last.replace(/:(is|where|has|not)\([^]*\)/g, ""); // the compound's own classes, not its arguments
      if (HOOK_CLASS.test(own) && !own.includes(".sd-region")) out.push(sel);
    }
  }
  return out;
}

test("boxOnHook (self-test): flags a box on a hook class that reaches the wrappers, not on the region", () => {
  assert.deepEqual(boxOnHook(".sd-meta { padding-left: 4px; }"), [".sd-meta"]);
  assert.deepEqual(boxOnHook(".sd-canvas .sd-meta { border-inline-start: 4px solid red; }"), [".sd-canvas .sd-meta"]);
  assert.deepEqual(boxOnHook(".sd-el.sd-subtitle:first-child, .x { background-color: red; }"), [".sd-el.sd-subtitle:first-child"]);
  assert.deepEqual(boxOnHook(".sd-title { box-shadow: 0 0 1px red; } .sd-statement { outline: 1px solid; }"), [".sd-title", ".sd-statement"]);
  assert.deepEqual(boxOnHook(".sd-region.sd-meta { padding-inline-start: 24px; border-inline-start: 4px solid; }"), []);
  assert.deepEqual(boxOnHook(".sd-region.sd-meta:has(> .sd-el:not(.sd-hidden)) { border-inline-start-color: red; }"), []);
  assert.deepEqual(boxOnHook(".sd-meta { color: red; } .sd-kicker .sd-text { margin: 0; }"), [], "no box property / not on the hook element");
  assert.deepEqual(boxOnHook("/* .sd-meta { padding: 1px } */ .sd-accent { color: red; }"), []);
});

test("every shipped theme.css: no box property on a hook class that reaches the wrappers", () => {
  const themes = new URL("../../engine/themes/", import.meta.url);
  for (const t of readdirSync(themes, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)) {
    const css = read(new URL(`${t}/`, themes), "theme.css");
    assert.deepEqual(boxOnHook(css), [], `${t}/theme.css`);
  }
});

test("--theme is checked before any browser starts: name syntax, the engine's themes, did-you-mean (exit 2)", async () => {
  const { assertTheme, findTheme, ENGINE } = await import("../../cli/engine.js");
  const kit = fileURLToPath(new URL("../../examples/kit/", import.meta.url));
  assert.doesNotThrow(() => assertTheme(kit, "modern"));
  assert.doesNotThrow(() => assertTheme(kit, "academic-light"));
  assert.throws(() => assertTheme(kit, "nope"), /unknown theme 'nope'; themes: .*modern/);
  assert.throws(() => assertTheme(kit, "modrn"), /did you mean 'modern'/);
  for (const bad of ["../x", "a/b", "modern/../academic-light", "Modern", ".hidden", ""]) {
    assert.throws(() => assertTheme(kit, bad), /is not a theme name/, bad);
  }
  assert.deepEqual(findTheme(ENGINE, "modern"), { ok: true });
  assert.equal(findTheme(ENGINE, "../themes").ok, false);
  // The CLI: exit 2, a clear message, and shoot writes nothing.
  const shots = mkdtempSync(join(tmpdir(), "stepdeck-theme-arg-"));
  try {
    cpSync(join(kit, "deck.js"), join(shots, "deck.js"));
    for (const [arg, re] of [["nope", /unknown theme 'nope'/], ["../x", /not a theme name/], ["a/b", /not a theme name/], ["modrn", /did you mean 'modern'/]]) {
      for (const cmd of ["shoot", "check", "dump"]) {
        const r = spawnSync(process.execPath, [fileURLToPath(new URL("../../cli/index.js", import.meta.url)), cmd, shots, "--theme", arg], { encoding: "utf8", env: { ...process.env, STEPDECK_PLAYWRIGHT: "/nonexistent" } });
        assert.equal(r.status, 2, `${cmd} --theme ${arg}: ${r.stderr}`);
        assert.match(r.stderr, re, `${cmd} --theme ${arg}`);
      }
    }
    assert.equal(existsSync(join(shots, "shots")), false, "shoot wrote no folder");
  } finally {
    rmSync(shots, { recursive: true, force: true });
  }
});

test("a theme folder whose name breaks THEME_NAME is never offered as a theme or a suggestion", async () => {
  const { findTheme } = await import("../../cli/engine.js");
  const engine = mkdtempSync(join(tmpdir(), "stepdeck-theme-names-"));
  try {
    for (const t of ["My_Theme", "good"]) {
      mkdirSync(join(engine, "themes", t), { recursive: true });
      writeFileSync(join(engine, "themes", t, "tokens.css"), ":root{}");
    }
    const found = findTheme(engine, "My_Theme");
    assert.equal(found.ok, false);
    assert.deepEqual(found.themes, ["good"]);
    assert.notEqual(found.close, "My_Theme");
  } finally {
    rmSync(engine, { recursive: true, force: true });
  }
});

test("both themes declare the six motion tokens, with the stagger, enter and distance each theme sets", () => {
  const MOTION = {
    modern: { tokens: modern, "--sd-stagger": "80ms", "--sd-enter": "rise", "--sd-motion-distance": "24px" },
    "academic-light": { tokens: academic, "--sd-stagger": "60ms", "--sd-enter": "fade", "--sd-motion-distance": "16px" },
  };
  for (const [theme, { tokens, ...own }] of Object.entries(MOTION)) {
    const expected = {
      "--sd-duration": "400ms",
      "--sd-duration-fast": "200ms",
      "--sd-easing": "cubic-bezier(0.65, 0, 0.35, 1)",
      ...own,
    };
    for (const [name, value] of Object.entries(expected)) assert.equal(tokens[name], value, `${theme} ${name}`);
  }
});
