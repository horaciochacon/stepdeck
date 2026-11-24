// Where the engine is, and small file helpers the CLI commands share. Node only.
//
// Two roots, kept apart:
//   REPO    the repository root: in-repo decks (examples/, site/gallery/, test/fixtures/) are served from here;
//           LICENSE, THIRD_PARTY_NOTICES.md, templates/, docs/ and site/ live here.
//   ENGINE  <repo>/engine: core/, components/, layouts/, themes/, vendor/ and schema/, the folders `stepdeck new`
//           copies into a deck's stepdeck/ folder. Paths relative to it are also paths inside that folder.
import { cpSync, existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { suggest } from "#engine/core/registry.js";
import { THEME_NAME } from "#engine/core/constants.js";

/** The repository root (no trailing separator). */
export const REPO = resolve(fileURLToPath(new URL("../", import.meta.url)));

/** This repository's engine root, <repo>/engine (no trailing separator). */
export const ENGINE = join(REPO, "engine");

/** Names never copied into a deck: OS litter and generated folders. */
const JUNK = new Set([".DS_Store", "Thumbs.db", "shots", "catalog", "node_modules"]);

/** A cpSync filter that skips JUNK. */
export const keepFile = (src) => !JUNK.has(basename(src));

/** Copies this repository's engine/ (core, components, layouts, themes, vendor, schema) to `dest`, skipping JUNK. */
export const copyEngine = (dest) => cpSync(ENGINE, dest, { recursive: true, filter: keepFile });

/** Whether `deck` holds a copied engine (<deck>/stepdeck/, as `stepdeck new` makes it). */
export const hasEngineCopy = (deck) => existsSync(resolve(deck, "stepdeck", "core", "render.html"));

/** The engine a deck uses: its copied engine (<deck>/stepdeck/) when there is one, else this repo's engine/. */
export const engineFor = (deckDir) => (hasEngineCopy(deckDir) ? resolve(deckDir, "stepdeck") : ENGINE);

/** A path for a printed shell command: single-quoted when it holds anything but safe characters. */
export const shellPath = (p) => (/^[\w./+-]+$/.test(p) ? p : `'${p.replaceAll("'", "'\\''")}'`);

export const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
export const readJSON = (file) => JSON.parse(readFileSync(file, "utf8"));

/** The engine's built-in component names (components/index.json). Throws when it is missing or bad. */
export const readBuiltins = (engine) => readJSON(join(engine, "components", "index.json"));

/** Names of the folders in `dir`, in readdir order; [] when it cannot be read. */
export function listDirs(dir) {
  try {
    return readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  } catch {
    return [];
  }
}

/**
 * Exact-case lookup of a relative path under root, segment by segment against readdir (macOS and
 * Windows file systems are case-insensitive, the web server of a published deck may not be).
 * -> { ok: true } | { missing: true } | { actual: "<path as it is on disk>" }
 */
export function exactCase(root, rel, readdir = readdirSync) {
  const segments = rel.split("/").filter((s) => s !== "" && s !== ".");
  let dir = root;
  let mismatch = false;
  const actual = [];
  for (const seg of segments) {
    let names;
    try {
      names = readdir(dir);
    } catch {
      return { missing: true };
    }
    let name = names.includes(seg) ? seg : names.find((n) => n.toLowerCase() === seg.toLowerCase());
    if (name === undefined) return { missing: true };
    if (name !== seg) mismatch = true;
    actual.push(name);
    dir = join(dir, name);
  }
  return mismatch ? { actual: actual.join("/") } : { ok: true };
}

export { THEME_NAME };

/**
 * A failed-request line for a missing optional theme.css ("404 <path>/themes/<name>/theme.css"): the runtime treats
 * it as absent (theme.css is optional), so check and dump do not report it.
 */
export const OPTIONAL_THEME_CSS = /^404 (?:\S*\/)?themes\/[^/\s]+\/theme\.css$/;

/**
 * Whether `theme` is a theme of `engine`: a valid name (THEME_NAME, as the runtime requires), a folder of themes/
 * in that exact case, holding tokens.css.
 * -> { ok: true } | { ok: false, themes: string[] (the engine's themes), close: string | null (did you mean) }
 * Shared by validate (deck.js `theme`) and withDeck (the CLI's --theme).
 */
export function findTheme(engine, theme, readdir = readdirSync) {
  const root = join(engine, "themes");
  const name = String(theme);
  if (THEME_NAME.test(name) && exactCase(root, name, readdir).ok && existsSync(join(root, name, "tokens.css"))) return { ok: true };
  const themes = listDirs(root).filter((d) => THEME_NAME.test(d) && existsSync(join(root, d, "tokens.css")));
  return { ok: false, themes, close: suggest(name, themes) };
}

/** Throws a plain message unless `theme` names a theme of the engine the deck loads (the CLI's --theme). */
export function assertTheme(deckDir, theme) {
  const name = String(theme);
  if (!THEME_NAME.test(name)) throw new Error(`--theme '${name}' is not a theme name (lowercase letters, digits and hyphens)`);
  const found = findTheme(engineFor(deckDir), name);
  if (found.ok) return;
  throw new Error(`unknown theme '${name}'${found.close ? ` (did you mean '${found.close}'?)` : ""}; themes: ${found.themes.join(", ")}`);
}

/** A deck.js module's default export. `fresh` bypasses Node's module cache (the file may have changed). */
export async function importDeck(file, { fresh = false } = {}) {
  const url = pathToFileURL(file).href;
  return (await import(fresh ? `${url}?fresh=${Date.now()}-${Math.random()}` : url)).default;
}
