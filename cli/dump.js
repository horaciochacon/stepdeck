// `stepdeck dump` (spec §10): per step, every element's visibility, type, box (canvas pixels), text
// and resolved props, plus the ids that changed since the previous step. For agents without vision
// and for cheap diffs.
//
// dump(deckDir, { slide?, step?, size?, theme? }) -> Promise<Array<StepDump>>
//   StepDump = { slide, step, stepId, elements: ElementDump[], changed: string[], errors: string[] }
//   ElementDump = { id, type, visible, ghost?, text, box: { x, y, w, h }, canvas?, props }
//   step     index (number); stepId the step's id (its index as a string when it has none)
//   visible  measured on the page (computed visibility/display), not read from the spec
//   ghost    only while the element's ghost placeholder is on screen (the element is hidden): its label, or
//            true for a ghost without one. Measured on the page too.
//   text     the element's text nodes, each whitespace-collapsed, joined by one space (an accent title: its
//            plain string, without the phrase marks; plainAccentText). A ghost's label is not part of it.
//   box      relative to the canvas, in canvas pixels (1920×1080, whatever the viewport), rounded
//            to 1 px; a collapsed element is { 0, 0, 0, 0 }
//   canvas   one object per canvas.sd-canvas-layer in the element, in DOM order: its data-* attributes, named
//            without the prefix (a fan: draws, until, seed, signature). It is what the draw fan has painted,
//            so a dump and `check --played` compare the canvas state without reading pixels. Omitted when the
//            element has no canvas layer. Measured on the page.
//   props    the resolved props (bindings applied) from STEPDECK.state()
//   changed  ids whose resolved props or visibility differ from the previous step; at step 0 every id
//   errors   STEPDECK.errors plus console/page errors seen while showing that step
// theme: show the deck under another shipped theme (the page's ?theme=), for any session of withDeck.
// Without `slide`, every slide; without `step`, every step. Each step is measured on a fresh page load
// of the bare shell (`?slide=&step=&capture`), so a dump is always a true jump: mounted from scratch,
// one update, no history. One browser per call; the page is reused across loads.
//
// formatDump(dumps) -> text, one block per step:
//   trend · step 1 (regimens)
//     visible  chart  chart.line  60,180 1240×700  "0 100 200 …"  canvas draws=20 seed=1 signature=1a2b3c4d
//     hidden   next   text        980,300 840×600  ghost "2 · Result"  "…"
//     changed: chart
import { withPage, deckTarget, withTimeout, describePageUrl, PAGE_TIMEOUT_MS } from "./browser.js";
import { assertTheme, OPTIONAL_THEME_CSS } from "./engine.js";
import { CANVAS } from "#engine/core/constants.js";
import { stripAccent } from "#engine/core/accent.js";

export const CANVAS_W = CANVAS.w;

/** Deep equality for JSON values (key order ignored). */
export function jsonEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => Object.hasOwn(b, k) && jsonEqual(a[k], b[k]));
}

/**
 * Serves the deck (ruling R15 via deckTarget), launches one browser and runs fn with a session:
 *   { slides, steps, page, open(slide, index, query) -> Promise<void>,
 *     measure() -> Promise<measurement>, goTo(slide, index) -> Promise<void>, flags() -> Promise<object> }
 * `query` is { capture?: true, motion?: "full" }. `theme` (optional) is added to every load as ?theme=, so the
 * whole session runs under that theme instead of the deck's own; a name that is not a theme of the engine the
 * deck loads (engine.js findTheme) throws before the browser starts. Throws for a deck that does not load or an
 * unknown --slide.
 * measure() adds what the page reported since the previous open() or measure():
 *   errors        STEPDECK.errors plus console/page errors (what `dump` shows)
 *   renderErrors  STEPDECK.errors alone
 *   pageErrors    console errors and page errors ("console: …", "pageerror: …")
 *   failed        failed requests ("404 <url>", "failed <url> (reason)")
 */
