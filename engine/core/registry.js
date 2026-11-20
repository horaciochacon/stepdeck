// Component registry (spec §5, component resolution).
//
// Folder convention: `<root>/<name>/index.js` and `<root>/<name>/schema.json`, where `<name>` is the
// full component name, dots included (`chart.line/`, `my.x/`).
//
// The registry does not scan folders: it is told which names exist.
//   builtins:       string[] | () => string[] | Promise<string[]>   names under builtinRoot
//   deckComponents: string[] | () => string[] | Promise<string[]>   names under deckRoot
// Lookup: the deck first, then the built-ins. A deck component whose name equals a built-in name is an
// error (whatever its shape), so a custom component must use a namespace that is not a built-in name.
// Errors are thrown from get/schema (as rejections), never from createRegistry.
//
// importer(url) defaults to dynamic import; readJSON(url) defaults to fetch(url).json(). Both are
// injectable so Node tests can use fakes.

// Both defaults resolve relative roots the same way: against the page (document.baseURI) in the
// browser, so `import()` and `fetch()` agree; in Node there is no page, so pass absolute URLs or inject.
import { memoAsync } from "./kit.js";

const absolute = (url) => new URL(url, globalThis.document?.baseURI ?? import.meta.url).href;

const defaultImporter = (url) => import(absolute(url));

async function defaultReadJSON(url) {
  const res = await fetch(absolute(url));
  if (!res.ok) throw new Error(`cannot read ${url}: HTTP ${res.status}`);
  return res.json();
}

const list = async (x) => [...((typeof x === "function" ? await x() : x) ?? [])];

/** Levenshtein edit distance. */
export function levenshtein(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** Closest known name within max(2, length/3) edits, or null. */
export function suggest(name, known) {
  let best = null;
  let bestDistance = Infinity;
  for (const k of known) {
    const d = levenshtein(name, k);
    if (d < bestDistance) [best, bestDistance] = [k, d];
  }
  return bestDistance <= Math.max(2, Math.floor(name.length / 3)) ? best : null;
}

/**
 * createRegistry({ builtinRoot, deckRoot, builtins, deckComponents, importer, readJSON })
 *   -> { get(name): Promise<ComponentModule>, schema(name): Promise<object> }
 */
export function createRegistry({
  builtinRoot,
  deckRoot,
  builtins = [],
  deckComponents = [],
  importer = defaultImporter,
  readJSON = defaultReadJSON,
}) {
  const trim = (root) => String(root ?? "").replace(/\/+$/, "");
  const join = (root, name) => (root === "" ? name : `${root}/${name}`); // empty root stays relative
  const roots = { builtin: trim(builtinRoot), deck: trim(deckRoot) };
  let names = null;
  const modules = new Map();
  const schemas = new Map();

  async function known() {
    names ??= Promise.all([list(builtins), list(deckComponents)]).then(([b, d]) => ({ builtin: new Set(b), deck: new Set(d) }));
    return names;
  }

  /** Folder of a component name, or throws the collision / unknown error. */
  async function folder(name) {
    const { builtin, deck } = await known();
    if (deck.has(name)) {
      if (builtin.has(name)) {
        throw new Error(`component '${name}' collides with built-in; use a namespace like 'my.${name}'`);
      }
      return join(roots.deck, name);
    }
    if (builtin.has(name)) return join(roots.builtin, name);
    const close = suggest(String(name), [...deck, ...builtin]);
    throw new Error(`unknown component '${name}'${close ? `; did you mean '${close}'?` : ""}`);
  }

  return {
    get(name) {
      return memoAsync(modules, name, async () => {
        const mod = await importer(`${await folder(name)}/index.js`);
        return mod?.default ?? mod;
      });
    },
    schema(name) {
      return memoAsync(schemas, name, async () => readJSON(`${await folder(name)}/schema.json`));
    },
  };
}
