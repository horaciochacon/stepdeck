// The pure rules of the map component: raster levels and frame runs, the join of data rows to regions, and what
// `validate` reports about a map's props and its raster files. No DOM, and a single pure-leaf dependency, so the CLI loads
// it in plain Node and the component loads it in the browser.
//
// Values and runs
//   levelValue(level, value)               the data value of a raster level 0..255 (linear, log) or its class name
//   frameRun(labels, from, to)             the frame indexes a run shows, `from` to `to` inclusive, in list order or reversed
//   runMs(labels, from, to, pace)          the run's length: frames moved x pace
//   firstPhase(prev, next)                 how many step durations a map step's motion takes before a run: 0, 1 or 2
//   stepRun({ prevLabels, nextLabels, nextShowsLapse, prevProps, nextProps })
//                                          whether a map step plays a run, and its frames and first phase: the one rule
//                                          the element plays by and `validate` budgets by
//   joinValues(rows, key, value, ids)      rows joined to region ids as text; { values, unknown, duplicates }
//   niceLength(max)                        the largest 1, 2 or 5 x 10^n that is at most `max` (a scale bar)
//
// Raster files (`path` prefixes every message)
//   rasterProblems(json, path)             a sidecar JSON: bounds, value, src or frames, labels, numbers
//   pngProblems(info, path)                a PNG's header and chunk list, as `cli/png.js` `pngInfo` reads them
//   lapsePixelProblems(frames, size, path) a time-lapse's pixels, every frame together, against MAX_LAPSE_PIXELS
//
// What `validate` reports, as [{ rule, severity: "warning" | "error", message, limit, fix }] like `chartProblems`
//   `files` is { [rasterPath]: { json, pngs: { [src]: info } } }: for each raster layer, keyed by the layer's
//   `raster` prop, the parsed sidecar and the `pngInfo` of each image it names, keyed as the sidecar writes `src`.
//   An image that is not there has no entry (reported as "not found"); one that could not be read has
//   `{ error: "not a PNG" }` (reported as `<path>: not a PNG`). A layer is a time-lapse when its sidecar has `frames`.
//   mapProblems(props, files)              one element at one step
//   mapRunProblems(prev, next, files, timing, maxRun)   one step that changes `frame`; `timing` is
//                                          { duration, transition } in ms: the `--sd-duration` token, and the
//                                          step's own transition duration (undefined when it sets none)
//
// Rules:
//   map-layer (error)         `shown` names an id that is not in `layers`.
//   map-frame (error)         `frame` is not a label of the time-lapse; two time-lapse layers have different label
//                             lists; a `numbers` key is found in two time-lapse layers.
//   map-raster (error)        a sidecar, a PNG (an interlaced one included) or a frame size outside the raster format,
//                             or a time-lapse of more than MAX_LAPSE_PIXELS, every frame together.
//   map-run (error)          the first phase plus frames moved x `pace` is longer than `maxRun`.
//   map-prop-unused (warning) `frame` or `pace` without a time-lapse layer; a `numbers` key no frame has.
import { numberOf } from "./chart-layout.js";

/** The most frames in one time-lapse. */
export const MAX_FRAMES = 200;
/** The most pixels in one raster image: 2,000 x 2,000. */
export const MAX_RASTER_PIXELS = 2000 * 2000;
/** The most pixels in one time-lapse, every frame together (frames x columns x rows): what a deck may ask a page to decode. */
export const MAX_LAPSE_PIXELS = 100_000_000;
/** The default `pace`, ms per frame. */
export const DEFAULT_PACE = 700;

const COLOR_CHUNKS = ["gAMA", "cHRM", "iCCP", "sRGB"];

const isObject = (x) => x !== null && typeof x === "object" && !Array.isArray(x);

// --- values and runs ----------------------------------------------------------------------------------------

/**
 * The data value of raster `level` (0 to 255): linear is min + g/255 x (max - min), log is min x (max/min)^(g/255),
 * classes give the class name, or null for a level past the class list.
 * @param {number} level
 * @param {{ scale?: "linear" | "log", min?: number, max?: number, classes?: string[] }} value a sidecar's `value`
 * @returns {number | string | null}
 */
export function levelValue(level, value) {
  if (value.scale === "linear") return value.min + (level / 255) * (value.max - value.min);
  if (value.scale === "log") return value.min * (value.max / value.min) ** (level / 255);
  return value.classes?.[level] ?? null;
}

