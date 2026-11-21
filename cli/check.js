// `stepdeck check` (spec §10): layout rules per step, and with `--played` the played-vs-jumped comparison.
//
// check(deckDir, { slide?, step?, played?, size? })    -> Promise<Problem[]>
// runCheck(deckDir, { slide?, step?, played?, size? }) -> Promise<{ problems, slides, steps, played }>
//   step (id or index, needs slide): only that step is measured; step0-shows-all is skipped; with
//   played, only the arrivals at that step (from the step before, animated, and from the step after).
//   One browser for the whole run. Problems come in this order: page errors, layout rules,
//   step0-shows-all, then (with `played`) played-mismatch.
//   slides, steps  how many slides and steps the layout pass measured
//   played         runPlayed's per-slide counts, or null without `played`
//
// Layout pass. Every step is a fresh load of the bare shell in capture mode (`?slide=&step=&capture`),
// measured after document.fonts.ready and settled(), at 1920×1080 unless `size` says otherwise. All
// geometry is in canvas pixels. "Text" means text nodes (Range rects, one per line fragment), SVG
// <text> included, attributed to their top-level element (text a custom component mounts through
// ctx.mount belongs to that component). Text is skipped when nobody can see it: whitespace only,
// visibility not `visible`, a cumulative opacity of 0, or nothing left after clipping by the
// overflow of its ancestors up to its element. The engine's own error boxes (.sd-error) are not
// audience text and are skipped too; the error itself is reported as render-error.
//   text-outside-canvas  text past the 1920×1080 canvas
//   text-outside-region  text of an element placed in a region (not `box`) past the region's content
//                        box. Glyphs may overhang their line box by the half-leading (a tall font
//                        with a tight line-height), so that overhang and 1 px are allowed.
//   text-overlap         text of two different elements intersecting by more than 4 px in both
//                        axes. Box-positioned elements are not exempt: there is no opt-out.
//   font-too-small       visible text whose computed font size (canvas pixels; SVG text scaled by its
//                        viewBox) is under the theme's --sd-min-audience-font (an alias of
//                        --min-audience-font in the theme; read first, then --min-audience-font,
//                        28px by default). Exempt: the footer frame, i.e. elements with
//                        props.role "source" (or text inside .sd-role-source) and every element
//                        in the layout's `footer` region.
//   contrast             text color against its resolved background under 4.5:1. The background is
//                        found by walking up from the text to the first opaque background, blending
//                        any translucent ones on the way, falling back to the canvas background
//                        (then white). The text color (`fill` for SVG text; skipped when it is
//                        none or a paint server) is blended with its alpha and cumulative opacity.
//                        Backgrounds that are not ancestors (an SVG rect under a label, an image)
//                        are not seen.
//   step0-shows-all      a slide with more than one step whose step 0 shows the same content as
//                        its last step: same visible set, text and resolved props (ruling R10).
//                        Slides driven by `advance` change props, so they do not trip it.
//   A layout problem is reported once per slide, element and rule (per pair for overlaps), at
//   its first step, with "(+N more steps)" when it persists.
//
// Page errors, in the layout and the played pass alike, once per slide, step and message:
//   render-error   STEPDECK.errors (boot, slide and element errors the runtime caught)
//   console-error  console.error calls and uncaught page errors. Chrome's own "Failed to load
//                  resource" console lines are left to network-error.
//   network-error  a request that failed or answered HTTP 400 or more. A 404 for a theme's
//                  themes/<name>/theme.css is not one: that file is optional (default-theme spec §5.1).
//
// runPlayed(deckDir, { slide?, size? })   -> Promise<{ problems, slides: { [id]: { jumped, fromPrev, fromNext } } }>
// checkPlayed(deckDir, { slide?, size? }) -> Promise<Problem[]>
//   For every step k of every slide (or of `slide`), three dumps of k are compared:
//     jumped    a fresh page load at k: mount, one update, no history (the same measurement as `dump`)
//     fromPrev  arriving at k from k−1 with animation (STEPDECK.goTo, motion on, forward by one)
//     fromNext  arriving at k from k+1
//   Compared per element: visibility, text content, the box rounded to 1 px (canvas pixels) and the state
//   of its canvas layers (`canvas` in the dump: their data-* attributes, so the draw fan's draws, seed
//   and signature are compared without reading pixels).
//   Paths, cheapest true version of each: page loads at k with `?motion=full` (no capture, so
//   animation runs) record jumped(k); goTo(k+1) records fromPrev(k+1); goTo(k) back records
//   fromNext(k). That is one page load per step. The run fails loudly if the page reports that
//   animation is off, so the animated path can never silently degrade into a jump.
//   All three use the same page flags; only the path differs.
//   played-mismatch  one per slide and element: the first step (in step order, from-previous before
//                    from-next) whose arrival differs from the jump, with the number of other
//                    differing arrivals. A component that is not idempotent usually differs on every
//                    arrival; one line per element is enough to point at it.
//   Page errors are reported as above: the comparison cannot be trusted while the slide is failing.
import { withDeck, jsonEqual, slidePlan, assertStepScope, CANVAS_W, BARE_CANVAS } from "./dump.js";
import { OPTIONAL_THEME_CSS } from "./engine.js";
import { problem } from "./problems.js";
import { CANVAS } from "#engine/core/constants.js";
import { luminance as relativeLuminance, contrast as ratio } from "#engine/core/color.js";

