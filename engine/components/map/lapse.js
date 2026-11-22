// The time-lapse of `map` (index.js): a raster layer whose file has `frames`. This module holds the pieces of a step's
// time-lapse that need no canvas: its state (`lapseOf`), whether a step runs (`runOf`, after core/map-rules.js
// `stepRun`, the rule `validate` budgets by), the frame pair at a moment of a run (`pairAt`), the frames a run decodes
// as it goes (`runFrames`), and the corner panel and run moments (`panelBetween`, `runMoment`). index.js plays them.
//
// A frame pair is `{ at, next, mix }`, indexes into the frames: frame `at`, and `next` crossfading in over it at `mix`
// (0..1). A resting moment is `still(i)`. At progress u of a run of n moves the pair is the run's place ⌊u·n⌋ and the
// next, `mix` the fractional part; at u = 1 it is the last move, fully mixed. The panel's label (and `data-frame`) shows
// the frame the crossfade heads to once `mix` is half way; its numbers go linearly between the two frames' values.
//
// Frames are decoded as they are needed: a step's own frame, and during a run `READ_AHEAD` frames past the one on
// screen, in the run's direction (a raster keeps its 12 most recently used, core/map.js). A frame whose decoding failed
// is remembered, never thrown where nothing waits for it: the run that reaches it, or the paint at rest, reports it.
import { lerp } from "../../core/kit.js";
import { loadRaster } from "../../core/map.js";
import { DEFAULT_PACE, frameRun, stepRun } from "../../core/map-rules.js";

/** How many frames past the one on screen a run decodes, in its direction. */
export const READ_AHEAD = 4;
/** The `pace` a map takes, ms per frame moved. */
export const PACES = [100, 2000];

const fail = (message) => {
  throw new Error(message);
};
const sameList = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

/** The frame pair of a moment that rests on frame `i`. */
export const still = (i) => ({ at: i, next: i, mix: 0 });

/** Whether a raster from `loadRaster` is a time-lapse: a file with `frames`, each labelled (one `src` has one frame, labelled ""). */
export const isLapse = (raster) => raster.frames[0].label !== "";

/**
 * The time-lapse of a step with props `p`: null when none of the layers it declares (`slots`, `{ id }` each, with
 * `layers[i].prepared` prepared for them; a prepared raster time-lapse has `lapse: { labels, numbers }`) is one; else
 * `{ labels, index, pace, numbers }`: their frame labels, the index of the one `frame` names (the first without it), the
 * step's `pace`, and for each entry of `numbers` `{ key, label, format, fmt, values }`, `fmt` the formatter of `format`
 * (`ctx.format`) and `values` the key's value in each frame. Throws `time-lapse layers 'a' and 'b' have different frame
 * labels`, `frame '1999' not found (frames: …)`, `` `pace` must be 100 to 2000 ms a frame ``, and for a `numbers` key in
 * no time-lapse layer or in two, or without a `format`.
 */
export function lapseOf(p, slots, layers, ctx) {
  const found = slots.flatMap(({ id }, i) => (layers[i].prepared?.lapse ? [{ id, ...layers[i].prepared.lapse }] : []));
  if (found.length === 0) return null;
  const [first] = found;
  const other = found.find((layer) => !sameList(layer.labels, first.labels));
  if (other) fail(`time-lapse layers '${first.id}' and '${other.id}' have different frame labels`);
  const index = p.frame === undefined || p.frame === null ? 0 : frameRun(first.labels, p.frame, p.frame)[0];
  const pace = p.pace ?? DEFAULT_PACE;
  if (typeof pace !== "number" || !(pace >= PACES[0] && pace <= PACES[1])) fail(`\`pace\` must be ${PACES[0]} to ${PACES[1]} ms a frame`);
  const keys = [...new Set(found.flatMap((layer) => Object.keys(layer.numbers[0])))];
  const numbers = (p.numbers ?? []).map(({ key, label = "", format } = {}) => {
    const holders = found.filter((layer) => Object.hasOwn(layer.numbers[0], key));
    if (holders.length === 0) fail(`\`numbers\` key '${key}' is in no time-lapse layer (keys: ${keys.join(", ") || "none"})`);
    if (holders.length > 1) fail(`\`numbers\` key '${key}' is in time-lapse layers ${holders.map((layer) => `'${layer.id}'`).join(" and ")}`);
    if (typeof format !== "string" || format === "") fail(`\`numbers\` key '${key}' needs a \`format\` (a d3-format string such as ",.0f")`);
    return { key, label, format, fmt: ctx.format(format), values: holders[0].numbers.map((n) => n[key]) };
  });
  return { labels: first.labels, index, pace, numbers };
}

/**
 * The run of a step from step state `a` to `b` (each `{ lapse, layers, props }`, index.js): core/map-rules.js `stepRun`
 * on their labels, on whether `b` shows a time-lapse layer and on their props, so the element plays the runs `validate`
 * budgets. `{ run, moves, factor }` or null.
 */
export const runOf = (a, b) =>
  stepRun({
    prevLabels: a.lapse?.labels ?? null,
    nextLabels: b.lapse?.labels ?? null,
    nextShowsLapse: b.layers.some((layer) => layer.alpha > 0 && layer.prepared?.lapse),
    prevProps: a.props,
    nextProps: b.props,
  });