/** The first five labels, with an ellipsis when there are more: "2000, 2001, 2002, 2003, 2004, …". */
const labelHint = (labels) => labels.slice(0, 5).map(String).join(", ") + (labels.length > 5 ? ", …" : "");

/**
 * The frame indexes from label `from` to label `to` inclusive: in list order, or reversed when `to` comes first.
 * Labels compare as text, so 2015 and "2015" are one label.
 * @param {Array<string | number>} labels
 * @param {string | number} from
 * @param {string | number} to
 * @returns {number[]}
 * @throws {Error} `frame '<x>' not found (frames: ...)` for a label the list lacks
 */
export function frameRun(labels, from, to) {
  const text = labels.map(String);
  const at = (label) => {
    const i = text.indexOf(String(label));
    if (i < 0) throw new Error(`frame '${label}' not found (frames: ${labelHint(labels)})`);
    return i;
  };
  const a = at(from);
  const b = at(to);
  const run = [];
  for (let i = a; a <= b ? i <= b : i >= b; i += a <= b ? 1 : -1) run.push(i);
  return run;
}

/**
 * How long a run lasts: the frames moved (one fewer than the frames shown) x `pace` ms.
 * @param {Array<string | number>} labels
 * @param {string | number} from
 * @param {string | number} to
 * @param {number} pace ms per frame
 * @returns {number}
 */
export function runMs(labels, from, to, pace) {
  return (frameRun(labels, from, to).length - 1) * pace;
}

/** Props whose change redraws a map at once (a new geometry): nothing moves on such a step, no run plays. */
const GEOMETRY = ["boundaries", "id", "name", "projection"];
const changed = (a, b) => !sameValue(a ?? null, b ?? null);
const asSet = (list) => [...new Set(Array.isArray(list) ? list.map(String) : [])].sort();

/**
 * How long the motion of a map step lasts before its run, as a multiple of the step's duration, from the props of the
 * step before (`prev`) and of the step (`next`), as the map plays them: 2 when the map flies (`view` changes) or the
 * inset does (`inset.view` changes, the inset being on at both steps); 1 when anything else the map animates changes
 * (the layers in `shown`, `highlight`, `labels`, `numbers`, an inset coming or going, the definition of a layer shown at
 * `prev`); 0 otherwise (`frame`, `pace`, `legend`, a hidden layer's definition, the inset's `at` or `scale` are drawn
 * at once, or by the run).
 * @param {Record<string, unknown>} prev
 * @param {Record<string, unknown>} next
 * @returns {0 | 1 | 2}
 */
export function firstPhase(prev, next) {
  if (changed(prev.view, next.view)) return 2;
  const [a, b] = [isObject(prev.inset) ? prev.inset : null, isObject(next.inset) ? next.inset : null];
  if (a && b && changed(a.view, b.view)) return 2;
  if (!a !== !b) return 1;
  if (["highlight", "labels", "numbers"].some((key) => changed(prev[key], next[key]))) return 1;
  const shown = asSet(prev.shown);
  if (changed(shown, asSet(next.shown))) return 1;
  const layersOf = (props) => (isObject(props.layers) ? props.layers : {});
  return shown.some((id) => changed(layersOf(prev)[id], layersOf(next)[id])) ? 1 : 0;
}

/**
 * Whether a step of a map from props `prevProps` to `nextProps` plays a run, as the map element does: when both steps
 * have a time-lapse (`prevLabels`, `nextLabels`: the frame labels of the first time-lapse layer each declares, or
 * null), with the same labels, the step shows a time-lapse layer (`nextShowsLapse`), its `frame` names another frame
 * (an unset `frame` is the first) and its geometry stays (`boundaries`, `id`, `name`, `projection`). Otherwise null:
 * a frame that changes with nothing to run through is drawn at once, or crossfades with its layer.
 * @param {{ prevLabels: string[] | null, nextLabels: string[] | null, nextShowsLapse: boolean, prevProps: Record<string, unknown>, nextProps: Record<string, unknown> }} step
 * @returns {{ run: number[], moves: number, factor: 0 | 1 | 2 } | null} the frame indexes it shows (`frameRun`), the
 *   frames it moves, and its first phase (`firstPhase`)
 * @throws {Error} `frame '<x>' not found (frames: ...)` for a `frame` the labels lack
 */
