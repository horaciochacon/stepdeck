// stepdeck new / new-component (spec §5, §10): scaffolding. Dev tooling only.
//
// newDeck(dir, { template = "talk" }) -> Promise<{ dir, template, engine, next: string[] }>
//   Refuses a folder that exists and is not empty. Copies templates/<template>/ into dir, then the
//   engine (the folders of <repo>/engine/) into dir/stepdeck/: core, components, layouts, themes (fonts
//   and OFL files included), vendor (with LICENSE files) and schema (stepdeck.d.ts included), plus
//   LICENSE and THIRD_PARTY_NOTICES.md from the repository root. Not cli, test, docs, examples or
//   node_modules: the deck is self-contained at presentation time (spec §3) and the CLI serves it from
//   its own folder (ruling R15). The template's index.html maps "stepdeck/" to
//   "./stepdeck/" (one import map). `next` says the deck works as made and lists the commands to run next, with the real CLI path
//   (cli()), since `stepdeck` is usually not on PATH.
//
// newComponent(deckDir, name) -> Promise<{ dir, name, files, deckUpdated, line }>
//   name must be namespaced ("my.thing": lowercase segments joined by dots) and not a built-in
//   (components/index.json of the deck's engine). Copies templates/component/{index.js,
//   schema.json, example.js, README.md} into <deck>/components/<name>/ with __NAME__ replaced by the
//   name and __ID__ by a slide id made from it ("my-thing-example"). Then adds the name to
//   `components: []` in deck.js (ruling R17) when that is safe: a literal array of strings, or no
//   `components` key and one `slides:` line to insert it before. The edit is checked by importing
//   deck.js again and reverted if the result is not exactly the old deck plus the name. Otherwise
//   deck.js is left alone and `line` says what to add.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { REPO, copyEngine, engineFor, importDeck, keepFile, readBuiltins } from "./engine.js";

const ENGINE_FILES = ["LICENSE", "THIRD_PARTY_NOTICES.md"];
const COMPONENT_FILES = ["index.js", "schema.json", "example.js", "README.md"];
const NAME = /^[a-z0-9][a-z0-9-]*(\.[a-z0-9][a-z0-9-]*)+$/;


/** A path for a printed shell command: single-quoted when it holds anything but safe characters. */
export const shellPath = (p) => (/^[\w./+-]+$/.test(p) ? p : `'${p.replaceAll("'", "'\\''")}'`);

/**
 * The printed form of a CLI command, with this engine's real path, so hints are copy-pasteable
 * without `stepdeck` on PATH: cli("validate", "/abs/deck") -> "node /…/cli/index.js validate /abs/deck".
 */
export function cli(command, ...args) {
  return ["node", shellPath(join(REPO, "cli", "index.js")), command, ...args.map(shellPath)].join(" ");
}

/** Starter templates: folders of templates/ holding an index.html (templates/component is not one). */
export function listTemplates() {
  const dir = join(REPO, "templates");
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(dir, d.name, "index.html")))
    .map((d) => d.name)
    .sort();
}

export async function newDeck(dir, { template = "talk" } = {}) {
  const target = resolve(dir);
  const templates = listTemplates();
  if (!templates.includes(template)) throw new Error(`unknown template '${template}' (templates: ${templates.join(", ")})`);
  if (existsSync(target)) {
    if (readdirSync(target).length > 0) throw new Error(`${target} is not empty; pass a new or empty folder`);
  }
  mkdirSync(target, { recursive: true });
  cpSync(join(REPO, "templates", template), target, { recursive: true, filter: keepFile });
  const engine = join(target, "stepdeck");
  copyEngine(engine);
  for (const f of ENGINE_FILES) cpSync(join(REPO, f), join(engine, f));

  const html = readFileSync(join(target, "index.html"), "utf8");
  if (!html.includes('"stepdeck/": "./stepdeck/"')) {
    throw new Error(`templates/${template}/index.html must map "stepdeck/" to "./stepdeck/" in its import map`);
  }
  return {
    dir: target,
    template,
    engine,
    next: [
      `the deck already works: ${readdirSync(join(target, "slides")).filter((f) => f.endsWith(".js")).sort().map((f) => `slides/${f}`).join(", ")};`,
      `edit them, or delete a slide file and its id in deck.js \`slides\`; add slides as slides/<id>.js`,
      `${cli("serve", target)}  # present: open the URL it prints (index.html, reveal shell)`,
      `${cli("validate", target)}  # in Node: schemas, props at every step, data, paths`,
      `${cli("check", target)} --played  # in Chrome: layout, fonts, contrast, errors, played vs jumped`,
      `${cli("shoot", target)}  # PNGs per step in shots/960/; look at them`,
      `${cli("catalog", target)}  # what components, layouts and themes exist (catalog/index.json)`,
    ],
  };
}

