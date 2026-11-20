// Pure building blocks for charts: scale extents, category order, forecast splits, label placement, draw order
// and beeswarm offsets. A leaf module: no imports, no DOM, no randomness. Everything takes plain data and
// returns plain data, so built-in charts, custom components and `validate` share the same maths.

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const missing = (v) => v == null || v === "" || (typeof v === "number" && !Number.isFinite(v));
const lerpN = (a, b, t) => a + (b - a) * t;

/** Compares two strings by code point (not by UTF-16 unit): negative, 0 or positive. */
function byCodePoint(a, b) {
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const ca = a.codePointAt(i);
    const cb = b.codePointAt(j);
    if (ca !== cb) return ca - cb;
    i += ca > 0xffff ? 2 : 1;
    j += cb > 0xffff ? 2 : 1;
  }
  return (a.length - i) - (b.length - j);
}

/**
 * The [min, max] of every finite number in `columns` across `rows`. `null`, `""`, non-numbers and non-finite
 * values are missing; numeric strings count as numbers; undefined entries in `columns` are skipped. With
 * `zero`, 0 is included. No values: [0, 1]; a single value v: [v, v + 1]. The result is not niced: callers nice.
 * @param {Array<Record<string, unknown>>} rows
 * @param {Array<string | undefined>} columns
 * @param {{ zero?: boolean }} [options]
 * @returns {[number, number]}
 */
export function extentOf(rows, columns, { zero = false } = {}) {
  let lo = zero ? 0 : Infinity;
  let hi = zero ? 0 : -Infinity;
  let any = zero;
  for (const row of rows ?? []) {
    for (const col of columns ?? []) {
      if (col === undefined) continue;
      const raw = row?.[col];
      if (missing(raw) || (typeof raw !== "number" && typeof raw !== "string")) continue;
      const v = Number(raw);
      if (!Number.isFinite(v)) continue;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
      any = true;
    }
  }
  if (!any) return [0, 1];
  return lo === hi ? [lo, lo + 1] : [lo, hi];
}

/**
 * The category keys in display order. `items` is one `{ key, value, columns? }` per category, in data order.
 * `sort` is `undefined` or `"none"` (data order), `"value"` (ascending), `"-value"` (descending),
 * `{ by, order: "asc" | "desc" }` (by `columns[by]`, ascending by default) or a list of keys (listed first, the
 * rest after in data order). Stable; missing values are last in both directions; strings compare by code point.
 * Throws naming the column or the category that is not found.
 * @param {Array<{ key: string, value: number | null, columns?: Record<string, number | string | null> }>} items
 * @param {unknown} sort
 * @returns {string[]}
 */
export function rank(items, sort) {
  const keys = items.map((it) => it.key);
  const invalid = () =>
    new Error('`sort` must be "none", "value", "-value", { by, order } or a list of categories');
  if (sort === undefined || sort === "none") return keys;

  if (Array.isArray(sort)) {
    const known = new Set(keys);
    const listed = [];
    const seen = new Set();
    for (const k of sort) {
      const key = String(k);
      if (!known.has(key)) throw new Error(`category '${key}' in \`sort\` not found (categories: ${keys.join(", ")})`);
      if (!seen.has(key)) {
        seen.add(key);
        listed.push(key);
      }
    }
    return [...listed, ...keys.filter((k) => !seen.has(k))];
  }

  let valueOf;
  let desc;
  if (sort === "value" || sort === "-value") {
    valueOf = (it) => it.value;
    desc = sort === "-value";
  } else if (sort && typeof sort === "object" && typeof sort.by === "string" && (sort.order === undefined || sort.order === "asc" || sort.order === "desc")) {
    const names = [];
    for (const it of items) for (const name of Object.keys(it.columns ?? {})) if (!names.includes(name)) names.push(name);
    if (!names.includes(sort.by)) throw new Error(`sort column '${sort.by}' not found (columns: ${names.join(", ")})`);
    valueOf = (it) => it.columns?.[sort.by];
    desc = sort.order === "desc";
  } else throw invalid();

  const cmp = (a, b) => (typeof a === "number" && typeof b === "number" ? a - b : typeof a === "string" && typeof b === "string" ? byCodePoint(a, b) : typeof a === "number" ? -1 : 1);
  return items
    .map((it, i) => ({ key: it.key, v: valueOf(it), i }))
    .sort((a, b) => {
      const ma = missing(a.v);
      const mb = missing(b.v);
      if (ma || mb) return ma === mb ? a.i - b.i : ma ? 1 : -1;
      return (desc ? -cmp(a.v, b.v) : cmp(a.v, b.v)) || a.i - b.i;
    })
    .map((e) => e.key);
}