export function stepRun({ prevLabels, nextLabels, nextShowsLapse, prevProps, nextProps }) {
  if (!prevLabels || !nextLabels || !nextShowsLapse || prevLabels.join("\n") !== nextLabels.join("\n")) return null;
  if (GEOMETRY.some((key) => changed(prevProps[key], nextProps[key]))) return null;
  const run = frameRun(nextLabels, prevProps.frame ?? nextLabels[0], nextProps.frame ?? nextLabels[0]);
  if (run.length < 2) return null;
  return { run, moves: run.length - 1, factor: firstPhase(prevProps, nextProps) };
}

/**
 * Data rows joined to region ids. Keys compare as text (`String(key).trim()`, so "01" is not 1). A value that is
 * empty, blank or not a finite number is null (the rule of `numberOf`): a region without data. The first row of a
 * key is kept.
 * @param {Array<Record<string, unknown>>} rows
 * @param {string} key the column that holds the region id
 * @param {string} value the column that holds the value
 * @param {Iterable<string | number>} ids the region ids
 * @returns {{ values: Map<string, number | null>, unknown: string[], duplicates: string[] }}
 *   `values` has an entry for each region a row names; `unknown` lists the keys that name no region, and
 *   `duplicates` the keys that appear in more than one row.
 */
export function joinValues(rows, key, value, ids) {
  const regions = new Set(Array.from(ids, String));
  const values = new Map();
  const unknown = new Set();
  const duplicates = new Set();
  const seen = new Set();
  for (const row of rows) {
    const k = String(row?.[key] ?? "").trim();
    if (seen.has(k)) duplicates.add(k);
    seen.add(k);
    if (!regions.has(k)) unknown.add(k);
    else if (!values.has(k)) values.set(k, numberOf(row[value]));
  }
  return { values, unknown: [...unknown], duplicates: [...duplicates] };
}

/**
 * The largest 1, 2 or 5 x 10^n that is at most `max`; 0 for a `max` that is not a positive number.
 * @param {number} max
 * @returns {number}
 */
export function niceLength(max) {
  if (!(max > 0) || !Number.isFinite(max)) return 0;
  let n = Math.floor(Math.log10(max));
  if (10 ** (n + 1) <= max) n += 1; // log10 rounding just below an exact power of ten
  for (const m of [5, 2, 1]) {
    const length = Number(`${m}e${n}`);
    if (length <= max) return length;
  }
  return Number(`1e${n - 1}`); // unreachable: 1e<n> <= max
}

// --- raster files ---------------------------------------------------------------------------------------------

const finite = (x) => typeof x === "number" && Number.isFinite(x);

function boundsProblems(bounds) {
  if (!Array.isArray(bounds) || bounds.length !== 4 || !bounds.every(finite)) {
    return ["`bounds` must be [west, south, east, north], four numbers"];
  }
  const [west, south, east, north] = bounds;
  const found = [];
  if (!(west < east)) found.push("`bounds` west must be less than east");
  if (!(south < north)) found.push("`bounds` south must be less than north");
  if (west < -180 || east > 180 || south < -90 || north > 90) found.push("`bounds` must stay within ±180° longitude and ±90° latitude");
  return found;
}

function valueProblems(value) {
  if (!isObject(value)) return ["`value` must be an object: `scale`, `min` and `max`, or `classes`"];
  const hasScale = value.scale !== undefined;
  const hasClasses = value.classes !== undefined;
  if (hasScale === hasClasses) return ["`value` needs exactly one of `scale` or `classes`"];
  if (hasClasses) {
    const { classes } = value;
    if (!Array.isArray(classes) || classes.length < 1 || classes.length > 256) return ["`classes` must list 1 to 256 names"];
    if (!classes.every((c) => typeof c === "string" && c !== "")) return ["`classes` names must be non-empty strings"];
    return new Set(classes).size === classes.length ? [] : ["`classes` names must be unique"];
  }
  if (value.scale !== "linear" && value.scale !== "log") return ['`scale` must be "linear" or "log"'];
  if (!finite(value.min) || !finite(value.max)) return ["`min` and `max` must be finite numbers"];
  const found = [];
  if (value.scale === "log" && !(value.min > 0)) found.push("a log scale needs `min` greater than 0");
  if (!(value.min < value.max)) found.push("`min` must be less than `max`");
  return found;
}

