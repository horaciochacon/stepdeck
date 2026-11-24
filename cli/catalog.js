// stepdeck catalog (spec §6.5): what an agent reads instead of the source.
//
// buildCatalog(rootDirs) -> Promise<{ entries, details: Map<name, detail>, problems }>
// catalog(rootDirs, { outDir }) -> Promise<{ entries, details, problems, outDir }>
//   Writes <outDir>/index.json (entries) and <outDir>/<name>.json (one detail each). outDir defaults
//   to <last root>/catalog/. What the previous run wrote there is removed first (the entries its index.json
//   lists, and index.json); any other file, a *.json of the user's included, is left alone.
// catalogTarget(dir) -> { roots, outDir }   what `stepdeck catalog` reads and writes for a folder
// isCatalogTarget(dir) -> boolean            whether catalogTarget accepts it
//
// rootDirs: an engine root first (components/index.json, layouts/, themes/), then optionally a deck
// (deck.js `components: []`, folders components/<name>/). Built-ins are listed in
// components/index.json and deck components in deck.js (ruling R17): nothing scans component
// folders. Layouts are the folders of layouts/ holding schema.json, themes those of themes/ holding
// tokens.css.
//
// Only data is read: schema.json, README.md, layout descriptors (layouts/<name>/schema.json), and
// theme files (tokens.css as text, palettes.json, README.md). Component code (index.js) is never
// imported (spec §5). deck.js is imported for its `components` list; it is plain data (spec §5).
//
// Entry  = { kind: "component"|"layout"|"theme", name, summary, animates: string[], enter: "own"|"box" }
//   summary   the first sentence of the schema's top-level description (a theme: of its README's
//             first paragraph), so the text lives in one place
//   animates  props whose x-transition is not "snap" (layouts and themes: [])
//   enter     "own" when the schema declares a top-level "x-enter": "own" (the component builds its own
//             entrance and its box stays still), else "box" (the element's box moves; layouts and themes: "box")
// Detail = the entry plus, for a component: origin ("built-in"|"deck"), description, required,
//   props: { <prop>: { required, x-transition, description, examples, default?, schema } } (schema is
//   the prop's JSON Schema without description, examples and x-transition), readme, example (path);
//   for a layout: description, regions, variables, readme, example; for a theme: description,
//   tokens ({ "--sd-…": value } from tokens.css :root), palettes (palettes.json), readme.
//
// Problems (cli/problems.js, rule "catalog-schema", element = the name): a component schema without
// a top-level description, or a prop without description, examples or x-transition (spec §6.3); an
// unreadable file; two entries of different kinds with one name ("catalog-name"). A top-level x-enter
// other than "own" or "box" is a "catalog-schema" problem too.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { problem } from "./problems.js";
import { engineFor, importDeck, isObject, listDirs, readBuiltins, readJSON } from "./engine.js";

const TRANSITIONS = ["tween", "draw", "fade", "snap"];
const ENTERS = ["own", "box"]; // a schema's top-level x-enter; absent means "box"

const readText = (file) => (existsSync(file) ? readFileSync(file, "utf8") : null);

const sortedDirs = (dir) => listDirs(dir).sort();