/** deck.js as it is on disk now, or null when it does not import. */
async function tryImport(deckFile) {
  try {
    return (await importDeck(deckFile, { fresh: true })) ?? {};
  } catch {
    return null;
  }
}

/** Text edit of deck.js that adds `name` to components, or null when no safe edit is found. */
function addToComponents(text, name) {
  const literal = JSON.stringify(name);
  const arrays = [...text.matchAll(/(^|[\s{,])components\s*:\s*\[([^\]]*)\]/g)];
  if (arrays.length === 1) {
    const [match, lead, inner] = arrays[0];
    const items = inner.split(",").map((s) => s.trim()).filter(Boolean);
    if (!items.every((s) => /^"[^"\\]*"$|^'[^'\\]*'$/.test(s))) return null;
    const quote = items[0]?.startsWith("'") ? `'${name}'` : literal;
    const body = inner.trim() === "" ? quote : `${inner.replace(/\s*,?\s*$/, "")}, ${quote}`;
    const start = arrays[0].index;
    const replaced = `${lead}components: [${body}${/\n\s*$/.test(inner) ? inner.match(/\n\s*$/)[0] : ""}]`;
    return text.slice(0, start) + replaced + text.slice(start + match.length);
  }
  if (arrays.length === 0 && !/\bcomponents\b/.test(text)) {
    const slides = [...text.matchAll(/^([ \t]*)slides\s*:/gm)];
    if (slides.length !== 1) return null;
    const [, indent] = slides[0];
    return `${text.slice(0, slides[0].index)}${indent}components: [${literal}],\n${text.slice(slides[0].index)}`;
  }
  return null;
}

export async function newComponent(deckDir, name) {
  const deck = resolve(deckDir);
  const deckFile = join(deck, "deck.js");
  if (!existsSync(deckFile)) throw new Error(`no deck.js in ${deck}; run new-component in a deck folder (or pass it)`);
  if (typeof name !== "string" || name === "") throw new Error("new-component needs a name, e.g. my.chart");
  if (!name.includes(".")) throw new Error(`'${name}' needs a namespace, e.g. 'my.${name}' (deck components are namespaced so they never collide with a built-in)`);
  if (!NAME.test(name)) throw new Error(`'${name}' is not a component name: use lowercase letters, digits and dashes in dot-separated parts, e.g. 'my.chart'`);
  const builtins = readBuiltins(engineFor(deck));
  if (builtins.includes(name)) throw new Error(`'${name}' is a built-in component; pick another namespace, e.g. 'my.${name.split(".").pop()}'`);
  const dir = join(deck, "components", name);
  if (existsSync(dir)) throw new Error(`components/${name}/ already exists`);

  const id = `${name.replaceAll(".", "-")}-example`;
  mkdirSync(dir, { recursive: true });
  for (const f of COMPONENT_FILES) {
    const text = readFileSync(join(REPO, "templates", "component", f), "utf8");
    writeFileSync(join(dir, f), text.replaceAll("__NAME__", name).replaceAll("__ID__", id));
  }

  const line = `add "${name}" to components in deck.js: components: [${JSON.stringify(name)}]`;
  const original = readFileSync(deckFile, "utf8");
  const before = await tryImport(deckFile);
  const listed = before !== null && (before.components ?? []).includes(name);
  let deckUpdated = listed; // already listed
  const edited = before !== null && !listed ? addToComponents(original, name) : null;
  if (edited !== null) {
    writeFileSync(deckFile, edited);
    const after = await tryImport(deckFile);
    const expected = { ...before, components: [...(before.components ?? []), name] };
    if (after && isDeepStrictEqual({ ...after }, expected)) deckUpdated = true;
    else writeFileSync(deckFile, original);
  }
  return { dir, name, files: COMPONENT_FILES.map((f) => join(dir, f)), deckUpdated, line: deckUpdated ? null : line };
}