function framesProblems(frames) {
  if (!Array.isArray(frames) || frames.length === 0) return ["`frames` needs at least one frame"];
  if (frames.length > MAX_FRAMES) return [`${frames.length} frames is more than ${MAX_FRAMES}`];
  const found = [];
  const labels = new Set();
  frames.forEach((frame, i) => {
    const where = `frame ${i + 1}`;
    if (!isObject(frame)) return found.push(`${where} must be an object with \`src\` and \`label\``);
    if (typeof frame.src !== "string" || frame.src === "") found.push(`${where} needs a \`src\``);
    const label = typeof frame.label === "string" || finite(frame.label) ? String(frame.label) : "";
    if (label === "") found.push(`${where} needs a non-empty \`label\``);
    else if (labels.has(label)) found.push(`frame label '${label}' is not unique`);
    labels.add(label);
  });
  const keys = (frame) => Object.keys(isObject(frame?.numbers) ? frame.numbers : {}).sort().join(", ");
  const first = keys(frames[0]);
  const odd = frames.findIndex((frame) => keys(frame) !== first);
  if (odd >= 0) found.push(`every frame needs the same \`numbers\` keys: frame ${odd + 1} has (${keys(frames[odd])}), frame 1 has (${first})`);
  return found;
}

/**
 * What is wrong with a raster sidecar (its parsed JSON), one message per finding, each starting `${path}: `.
 * @param {unknown} json
 * @param {string} path the sidecar's path, for the messages
 * @returns {string[]}
 */
export function rasterProblems(json, path) {
  if (!isObject(json)) return [`${path}: must be a JSON object`];
  const found = [...boundsProblems(json.bounds), ...valueProblems(json.value)];
  const hasSrc = json.src !== undefined;
  const hasFrames = json.frames !== undefined;
  if (hasSrc && hasFrames) found.push("has both `src` and `frames`; use one");
  else if (!hasSrc && !hasFrames) found.push("needs `src` or `frames`");
  else if (hasSrc && (typeof json.src !== "string" || json.src === "")) found.push("`src` must be an image file name");
  else if (hasFrames) found.push(...framesProblems(json.frames));
  return found.map((message) => `${path}: ${message}`);
}

/**
 * What is wrong with a PNG for the raster format, from its header and chunk list (`pngInfo` in `cli/png.js`).
 * @param {{ width: number, height: number, bitDepth: number, colorType: number, interlace?: number, chunks: string[] }} info
 * @param {string} path the image's path, for the messages
 * @returns {string[]}
 */
export function pngProblems(info, path) {
  const found = [];
  if (info.bitDepth !== 8) found.push(`bit depth ${info.bitDepth} is not 8`);
  if (info.interlace) found.push("is interlaced; only non-interlaced PNGs are read");
  if (info.colorType !== 0 && info.colorType !== 4) found.push(`color type ${info.colorType} is not 0 (grey) or 4 (grey with alpha)`);
  for (const type of COLOR_CHUNKS) if (info.chunks.includes(type)) found.push(`has a ${type} chunk; color chunks are not allowed`);
  if (info.width * info.height > MAX_RASTER_PIXELS) found.push(`${info.width}×${info.height} is more than 2,000×2,000 pixels`);
  return found.map((message) => `${path}: ${message}`);
}

/**
 * What is wrong with the size of a time-lapse of `frames` frames of `cols` x `rows` pixels: more than `MAX_LAPSE_PIXELS`
 * every frame together. One message, starting `${path}: ` (the sidecar's path), or none. `validate` asks it with the
 * first frame's header, and `loadRaster` as soon as the first frame is decoded, before it decodes another.
 * @param {number} frames
 * @param {[number, number]} size the first frame's [cols, rows]
 * @param {string} path
 * @returns {string[]}
 */
export function lapsePixelProblems(frames, [cols, rows], path) {
  const total = frames * cols * rows;
  if (total <= MAX_LAPSE_PIXELS) return [];
  const millions = Math.ceil(total / 1e5) / 10; // rounded up, so a total past the limit never reads as the limit
  return [`${path}: ${frames} frames of ${cols}×${rows} is ${millions} million pixels, more than ${MAX_LAPSE_PIXELS / 1e6} million; use fewer or smaller frames`];
}

// --- what `validate` reports ----------------------------------------------------------------------------------

const item = (rule, severity, message, limit, fix) => ({ rule, severity, message, limit, fix });

