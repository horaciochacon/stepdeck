// stepdeck validate (spec §10): checks a deck in plain Node, with no browser.
//
// validate(deckDir, { slide? }) -> Promise<Problem[]>
// runValidate(deckDir, { slide? }) -> Promise<{ problems, slides }>   (slides: ids that were checked)
//
// Problems use cli/problems.js plus `severity`: "error" (exit 1) or "warning" (printed, exit 0).
// Throws (CLI exit 2) only when there is no deck to check: no deck.js, or an unknown --slide.
//
// Checks, in order:
//   deck      deck.schema.json; theme and palette exist; the palettes the deck uses pass checkPalette
//             against the theme's --sd-color-background (tokens.css); deck components do not collide
//             with a built-in; every component schema.json (deck and engine) compiles and every engine
//             layout schema.json matches schema/layout.schema.json, used or not.
//   slide     the file exists in that exact case and imports; its id matches; slide.schema.json with
//             did-you-mean on unknown keys; unique element and step ids; no digits-only step ids (R20);
//             slide.style holds no remote URL (http(s):// or //host; spec §3) and no @import (the
//             runtime parses it with CSSStyleSheet.replaceSync, which drops @import);
//             layout and regions exist; from / at / advance.start name real steps; advance fits.
//   per step  every patch names known elements (reported at the step that names them); then the slide is
//             folded with stateAt at every step k up to the first step whose set/replace/show/hide names an
//             unknown element (a bad `only` skips its own step; a bad from/at/advance ref skips folding), and at each k every element's props must be an object,
//             hold no remote URL (http(s):// or //host, R20) and no hex color, have bindings whose file,
//             pointer and format exist, name CSV columns (x, y, series, interval.lower/upper) that exist,
//             point at files that exist in that exact case, and, with bindings resolved, match the
//             component schema; a `diagram` that matches its schema must also pass diagramProblems
//             (components/diagram/place.js: diagram-id, diagram-overlap; the gap and pad come from the
//             theme's tokens.css). Each problem is reported once, at the first step where it appears.
//   kicker    an author element may not take the reserved id `kicker` (reserved-id, error); a slide `section` on
//             a layout without a title region is not shown (kicker-no-region, warning; not unknown-region).
//   accent    a title (the sugar, or a text element `title` with accent true) at each step: an odd number of
//             unescaped `*` is title-accent; an empty phrase `**` (markdown bold habit) is accent-empty (both
//             warnings; both show their asterisks as written).
//   lint      a slide with chart.*, map or big-number needs an element whose props have role "source";
//             a step whose state equals the previous step's is a warning.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { stateAt, stepIndex, stepCount, initialElements } from "#engine/core/fold.js";
import { DEFAULT_THEME, DEFAULT_LAYOUT, REGION_HOOKS } from "#engine/core/constants.js";
import { accentMarks } from "#engine/core/accent.js";
import { parseBinding, lookupPointer, resolveBindings } from "#engine/core/bindings.js";
import { createDataLoader } from "#engine/core/data.js";
import { createRegistry, suggest } from "#engine/core/registry.js";
import { makeFormat } from "#engine/core/format.js";
import { problem, componentProblem } from "./problems.js";
import { diagramProblems, diagramSpacing } from "#engine/components/diagram/place.js";
import { checkPalette } from "./palettes.js";
import { createAjv, compile, readSchema } from "./ajv.js";
import { THEME_NAME, engineFor, exactCase, findTheme, importDeck, isObject, listDirs, readBuiltins } from "./engine.js";

export { exactCase };


