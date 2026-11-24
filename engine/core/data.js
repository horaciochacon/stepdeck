// Data loading for decks: CSV parsing and a cached, read-injected loader.
// No DOM, no fetch, no fs: the caller injects `read`, so this runs in Node (validate) and the
// browser (slide controller) alike.
//
// Values returned by the loader are shared (cached) objects. Treat them as read-only.
import { memoAsync } from "./kit.js";

// ---------- CSV ----------

// Undeclared columns are numbers only when every non-empty value looks like this: optional
// minus, no leading zero (so codes such as "080101" stay strings), optional decimals, no
// exponent, no thousands separators. An integer too large to be exact as a number (an id such as
// "9007199254740993", above 2^53) keeps the column as strings too.
const GUESS_NUMBER = /^-?(0|[1-9]\d*)(\.\d+)?$/;
const guessedNumber = (v) => GUESS_NUMBER.test(v) && (v.includes(".") || Number.isSafeInteger(Number(v)));
// Declared number columns are more lenient: a code like "080101" is accepted if asked for.
const DECLARED_NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;
const TYPES = ["string", "number", "date"];

/** Split RFC 4180 text into records of raw string fields. Handles quotes, CRLF and a BOM. */
function parseRecords(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const records = [];
  let record = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const endField = () => {
    record.push(field);
    field = "";
  };
  const endRecord = () => {
    endField();
    // A line with nothing on it is not a record.
    if (!(record.length === 1 && record[0] === "")) records.push(record);
    record = [];
  };
  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
      } else field += ch;
      i += 1;
      continue;
    }
    if (ch === '"') inQuotes = true;
    else if (ch === ",") endField();
    else if (ch === "\n") endRecord();
    else if (ch === "\r") {
      if (text[i + 1] === "\n") i += 1;
      endRecord();
    } else field += ch;
    i += 1;
  }
  if (inQuotes) throw new Error("CSV has an unterminated quoted field");
  if (field !== "" || record.length > 0) endRecord();
  return records;
}

// Date.parse rolls "2024-02-31" over to March; reject days that do not exist.
function realCalendarDay(v) {
  const [y, m, d] = v.slice(0, 10).split("-").map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
}

function convert(value, type, column, row) {
  if (type === "string") return value;
  if (value.trim() === "") return null;
  if (type === "number") {
    const v = value.trim();
    if (!DECLARED_NUMBER.test(v)) {
      throw new Error(`CSV column "${column}" is declared number but row ${row} has "${value}"`);
    }
    return Number(v);
  }
  // date: kept as the ISO string (validated, not converted to a Date), so it serializes and
  // compares lexicographically, and no timezone shifts sneak in.
  const v = value.trim();
  if (!ISO_DATE.test(v) || Number.isNaN(Date.parse(v)) || !realCalendarDay(v)) {
    throw new Error(`CSV column "${column}" is declared date but row ${row} has "${value}" (expected ISO 8601)`);
  }
  return v;
}

/**
 * parseCSV(text, types?) -> object[]
 *
 * `types` maps column -> "string" | "number" | "date" and always wins. Undeclared columns are
 * numbers only when every non-empty value matches /^-?\d+(\.\d+)?$/ with no leading zero and every integer among
 * them is a safe integer (exact as a number); otherwise (or when the column has no values at all) they stay strings.
 * Empty cells: `null` in number and date columns, "" in string columns.
 * A declared number or date column with an unparsable cell throws (no guessing).
 * A row with more cells than the header throws; a shorter row is padded with empty cells.
 */
export function parseCSV(text, types = {}) {
  const records = parseRecords(String(text));
  if (records.length === 0) return [];
  const header = records[0];
  const body = records.slice(1);

  for (const [column, type] of Object.entries(types)) {
    if (!TYPES.includes(type)) throw new Error(`CSV column "${column}" has unknown type "${type}" (use ${TYPES.join(", ")})`);
    if (!header.includes(column)) throw new Error(`CSV types declare column "${column}" that is not in the header (${header.join(", ")})`);
  }

  body.forEach((cells, k) => {
    if (cells.length > header.length) {
      throw new Error(`CSV row ${k + 1} has ${cells.length} cells but the header has ${header.length}`);
    }
  });

  const colType = header.map((name, c) => {
    if (Object.hasOwn(types, name)) return types[name];
    const values = body.map((cells) => cells[c] ?? "").filter((v) => v !== "");
    return values.length > 0 && values.every(guessedNumber) ? "number" : "string";
  });

  return body.map((cells, k) => {
    const row = {};
    header.forEach((name, c) => {
      const raw = cells[c] ?? "";
      // Guessed numbers are already validated; "" is the only non-numeric value left.
      row[name] = convert(raw, colType[c], name, k + 1);
    });
    return row;
  });
}