const rasterPathOf = (layer) => (isObject(layer) && typeof layer.raster === "string" ? layer.raster : null);

/** The directory part of `path`, with its trailing slash ("" for a bare file name). */
const dirOf = (path) => path.slice(0, path.lastIndexOf("/") + 1);

/** The raster layers of `props`, in declaration order: { id, path, file } with `file` undefined when `files` lacks it. */
function rasterLayers(props, files) {
  const found = [];
  for (const [id, layer] of Object.entries(isObject(props?.layers) ? props.layers : {})) {
    const path = rasterPathOf(layer);
    if (path !== null) found.push({ id, path, file: files?.[path] });
  }
  return found;
}

/** The time-lapse layers of `props` (sidecar has `frames`): { id, labels, keys } with `keys` the `numbers` keys any frame has. */
function lapseLayers(props, files) {
  return rasterLayers(props, files)
    .filter(({ file }) => Array.isArray(file?.json?.frames))
    .map(({ id, file }) => {
      const frames = file.json.frames.filter(isObject);
      return {
        id,
        labels: frames.map((f) => String(f.label)),
        keys: new Set(frames.flatMap((f) => (isObject(f.numbers) ? Object.keys(f.numbers) : []))),
      };
    });
}

function sameValue(a, b) {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].every((k) => sameValue(a[k] ?? null, b[k] ?? null));
}

const unused = (prop) =>
  item("map-prop-unused", "warning", `\`${prop}\` does nothing without a time-lapse layer`, `\`${prop}\` together with a time-lapse layer`, `add a raster layer whose file has \`frames\`, or remove \`${prop}\``);

function rasterFileProblems(layers) {
  const found = [];
  const seen = new Set();
  const report = (messages, limit, fix) => messages.forEach((m) => found.push(item("map-raster", "error", m, limit, fix)));
  for (const { path, file } of layers) {
    if (!file || seen.has(path)) continue;
    seen.add(path);
    const sidecar = rasterProblems(file.json, path);
    if (sidecar.length > 0) {
      report(sidecar, "a sidecar with `bounds`, `value`, and `src` or `frames`", "correct the sidecar JSON");
      continue;
    }
    const srcs = file.json.frames ? file.json.frames.map((f) => f.src) : [file.json.src];
    let first = null;
    for (const src of srcs) {
      const png = dirOf(path) + src;
      const info = file.pngs?.[src];
      if (!info) {
        report([`${png}: not found`], "every `src` names an image next to the sidecar", "add the image, or correct the `src`");
        continue;
      }
      if (typeof info.error === "string") {
        report([`${png}: ${info.error}`], "every `src` names a readable image next to the sidecar", "re-export the image as a PNG inside the deck");
        continue;
      }
      const bad = pngProblems(info, png);
      report(bad, "8-bit greyscale PNG (type 0 or 4), not interlaced, no color chunks, at most 2,000×2,000 pixels", "re-export the image as 8-bit greyscale, not interlaced, without a color profile");
      if (bad.length === 0 && first === null) first = { info, png };
      else if (bad.length === 0 && (info.width !== first.info.width || info.height !== first.info.height)) {
        report([`${png}: ${info.width}×${info.height} is not ${first.info.width}×${first.info.height}, the size of ${first.png}`], "every frame has the same size", "export every frame at one size");
      }
    }
    if (file.json.frames && first) {
      report(lapsePixelProblems(srcs.length, [first.info.width, first.info.height], path), `at most ${MAX_LAPSE_PIXELS / 1e6} million pixels in a time-lapse, every frame together`, "use fewer frames, or export them smaller");
    }
  }
  return found;
}

/**
 * What `validate` reports about one map element's props, beyond its schema.
 * @param {Record<string, unknown> | null | undefined} props the element's resolved props at one step
 * @param {Record<string, { json: unknown, pngs: Record<string, object> }>} files the raster files, by `raster` path
 * @returns {Array<{ rule: string, severity: "warning" | "error", message: string, limit: string, fix: string }>}
 */