const CANVAS_H = CANVAS.h;
const OVERLAP_PX = 4;
const EDGE_PX = 1;
/** The text contrast `check` requires (WCAG AA for normal text). */
export const MIN_CONTRAST = 4.5;

// ---------------------------------------------------------------------------------------------
// Page errors

const ERROR_FIX = {
  "render-error": "fix the error shown on the slide, then run check again",
  "console-error": "fix the script error logged by the page (a component or the deck's own code)",
  "network-error": "fix the path or add the missing file; every path is relative and same-origin",
};


/** Page errors of one measurement as [{ rule, line }]. */
export function classifyErrors(m) {
  const out = [];
  for (const line of m.renderErrors ?? []) out.push({ rule: "render-error", line });
  for (const line of m.pageErrors ?? []) {
    if (/^console: Failed to load resource\b/.test(line)) continue; // reported as network-error
    out.push({ rule: "console-error", line });
  }
  for (const line of m.failed ?? []) {
    if (OPTIONAL_THEME_CSS.test(line)) continue; // a theme without theme.css: the runtime treats it as absent
    out.push({ rule: "network-error", line });
  }
  return out;
}

function errorCollector() {
  const seen = new Map();
  return {
    note(slide, stepId, m) {
      for (const { rule, line } of classifyErrors(m)) {
        const key = `${slide}\n${stepId}\n${rule}\n${line}`;
        if (!seen.has(key)) seen.set(key, problem({ slide, step: stepId, rule, measured: line, limit: "no errors", fix: ERROR_FIX[rule] }));
      }
    },
    problems: () => [...seen.values()],
  };
}

// ---------------------------------------------------------------------------------------------
// Played pass

const FIX =
  "make update() idempotent: render the whole state from props (never from prev or earlier calls) and leave no animation residue when it ends or is aborted";

const short = (v, n = 60) => {
  const s = JSON.stringify(v) ?? "undefined";
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
};
const canvasText = (c) => (c ? short(c) : "none");
const boxText = (b) => (b ? `${b.x},${b.y} ${b.w}×${b.h}` : "none");

/** Keeps the first finding per key (make() builds it, with more: 0) and counts the repeats in `more`. */
function tally(map, key, make) {
  const seen = map.get(key);
  if (seen) seen.more += 1;
  else map.set(key, { ...make(), more: 0 });
}

/** The first difference between an element's jumped and arrived measurements, or null. */
function difference(jumped, arrived) {
  if (!jumped || !arrived) return { field: "presence", measured: arrived ? "present" : "missing", limit: jumped ? "present" : "missing" };
  if (jumped.visible !== arrived.visible) {
    const v = (x) => (x ? "visible" : "hidden");
    return { field: "visibility", measured: v(arrived.visible), limit: v(jumped.visible) };
  }
  if (jumped.text !== arrived.text) return { field: "text", measured: short(arrived.text), limit: short(jumped.text) };
  const a = arrived.box;
  const j = jumped.box;
  if (a.x !== j.x || a.y !== j.y || a.w !== j.w || a.h !== j.h) return { field: "box", measured: boxText(a), limit: boxText(j) };
  if (!jsonEqual(jumped.canvas, arrived.canvas)) return { field: "canvas", measured: canvasText(arrived.canvas), limit: canvasText(jumped.canvas) };
  return null;
}