/** First sentence: up to the first ". " followed by a capital, a backtick or an opening quote. */
export function firstSentence(text) {
  const t = String(text ?? "").replace(/\s+/g, " ").trim();
  const m = /^(.+?[.!?])\s+(?=[A-Z`"(])/.exec(t);
  return m ? m[1] : t;
}

/** The first paragraph of a README after its heading, as one line. */
function readmeLead(markdown) {
  const blocks = String(markdown ?? "").split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  const lead = blocks.find((b) => !b.startsWith("#") && !b.startsWith("|") && !b.startsWith("```"));
  return lead ? lead.replace(/\s+/g, " ") : "";
}

/** Custom properties declared in tokens.css :root blocks, in order (read as text, never applied). */
function parseTokens(css) {
  const tokens = {};
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const block of clean.matchAll(/:root\s*\{([^}]*)\}/g)) {
    for (const m of block[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) tokens[m[1]] = m[2].trim();
  }
  return tokens;
}

function componentDetail(name, dir, origin, add) {
  const rel = (f) => `components/${name}/${f}`; // relative to the engine root or the deck
  let schema;
  try {
    schema = readJSON(join(dir, "schema.json"));
  } catch (e) {
    add({ element: name, rule: "catalog-schema", measured: `${rel("schema.json")}: ${e.message}`, limit: "a readable JSON Schema", fix: `add ${rel("schema.json")} (see the template from stepdeck new-component)` });
    return null;
  }
  if (!schema.description) {
    add({ element: name, rule: "catalog-schema", measured: `${rel("schema.json")} has no top-level description`, limit: "a description whose first sentence is the summary", fix: `add "description" to ${rel("schema.json")}` });
  }
  const xEnter = schema["x-enter"];
  if (xEnter !== undefined && !ENTERS.includes(xEnter)) {
    add({ element: name, rule: "catalog-schema", measured: `x-enter is ${JSON.stringify(xEnter)} in ${rel("schema.json")}`, limit: `"x-enter": "own" (the component builds its own entrance), "box" or no x-enter`, fix: `set "x-enter" to "own" or remove it from ${rel("schema.json")}` });
  }
  const required = new Set(Array.isArray(schema.required) ? schema.required : []);
  const props = {};
  for (const [key, raw] of Object.entries(isObject(schema.properties) ? schema.properties : {})) {
    const { description, examples, "x-transition": transition, default: dflt, ...rest } = isObject(raw) ? raw : {};
    const missing = [];
    if (!description) missing.push("description");
    if (!Array.isArray(examples) || examples.length === 0) missing.push("examples");
    if (!TRANSITIONS.includes(transition)) missing.push("x-transition");
    if (missing.length) {
      add({ element: name, rule: "catalog-schema", measured: `prop '${key}' lacks ${missing.join(", ")}`, limit: `description, examples and x-transition (${TRANSITIONS.join("|")}) on every prop`, fix: `add ${missing.join(", ")} to properties.${key} in ${rel("schema.json")}` });
    }
    props[key] = {
      required: required.has(key),
      "x-transition": transition ?? null,
      description: description ?? "",
      examples: Array.isArray(examples) ? examples : [],
      ...(dflt !== undefined ? { default: dflt } : {}),
      schema: rest,
    };
  }
  const animates = Object.entries(props).filter(([, p]) => p["x-transition"] && p["x-transition"] !== "snap").map(([k]) => k);
  return {
    kind: "component",
    name,
    summary: firstSentence(schema.description),
    animates,
    enter: xEnter === "own" ? "own" : "box",
    origin,
    description: schema.description ?? "",
    required: [...required],
    props,
    readme: readText(join(dir, "README.md")),
    example: existsSync(join(dir, "example.js")) ? rel("example.js") : null,
  };
}

function layoutDetail(name, dir, add) {
  let d;
  try {
    d = readJSON(join(dir, "schema.json"));
  } catch (e) {
    add({ element: name, rule: "catalog-schema", measured: `layouts/${name}/schema.json: ${e.message}`, limit: "a readable layout descriptor", fix: `fix layouts/${name}/schema.json (schema/layout.schema.json)` });
    return null;
  }
  return {
    kind: "layout",
    name,
    summary: firstSentence(d.description),
    animates: [],
    enter: "box",
    description: d.description ?? "",
    regions: Array.isArray(d.regions) ? d.regions : [],
    variables: Array.isArray(d.variables) ? d.variables : [],
    readme: readText(join(dir, "README.md")),
    example: existsSync(join(dir, "example.js")) ? `layouts/${name}/example.js` : null,
  };
}

function themeDetail(name, dir, add) {
  const readme = readText(join(dir, "README.md"));
  const lead = readmeLead(readme);
  let palettes = null;
  try {
    palettes = readJSON(join(dir, "palettes.json"));
  } catch (e) {
    if (existsSync(join(dir, "palettes.json"))) add({ element: name, rule: "catalog-schema", measured: `themes/${name}/palettes.json: ${e.message}`, limit: "readable JSON", fix: `fix themes/${name}/palettes.json` });
  }
  if (!lead) add({ element: name, rule: "catalog-schema", measured: `themes/${name}/README.md has no first paragraph`, limit: "a README whose first paragraph is the summary", fix: `add a short paragraph under the heading of themes/${name}/README.md` });
  return {
    kind: "theme",
    name,
    summary: firstSentence(lead),
    animates: [],
    enter: "box",
    description: lead,
    tokens: parseTokens(readFileSync(join(dir, "tokens.css"), "utf8")),
    palettes,
    readme,
  };
}

async function deckComponents(root) {
  const file = join(root, "deck.js");
  if (!existsSync(file)) return [];
  const deck = (await importDeck(file, { fresh: true })) ?? {};
  return Array.isArray(deck.components) ? deck.components.map(String) : [];
}

export async function buildCatalog(rootDirs) {
  const roots = rootDirs.map((r) => resolve(r));
  const problems = [];
  const add = (p) => problems.push(problem(p));
  const details = new Map();
  const put = (detail) => {
    if (!detail) return;
    const seen = details.get(detail.name);
    if (seen && seen.kind !== detail.kind) {
      add({ element: detail.name, rule: "catalog-name", measured: `${detail.kind} '${detail.name}' and ${seen.kind} '${detail.name}'`, limit: "one entry per name (catalog/<name>.json)", fix: `rename the ${detail.kind}, e.g. with a namespace such as 'my.${detail.name}'` });
      return;
    }
    details.set(detail.name, detail); // a later root (the deck) wins within one kind
  };
  for (const root of roots) {
    const builtins = existsSync(join(root, "components", "index.json")) ? readBuiltins(root) : [];
    for (const name of builtins) put(componentDetail(name, join(root, "components", name), "built-in", add));
    for (const name of await deckComponents(root)) put(componentDetail(name, join(root, "components", name), "deck", add));
    for (const name of sortedDirs(join(root, "layouts"))) {
      if (existsSync(join(root, "layouts", name, "schema.json"))) put(layoutDetail(name, join(root, "layouts", name), add));
    }
    for (const name of sortedDirs(join(root, "themes"))) {
      if (existsSync(join(root, "themes", name, "tokens.css"))) put(themeDetail(name, join(root, "themes", name), add));
    }
  }
  const order = { component: 0, layout: 1, theme: 2 };
  const entries = [...details.values()]
    .sort((a, b) => order[a.kind] - order[b.kind] || a.name.localeCompare(b.name))
    .map(({ kind, name, summary, animates, enter }) => ({ kind, name, summary, animates, enter }));
  return { entries, details, problems };
}

export async function catalog(rootDirs, { outDir } = {}) {
  const built = await buildCatalog(rootDirs);
  const out = resolve(outDir ?? join(rootDirs[rootDirs.length - 1], "catalog"));
  mkdirSync(out, { recursive: true });
  // Remove what the previous run wrote, and nothing else: the entries its index.json lists, and index.json.
  let previous = [];
  try {
    previous = readJSON(join(out, "index.json")).map((e) => e?.name).filter((name) => typeof name === "string" && !/[\\/]/.test(name));
  } catch {
    // no index.json, or not one of ours: nothing to remove
  }
  for (const name of previous) rmSync(join(out, `${name}.json`), { force: true });
  writeFileSync(join(out, "index.json"), `${JSON.stringify(built.entries, null, 2)}\n`);
  for (const [name, detail] of built.details) writeFileSync(join(out, `${name}.json`), `${JSON.stringify(detail, null, 2)}\n`);
  return { ...built, outDir: out };
}

/** Whether `stepdeck catalog` can read `dir`: a deck (deck.js), an engine root (components/index.json) or a stepdeck repository (engine/components/index.json). */
export const isCatalogTarget = (dir) => ["deck.js", "components/index.json", "engine/components/index.json"].some((f) => existsSync(join(resolve(dir), f)));

/**
 * What `stepdeck catalog` reads and writes for a folder: a deck reads its engine (the copied one,
 * <deck>/stepdeck/, else this repo's engine/) plus itself; an engine root reads itself; a stepdeck
 * repository reads its engine/. Each writes <folder>/catalog/.
 */
export function catalogTarget(dir) {
  const root = resolve(dir);
  const out = join(root, "catalog");
  if (existsSync(join(root, "deck.js"))) return { roots: [engineFor(root), root], outDir: out };
  if (existsSync(join(root, "components", "index.json"))) return { roots: [root], outDir: out };
  if (existsSync(join(root, "engine", "components", "index.json"))) return { roots: [join(root, "engine")], outDir: out };
  throw new Error(`${root} is neither a deck (deck.js), an engine (components/index.json) nor a stepdeck repository (engine/); pass the deck folder`);
}

/** Human listing of one detail, for `stepdeck catalog <name>`. */
export function formatEntry(d) {
  const lines = [`${d.name} · ${d.kind}${d.origin ? ` (${d.origin})` : ""}`, d.description || d.summary];
  if (d.kind === "component") {
    lines.push("", d.enter === "own" ? "enter: own (the component builds its own entrance; its box stays still)" : "enter: box (the element's box moves in)");
    lines.push("", "props (name, transition, required, description):");
    const width = Math.max(0, ...Object.keys(d.props).map((k) => k.length));
    for (const [k, p] of Object.entries(d.props)) {
      lines.push(`  ${k.padEnd(width)}  ${(p["x-transition"] ?? "?").padEnd(5)}  ${p.required ? "required" : "optional"}  ${p.description}`);
      if (p.examples.length) lines.push(`  ${"".padEnd(width)}  e.g. ${p.examples.map((v) => JSON.stringify(v)).join(", ")}`);
    }
    if (d.example) lines.push("", `example: ${d.example}`);
  } else if (d.kind === "layout") {
    lines.push("", "regions:", ...d.regions.map((r) => `  ${r.name}  ${r.description}`));
    if (d.variables.length) lines.push("", "variables (slide `regions`):", ...d.variables.map((v) => `  ${v.name}: ${v.default}  ${v.description}`));
    if (d.example) lines.push("", `example: ${d.example}`);
  } else if (d.kind === "theme") {
    lines.push("", "tokens:", ...Object.entries(d.tokens).map(([k, v]) => `  ${k}: ${v}`));
    if (d.palettes?.palettes) {
      lines.push("", "palettes:");
      for (const [name, p] of Object.entries(d.palettes.palettes)) {
        const dflt = d.palettes.default?.[p.kind] === name ? ", default" : "";
        lines.push(`  ${name} (${p.kind}${dflt}): ${(p.colors ?? []).map((c) => `${c.id} ${c.value}`).join(", ")}`);
      }
    }
  }
  return `${lines.join("\n")}\n`;
}