export function mapProblems(props, files) {
  if (!isObject(props)) return [];
  const found = [];
  const layerIds = Object.keys(isObject(props.layers) ? props.layers : {});
  for (const id of Array.isArray(props.shown) ? props.shown : []) {
    if (!layerIds.includes(id)) {
      found.push(item("map-layer", "error", `\`shown\` lists '${id}', which is not a layer (layers: ${layerIds.join(", ") || "none"})`, "every id in `shown` is a key of `layers`", `add a layer '${id}', or remove it from \`shown\``));
    }
  }

  const rasters = rasterLayers(props, files);
  const lapse = lapseLayers(props, files);
  if (props.frame !== undefined && props.frame !== null && lapse.length > 0 && !lapse[0].labels.includes(String(props.frame))) {
    found.push(item("map-frame", "error", `frame '${props.frame}' not found (frames: ${labelHint(lapse[0].labels)})`, "`frame` is a label of the time-lapse", "use one of the frame labels"));
  }
  for (const other of lapse.slice(1)) {
    if (other.labels.join("\n") !== lapse[0].labels.join("\n")) {
      found.push(item("map-frame", "error", `time-lapse layers '${lapse[0].id}' and '${other.id}' have different frame labels`, "every time-lapse layer on a map has the same label list", "give the files the same frame labels, in the same order"));
    }
  }
  const numbers = Array.isArray(props.numbers) ? props.numbers.map((n) => n?.key).filter((k) => typeof k === "string") : [];
  for (const key of numbers) {
    const holders = lapse.filter((l) => l.keys.has(key));
    if (holders.length > 1) {
      found.push(item("map-frame", "error", `\`numbers\` key '${key}' is in time-lapse layers ${holders.map((l) => `'${l.id}'`).join(" and ")}`, "each `numbers` key comes from one time-lapse layer", "rename the key in one of the files"));
    }
  }

  found.push(...rasterFileProblems(rasters));

  // A raster file `files` lacks may be a time-lapse; stay quiet about what depends on it.
  if (rasters.every(({ file }) => file)) {
    if (props.frame !== undefined && props.frame !== null && lapse.length === 0) found.push(unused("frame"));
    if (props.pace !== undefined && props.pace !== null && lapse.length === 0) found.push(unused("pace"));
    for (const key of numbers) {
      if (!lapse.some((l) => l.keys.has(key))) {
        found.push(item("map-prop-unused", "warning", `\`numbers\` key '${key}' is in no frame`, "each `numbers` key is a key of the frames' `numbers`", `add '${key}' to the frames' \`numbers\`, or remove it from \`numbers\``));
      }
    }
  }
  return found;
}

/**
 * What `validate` reports about one step that plays a map's run (`stepRun`, the rule the element plays by), in two
 * phases: the first lasts `firstPhase` times the duration (or the step's transition), then the run lasts frames moved x
 * `pace`. The labels of the first time-lapse layer each step declares count.
 * @param {Record<string, unknown>} prev the element's props at the earlier step
 * @param {Record<string, unknown>} next the element's props at this step
 * @param {Record<string, { json: unknown, pngs: Record<string, object> }>} files the raster files, by `raster` path
 * @param {{ duration: number, transition?: number }} timing `--sd-duration` and the step's transition duration, ms
 * @param {number} maxRun the longest run an update may declare, ms
 * @returns {Array<{ rule: string, severity: "error", message: string, limit: string, fix: string }>}
 */
export function mapRunProblems(prev, next, files, timing, maxRun) {
  if (!isObject(prev) || !isObject(next)) return [];
  const [before] = lapseLayers(prev, files);
  const lapse = lapseLayers(next, files);
  const shown = Array.isArray(next.shown) ? next.shown : [];
  let step;
  try {
    step = stepRun({
      prevLabels: before?.labels ?? null,
      nextLabels: lapse[0]?.labels ?? null,
      nextShowsLapse: lapse.some(({ id }) => shown.includes(id)),
      prevProps: prev,
      nextProps: next,
    });
  } catch {
    return []; // an unknown label is for `mapProblems` to report
  }
  if (!step) return [];

  const { moves, factor } = step;
  const phase = factor === 0 ? 0 : (timing.transition ?? factor * timing.duration);
  const pace = next.pace ?? DEFAULT_PACE;
  const total = phase + moves * pace;
  if (total <= maxRun) return [];
  return [
    item(
      "map-run",
      "error",
      `first phase ${phase} ms + ${moves} frame ${moves === 1 ? "move" : "moves"} × ${pace} ms = ${total} ms`,
      `at most ${maxRun} ms`,
      "lower `pace`, or play the frames over two steps",
    ),
  ];
}