function compare(slide, stepId, jumped, arrived, from, animated, found) {
  const byId = new Map(jumped.elements.map((e) => [e.id, e]));
  const ids = [...new Set([...jumped.elements.map((e) => e.id), ...arrived.elements.map((e) => e.id)])];
  const other = new Map(arrived.elements.map((e) => [e.id, e]));
  for (const id of ids) {
    const d = difference(byId.get(id), other.get(id));
    if (d) tally(found, `${slide}\n${id}`, () => ({ slide, element: id, step: stepId, from, animated, ...d }));
  }
}

/** Throws when the page will not animate a forward step: the played pass would silently test a jump. */
async function animateOn(session) {
  const flags = await session.flags();
  if (flags.animate !== true) {
    throw new Error(`animation is off on the page (flags ${JSON.stringify(flags)}); check --played cannot test the animated path`);
  }
}

/** The played pass on an open session (see withDeck), over a slidePlan. */
async function playedPass(session, plan, errors) {
  const slides = {};
  const found = new Map();
  for (const { id, ids, only } of plan) {
    const n = ids.length;
    const jumped = [];
    const fromPrev = [];
    const fromNext = [];
    /** Measures the page as step k and notes its errors. */
    const take = async (k) => {
      const m = await session.measure();
      errors.note(id, ids[k], m);
      return m;
    };
    // With --step k, only arrivals at k are compared: from k−1 (animated) and from k+1.
    if (only !== null) {
      const k = only;
      await session.open(id, k, { motion: "full" });
      jumped[k] = await take(k);
      if (k + 1 < n) {
        await animateOn(session);
        await session.goTo(id, k + 1);
        await take(k + 1);
        await session.goTo(id, k);
        fromNext[k] = await take(k);
      }
      if (k > 0) {
        await session.open(id, k - 1, { motion: "full" });
        await animateOn(session);
        await session.goTo(id, k);
        fromPrev[k] = await take(k);
      }
    }
    for (let k = 0; only === null && k < n; k++) {
      await session.open(id, k, { motion: "full" });
      jumped[k] = await take(k);
      if (k + 1 >= n) continue;
      await animateOn(session);
      await session.goTo(id, k + 1);
      fromPrev[k + 1] = await take(k + 1);
      await session.goTo(id, k);
      fromNext[k] = await take(k);
    }
    for (let k = 0; k < n; k++) {
      if (fromPrev[k]) compare(id, ids[k], jumped[k], fromPrev[k], ids[k - 1], true, found);
      if (fromNext[k]) compare(id, ids[k], jumped[k], fromNext[k], ids[k + 1], false, found);
    }
    slides[id] = {
      jumped: jumped.filter(Boolean).length,
      fromPrev: fromPrev.filter(Boolean).length,
      fromNext: fromNext.filter(Boolean).length,
    };
  }

  const problems = [];
  for (const f of found.values()) {
    const how = `arriving from '${f.from}'${f.animated ? " (animated)" : ""}`;
    const more = f.more ? ` (+${f.more} more differing arrival${f.more === 1 ? "" : "s"})` : "";
    problems.push(
      problem({
        slide: f.slide,
        element: f.element,
        step: f.step,
        rule: "played-mismatch",
        measured: `${f.field} ${f.measured} ${how}${more}`,
        limit: `${f.limit} when jumped to`,
        fix: FIX,
      }),
    );
  }
  return { problems, slides };
}

export async function runPlayed(deckDir, { slide, size, theme } = {}) {
  return withDeck(deckDir, { size, slide, theme }, async (session) => {
    const errors = errorCollector();
    const { problems, slides } = await playedPass(session, slidePlan(session, slide), errors);
    return { problems: [...errors.problems(), ...problems], slides };
  });
}

export async function checkPlayed(deckDir, opts = {}) {
  return (await runPlayed(deckDir, opts)).problems;
}