// ---------- Loader ----------

function normalizePath(path) {
  if (typeof path !== "string" || path === "") throw new Error(`data path must be a non-empty string: ${String(path)}`);
  const outside = `data path must be relative to the deck root: ${path}`;
  if (path.startsWith("/") || path.includes("\\") || /^[a-z][a-z0-9+.-]*:/i.test(path)) throw new Error(outside);
  // A percent sign could spell a dot segment ("%2e%2e") that the URL resolves after this check; a deck path never needs one.
  if (path.includes("%")) throw new Error(`data path may not contain '%': ${path}`);
  const segments = path.split("/").filter((s) => s !== "" && s !== ".");
  if (segments.includes("..") || segments.length === 0) throw new Error(outside);
  return segments.join("/");
}

// `read` may hand back text, bytes (fs.readFile without an encoding) or a fetch Response
// (so `fetch` itself can be injected): normalize all three to text.
async function toText(result) {
  if (typeof result === "string") return result;
  if (result instanceof Uint8Array) return new TextDecoder().decode(result);
  if (result && typeof result.text === "function" && "ok" in result) {
    if (!result.ok) throw new Error(`HTTP ${result.status}`);
    return result.text();
  }
  throw new TypeError("read() must return text, bytes or a fetch Response");
}

const stableTypes = (types) => JSON.stringify(Object.entries(types ?? {}).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));

/**
 * createDataLoader({ root, read }) -> (path, opts?) => Promise<any>
 *
 * `read(fullPath)` is injected (`fetch` in the browser, `fs.readFile` in Node). It may return
 * (or resolve to) text, bytes, or a fetch Response; a Response with `ok === false`, or any
 * rejection, becomes `Error("data file not found: <path>")` with the cause attached.
 * Paths are relative to the deck root and may not leave it. Dispatch is by extension:
 * .json and .geojson are parsed as JSON, .csv with parseCSV(text, opts.types).
 * Results are cached by normalized path (CSV: path plus types) and the promise is cached, so
 * concurrent calls share one read; failures are evicted so a later call retries.
 * The returned function also carries `url(path)`: the full location of a deck file (see below).
 */
export function createDataLoader({ root = "", read }) {
  if (typeof read !== "function") throw new TypeError("createDataLoader needs a read(path) function");
  const base = root.replace(/\/+$/, "");
  const cache = new Map();
  const fullPath = (norm) => (base === "" ? norm : `${base}/${norm}`);

  async function fetchAndParse(path, norm, ext, opts) {
    let text;
    try {
      text = await toText(await read(fullPath(norm)));
    } catch (cause) {
      throw new Error(`data file not found: ${path}`, { cause });
    }
    try {
      return ext === "csv" ? parseCSV(text, opts?.types) : JSON.parse(text);
    } catch (cause) {
      throw new Error(`invalid data file ${path}: ${cause.message}`, { cause });
    }
  }

  function load(path, opts) {
    let norm;
    try {
      norm = normalizePath(path);
    } catch (e) {
      return Promise.reject(e);
    }
    const ext = norm.includes(".") ? norm.slice(norm.lastIndexOf(".") + 1).toLowerCase() : "";
    if (!["json", "geojson", "csv"].includes(ext)) {
      return Promise.reject(new Error(`unsupported data file type: ${path} (use .json, .geojson or .csv)`));
    }
    const key = ext === "csv" ? `${norm}\n${stableTypes(opts?.types)}` : norm;
    return memoAsync(cache, key, () => fetchAndParse(path, norm, ext, opts));
  }

  /**
   * load.url(path) -> string: where a deck file lives, for things the browser fetches itself (images).
   * Same root and path rules as a data path (relative, inside the deck), any extension; nothing is read.
   */
  load.url = (path) => fullPath(normalizePath(path));
  return load;
}