/**
 * The frame pair at progress `u` (0..1) of run `run` (frame indexes, at least two): the run's place `k` = ⌊u·n⌋ of its
 * n moves (the last move at u = 1) and the next, crossfading in at the fractional part. `place` is `k`.
 * @param {number[]} run
 * @param {number} u
 * @returns {{ at: number, next: number, mix: number, place: number }}
 */
export function pairAt(run, u) {
  const n = run.length - 1;
  const place = Math.max(0, Math.min(n - 1, Math.floor(u * n)));
  return { at: run[place], next: run[place + 1], mix: Math.max(0, Math.min(1, u * n - place)), place };
}

/** The rasters of the time-lapse layers a step state declares. */
export const lapseRasters = (s) => [...new Set(s.layers.flatMap(({ prepared }) => (prepared?.lapse ? [prepared.lapse.raster] : [])))];
/** Decodes frame `i` (default: the step's own) of every time-lapse layer of step state `s`, so it can be painted. */
export const decodeFrame = (s, i = s.lapse?.index) => Promise.all(lapseRasters(s).map((r) => r.grid(i)));

/**
 * The frames of run `run` (frame indexes) of step state `s`, decoded as it goes. `ask(place)` asks for each of the run's
 * places up to `place + READ_AHEAD` not asked for yet, and resolves when those are decoded or have failed (it never
 * rejects); `failure(i)` is the error decoding frame `i`, if it failed; `ready(i)` whether frame `i` is decoded in every
 * time-lapse layer now.
 */
export function runFrames(s, run) {
  const rasters = lapseRasters(s);
  const failures = new Map();
  let asked = -1; // the run's places up to here are asked for
  return {
    ask(place) {
      const now = [];
      while (asked < Math.min(run.length - 1, place + READ_AHEAD)) {
        const i = run[++asked];
        now.push(Promise.all(rasters.map((r) => r.grid(i))).catch((error) => void failures.set(i, error)));
      }
      return Promise.all(now);
    },
    failure: (i) => failures.get(i),
    ready: (i) => rasters.every((r) => r.decoded(i) !== undefined),
  };
}

/** Whether two `numbers` rows of a step state's time-lapse show the same thing. */
const sameRow = (a) => (b) => a.key === b.key && a.label === b.label && a.format === b.format;

/** The `numbers` rows of a step state, as text: equal when the panel shows the same rows. */
export const rowsOf = (s) => (s.lapse?.numbers ?? []).map(({ key, label, format }) => `${key}|${label}|${format}`).join("\n");

/**
 * The corner panel of a moment between time-lapses `a` and `b` (a step state's `lapse`, or null) at fade `f`, over
 * `layers`, the moment's: the label of `b`'s frame (or `a`'s, while `b` has none) and each of its numbers at that frame,
 * a row that `numbers` gains or loses fading in or out, the whole at the opacity of the time-lapse layers on screen
 * (`alpha`, 0 when none is shown); null when neither has a time-lapse.
 */
export function panelBetween(a, b, f, layers) {
  const lapse = b ?? a;
  if (!lapse) return null;
  const was = a?.numbers ?? [], is = b?.numbers ?? [];
  const row = (number, at, opacity) => ({ key: number.key, label: number.label, text: number.fmt(number.values[at]), opacity });
  return {
    label: lapse.labels[lapse.index],
    alpha: Math.max(0, ...layers.filter((layer) => layer.prepared?.lapse).map((layer) => layer.alpha)),
    rows: [
      ...is.map((number) => row(number, b.index, was.some(sameRow(number)) ? 1 : f)),
      ...was.filter((number) => !is.some(sameRow(number))).map((number) => row(number, a.index, 1 - f)),
    ],
  };
}

/**
 * The moment of a run of step state `s` at frame pair `pair`: `rest`, the state at rest (index.js `between`), with its
 * layers on the pair, the panel's numbers between the values of its two frames, and the label of the frame the
 * crossfade heads to once it is half way.
 */
export function runMoment(rest, s, pair) {
  const label = s.lapse.labels[pair.mix >= 0.5 ? pair.next : pair.at];
  const text = (number) => number.fmt(lerp(number.values[pair.at], number.values[pair.next], pair.mix));
  return {
    ...rest,
    frame: label,
    layers: rest.layers.map((layer) => ({ ...layer, frame: pair })),
    panel: { ...rest.panel, label, rows: rest.panel.rows.map((row, i) => ({ ...row, text: text(s.lapse.numbers[i]) })) },
  };
}

/**
 * How many raster layers of `propsList` (`isRaster(def)` says which) show a time-lapse at some step. A file that fails
 * to load does not count: the step that shows it reports it.
 */
export async function lapseLayers(propsList, isRaster, ctx) {
  const files = new Map(); // layer id -> the raster files it names
  for (const p of propsList) {
    for (const [id, def] of Object.entries(p.layers ?? {})) {
      if (isRaster(def) && typeof def.raster === "string") files.set(id, new Set([...(files.get(id) ?? []), def.raster]));
    }
  }
  const lapse = (file) => loadRaster(file, ctx).then(isLapse, () => false);
  const found = await Promise.all([...files.values()].map(async (names) => (await Promise.all([...names].map(lapse))).some(Boolean)));
  return found.filter(Boolean).length;
}