// ---------------------------------------------------------------------------------------------
// Layout pass: measurement in the page

/**
 * Runs in the page (page.evaluate(textLayoutInPage, [canvasWidth, selector])). For every element of
 * the slide on screen, the visible text it owns:
 *   { minFont, canvas: { w, h }, elements: [{ id, region, box, regionRect, items: [TextItem] }] }
 *   region      the region name, or null for a box-positioned element
 *   regionRect  the region's content box (canvas pixels), or null
 *   TextItem    { text, rects: [{ x, y, w, h }], slack, fontSize, source, fg: [r,g,b,a] | null, bg: [r,g,b] }
 *     rects     line fragments clipped by ancestor overflow, canvas pixels
 *     slack     how far the glyphs may overhang their line box vertically (half-leading), px
 *     source    text inside .sd-role-source (a nested `text` with role source)
 *     fg        the text color with its alpha times the cumulative opacity; null when not a color
 *     bg        the resolved, opaque background behind it
 */
export function textLayoutInPage([canvasWidth, selector]) {
  const canvas = document.querySelector(selector);
  const st = window.STEPDECK.state();
  const c = canvas.getBoundingClientRect();
  const scale = c.width > 0 ? c.width / canvasWidth : 1;
  const toCanvas = (r) => ({ x: (r.left - c.left) / scale, y: (r.top - c.top) / scale, w: r.width / scale, h: r.height / scale });

  // Colors: computed styles are rgb()/rgba() for the theme's hex values; anything else (color(),
  // oklch(), a keyword) is normalized through a 2D context, which answers #rrggbb or rgba().
  const ctx2d = document.createElement("canvas").getContext("2d");
  const parseColor = (value) => {
    if (!value || value === "none" || value.startsWith("url(")) return null;
    let m = /^rgba?\(([^)]+)\)$/.exec(value.trim());
    if (!m) {
      ctx2d.fillStyle = "#010203";
      ctx2d.fillStyle = value;
      const v = ctx2d.fillStyle;
      if (v === "#010203" && value.trim() !== "#010203") return null;
      if (v.startsWith("#")) return [1, 3, 5].map((i) => parseInt(v.slice(i, i + 2), 16)).concat(1);
      m = /^rgba?\(([^)]+)\)$/.exec(v);
      if (!m) return null;
    }
    const parts = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return [parts[0], parts[1], parts[2], parts.length > 3 ? parts[3] : 1];
  };
  const over = (top, bottom) => {
    const a = top[3];
    return [0, 1, 2].map((i) => top[i] * a + bottom[i] * (1 - a)).concat(1);
  };
  const canvasBg = (() => {
    const v = parseColor(getComputedStyle(canvas).backgroundColor);
    return v && v[3] > 0 ? over(v, [255, 255, 255, 1]) : [255, 255, 255, 1];
  })();
  // Per node: many text nodes share a parent, and its background and clipping ancestors are the same.
  const memo = (fn) => {
    const seen = new Map();
    return (n, ...rest) => {
      if (!seen.has(n)) seen.set(n, fn(n, ...rest));
      return seen.get(n);
    };
  };
  const backgroundOf = memo((from) => {
    const layers = [];
    for (let n = from; n && n !== canvas.parentElement; n = n.parentElement) {
      const v = parseColor(getComputedStyle(n).backgroundColor);
      if (v && v[3] > 0) {
        layers.push(v);
        if (v[3] >= 1) break;
      }
      if (n === canvas) break;
    }
    let bg = layers.length && layers[layers.length - 1][3] >= 1 ? [] : canvasBg;
    for (let i = layers.length - 1; i >= 0; i--) bg = bg.length ? over(layers[i], bg) : layers[i];
    return bg.slice(0, 3);
  });
  /** The ancestors of `parent` that clip their overflow, up to and including the element's box `node`. */
  const clipsOf = memo((parent, node) => {
    const clips = [];
    for (let n = parent; n; n = n.parentElement) {
      const o = getComputedStyle(n);
      const clipX = o.overflowX !== "visible";
      const clipY = o.overflowY !== "visible";
      if (clipX || clipY) clips.push({ b: toCanvas(n.getBoundingClientRect()), clipX, clipY });
      if (n === node) break;
    }
    return clips;
  });

  const tokens = getComputedStyle(canvas);
  const minFont =
    parseFloat(tokens.getPropertyValue("--sd-min-audience-font")) || parseFloat(tokens.getPropertyValue("--min-audience-font")) || 28;

  const contentBox = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const p = (k) => parseFloat(cs[k]) || 0;
    const b = toCanvas(r);
    const l = (p("paddingLeft") + p("borderLeftWidth"));
    const t = (p("paddingTop") + p("borderTopWidth"));
    return {
      x: b.x + l,
      y: b.y + t,
      w: b.w - l - p("paddingRight") - p("borderRightWidth"),
      h: b.h - t - p("paddingBottom") - p("borderBottomWidth"),
    };
  };
  const intersect = (a, b) => {
    const x = Math.max(a.x, b.x);
    const y = Math.max(a.y, b.y);
    return { x, y, w: Math.min(a.x + a.w, b.x + b.w) - x, h: Math.min(a.y + a.h, b.y + b.h) - y };
  };

  const elements = [];
  for (const id of Object.keys(st?.elements ?? {})) {
    const node = canvas.querySelector(`.sd-el[data-el="${CSS.escape(id)}"]`);
    if (!node) continue;
    const isBox = node.hasAttribute("data-box");
    const regionEl = isBox ? null : node.closest(".sd-region");
    const items = [];
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      const text = t.nodeValue.replace(/\s+/g, " ").trim();
      const parent = t.parentElement;
      if (!text || !parent || parent.closest(".sd-error")) continue;
      if (parent instanceof SVGElement && ["style", "script", "title", "desc"].includes(parent.localName)) continue;
      const cs = getComputedStyle(parent);
      if (cs.visibility !== "visible" || cs.display === "none") continue;
      let opacity = 1;
      for (let n = parent; n && n !== canvas; n = n.parentElement) opacity *= Number(getComputedStyle(n).opacity);
      if (opacity <= 0) continue;

      const range = document.createRange();
      range.selectNodeContents(t);
      let rects = [...range.getClientRects()].map(toCanvas);
      if (rects.length === 0 && parent instanceof SVGGraphicsElement) rects = [toCanvas(parent.getBoundingClientRect())];
      // Clip by every ancestor that clips its overflow, up to and including the element's own box.
      for (const { b, clipX, clipY } of clipsOf(parent, node)) {
        rects = rects.map((r) => {
          const i = intersect(r, b);
          return { x: clipX ? i.x : r.x, w: clipX ? i.w : r.w, y: clipY ? i.y : r.y, h: clipY ? i.h : r.h };
        });
      }
      rects = rects.filter((r) => r.w > 0.5 && r.h > 0.5);
      if (rects.length === 0) continue;

      let fontSize = parseFloat(cs.fontSize);
      if (parent instanceof SVGGraphicsElement) {
        // SVG user units to canvas pixels (a viewBox or transform may scale the text).
        const text = parent.closest("text") ?? parent;
        const bb = text.getBBox();
        const screen = text.getBoundingClientRect().height / scale;
        if (bb.height > 0 && screen > 0) fontSize *= screen / bb.height;
      }
      const lineHeight = cs.lineHeight === "normal" ? fontSize * 1.2 : parseFloat(cs.lineHeight);
      const slack = Math.max(0, ...rects.map((r) => (r.h - lineHeight) / 2));

      const isSvg = parent instanceof SVGElement;
      let fg = parseColor(isSvg ? cs.fill : cs.color);
      if (fg) {
        const alpha = fg[3] * opacity * (isSvg ? Number(cs.fillOpacity) : 1);
        fg = [fg[0], fg[1], fg[2], alpha];
      }
      items.push({
        text: text.length > 40 ? `${text.slice(0, 39)}…` : text,
        rects,
        slack,
        fontSize,
        source: !!parent.closest(".sd-role-source"),
        fg,
        bg: backgroundOf(parent),
      });
    }
    elements.push({
      id,
      region: regionEl ? regionEl.dataset.region : null,
      box: isBox,
      regionRect: regionEl ? contentBox(regionEl) : null,
      items,
    });
  }
  return { minFont, canvas: { w: c.width / scale, h: c.height / scale }, elements };
}