const REMOTE = /https?:\/\/[^\s"')\]>]*/i;
const PROTOCOL_RELATIVE = /(?:^|[\s("'=[<])(\/\/[a-z0-9][a-z0-9.-]*[^\s"')\]>]*)/i;
const remoteUrls = (s) => [
  ...[...s.matchAll(new RegExp(REMOTE.source, "gi"))].map((m) => m[0]),
  ...[...s.matchAll(new RegExp(PROTOCOL_RELATIVE.source, "gi"))].map((m) => m[1]),
].map((u) => u.replace(/[.,;:!?]+$/, ""));
const CSS_IMPORT = /@import\s+[^;]*;?/gi;
const HEX = /(?:^|[^\w&#])(#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4}))(?![\w-])/i;
const BRACES = /\{\{[^{}]*\}\}/g;
const FILE_REF = /^(?![/.])(?!.*\.\.)[\w./-]+\.(json|geojson|csv|png|jpe?g|gif|svg|webp|avif|mp4|webm|mp3|wav|ogg)$/i;
const RESERVED_IDS = ["kicker"];
const FIGURE = (type) => /^chart\./.test(type) || type === "map" || /^map\./.test(type) || type === "big-number";

const quote = (list) => list.map((s) => `'${s}'`).join(", ");
const didYouMean = (name, known) => suggest(String(name), known);
const article = (word) => (/^[aeiou]/i.test(word) ? `an ${word}` : `a ${word}`);
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** readdirSync, memoized (errors too): within one run the deck and the engine do not change. */
function cachedReaddir() {
  const seen = new Map();
  return (dir) => {
    if (!seen.has(dir)) {
      try {
        seen.set(dir, { names: readdirSync(dir) });
      } catch (error) {
        seen.set(dir, { error });
      }
    }
    const { names, error } = seen.get(dir);
    if (error) throw error;
    return names;
  };
}

/** Walk every string in a JSON value: fn(string, path) with path like "axes.y" or "annotate[0].label". */
function walkStrings(value, path, fn) {
  if (typeof value === "string") fn(value, path);
  else if (Array.isArray(value)) value.forEach((v, i) => walkStrings(v, `${path}[${i}]`, fn));
  else if (isObject(value)) {
    for (const [k, v] of Object.entries(value)) walkStrings(v, path ? `${path}.${k}` : k, fn);
  }
}

const pointerToPath = (p) => p.split("/").slice(1).map((s) => s.replaceAll("~1", "/").replaceAll("~0", "~")).join(".");

/** Short description of a schema branch, for anyOf/oneOf limits. */
function describe(schema) {
  if (!isObject(schema)) return "a value";
  if (schema.enum) return `one of ${schema.enum.map((v) => JSON.stringify(v)).join(", ")}`;
  if (schema.const !== undefined) return JSON.stringify(schema.const);
  if (schema.type === "string" && schema.pattern) return `a string matching ${schema.pattern}`;
  if (schema.type === "array" && schema.minItems && schema.minItems === schema.maxItems) return `an array of ${schema.minItems} items`;
  if (schema.type) return article([].concat(schema.type).join(" or "));
  return "a value";
}

/**
 * Ajv errors -> [{ rule: "unknown"|"invalid", path, key?, allowed?, measured, limit, fix }].
 * Errors inside an anyOf/oneOf branch are folded into the anyOf error itself.
 */
function schemaErrors(errors, data) {
  const list = errors ?? [];
  const unions = list.filter((e) => e.keyword === "anyOf" || e.keyword === "oneOf");
  const inUnion = (e) => unions.some((u) => u !== e && e.instancePath.startsWith(u.instancePath) && e.schemaPath.startsWith(`${u.schemaPath}/`));
  const out = [];
  for (const e of list) {
    if (inUnion(e)) continue;
    const path = pointerToPath(e.instancePath);
    const value = e.instancePath === "" ? data : lookupPointer(data, e.instancePath).value;
    const shown = JSON.stringify(value);
    const at = path || "(root)";
    if (e.keyword === "additionalProperties") {
      const key = e.params.additionalProperty;
      const allowed = Object.keys(e.parentSchema?.properties ?? {});
      const close = didYouMean(key, allowed);
      const full = path ? `${path}.${key}` : key;
      out.push({
        rule: "unknown",
        path: full,
        key,
        measured: `key '${full}'`,
        limit: `allowed: ${allowed.join(", ") || "none"}`,
        fix: close ? `rename '${key}' to '${close}'` : `remove '${key}'; allowed keys are ${allowed.join(", ")}`,
      });
    } else if (e.keyword === "required") {
      const key = e.params.missingProperty;
      out.push({ rule: "invalid", path: path ? `${path}.${key}` : key, measured: `'${key}' missing`, limit: "required", fix: `add '${key}'${path ? ` to ${path}` : ""}` });
    } else if (e.keyword === "enum") {
      const allowed = e.params.allowedValues.map((v) => JSON.stringify(v));
      const close = typeof value === "string" ? didYouMean(value, e.params.allowedValues.filter((v) => typeof v === "string")) : null;
      out.push({ rule: "invalid", path, measured: `${at} = ${shown}`, limit: `one of ${allowed.join(", ")}`, fix: close ? `set ${at} to "${close}"` : `set ${at} to one of ${allowed.join(", ")}` });
    } else if (e.keyword === "type") {
      out.push({ rule: "invalid", path, measured: `${at} = ${shown}`, limit: `must be ${e.params.type}`, fix: `make ${at} ${article(String(e.params.type))}` });
    } else if (e.keyword === "anyOf" || e.keyword === "oneOf") {
      const branches = (e.schema ?? []).map(describe);
      out.push({ rule: "invalid", path, measured: `${at} = ${shown}`, limit: `must be ${branches.join(" or ")}`, fix: `make ${at} ${branches.join(" or ")}` });
    } else {
      out.push({ rule: "invalid", path, measured: `${at} = ${shown}`, limit: e.message, fix: `change ${at} so it ${e.message.replace(/^must /, "is ")}` });
    }
  }
  return out;
}

/** Custom properties declared in a tokens.css: { "--sd-space": "16px", ... } (last declaration wins). */
function tokenValues(css) {
  const out = {};
  for (const m of css.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

/** Header of a CSV text (works for a header-only file too). */
function csvHeader(text) {
  const t = String(text).replace(/^﻿/, "");
  const header = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (inQuotes) {
      if (ch === '"' && t[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") { header.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") break;
    else field += ch;
  }
  header.push(field);
  return header;
}

export async function validate(deckDir, opts = {}) {
  return (await runValidate(deckDir, opts)).problems;
}

export async function runValidate(deckDir, { slide: only } = {}) {
  const deckRoot = resolve(deckDir);
  const deckFile = join(deckRoot, "deck.js");
  if (!existsSync(deckFile)) throw new Error(`no deck.js in ${deckRoot}; pass the deck folder (the one holding deck.js)`);
  const engine = engineFor(deckRoot);
  const readdir = cachedReaddir();
  const exact = (root, rel) => exactCase(root, rel, readdir);
  const ajv = createAjv();
  const problems = [];
  const add = (p, severity = "error") => problems.push({ ...problem(p), severity });

  // ---------------- deck ----------------
  let deck;
  try {
    deck = await importDeck(deckFile);
  } catch (e) {
    add({ rule: "deck-load", measured: `deck.js throws: ${e.message}`, limit: "importable in plain Node", fix: "make deck.js a plain object export with no DOM, fetch or top-level await" });
    return { problems, slides: [] };
  }
  if (!isObject(deck)) {
    add({ rule: "deck-load", measured: "deck.js has no default object export", limit: "export default { title, slides }", fix: "add `export default { title: \"…\", slides: [\"…\"] }` to deck.js" });
    return { problems, slides: [] };
  }
  const deckSchema = compile(ajv, readSchema("deck"));
  if (!deckSchema(deck)) {
    for (const e of schemaErrors(deckSchema.errors, deck)) {
      add({ rule: e.rule === "unknown" ? "unknown-key" : "spec-invalid", measured: `deck.js: ${e.measured}`, limit: e.limit, fix: `${e.fix} in deck.js` });
    }
  }
  const lang = typeof deck.lang === "string" ? deck.lang : "en";
  const fmt = makeFormat(lang);

  // Theme, palette and the palette check (g).
  let spacing = {}; // diagram grid gap and group padding (px) from the theme tokens, when known
  const theme = typeof deck.theme === "string" ? deck.theme : DEFAULT_THEME;
  const themeDir = join(engine, "themes", theme);
  const found = findTheme(engine, theme, readdir);
  if (!found.ok && !THEME_NAME.test(String(theme))) {
    add({ rule: "unknown-theme", measured: `theme '${theme}' is not a theme name (lowercase letters, digits and hyphens)`, limit: `themes: ${found.themes.join(", ")}`, fix: "rename the theme folder (and theme in deck.js) to lowercase letters, digits and hyphens" });
  } else if (!found.ok) {
    add({ rule: "unknown-theme", measured: `theme '${theme}'`, limit: `themes: ${found.themes.join(", ")}`, fix: found.close ? `set theme: "${found.close}" in deck.js` : "set theme in deck.js to a folder under the engine's themes/" });
  } else {
    let palettes = null;
    try {
      palettes = JSON.parse(readFileSync(join(themeDir, "palettes.json"), "utf8"));
    } catch (e) {
      add({ rule: "theme-palettes", measured: `themes/${theme}/palettes.json: ${e.code === "ENOENT" ? "missing" : e.message}`, limit: "a palettes.json", fix: `add themes/${theme}/palettes.json (see themes/academic-light/palettes.json)` });
    }
    const all = palettes?.palettes ?? {};
    if (typeof deck.palette === "string" && !Object.hasOwn(all, deck.palette)) {
      const close = didYouMean(deck.palette, Object.keys(all));
      add({ rule: "unknown-palette", measured: `palette '${deck.palette}'`, limit: `palettes of ${theme}: ${Object.keys(all).join(", ")}`, fix: close ? `set palette: "${close}" in deck.js` : `use one of ${quote(Object.keys(all))} or remove palette from deck.js` });
    }
    const tokens = readFileSync(join(themeDir, "tokens.css"), "utf8");
    spacing = diagramSpacing(tokenValues(tokens));
    const background = /--sd-color-background\s*:\s*([^;]+);/.exec(tokens)?.[1].trim();
    if (!background || !/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(background)) {
      add({ rule: "theme-background", measured: `--sd-color-background: ${background ?? "missing"}`, limit: "a hex color", fix: `declare --sd-color-background as a hex color in themes/${theme}/tokens.css` });
    } else if (palettes) {
      // The palettes this deck draws with: its own palette for that kind, else the theme default.
      const used = new Set();
      for (const kind of ["categorical", "sequential", "diverging"]) {
        const name = typeof deck.palette === "string" && all[deck.palette]?.kind === kind ? deck.palette : palettes.default?.[kind];
        if (name && all[name]) used.add(name);
      }
      for (const name of used) {
        for (const p of checkPalette({ name, ...all[name] }, background)) {
          add({ ...p, fix: `${p.fix}, in themes/${theme}/palettes.json` });
        }
      }
    }
  }

  // Components: built-ins from components/index.json; deck components from deck.js (R17).
  let builtins = [];
  try {
    builtins = readBuiltins(engine);
  } catch (e) {
    add({ rule: "engine", measured: `components/index.json: ${e.message}`, limit: "the engine's component list", fix: "copy the engine again (stepdeck new) so components/index.json exists" });
  }
  const builtinSet = new Set(builtins);
  const declared = Array.isArray(deck.components) ? deck.components.filter((c) => typeof c === "string") : [];
  const deckComponents = new Set();
  for (const name of declared) {
    if (builtinSet.has(name)) {
      add({ rule: "component-collision", measured: `deck component '${name}'`, limit: "not a built-in name", fix: `rename components/${name}/ and its entry in deck.js to a namespace such as 'my.${name}'` });
      continue;
    }
    const where = exact(join(deckRoot, "components"), `${name}/schema.json`);
    if (!where.ok) {
      add({ rule: where.actual ? "path-case" : "component-missing", measured: `components/${name}/schema.json ${where.actual ? `is ${where.actual} on disk` : "not found"}`, limit: "components/<name>/schema.json, exact case", fix: where.actual ? `rename components/${where.actual} to components/${name}/schema.json` : `add components/${name}/schema.json and index.js, or remove '${name}' from deck.js components` });
      continue;
    }
    deckComponents.add(name);
  }

  const registry = createRegistry({
    builtinRoot: join(engine, "components"),
    deckRoot: join(deckRoot, "components"),
    builtins,
    deckComponents: [...deckComponents],
    readJSON: async (path) => JSON.parse(await readFile(path, "utf8")),
  });
  const validators = new Map(); // name -> Promise<validate fn | null>
  const validatorFor = (name) => {
    if (!validators.has(name)) {
      validators.set(name, (async () => {
        const source = deckComponents.has(name) ? `components/${name}/schema.json (deck)` : `components/${name}/schema.json (engine)`;
        let schema;
        try {
          schema = await registry.schema(name);
        } catch (e) {
          add({ rule: "component-schema", measured: `${source}: ${e.message}`, limit: "valid JSON", fix: `fix the JSON in ${source}` });
          return null;
        }
        try {
          return compile(ajv, schema);
        } catch (e) {
          add({ rule: "component-schema", measured: `${source}: ${e.message}`, limit: "a JSON Schema 2020-12 that compiles", fix: `fix ${source} so it compiles (see components/text/schema.json for the shape)` });
          return null;
        }
      })());
    }
    return validators.get(name);
  };
  // (f) every schema.json compiles, used or not: deck components, the engine's built-ins, and the
  // engine's layout descriptors (validated against schema/layout.schema.json).
  for (const name of deckComponents) await validatorFor(name);
  for (const name of builtins) await validatorFor(name);
  const layoutDescriptor = compile(ajv, readSchema("layout"));
  for (const name of listDirs(join(engine, "layouts"))) {
    const file = `layouts/${name}/schema.json`;
    let descriptor;
    try {
      descriptor = JSON.parse(readFileSync(join(engine, file), "utf8"));
    } catch (e) {
      add({ rule: "layout-schema", measured: `${file}: ${e.code === "ENOENT" ? "missing" : e.message}`, limit: "a layout descriptor", fix: `add a valid ${file} (see schema/layout.schema.json)` });
      continue;
    }
    // hooks: each key a declared region, each value a region hook. Checked here, with plain messages; the schema
    // then judges the rest of the descriptor.
    let hookProblem = false;
    if (isObject(descriptor?.hooks)) {
      const regions = Array.isArray(descriptor.regions) ? descriptor.regions.map((r) => r?.name) : [];
      for (const [region, hook] of Object.entries(descriptor.hooks)) {
        if (!regions.includes(region)) {
          hookProblem = true;
          add({ rule: "layout-schema", measured: `${file}: hooks names region '${region}'`, limit: `a declared region (${regions.join(", ")})`, fix: `map a region ${file} declares, or remove '${region}' from hooks` });
        }
        if (!REGION_HOOKS.includes(hook)) {
          hookProblem = true;
          add({ rule: "layout-schema", measured: `${file}: hooks maps '${region}' to '${hook}'`, limit: `a region hook: ${REGION_HOOKS.join(", ")}`, fix: `use ${REGION_HOOKS.join(", ")}; title, kicker and accent are core's own hooks` });
        }
      }
    }
    const { hooks: _hooks, ...withoutHooks } = isObject(descriptor) ? descriptor : {};
    const judged = hookProblem ? withoutHooks : descriptor;
    if (!layoutDescriptor(judged)) {
      const [first] = schemaErrors(layoutDescriptor.errors, judged);
      add({ rule: "layout-schema", measured: `${file}: ${first.measured}`, limit: first.limit, fix: `${first.fix} in ${file} (see schema/layout.schema.json)` });
    }
  }
  const knownComponents = [...deckComponents, ...builtins];

  // ---------------- slides ----------------
  const ids = Array.isArray(deck.slides) ? deck.slides.filter((s) => typeof s === "string") : [];
  if (only !== undefined && !ids.includes(only)) throw new Error(`unknown slide '${only}' (slides: ${ids.join(", ")})`);
  const selected = only === undefined ? ids : [only];
  const slideSchema = compile(ajv, readSchema("slide"));
  const load = createDataLoader({ root: deckRoot, read: (p) => readFile(p) });
  const layouts = new Map();

  const env = { deckRoot, engine, exact, add, ajv, slideSchema, load, fmt, validatorFor, knownComponents, deckComponents, builtinSet, layouts, spacing };
  for (const id of selected) {
    const where = exact(join(deckRoot, "slides"), `${id}.js`);
    if (!where.ok) {
      add({ slide: id, rule: where.actual ? "path-case" : "slide-missing", measured: `slides/${id}.js ${where.actual ? `is slides/${where.actual} on disk` : "not found"}`, limit: "slides/<id>.js, exact case", fix: where.actual ? `rename slides/${where.actual} to slides/${id}.js` : `create slides/${id}.js or remove '${id}' from deck.js slides` });
      continue;
    }
    let spec;
    try {
      spec = (await import(pathToFileURL(join(deckRoot, "slides", `${id}.js`)).href)).default;
    } catch (e) {
      add({ slide: id, rule: "slide-load", measured: `import throws: ${e.message}`, limit: "importable in plain Node", fix: `fix slides/${id}.js: no DOM, fetch or top-level await; JSON-only props` });
      continue;
    }
    if (!isObject(spec)) {
      add({ slide: id, rule: "slide-load", measured: "no default object export", limit: "export default { id, elements }", fix: `add \`export default { id: "${id}", elements: [] }\` to slides/${id}.js` });
      continue;
    }
    if (spec.id !== id) {
      add({ slide: id, rule: "slide-id", measured: `id '${spec.id}'`, limit: `'${id}' (the file name)`, fix: `set id: "${id}" in slides/${id}.js` });
      continue;
    }
    await validateSlide(spec, env);
  }
  return { problems, slides: selected };
}

function stepLabel(spec, i) {
  if (!Array.isArray(spec.steps) || spec.steps.length === 0) return null;
  const s = spec.steps[i];
  return isObject(s) && typeof s.id === "string" ? s.id : String(i);
}

function layoutRegions(name, env) {
  if (!env.layouts.has(name)) {
    const dir = join(env.engine, "layouts");
    let regions = null;
    if (env.exact(dir, `${name}/schema.json`).ok) {
      try {
        regions = (JSON.parse(readFileSync(join(dir, name, "schema.json"), "utf8")).regions ?? []).map((r) => r.name);
      } catch {
        regions = null;
      }
    }
    env.layouts.set(name, regions);
  }
  return env.layouts.get(name);
}

async function validateSlide(spec, env) {
  const { add } = env;
  const slide = spec.id;

  // Schema of the slide spec itself.
  if (!env.slideSchema(spec)) {
    for (const e of schemaErrors(env.slideSchema.errors, spec)) {
      let element = null;
      let step = null;
      let path = e.path;
      const m = /^(elements|steps)\.(\d+)\.?(.*)$/.exec(e.path);
      if (m) {
        const i = Number(m[2]);
        if (m[1] === "elements") element = isObject(spec.elements?.[i]) && typeof spec.elements[i].id === "string" ? spec.elements[i].id : `elements[${i}]`;
        else step = stepLabel(spec, i);
        path = m[3];
      }
      add({
        slide, element, step,
        rule: e.rule === "unknown" ? "unknown-key" : "spec-invalid",
        measured: path ? e.measured.replace(e.path, path) : e.measured,
        limit: e.limit,
        fix: `${path ? e.fix.replaceAll(e.path, path) : e.fix} in slides/${slide}.js`,
      });
    }
  }
  if (!Array.isArray(spec.elements)) return;
  const defs = spec.elements.filter((d) => isObject(d) && typeof d.id === "string" && typeof d.type === "string");
  if (defs.length !== spec.elements.length) return; // reported by the schema; the rest would not fold
  if (spec.steps !== undefined && (!Array.isArray(spec.steps) || !spec.steps.every(isObject))) return;
  const steps = spec.steps ?? [];
  const n = stepCount(spec);
  const stepIds = steps.map((s) => s.id).filter((s) => typeof s === "string");

  // Ids: elements unique (b); step ids unique and not digits only (a, R20).
  const seen = new Set();
  for (const d of defs) {
    if (seen.has(d.id)) add({ slide, element: d.id, rule: "duplicate-id", measured: `element id '${d.id}' used twice`, limit: "unique per slide", fix: `rename one of the '${d.id}' elements (and the patches that target it)` });
    seen.add(d.id);
    // Reserved ids (default-theme spec §10.4): core makes the element `kicker` from the slide's section. (`title` is
    // reserved too, but an author may define it: it replaces the title sugar.)
    if (RESERVED_IDS.includes(d.id)) add({ slide, element: d.id, rule: "reserved-id", measured: `element id '${d.id}'`, limit: `reserved: ${quote(RESERVED_IDS)} (core's element for the slide's section)`, fix: `rename the element '${d.id}' (and the patches that target it); to show a kicker, set the slide's section` });
  }
  const seenSteps = new Set();
  steps.forEach((s, i) => {
    if (typeof s.id !== "string") return;
    if (/^\d+$/.test(s.id)) add({ slide, step: s.id, rule: "step-id-numeric", measured: `step id '${s.id}'`, limit: "not digits only (digits mean a step number)", fix: `rename step '${s.id}' to a word, e.g. 'step-${s.id}', and update its references` });
    if (seenSteps.has(s.id)) add({ slide, step: s.id, rule: "duplicate-step-id", measured: `step id '${s.id}' used twice`, limit: "unique per slide", fix: `rename step ${i} to a new id` });
    seenSteps.add(s.id);
  });

  // slide.style: same-origin only (spec §3), and no @import (replaceSync drops it without a word).
  if (typeof spec.style === "string") {
    for (const remote of new Set(remoteUrls(spec.style))) {
      add({ slide, rule: "remote-url", measured: `style has ${remote}`, limit: "relative, same-origin paths only", fix: `copy the resource into the deck (e.g. assets/) and use a relative url() in style, or drop it` });
    }
    for (const [m] of spec.style.matchAll(CSS_IMPORT)) {
      add({ slide, rule: "style-import", measured: `style has ${m.trim()}`, limit: "no @import in slide.style (the runtime ignores it)", fix: "copy the rules into style itself (slide.style is scoped CSS, parsed without @import)" });
    }
  }

  // Elements as the fold sees them (the slide title is sugar for the element "title").
  const all = initialElements(spec); // every element passed the filter above, so this is defs plus the title
  const elementIds = [...new Set(all.map((d) => d.id))];
  const typeOf = new Map(all.map((d) => [d.id, d.type]));

  // Layout and regions.
  const layout = typeof spec.layout === "string" ? spec.layout : DEFAULT_LAYOUT;
  const regions = layoutRegions(layout, env);
  if (regions === null) {
    const known = listDirs(join(env.engine, "layouts"));
    const close = didYouMean(layout, known);
    add({ slide, rule: "unknown-layout", measured: `layout '${layout}'`, limit: `layouts: ${known.join(", ")}`, fix: close ? `set layout: "${close}"` : `set layout to one of ${quote(known)}` });
  } else {
    for (const d of all) {
      const region = typeof d.region === "string" ? d.region : d.box ? null : "main";
      if (region === null || regions.includes(region)) continue;
      if (d.id === "kicker" && !defs.includes(d)) {
        // The section kicker: the runtime drops it quietly on a layout without a title region.
        add({ slide, rule: "kicker-no-region", measured: `section "${spec.section}"`, limit: `layout ${layout} has no title region (regions: ${regions.join(", ")})`, fix: "the kicker is not shown and steps that set, replace, show or hide kicker are ignored here: use a layout with a title region, or remove section" }, "warning");
        continue;
      }
      const close = didYouMean(region, regions);
      add({ slide, element: d.id, rule: "unknown-region", measured: `region '${region}'`, limit: `regions of ${layout}: ${regions.join(", ")}`, fix: close ? `set region: "${close}"` : `set region to one of ${quote(regions)}, or give the element a box` });
    }
  }

  // Step references in sugar, and advance length.
  let sugarOk = true;
  const ref = (d, key, r) => {
    try {
      return stepIndex(spec, r);
    } catch {
      sugarOk = false;
      const close = typeof r === "string" ? didYouMean(r, stepIds) : null;
      add({
        slide, element: d.id, rule: "step-ref",
        measured: `${key} ${JSON.stringify(r)}`,
        limit: steps.length ? `steps: ${steps.map((s, i) => stepLabel(spec, i)).join(", ")}` : "the slide has one state (no steps)",
        fix: close ? `set ${key} to '${close}'` : typeof r === "number" ? `use a step number from 0 to ${n - 1}, or better a step id` : `use one of the step ids ${quote(stepIds)}${steps.length ? "" : " (add steps first)"}`,
      });
      return null;
    }
  };
  for (const d of defs) {
    if (d.from !== undefined) ref(d, "from", d.from);
    if (Array.isArray(d.at)) for (const r of d.at) ref(d, "at", r);
    if (isObject(d.advance) && Array.isArray(d.advance.values)) {
      const start = d.advance.start ?? 0;
      const first = ref(d, "advance.start", start);
      const count = d.advance.values.length;
      if (first !== null && first + count > n) {
        const extra = first + count - n;
        add({
          slide, element: d.id, rule: "advance-overflow",
          measured: `${count} values from step '${stepLabel(spec, first) ?? first}'`,
          limit: `${plural(n - first, "step")} from there`,
          fix: `add ${plural(extra, "step")} after '${stepLabel(spec, n - 1) ?? n - 1}' or drop the last ${plural(extra, "value")} of advance.values`,
        });
      }
    }
  }

  // Patches naming unknown elements (d), at the step that names them. A folded op (set, replace, show,
  // hide) breaks that step and every later one; `only` applies at its own step alone.
  let firstBad = n;
  const badOnly = new Set();
  steps.forEach((s, i) => {
    const named = [
      ...["set", "replace", "only"].flatMap((op) => (isObject(s[op]) ? Object.keys(s[op]).map((id) => [op, id]) : [])),
      ...["show", "hide"].flatMap((op) => (Array.isArray(s[op]) ? s[op].filter((id) => typeof id === "string").map((id) => [op, id]) : [])),
    ];
    for (const [op, id] of named) {
      if (elementIds.includes(id)) continue;
      if (op === "only") badOnly.add(i);
      else firstBad = Math.min(firstBad, i);
      const close = didYouMean(id, elementIds);
      add({ slide, step: stepLabel(spec, i), rule: "unknown-element", measured: `${op} names '${id}'`, limit: `elements: ${elementIds.join(", ")}`, fix: close ? `change '${id}' to '${close}' in ${op}` : `remove '${id}' from ${op}, or add an element with that id` });
    }
  });

  // Component of each element, its schema validator.
  const validator = new Map();
  for (const d of all) {
    if (validator.has(d.id)) continue;
    if (!env.deckComponents.has(d.type) && !env.builtinSet.has(d.type)) {
      const close = didYouMean(d.type, env.knownComponents);
      add({ slide, element: d.id, rule: "unknown-component", measured: `type '${d.type}'`, limit: "a built-in or a component declared in deck.js", fix: close ? `set type: "${close}"` : `use a built-in (${env.knownComponents.join(", ")}) or add components/${d.type}/ and list it in deck.js components` });
      validator.set(d.id, null);
      continue;
    }
    validator.set(d.id, await env.validatorFor(d.type));
  }

  // Fold every step and check the resolved state.
  const once = new Set();
  const report = (key, p, severity) => {
    if (once.has(key)) return;
    once.add(key);
    add(p, severity);
  };
  let prev = null;
  // Problem keys carry no step, so an element whose props equal those of an earlier checked step can only
  // repeat that step's (already reported) problems: it is not checked again.
  const checked = new Map(); // element id -> props at the last step it was checked
  const lastStep = sugarOk ? firstBad - 1 : -1;
  for (let k = 0; k <= lastStep; k++) {
    const step = stepLabel(spec, k);
    if (badOnly.has(k)) {
      prev = null; // this state cannot be built; do not compare the next one with an older state
      continue;
    }
    let state;
    try {
      state = stateAt(spec, k);
    } catch (e) {
      add({ slide, step, rule: "fold-error", measured: e.message, limit: "a slide that folds at every step", fix: "fix the patch of this step so every id and step it names exists" });
      break;
    }
    if (prev && isDeepStrictEqual(prev, state.elements)) {
      add({ slide, step, rule: "noop-step", measured: "same elements, props and visibility as the previous step", limit: "a step changes something on screen", fix: `merge step '${step}' into the previous step (move its notes there), or give it a patch` }, "warning");
    }
    prev = state.elements;

    const changed = Object.entries(state.elements).filter(([id, el]) => !(checked.has(id) && isDeepStrictEqual(checked.get(id), el.props)));
    for (const [id, el] of changed) checked.set(id, el.props);
    await Promise.all(changed.map(([id, el]) => checkElement(id, el, k, step)));
  }

  async function checkElement(id, el, k, step) {
    const type = typeOf.get(id);
    const props = el.props;
    if (!isObject(props)) {
      report(`${id}|props-not-object`, { slide, element: id, step, rule: "props-not-object", measured: `props = ${JSON.stringify(props)}`, limit: "an object", fix: `use set: { ${id}: { <prop>: null } } to delete one prop, not set: { ${id}: null }; or replace: { ${id}: { … } }` });
      return;
    }
    // The accent phrase of a title (default-theme spec §5.4): `*phrase*`, counted on the string as written.
    if (id === "title" && type === "text" && props.accent === true && typeof props.text === "string") {
      const { stars, empty } = accentMarks(props.text);
      const text = JSON.stringify(props.text);
      if (stars % 2 === 1) {
        report(`${id}|title-accent|${props.text}`, { slide, element: id, step, rule: "title-accent", measured: stars === 1 ? `title ${text} has an unmatched *` : `title ${text} has ${stars} *, an odd number`, limit: "* in pairs around the accent phrase: *phrase*", fix: "close the phrase with a second *, or write \\* for a literal asterisk (the unmatched * shows as written)" }, "warning");
      }
      if (empty) {
        report(`${id}|accent-empty|${props.text}`, { slide, element: id, step, rule: "accent-empty", measured: `title ${text} has an empty accent phrase **`, limit: "one * on each side of the accent phrase: *phrase* (titles are not markdown)", fix: "write a single *phrase* for the accent, or \\*\\* for two literal asterisks (** shows as written)" }, "warning");
      }
    }
    let bindingFailed = false;
    const fileChecks = [];
    walkStrings(props, "", (s, path) => {
      const remote = (REMOTE.exec(s)?.[0] ?? PROTOCOL_RELATIVE.exec(s)?.[1])?.replace(/[.,;:!?]+$/, "");
      if (remote) {
        report(`${id}|remote|${path}|${s}`, { slide, element: id, step, rule: "remote-url", measured: `${path} has ${remote}`, limit: "relative, same-origin paths only", fix: `copy the resource into the deck (e.g. assets/) and use a relative path, or drop the link from ${path}` });
      }
      const hex = HEX.exec(s)?.[1];
      if (hex) {
        report(`${id}|hex|${path}|${s}`, { slide, element: id, step, rule: "hex-color", measured: `${path} has ${hex}`, limit: "no hex colors in props", fix: `remove ${hex} from ${path}; colors come from the theme palette (use {{color:accent}} words in text)` });
      }
      for (const m of s.matchAll(BRACES)) {
        const b = parseBinding(m[0]);
        if (!b) continue;
        fileChecks.push(checkBinding(env, b, m[0] === s, path).then((p) => {
          if (!p) return;
          bindingFailed = true;
          report(`${id}|binding|${m[0]}`, { slide, element: id, step, ...p });
        }));
      }
      if (FILE_REF.test(s)) fileChecks.push(Promise.resolve(checkFile(env, s, path)).then((p) => p && report(`${id}|file|${s}`, { slide, element: id, step, ...p })));
    });
    await Promise.all(fileChecks);

    if (typeof props.data === "string" && /\.csv$/i.test(props.data) && env.exact(env.deckRoot, props.data).ok) {
      for (const p of await checkColumns(env, props)) report(`${id}|${p.rule}|${p.measured}`, { slide, element: id, step, ...p });
    }

    const validate = validator.get(id);
    if (!validate || bindingFailed) return;
    let resolved;
    try {
      resolved = await resolveBindings(props, env.load, env.fmt);
    } catch {
      return; // reported by checkBinding
    }
    if (validate(resolved)) {
      if (type === "diagram") {
        for (const item of diagramProblems(resolved, env.spacing)) report(`${id}|${item.rule}|${item.message}`, componentProblem({ slide, element: id, step }, item));
      }
      return;
    }
    for (const e of schemaErrors(validate.errors, resolved)) {
      const rule = e.rule === "unknown" ? "unknown-prop" : "prop-invalid";
      report(`${id}|${rule}|${e.measured}|${e.limit}`, { slide, element: id, step, rule, measured: e.measured.replace(/^key /, "prop "), limit: e.rule === "unknown" ? `props of ${type}: ${e.limit.replace(/^allowed: /, "")}` : e.limit, fix: `${e.fix} (props of ${type})` });
    }
  }

  // A figure needs a source line on its slide.
  const figures = all.filter((d) => FIGURE(d.type));
  if (figures.length > 0 && !all.some((d) => isObject(d.props) && d.props.role === "source")) {
    add({ slide, element: figures[0].id, rule: "figure-source", measured: `${figures.map((d) => `${d.id} (${d.type})`).join(", ")} without a source`, limit: "an element with role: \"source\"", fix: `add { id: "src", region: "${regions?.includes("footer") ? "footer" : "main"}", type: "text", props: { role: "source", text: "Source: …" } }` });
  }
}

function checkFile(env, rel, path) {
  const where = env.exact(env.deckRoot, rel);
  if (where.ok) return null;
  if (where.actual) return { rule: "path-case", measured: `${path} = ${rel}`, limit: `on disk: ${where.actual}`, fix: `set ${path} to "${where.actual}" (or rename the file); paths are case-sensitive once published` };
  return { rule: "file-missing", measured: `${path} = ${rel}`, limit: "a file in the deck", fix: `create ${rel} in the deck (generate data with a script under data/), or fix the path in ${path}` };
}

async function checkColumns(env, props) {
  let text;
  try {
    text = await readFile(join(env.deckRoot, props.data), "utf8");
    await env.load(props.data, isObject(props.types) ? { types: props.types } : undefined); // parses, with the declared types
  } catch (e) {
    return [{ rule: "data-invalid", measured: `${props.data}: ${(e.cause ?? e).message}`, limit: "a CSV the loader parses", fix: `fix ${props.data} or the declared types` }];
  }
  const header = csvHeader(text);
  const named = [["x", props.x], ["y", props.y], ["series", props.series]];
  if (isObject(props.interval)) named.push(["interval.lower", props.interval.lower], ["interval.upper", props.interval.upper]);
  const out = [];
  for (const [prop, column] of named) {
    if (typeof column !== "string" || parseBinding(column) || header.includes(column)) continue;
    const close = didYouMean(column, header);
    out.push({ rule: "missing-column", measured: `${prop} = '${column}'`, limit: `columns of ${props.data}: ${header.join(", ")}`, fix: close ? `set ${prop} to '${close}'` : `set ${prop} to one of ${quote(header)}, or add the column to ${props.data}` });
  }
  return out;
}

async function checkBinding(env, b, whole, path) {
  const text = `{{${b.path}#${b.pointer}${b.format === null ? "" : ` | ${b.format}`}}}`;
  const where = /^[\w./-]+$/.test(b.path) && !b.path.includes("..") ? env.exact(env.deckRoot, b.path) : { missing: true };
  if (where.actual) return { rule: "path-case", measured: `${path}: ${text}`, limit: `on disk: ${where.actual}`, fix: `write the binding path as ${where.actual}` };
  if (!where.ok) return { rule: "binding-file", measured: `${path}: ${b.path} not found`, limit: "a .json, .geojson or .csv file in the deck", fix: `create ${b.path} (generate it with a script) or fix the path in ${path}` };
  let doc;
  try {
    doc = await env.load(b.path);
  } catch (e) {
    return { rule: "binding-file", measured: `${path}: ${e.message}`, limit: "a parseable .json, .geojson or .csv file", fix: `fix ${b.path} so it parses` };
  }
  let found;
  let value;
  try {
    ({ found, value } = lookupPointer(doc, b.pointer));
  } catch (e) {
    return { rule: "binding-pointer", measured: `${path}: ${e.message}`, limit: "an RFC 6901 pointer such as #/total", fix: `write the pointer as #/<key>/<key> in ${path}` };
  }
  if (!found) {
    const cut = b.pointer.lastIndexOf("/");
    const parent = lookupPointer(doc, b.pointer.slice(0, cut));
    const keys = parent.found && isObject(parent.value) ? Object.keys(parent.value) : [];
    const last = b.pointer.slice(cut + 1);
    const close = didYouMean(last, keys);
    return {
      rule: "binding-pointer",
      measured: `${path}: #${b.pointer} not in ${b.path}`,
      limit: keys.length ? `keys there: ${keys.join(", ")}` : "an existing pointer",
      fix: close
        ? `use #${b.pointer.slice(0, cut)}/${close}`
        : keys.length ? `point at one of ${keys.map((k) => `#${b.pointer.slice(0, cut)}/${k}`).join(", ")}` : `point at an existing value of ${b.path}`,
    };
  }
  if (b.format !== null) {
    try {
      env.fmt(b.format);
    } catch {
      return { rule: "binding-format", measured: `${path}: format "${b.format}"`, limit: "a d3-format specifier such as ,.0f or .1%", fix: `replace "${b.format}" with a valid d3-format specifier, e.g. ",.0f"` };
    }
    if (typeof value !== "number") {
      return { rule: "binding-format", measured: `${path}: #${b.pointer} is ${value === null ? "null" : Array.isArray(value) ? "an array" : typeof value}`, limit: "a number when a format is given", fix: `drop "| ${b.format}" or point at a number` };
    }
  } else if (!whole && (value === null || typeof value === "object")) {
    return { rule: "binding-format", measured: `${path}: #${b.pointer} is ${value === null ? "null" : Array.isArray(value) ? "an array" : "an object"}`, limit: "a number or string inside text", fix: `point at a number or string, or make ${path} exactly the binding` };
  }
  return null;
}
