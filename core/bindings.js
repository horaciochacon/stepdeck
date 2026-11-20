// Data bindings (spec 6.6): any string prop can be `{{path#/json/pointer | format}}`.
//   - `path` is relative to the deck root; `pointer` is an RFC 6901 JSON pointer ("" = whole file);
//     `format` is an optional d3-format specifier, localized by the deck language.
//   - A string that is exactly one binding without a format resolves to the raw value
//     (number, array, object, null). With a format, or when embedded in text, the result is a string.
//   - `{{color:...}}` belongs to the markdown component and is never touched here.
//   - In a title with an accent phrase (a `text` element with `accent: true`), a bound value is text, never syntax:
//     resolveElementProps escapes its `*` and `\`, so data cannot create (or break) an accent phrase. The phrase
//     marks come from the string as written, the same as parsing it before resolution.
// No DOM, no fetch: the file reader and the formatter are injected.
import { escapeAccent } from "./accent.js";

// Whole string only: surrounding whitespace outside the braces makes it embedded text, not a raw-value binding.
const BINDING = /^\{\{([^{}|#]+)#([^{}|]*)(?:\|([^{}]*))?\}\}$/;
const ANY_BRACES = /\{\{[^{}]*\}\}/g;

/** parseBinding("{{data/x.json#/a/b | ,.0f}}") -> { path, pointer, format } | null (whole string only). */
export function parseBinding(str) {
  if (typeof str !== "string") return null;
  const m = BINDING.exec(str);
  if (!m) return null;
  const path = m[1].trim();
  if (path === "" || path.startsWith("color:")) return null;
  return { path, pointer: m[2].trim(), format: m[3] === undefined ? null : m[3].trim() };
}

/**
 * lookupPointer(doc, pointer) -> { found, value }
 * RFC 6901: "" is the whole document, "~1" is "/", "~0" is "~". Array tokens must be canonical
 * non-negative integers ("-" and "01" are not found). Inherited properties are never read.
 * A pointer that is not "" and does not start with "/" (or has a bad escape) throws.
 */
export function lookupPointer(doc, pointer) {
  if (pointer === "") return { found: true, value: doc };
  if (!pointer.startsWith("/")) throw new Error(`invalid JSON pointer "${pointer}": it must be empty or start with "/"`);
  let node = doc;
  for (const raw of pointer.slice(1).split("/")) {
    if (/~(?![01])/.test(raw)) throw new Error(`invalid JSON pointer "${pointer}": "~" must be followed by 0 or 1`);
    const token = raw.replaceAll("~1", "/").replaceAll("~0", "~");
    if (Array.isArray(node)) {
      if (!/^(0|[1-9]\d*)$/.test(token) || Number(token) >= node.length) return { found: false, value: undefined };
      node = node[Number(token)];
    } else if (node !== null && typeof node === "object" && Object.hasOwn(node, token)) {
      node = node[token];
    } else {
      return { found: false, value: undefined };
    }
  }
  return { found: true, value: node };
}

const where = (b) => `${b.path}#${b.pointer}`;

async function evaluate(binding, load) {
  const doc = await load(binding.path);
  const { found, value } = lookupPointer(doc, binding.pointer);
  if (!found) throw new Error(`data pointer not found: pointer "${binding.pointer}" in "${binding.path}"`);
  return value;
}

function applyFormat(binding, value, fmt) {
  if (typeof value !== "number") {
    throw new Error(`cannot format ${where(binding)} with "${binding.format}": the value is ${value === null ? "null" : typeof value}, not a number`);
  }
  try {
    return fmt(binding.format)(value);
  } catch (cause) {
    throw new Error(`bad format "${binding.format}" in binding ${where(binding)}: ${cause.message}`, { cause });
  }
}

// `escape` (optional) is applied to every string a binding puts into the result, so the value cannot carry syntax
// that is parsed after resolution (an accent title's `*`: resolveElementProps).
async function resolveString(str, load, fmt, escape = (v) => v) {
  const whole = parseBinding(str);
  if (whole) {
    const value = await evaluate(whole, load);
    const out = whole.format === null ? value : applyFormat(whole, value, fmt);
    return typeof out === "string" ? escape(out) : out;
  }
  const parts = [];
  let last = 0;
  for (const m of str.matchAll(ANY_BRACES)) {
    const binding = parseBinding(m[0]);
    if (!binding) continue; // {{color:...}} and anything that is not a data binding stays as written
    parts.push(str.slice(last, m.index));
    last = m.index + m[0].length;
    parts.push(
      evaluate(binding, load).then((value) => {
        if (binding.format !== null) return escape(applyFormat(binding, value, fmt));
        if (value === null || typeof value === "object") {
          throw new Error(`binding ${where(binding)} is ${value === null ? "null" : Array.isArray(value) ? "an array" : "an object"} and cannot be embedded in text`);
        }
        return escape(String(value));
      }),
    );
  }
  if (parts.length === 0) return str;
  parts.push(str.slice(last));
  return (await Promise.all(parts)).join("");
}

/**
 * resolveBindings(props, load, fmt) -> Promise<props>
 * Walks strings in objects and arrays deeply and returns a new structure (input untouched).
 * `load(path)` returns the parsed file (core/data.js); `fmt` is makeFormat(lang).
 * Raw values from a whole-string binding are the cached objects: treat them as read-only.
 */
export function resolveBindings(props, load, fmt) {
  if (typeof props === "string") return resolveString(props, load, fmt);
  if (Array.isArray(props)) return Promise.all(props.map((p) => resolveBindings(p, load, fmt)));
  if (props !== null && typeof props === "object") {
    return Promise.all(
      Object.entries(props).map(async ([k, v]) => [k, await resolveBindings(v, load, fmt)]),
    ).then(Object.fromEntries);
  }
  return Promise.resolve(props);
}

/**
 * resolveElementProps(type, props, load, fmt) -> Promise<props>
 * resolveBindings for one element's props. For a `text` element with `accent: true`, values bound into `text` are
 * escaped (core/accent.js escapeAccent), so the component's parseAccent sees only the author's own `*` marks.
 */
export async function resolveElementProps(type, props, load, fmt) {
  if (type !== "text" || props === null || typeof props !== "object" || props.accent !== true || typeof props.text !== "string") {
    return resolveBindings(props, load, fmt);
  }
  const entries = await Promise.all(
    Object.entries(props).map(async ([k, v]) => [k, await (k === "text" ? resolveString(v, load, fmt, escapeAccent) : resolveBindings(v, load, fmt))]),
  );
  return Object.fromEntries(entries);
}
