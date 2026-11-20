// Pure fold engine: slide definition + step index -> resolved state.
// No imports, no DOM, no I/O. Runs in Node and in the browser.
//
// Patch shape (one per step; sugar expands to the same shape):
//   { set: {id: mergePatch}, replace: {id: props}, show: [id], hide: [id],
//     only: {id: mergePatch}, notes: string, transition: {stagger, duration} }
// Inside one patch the operations apply in this order: replace, set, show, hide.
// `only` is not part of the fold; it is applied on top of the folded state at its own step.

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const clone = (v) => (v === undefined ? v : structuredClone(v));

/** RFC 7396 JSON merge patch. Returns a new value; never mutates or aliases its inputs. */
export function mergePatch(target, patch) {
  if (!isObject(patch)) return clone(patch);
  const out = isObject(target) ? clone(target) : {};
  for (const [key, value] of Object.entries(patch)) {
    if (key === "__proto__") continue;
    if (value === null) delete out[key];
    else out[key] = mergePatch(out[key], value);
  }
  return out;
}

/** Number of states in a slide: steps.length, or 1 when there are no steps. */
export function stepCount(slide) {
  return Array.isArray(slide.steps) && slide.steps.length > 0 ? slide.steps.length : 1;
}

/** Resolves a step id or number to its index. Throws on anything unknown or out of range. */
export function stepIndex(slide, ref) {
  const n = stepCount(slide);
  if (typeof ref === "number") {
    if (Number.isInteger(ref) && ref >= 0 && ref < n) return ref;
  } else if (typeof ref === "string" && Array.isArray(slide.steps)) {
    const i = slide.steps.findIndex((s) => s && s.id === ref);
    if (i !== -1) return i;
  }
  throw new Error(`unknown step '${ref}' in slide '${slide.id}'`);
}

/** Parses a step query or hash value: digits are an index, anything else is a step id; empty is step 0. */
export function parseStepRef(value) {
  if (value == null || value === "") return 0;
  return /^\d+$/.test(value) ? Number(value) : value;
}

/** Whether an element is a title whose `*phrase*` is an accent (default-theme spec §10.5): a text element with the
 * reserved id `title`. It defaults to `accent: true`; props that set `accent` (e.g. false) keep their value. */
const accentTitle = (id, type) => id === "title" && type === "text";
const withAccent = (props) => (isObject(props) && props.accent === undefined ? { ...props, accent: true } : props);

/**
 * The slide's element definitions in order, with sugar expanded (never mutating the slide):
 *   - `section: "x"` becomes the element with the reserved id `kicker` (type text, region "title", props { text }),
 *     first, unless the slide defines a `kicker` itself (validate reports that as reserved-id). Layout-free: a
 *     layout without a title region drops it (core/layout.js placedSlide);
 *   - `title: "x"` becomes the element with the reserved id `title` (region "title", props { text, accent: true })
 *     unless the slide defines one itself;
 *   - an explicit text element with id `title` gets `accent: true` unless its props set `accent`.
 */
export function initialElements(slide) {
  const defs = (slide.elements ?? []).map((d) => (d && accentTitle(d.id, d.type) && withAccent(d.props) !== d.props ? { ...d, props: withAccent(d.props) } : d));
  if (typeof slide.title === "string" && !defs.some((d) => d.id === "title")) {
    defs.unshift({ id: "title", type: "text", region: "title", props: { text: slide.title, accent: true } });
  }
  if (typeof slide.section === "string" && slide.section !== "" && !defs.some((d) => d.id === "kicker")) {
    defs.unshift({ id: "kicker", type: "text", region: "title", props: { text: slide.section } });
  }
  return defs;
}

/**
 * Expands `from`, `at` and `advance` into one patch per step index.
 * Visibility sugar only emits show/hide where it changes, so explicit patches
 * (applied after the sugar of the same step) keep winning until the sugar changes again.
 */
export function expandSugar(slide) {
  const n = stepCount(slide);
  const patches = Array.from({ length: n }, () => ({}));
  const push = (i, op, id) => (patches[i][op] ??= []).push(id);

  for (const el of initialElements(slide)) {
    let visibleAt = null;
    if (el.from !== undefined) {
      const from = stepIndex(slide, el.from);
      visibleAt = (i) => i >= from;
    } else if (Array.isArray(el.at)) {
      const at = new Set(el.at.map((ref) => stepIndex(slide, ref)));
      visibleAt = (i) => at.has(i);
    }
    if (visibleAt) {
      let prev = true; // every element starts visible
      for (let i = 0; i < n; i++) {
        const now = visibleAt(i);
        if (now !== prev) push(i, now ? "show" : "hide", el.id);
        prev = now;
      }
    }

    if (el.advance) {
      const { prop, values = [], start = 0 } = el.advance;
      const first = stepIndex(slide, start);
      for (let j = 0; j < values.length && first + j < n; j++) {
        ((patches[first + j].set ??= {})[el.id] ??= {})[prop] = clone(values[j]);
      }
    }
  }
  return patches;
}

function applyPatch(state, patch, where) {
  const need = (id) => {
    const s = state.get(id);
    if (!s) throw new Error(`unknown element '${id}' in ${where}`);
    return s;
  };
  for (const [id, props] of Object.entries(patch.replace ?? {})) need(id).props = clone(props);
  for (const [id, p] of Object.entries(patch.set ?? {})) {
    const s = need(id);
    s.props = mergePatch(s.props, p);
  }
  for (const id of patch.show ?? []) need(id).visible = true;
  for (const id of patch.hide ?? []) need(id).visible = false;
}

/**
 * Resolved state of a slide at step k (id or number):
 * initial elements, folded with sugar then explicit patches of steps 0..k,
 * plus step k's own `only`.
 */
export function stateAt(slide, k) {
  const index = stepIndex(slide, k);
  const sugar = expandSugar(slide);
  const steps = slide.steps ?? [];

  const state = new Map();
  for (const d of initialElements(slide)) {
    const e = {
      type: d.type,
      props: clone(d.props ?? {}),
      visible: true,
      collapse: d.collapse === true,
      enter: d.enter,
      exit: d.exit,
    };
    if (d.region !== undefined) e.region = d.region;
    if (d.box !== undefined) e.box = clone(d.box);
    state.set(d.id, e);
  }

  for (let i = 0; i <= index; i++) {
    const where = `slide '${slide.id}' step '${steps[i]?.id ?? i}'`;
    applyPatch(state, sugar[i], where);
    if (steps[i]) applyPatch(state, steps[i], where);
  }

  const step = steps[index] ?? {};
  for (const [id, p] of Object.entries(step.only ?? {})) {
    const s = state.get(id);
    if (!s) throw new Error(`unknown element '${id}' in slide '${slide.id}' step '${step.id ?? index}'`);
    s.props = mergePatch(s.props, p);
  }

  // A replace on the title drops its props: the accent default comes back, so every step reads the same way.
  const title = state.get("title");
  if (title && accentTitle("title", title.type)) title.props = withAccent(title.props);

  const titleText = title?.props?.text;
  return {
    elements: Object.fromEntries(state),
    title: typeof titleText === "string" ? titleText : "",
    notes: step.notes ?? slide.notes ?? "",
    transition: clone(step.transition ?? null),
  };
}