export async function withDeck(deckDir, { size, slide, theme } = {}, fn) {
  if (theme !== undefined) assertTheme(deckDir, theme); // before the browser starts (and before shoot writes anything)
  const target = deckTarget(deckDir);
  return withPage({ root: target.root, size }, async (page, ctx) => {
    let mark = 0;
    let failedMark = 0;
    const open = async (s, index, { capture = false, ...query } = {}) => {
      mark = ctx.errors.length;
      failedMark = ctx.failed.length;
      await ctx.open(target.url({ slide: s, step: index, capture, query: theme ? { ...query, theme } : query }));
    };
    await open(slide, undefined, { capture: true });
    const { slides, steps, errors } = await page.evaluate(() => ({
      slides: [...window.STEPDECK.slides],
      steps: window.STEPDECK.steps,
      errors: window.STEPDECK.errors,
    }));
    if (slides.length === 0) throw new Error(`deck did not load: ${[...errors, ...ctx.errors].join("; ") || "no slides"}`);
    if (slide !== undefined && !slides.includes(slide)) {
      throw new Error(`unknown slide '${slide}' (slides: ${slides.join(", ")})`);
    }
    const session = {
      slides,
      steps,
      page,
      open,
      measure: async () => {
        const m = plainAccentText(await page.evaluate(measureInPage, [CANVAS_W, BARE_CANVAS]));
        m.renderErrors = m.errors;
        // A missing optional theme.css is no error (the runtime treats it as absent). When it was the only failed
        // request, Chrome's URL-less "Failed to load resource" console line is its echo and goes too.
        const failed = ctx.failed.slice(failedMark);
        m.failed = failed.filter((line) => !OPTIONAL_THEME_CSS.test(line));
        const onlyOptional = failed.length > 0 && m.failed.length === 0;
        m.pageErrors = ctx.errors.slice(mark).filter((line) => !(onlyOptional && /^console: Failed to load resource\b/.test(line)));
        m.errors = [...m.renderErrors, ...m.pageErrors];
        mark = ctx.errors.length;
        failedMark = ctx.failed.length;
        return m;
      },
      goTo: async (s, index) => {
        const moved = page.evaluate(async ([sl, i]) => {
          await window.STEPDECK.goTo(sl, i);
          await document.fonts.ready;
          await window.STEPDECK.settled();
        }, [s, index]);
        try {
          await withTimeout(moved, PAGE_TIMEOUT_MS, `waiting for goTo('${s}', ${index}) to settle`);
          await ctx.quiet();
        } catch (error) {
          throw new Error(`deck did not settle at ${describePageUrl(page.url())}: ${error.message.split("\n")[0]}`, { cause: error });
        }
      },
      flags: () => page.evaluate(() => ({ ...window.STEPDECK.flags })),
    };
    return fn(session);
  });
}

export const BARE_CANVAS = ".sd-stage .sd-canvas";

/**
 * Runs in the page (page.evaluate(measureInPage, [canvasWidth, selector])): the state on screen,
 * measured on the canvas `selector` matches (the bare shell's by default; the reveal shell's is
 * ".reveal .slides > section.present .sd-canvas").
 */
export function measureInPage([canvasWidth, selector = ".sd-stage .sd-canvas"]) {
  const sd = window.STEPDECK;
  const st = sd.state();
  const canvas = document.querySelector(selector);
  const c = canvas?.getBoundingClientRect();
  // Screen pixels to canvas pixels, rounded to 1 px. Chrome lays the canvas out in 1/64 px units, but a scaled shell
  // reports boxes in single precision: a box at exactly 433.5 reads 433.49998 at one scale and 433.50004 at another.
  // Snapping to 1/64 px first removes that noise, so every shell rounds a half pixel alike (unscaled, it changes nothing).
  const k = c && c.width > 0 ? canvasWidth / c.width : 1;
  const toCanvas = (v) => Math.round(Math.round(v * k * 64) / 64);
  const elements = [];
  for (const [id, e] of Object.entries(st?.elements ?? {})) {
    const node = canvas?.querySelector(`.sd-el[data-el="${CSS.escape(id)}"]`);
    let visible = false;
    let box = { x: 0, y: 0, w: 0, h: 0 };
    let text = "";
    let ghost;
    let canvasLayers = [];
    if (node) {
      const cs = getComputedStyle(node);
      visible = cs.visibility !== "hidden" && cs.display !== "none";
      if (cs.display !== "none") {
        const r = node.getBoundingClientRect();
        box = { x: toCanvas(r.left - c.left), y: toCanvas(r.top - c.top), w: toCanvas(r.width), h: toCanvas(r.height) };
      }
      // The ghost placeholder (core/layout.js), when it is on screen: its label, or true without one.
      const g = node.querySelector(":scope > .sd-ghost");
      if (g && getComputedStyle(g).display !== "none") ghost = g.querySelector(".sd-ghost-label")?.textContent ?? true;
      // Text nodes joined by one space, so "0" and "10,000" in separate tick labels stay apart. The ghost's label
      // is not the element's text.
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
      const parts = [];
      for (let t = walker.nextNode(); t; t = walker.nextNode()) {
        if (g?.contains(t)) continue;
        const v = t.nodeValue.replace(/\s+/g, " ").trim();
        if (v) parts.push(v);
      }
      text = parts.join(" ");
      // Each canvas layer's data-* attributes, without the prefix: the state its owner painted (core/chart-marks.js).
      canvasLayers = [...node.querySelectorAll("canvas.sd-canvas-layer")].map((cv) =>
        Object.fromEntries([...cv.attributes].filter((a) => a.name.startsWith("data-")).map((a) => [a.name.slice(5), a.value])),
      );
    }
    elements.push({
      id,
      type: e.type,
      visible,
      ...(ghost === undefined ? {} : { ghost }),
      text,
      box,
      ...(canvasLayers.length ? { canvas: canvasLayers } : {}),
      props: e.props,
    });
  }
  return {
    slide: st?.slide ?? null,
    step: st?.step ?? null,
    stepId: st ? String(st.stepId) : null,
    elements,
    errors: [...sd.errors],
  };
}

