// Pure fold engine: slide definition + step index -> resolved state.
// No imports, no DOM, no I/O. Runs in Node and in the browser.
//
// Patch shape (one per step; sugar expands to the same shape):
//   { set: {id: mergePatch}, replace: {id: props}, show: [id], hide: [id],
//     only: {id: mergePatch}, notes: string, transition: {stagger, duration} }
// Inside one patch the operations apply in this order: replace, set, show, hide.
// The `advance` sugar expands to one more operation, `assign: {id: {prop: value}}`, which only expandSugar writes:
// props[prop] = value, whole (an object value is not merged and null is a value). It applies before `set`.
// `only` is not part of the fold; it is applied on top of the folded state at its own step.

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const clone = (v) => (v === undefined ? v : structuredClone(v));

/** RFC 7396 JSON merge patch. Returns a new value; never mutates or aliases its inputs. */
export function mergePatch(target, patch) {
  if (!isObject(patch)) return clone(patch);
  return mergeInto(isObject(target) ? clone(target) : {}, patch);
}

/** Merges `patch` (an object) into `out`, which the caller owns and gets back; values from the patch are cloned. */
function mergeInto(out, patch) {
  for (const [key, value] of Object.entries(patch)) {
    if (key === "__proto__") continue;
    if (value === null) delete out[key];
    else if (isObject(value)) out[key] = mergeInto(isObject(out[key]) ? out[key] : {}, value);
    else out[key] = clone(value);
  }
  return out;
}

/** mergePatch for props the fold owns (already a private copy): merges in place instead of cloning them again. */
const patchOwn = (props, patch) => (isObject(patch) ? mergeInto(isObject(props) ? props : {}, patch) : clone(patch));

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

/** Whether an element is a title whose `*phrase*` is an accent: a text element with the
 * reserved id `title`. It defaults to `accent: true`; props that set `accent` (e.g. false) keep their value. */
const accentTitle = (id, type) => id === "title" && type === "text";
const withAccent = (props) => (isObject(props) && props.accent === undefined ? { ...props, accent: true } : props);
/** The same for the message line: a text element with the reserved id `lede` defaults to `role: "lede"`. */
const roleLede = (id, type) => id === "lede" && type === "text";
const withRole = (props) => (isObject(props) && props.role === undefined ? { ...props, role: "lede" } : props);

/**
 * The slide's element definitions in order, with sugar expanded (never mutating the slide):
 *   - `section: "x"` becomes the element with the reserved id `kicker` (type text, region "title", props { text }),
 *     first, unless the slide defines a `kicker` itself (validate reports that as reserved-id). Layout-free: a
 *     layout without a title region drops it (core/layout.js placedSlide);
 *   - `title: "x"` becomes the element with the reserved id `title` (region "title", props { text, accent: true })
 *     unless the slide defines one itself;
 *   - an explicit text element with id `title` gets `accent: true` unless its props set `accent`;
 *   - `lede: "x"` becomes the element with the reserved id `lede` (region "title", props { text, role: "lede" }),
 *     right after the title (or first without one), unless the slide defines one itself; an explicit text
 *     element with id `lede` gets `role: "lede"` unless its props set `role`.
 */
export function initialElements(slide) {
  const defs = (slide.elements ?? []).map((d) => {
    if (d && accentTitle(d.id, d.type) && withAccent(d.props) !== d.props) return { ...d, props: withAccent(d.props) };
    if (d && roleLede(d.id, d.type) && withRole(d.props) !== d.props) return { ...d, props: withRole(d.props) };
    return d;
  });
  if (typeof slide.title === "string" && !defs.some((d) => d.id === "title")) {
    defs.unshift({ id: "title", type: "text", region: "title", props: { text: slide.title, accent: true } });
  }
  if (typeof slide.lede === "string" && !defs.some((d) => d.id === "lede")) {
    defs.splice(defs.findIndex((d) => d.id === "title") + 1, 0, { id: "lede", type: "text", region: "title", props: { text: slide.lede, role: "lede" } });
  }
  if (typeof slide.section === "string" && slide.section !== "" && !defs.some((d) => d.id === "kicker")) {
    defs.unshift({ id: "kicker", type: "text", region: "title", props: { text: slide.section } });
  }
  return defs;
}

/**
 * Expands `from`, `at` and `advance` into one patch per step index (`advance` as `assign`, see the header).
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
        ((patches[first + j].assign ??= {})[el.id] ??= {})[prop] = clone(values[j]);
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
  for (const [id, values] of Object.entries(patch.assign ?? {})) {
    const s = need(id);
    if (!isObject(s.props)) s.props = {};
    for (const [prop, value] of Object.entries(values)) if (prop !== "__proto__") s.props[prop] = clone(value);
  }
  for (const [id, p] of Object.entries(patch.set ?? {})) {
    const s = need(id);
    s.props = patchOwn(s.props, p);
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
      ghost: d.ghost,
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
    s.props = patchOwn(s.props, p);
  }

  // A replace on the title (or the lede) drops its props: the accent (role) default comes back, so every step
  // reads the same way.
  const title = state.get("title");
  if (title && accentTitle("title", title.type)) title.props = withAccent(title.props);
  const lede = state.get("lede");
  if (lede && roleLede("lede", lede.type)) lede.props = withRole(lede.props);

  const titleText = title?.props?.text;
  return {
    elements: Object.fromEntries(state),
    title: typeof titleText === "string" ? titleText : "",
    notes: step.notes ?? slide.notes ?? "",
    transition: clone(step.transition ?? null),
  };
}