// ---------------------------------------------------------------------------------------------
// Layout pass: rules (in Node, on the measurement)

const px = (n) => `${Math.round(n * 100) / 100}px`;
const rectText = (r) => `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.w)}×${Math.round(r.h)}`;
const union = (rs) => {
  const x = Math.min(...rs.map((r) => r.x));
  const y = Math.min(...rs.map((r) => r.y));
  return { x, y, w: Math.max(...rs.map((r) => r.x + r.w)) - x, h: Math.max(...rs.map((r) => r.y + r.h)) - y };
};
const hex = (rgb) => `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;

/** WCAG 2 relative luminance and contrast ratio, of [r, g, b] in 0..255. */
export const luminance = ([r, g, b]) => relativeLuminance([r / 255, g / 255, b / 255]);
export const contrastRatio = (a, b) => ratio(luminance(a), luminance(b));

/** Rects of `rects` outside `bounds` (with 1 px, and `slack` vertically). */
function outside(rects, bounds, slack) {
  return rects.filter(
    (r) =>
      r.x < bounds.x - EDGE_PX ||
      r.x + r.w > bounds.x + bounds.w + EDGE_PX ||
      r.y < bounds.y - EDGE_PX - slack ||
      r.y + r.h > bounds.y + bounds.h + EDGE_PX + slack,
  );
}

/** Layout findings of one step: [{ element, rule, key, measured, limit, fix }]. */
export function layoutFindings(layout) {
  const out = [];
  const { minFont } = layout;
  const canvas = { x: 0, y: 0, w: layout.canvas.w || CANVAS_W, h: layout.canvas.h || CANVAS_H };
  for (const el of layout.elements) {
    if (el.items.length === 0) continue;
    const off = el.items.flatMap((it) => outside(it.rects, canvas, it.slack));
    if (off.length) {
      out.push({
        element: el.id,
        rule: "text-outside-canvas",
        measured: `text at ${rectText(union(off))}`,
        limit: `inside the canvas 0,0 ${canvas.w}×${canvas.h}`,
        fix: "move or shrink the element (its box, region or the text) so all text stays on the canvas",
      });
    }
    if (el.regionRect) {
      const offRegion = el.items.flatMap((it) => outside(it.rects, el.regionRect, it.slack));
      if (offRegion.length) {
        out.push({
          element: el.id,
          rule: "text-outside-region",
          measured: `text at ${rectText(union(offRegion))}`,
          limit: `inside region '${el.region}' at ${rectText(el.regionRect)}`,
          fix: "shorten the text, break long words, or give the region more room (the slide's `regions` grid variables)",
        });
      }
    }
    const exempt = el.region === "footer";
    const small = el.items.filter((it) => !exempt && !el.source && !it.source && it.fontSize < minFont - 0.01);
    if (small.length) {
      const worst = small.reduce((a, b) => (b.fontSize < a.fontSize ? b : a));
      out.push({
        element: el.id,
        rule: "font-too-small",
        measured: `${px(worst.fontSize)} "${worst.text}"`,
        limit: `${px(minFont)} (--min-audience-font)`,
        fix: "use a larger font size; only sources (role: \"source\") and the footer may go smaller",
      });
    }
    let worst = null;
    for (const it of el.items) {
      if (!it.fg) continue;
      const fg = it.fg[3] >= 1 ? it.fg.slice(0, 3) : [0, 1, 2].map((i) => it.fg[i] * it.fg[3] + it.bg[i] * (1 - it.fg[3]));
      const ratio = contrastRatio(fg, it.bg);
      if (ratio < MIN_CONTRAST - 1e-3 && (!worst || ratio < worst.ratio)) worst = { ratio, fg, bg: it.bg, text: it.text };
    }
    if (worst) {
      out.push({
        element: el.id,
        rule: "contrast",
        measured: `${worst.ratio.toFixed(2)}:1 ${hex(worst.fg)} on ${hex(worst.bg)} "${worst.text}"`,
        limit: `${MIN_CONTRAST}:1`,
        fix: "use the theme's ink or muted color, or a darker palette color, for text",
      });
    }
  }
  // Overlap: pairs of different elements, reported on the later one.
  const els = layout.elements.filter((e) => e.items.length);
  const rectsOf = els.map((e) => e.items.flatMap((it) => it.rects));
  for (let i = 0; i < els.length; i++) {
    for (let j = i + 1; j < els.length; j++) {
      let best = null;
      for (const a of rectsOf[i]) {
        for (const b of rectsOf[j]) {
          const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
          const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
          if (w > OVERLAP_PX && h > OVERLAP_PX && (!best || w * h > best.w * best.h)) best = { w, h };
        }
      }
      if (best) {
        out.push({
          element: els[j].id,
          rule: "text-overlap",
          key: els[i].id,
          measured: `overlaps '${els[i].id}' by ${Math.round(best.w)}×${Math.round(best.h)} px`,
          limit: `${OVERLAP_PX} px`,
          fix: "move one of them (box, region) or shorten the text so the two do not intersect",
        });
      }
    }
  }
  return out;
}

/** Same content (R10): visible set, text and resolved props of every element. */
function sameContent(a, b) {
  if (a.elements.length !== b.elements.length) return false;
  const other = new Map(b.elements.map((e) => [e.id, e]));
  return a.elements.every((e) => {
    const o = other.get(e.id);
    return o && o.visible === e.visible && o.text === e.text && jsonEqual(o.props, e.props);
  });
}

async function layoutPass(session, plan, errors) {
  const found = new Map();
  const step0 = [];
  let steps = 0;
  for (const { id, ids, only } of plan) {
    let first = null;
    let last = null;
    for (let k = 0; k < ids.length; k++) {
      if (only !== null && k !== only) continue;
      await session.open(id, k, { capture: true });
      const m = await session.measure();
      const layout = await session.page.evaluate(textLayoutInPage, [CANVAS_W, BARE_CANVAS]);
      steps += 1;
      errors.note(id, ids[k], m);
      if (k === 0) first = m;
      if (k === ids.length - 1) last = m;
      // Elements the runtime already reports as failed are not measured again.
      const failed = new Set(m.renderErrors.map((line) => /^[^/]+\/([^:]+):/.exec(line)?.[1]).filter(Boolean));
      const byId = new Map(m.elements.map((e) => [e.id, e]));
      for (const el of layout.elements) el.source = byId.get(el.id)?.props?.role === "source";
      for (const f of layoutFindings({ ...layout, elements: layout.elements.filter((e) => !failed.has(e.id)) })) {
        tally(found, `${id}\n${f.element}\n${f.rule}\n${f.key ?? ""}`, () => ({ slide: id, step: ids[k], ...f }));
      }
    }
    // step0-shows-all needs both ends of the slide, so a --step run skips it.
    if (only === null && ids.length > 1 && sameContent(first, last)) {
      step0.push(
        problem({
          slide: id,
          step: ids[0],
          rule: "step0-shows-all",
          measured: `step 0 shows the same as the last step '${ids[ids.length - 1]}' (visible elements, text and props)`,
          limit: "something still to come at step 0",
          fix: "hide elements until their step (from/at), change props per step (set/only/advance), or drop the extra steps",
        }),
      );
    }
  }
  const problems = [...found.values()].map((f) =>
    problem({
      slide: f.slide,
      element: f.element,
      step: f.step,
      rule: f.rule,
      measured: f.more ? `${f.measured} (+${f.more} more step${f.more === 1 ? "" : "s"})` : f.measured,
      limit: f.limit,
      fix: f.fix,
    }),
  );
  return { problems: [...problems, ...step0], steps };
}

export async function runCheck(deckDir, { slide, step, played = false, size, theme } = {}) {
  assertStepScope({ slide, step });
  return withDeck(deckDir, { size, slide, theme }, async (session) => {
    const plan = slidePlan(session, slide, step);
    const errors = errorCollector();
    const layout = await layoutPass(session, plan, errors);
    const playedRun = played ? await playedPass(session, plan, errors) : null;
    return {
      problems: [...errors.problems(), ...layout.problems, ...(playedRun?.problems ?? [])],
      slides: plan.length,
      steps: layout.steps,
      played: playedRun?.slides ?? null,
    };
  });
}

export async function check(deckDir, opts = {}) {
  return (await runCheck(deckDir, opts)).problems;
}