/**
 * An accent title's text (a text element with accent: true, default-theme spec §5.4) is its plain string,
 * stripAccent(props.text), not the text nodes joined by spaces: the phrase is its own node, so the walk would read
 * "at *50 mg*, then" as "at 50 mg , then". Elements that show nothing (or an error) keep what was measured.
 */
export function plainAccentText(m) {
  for (const e of m.elements) {
    if (e.text === "" || e.type !== "text" || e.props?.accent !== true || typeof e.props.text !== "string") continue;
    const plain = stripAccent(e.props.text).replace(/\s+/g, " ").trim();
    // Only when the page shows that text (a failed element shows its error message instead).
    if (plain.replace(/\s+/g, "") === e.text.replace(/\s+/g, "")) e.text = plain;
  }
  return m;
}

/** Resolves a --step value (id, or digits for an index) against a slide's step ids. */
export function resolveStep(ids, ref, slide) {
  if (ref === undefined || ref === null) return null;
  const s = String(ref);
  if (/^\d+$/.test(s) && Number(s) < ids.length) return Number(s);
  const i = ids.indexOf(s);
  if (i === -1) throw new Error(`unknown step '${s}' in slide '${slide}' (steps: ${ids.join(", ")})`);
  return i;
}

/** Throws "--step needs --slide" when a step is given without its slide. */
export function assertStepScope({ slide, step }) {
  if (step !== undefined && slide === undefined) throw new Error("--step needs --slide");
}

/**
 * What a per-step command visits: [{ id, ids, only }] per slide (`slide`, else every slide), with the
 * slide's step ids and the index of `step` among them (null: every step). Throws on an unknown step.
 */
export function slidePlan(session, slide, step) {
  return (slide !== undefined ? [slide] : session.slides).map((id) => {
    const ids = session.steps[id];
    return { id, ids, only: resolveStep(ids, step, id) };
  });
}

/** Ids whose props or visibility differ between two measurements of the same slide. */
export function changedIds(prev, next) {
  if (!prev) return next.elements.map((e) => e.id);
  const before = new Map(prev.elements.map((e) => [e.id, e]));
  return next.elements
    .filter((e) => {
      const p = before.get(e.id);
      return !p || p.visible !== e.visible || !jsonEqual(p.props, e.props);
    })
    .map((e) => e.id);
}

export async function dump(deckDir, { slide, step, size, theme } = {}) {
  assertStepScope({ slide, step });
  return withDeck(deckDir, { size, slide, theme }, async (session) => {
    const out = [];
    for (const { id, ids, only } of slidePlan(session, slide, step)) {
      // A single step also measures its predecessor, for `changed`.
      const indexes = only === null ? ids.map((_, i) => i) : [only - 1, only].filter((i) => i >= 0);
      let prev = null;
      for (const i of indexes) {
        await session.open(id, i, { capture: true });
        const m = await session.measure();
        const entry = { slide: id, step: i, stepId: ids[i], elements: m.elements, changed: changedIds(prev, m), errors: m.errors };
        prev = m;
        if (only === null || i === only) out.push(entry);
      }
    }
    return out;
  });
}

const excerpt = (text, n = 48) => (text.length > n ? `${text.slice(0, n - 1)}…` : text);

export function formatDump(dumps) {
  const blocks = dumps.map((d) => {
    const idW = Math.max(...d.elements.map((e) => e.id.length), 2);
    const typeW = Math.max(...d.elements.map((e) => String(e.type).length), 4);
    const lines = [`${d.slide} · step ${d.step} (${d.stepId})`];
    for (const e of d.elements) {
      const b = e.box;
      const parts = [
        (e.visible ? "visible" : "hidden").padEnd(7),
        e.id.padEnd(idW),
        String(e.type).padEnd(typeW),
        `${b.x},${b.y} ${b.w}×${b.h}`.padEnd(20),
      ];
      if (e.ghost !== undefined) parts.push(e.ghost === true ? "ghost" : `ghost ${JSON.stringify(excerpt(String(e.ghost)))}`);
      if (e.text) parts.push(JSON.stringify(excerpt(e.text)));
      // One `canvas k=v …` group per layer; an empty value (a fan without `until`) is left out.
      for (const layer of e.canvas ?? []) {
        const pairs = Object.entries(layer).filter(([, v]) => v !== "");
        parts.push(["canvas", ...pairs.map(([k, v]) => `${k}=${v}`)].join(" "));
      }
      lines.push(`  ${parts.join("  ").trimEnd()}`);
    }
    for (const err of d.errors) lines.push(`  error: ${err}`);
    lines.push(`  changed: ${d.changed.length ? d.changed.join(", ") : "(none)"}`);
    return lines.join("\n");
  });
  return `${blocks.join("\n\n")}\n`;
}