/**
 * Splits points (sorted by x) at `at` into the observed part and the forecast part. A point exactly at `at`
 * ends `observed` and starts `forecast` (the same object in both). When `at` falls strictly between two points,
 * a boundary point (the later point with every field numeric in both ends interpolated, a field that is `null`
 * at either end `null`, and `boundary: true`) ends `observed` and starts `forecast`. `at` before the first x:
 * `observed` is empty; after the last x: `forecast` is empty; a non-finite `at`: everything is observed.
 * @template P
 * @param {P[]} points
 * @param {number} at
 * @param {(p: P) => number} [x]
 * @returns {{ observed: P[], forecast: P[] }}
 */
export function splitAt(points, at, x = (p) => p.x) {
  if (!Number.isFinite(at)) return { observed: [...points], forecast: [] };
  const observed = points.filter((p) => x(p) <= at);
  const forecast = points.filter((p) => x(p) >= at);
  const below = points.filter((p) => x(p) < at);
  const above = points.length - observed.length;
  if (below.length && above && observed.length === below.length) {
    const a = below.at(-1);
    const b = points[observed.length];
    const t = (at - x(a)) / (x(b) - x(a));
    const boundary = { ...b };
    for (const k of Object.keys(b)) {
      if (a[k] === null || b[k] === null) boundary[k] = null;
      else if (isNum(a[k]) && isNum(b[k])) boundary[k] = lerpN(a[k], b[k], t);
    }
    boundary.boundary = true;
    observed.push(boundary);
    forecast.unshift(boundary);
  }
  return { observed, forecast };
}

/**
 * Pushes label positions apart so none is closer than `gap` to another, keeping them within [min, max] where
 * it can. Visits in ascending y (stable), pushing each down to at least the previous + `gap`; when the last
 * passes `max`, everything shifts up by the overflow, but never past `min`. With the default `min` this is
 * exactly the series-label placement of `chart.line`. The result is in input order.
 * @param {number[]} ys
 * @param {number} gap
 * @param {[number, number]} [range]
 * @returns {number[]}
 */
export function spread(ys, gap, [min, max] = [-Infinity, Infinity]) {
  const order = ys.map((_, i) => i).sort((a, b) => ys[a] - ys[b] || a - b);
  const out = new Array(ys.length);
  let prev;
  for (const i of order) {
    out[i] = prev === undefined ? ys[i] : Math.max(ys[i], prev + gap);
    prev = out[i];
  }
  if (order.length && prev > max) {
    const shift = Math.min(prev - max, Math.max(0, out[order[0]] - min));
    for (const i of order) out[i] -= shift;
  }
  return out;
}

/**
 * Places a label `width` px wide for a mark running from `start` to `end` (direction = sign of end - start,
 * positive when equal). First choice: past `end` (at end + gap) when it fits within [lo, hi]; else inside the
 * mark, against `end`, when |end - start| >= width + 2 gap; else past `start` on the other side. `anchor` is
 * the SVG `text-anchor` for `x`.
 * @param {number} end
 * @param {number} start
 * @param {number} width
 * @param {[number, number]} [range]
 * @param {number} [gap]
 * @returns {{ x: number, anchor: "start" | "end", inside: boolean }}
 */
export function fit(end, start, width, [lo, hi] = [-Infinity, Infinity], gap = 0) {
  const dir = end >= start ? 1 : -1;
  const outside = end + dir * gap;
  const far = outside + dir * width;
  if (Math.min(outside, far) >= lo && Math.max(outside, far) <= hi) return { x: outside, anchor: dir > 0 ? "start" : "end", inside: false };
  if (Math.abs(end - start) >= width + 2 * gap) return { x: end - dir * gap, anchor: dir > 0 ? "end" : "start", inside: true };
  return { x: start - dir * gap, anchor: dir > 0 ? "end" : "start", inside: false };
}

/** Word-wraps `text` to lines of at most `maxChars` characters (long words are cut) and at most `maxLines` lines. */
export function wrapLabel(text, maxChars, maxLines) {
  const lines = [];
  let line = "";
  for (let word of String(text).split(/\s+/).filter(Boolean)) {
    while (word.length > maxChars) {
      if (line) lines.push(line);
      line = "";
      lines.push(word.slice(0, maxChars));
      word = word.slice(maxChars);
    }
    if (!line) line = word;
    else if (line.length + 1 + word.length <= maxChars) line += ` ${word}`;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = `${lines[maxLines - 1].slice(0, Math.max(1, maxChars - 1))}…`;
  }
  return lines.length ? lines : [""];
}

/** The 32-bit FNV-1a hash of a string's UTF-8 bytes. */
function fnv1a(text) {
  let h = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(text)) h = Math.imul(h ^ byte, 0x01000193) >>> 0;
  return h;
}

/**
 * A fixed pseudo-random order of the unique ids (stringified, first occurrence): ascending by the FNV-1a hash
 * of `${seed}:${id}`, ties by code point. It depends only on the ids and the seed, never on their position, so
 * the painted set (a prefix of this order) stays stable as draws are added or the file is reordered.
 * @param {Array<string | number>} ids
 * @param {number} [seed]
 * @returns {string[]}
 */
export function drawOrder(ids, seed = 1) {
  return [...new Set(ids.map(String))]
    .map((id) => ({ id, h: fnv1a(`${seed}:${id}`) }))
    .sort((a, b) => a.h - b.h || byCodePoint(a.id, b.id))
    .map((e) => e.id);
}

/**
 * A vertical offset per input index that keeps points with nearby x apart (a beeswarm). Points are visited in
 * ascending x (ties by index) and take the first free slot of 0, +s, -s, +2s, -2s, ... (s = 2r) with
 * |dy| <= maxDy, a slot being free when no point placed in it is within 2r in x. With none free, the slot
 * whose nearest placed point is farthest in x is taken (ties to the first in slot order). A non-finite x gives NaN.
 * @param {number[]} xs
 * @param {{ r: number, maxDy: number }} options
 * @returns {number[]}
 */
export function swarm(xs, { r, maxDy }) {
  const out = xs.map(() => NaN);
  const s = 2 * r;
  const cap = maxDy === undefined ? Infinity : Math.max(0, Number(maxDy) || 0);
  const order = [];
  xs.forEach((x, i) => {
    if (isNum(x)) order.push(i);
  });
  order.sort((a, b) => xs[a] - xs[b] || a - b);
  if (!(s > 0)) {
    for (const i of order) out[i] = 0;
    return out;
  }
  const levels = Math.min(Math.floor(cap / s), order.length);
  const slots = [0];
  for (let k = 1; k <= levels; k++) slots.push(k * s, -k * s);
  const last = slots.map(() => -Infinity); // x of the last point placed in each slot (visits ascend, so it is the nearest)
  for (const i of order) {
    const x = xs[i];
    let pick = slots.findIndex((_, j) => x - last[j] >= s);
    if (pick < 0) {
      pick = 0;
      for (let j = 1; j < slots.length; j++) if (x - last[j] > x - last[pick]) pick = j;
    }
    last[pick] = x;
    out[i] = slots[pick];
  }
  return out;
}
