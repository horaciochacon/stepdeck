// Layout renderer: builds one slide's 1920×1080 canvas (spec §6.1, §7).
//
// renderSlideFrame(slide, layoutCss, themeTokens, { regions, hooks, kind, lang, document } = {})
//   -> { root, mountPoint(id), setVisible(id, visible, collapse), showError(id, message),
//        reveal(), problems, destroy() }
//
//   root         <div class="sd-canvas sd-booting" data-slide=<id> data-layout=<layout> data-kind=<kind>>.
//                It stays `visibility: hidden` (still laid out, so components can measure) until reveal().
//                kind is the layout's kind (core/constants.js LAYOUT_KINDS; default "content").
//                lang, when given (the deck's lang, or ?lang=), is the canvas's `lang` attribute, so text-transform
//                and hyphenation follow the slide's language (an uppercase kicker in Turkish, say).
//   regions      the layout's region names, in order (from its schema.json). Each becomes
//                <div class="sd-region" data-region=<name>> with `grid-area: <name>`, so the layout
//                CSS only declares grid templates. When omitted, the regions named by the elements
//                are created. An element naming a region the layout does not have is still
//                rendered, and a problem { element, line: "<slide>/<element>: unknown region …" } is
//                recorded.
//   elements     <div class="sd-el" data-el=<id> data-type=<type>>, in listed order inside their
//                region (default region: "main"). An element with `box: {x, y, w, h}` is
//                absolutely positioned on the canvas (canvas pixels) instead.
//                The slide-level `title` string is sugar for an element `title` in region "title".
//   kicker       the slide's `section` is the element `kicker` in region "title" (core/fold.js), with the class
//                sd-kicker. A layout without a "title" region drops it quietly: renderSlideFrame lays out
//                placedSlide(slide, regions), and the runtime gives the controller that same slide.
//   hooks        published styling hooks (core/constants.js HOOKS, default-theme spec §10.1): the layout's
//                { region: hook } map. The region and every element wrapper in it get the class sd-<hook>.
//                The reserved title element (id "title": the slide's `title` sugar or an explicit element)
//                gets sd-title, and the "title" region is a size container named sd-title, so a theme or a
//                slide style can size the title from the room it has (@container sd-title). Core's own
//                rules do not: the cover-figure size follows the figure region, not a width.
//   layoutCss,   injected once per document into <head> (deduplicated by content), so several
//   themeTokens  frames can coexist. Layout CSS should scope itself with
//                `.sd-canvas[data-layout="<name>"]`.
//   slide.style  scoped CSS: every selector is prefixed with `[data-slide="<id>"] `. A selector
//                starting with `:scope` or `&` targets the canvas itself. @media/@supports blocks
//                are scoped recursively; @keyframes and other at-rules are kept as they are. The result
//                sits in the sd-slide cascade layer, so it beats the theme's theme.css whatever the
//                selectors' specificity.
//   slide.regions  grid variable overrides: `{ "--notes-width": "700px" }` set on the canvas.
//
//   setVisible   hidden elements keep their space (visibility: hidden); collapse: true removes it.
//   showError    id = element id: the element's box shows the message and stays visible whatever
//                the step says. id = null: a slide-level error over the canvas.
import { initialElements } from "./fold.js";
import { CANVAS, DEFAULT_LAYOUT, inLayer } from "./constants.js";

/** The element definitions the frame lays out (slide `title` and `section` sugar included), in order. */
export const frameElements = initialElements;

/**
 * The slide as a layout with these `regions` shows it: when the regions are known and have no "title" region, the
 * kicker is dropped quietly (validate warns kicker-no-region): the slide loses its `section`, and every step loses
 * what it says about `kicker` (set, replace, only, show, hide), which would otherwise name an unknown element.
 * Otherwise the slide itself. (`advance` lives on an element definition, and the kicker has none.)
 */
export function placedSlide(slide, regions) {
  if (!Array.isArray(regions) || regions.includes("title") || slide.section === undefined) return slide;
  const { section, ...rest } = slide;
  if (Array.isArray(slide.steps)) rest.steps = slide.steps.map(withoutKicker);
  return rest;
}

const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
function withoutKicker(step) {
  if (!isPlainObject(step)) return step;
  const out = { ...step };
  for (const op of ["set", "replace", "only"]) {
    if (isPlainObject(out[op]) && Object.hasOwn(out[op], "kicker")) {
      const { kicker, ...others } = out[op];
      out[op] = others;
    }
  }
  for (const op of ["show", "hide"]) {
    if (Array.isArray(out[op]) && out[op].includes("kicker")) out[op] = out[op].filter((id) => id !== "kicker");
  }
  return out;
}

/** Splits a selector list on top-level commas (commas inside (), [] or strings are kept). */
export function splitSelectors(text) {
  const out = [];
  let depth = 0;
  let quote = null;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === "\\") i++;
      else if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth--;
    else if (ch === "," && depth === 0) {
      out.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }
  out.push(text.slice(start).trim());
  return out.filter(Boolean);
}

export function scopeSelector(selector, scope) {
  const m = /^(:scope|&)(?![\w-])/.exec(selector);
  if (m) return `${scope}${selector.slice(m[0].length)}`;
  return `${scope} ${selector}`;
}

/** Prefixes every selector of `css` with `scope`, using the browser's CSS parser. */
export function scopeCss(css, scope, doc = globalThis.document) {
  const Sheet = doc?.defaultView?.CSSStyleSheet ?? globalThis.CSSStyleSheet;
  const sheet = new Sheet();
  sheet.replaceSync(css);
  const walk = (rules) => {
    for (const rule of rules) {
      if (rule.selectorText !== undefined && rule.style) {
        rule.selectorText = splitSelectors(rule.selectorText).map((s) => scopeSelector(s, scope)).join(", ");
      } else if (rule.cssRules && rule.type !== 7 /* KEYFRAMES_RULE */) {
        walk(rule.cssRules);
      }
    }
  };
  walk(sheet.cssRules);
  return [...sheet.cssRules].map((r) => r.cssText).join("\n");
}

function injectShared(doc, kind, css) {
  if (!css) return;
  for (const s of doc.head.querySelectorAll(`style[data-sd-shared="${kind}"]`)) {
    if (s.textContent === css) return;
  }
  const style = doc.createElement("style");
  style.dataset.sdShared = kind;
  style.textContent = css;
  doc.head.appendChild(style);
}

export function renderSlideFrame(slide, layoutCss, themeTokens, { regions, hooks = {}, kind = "content", lang, document: doc = globalThis.document } = {}) {
  const layout = slide.layout ?? DEFAULT_LAYOUT;
  injectShared(doc, "theme", themeTokens);
  injectShared(doc, "layout", layoutCss);

  const root = doc.createElement("div");
  root.className = "sd-canvas sd-booting";
  root.dataset.slide = slide.id;
  root.dataset.layout = layout;
  root.dataset.kind = kind;
  if (lang) root.lang = lang;
  root.style.width = `${CANVAS.w}px`;
  root.style.height = `${CANVAS.h}px`;
  for (const [name, value] of Object.entries(slide.regions ?? {})) {
    if (name.startsWith("--")) root.style.setProperty(name, String(value));
  }

  const problems = [];
  if (typeof slide.style === "string" && slide.style.trim() !== "") {
    const style = doc.createElement("style");
    style.dataset.sdSlideStyle = slide.id;
    style.textContent = inLayer("sd-slide", scopeCss(slide.style, `[data-slide="${CSS.escape(slide.id)}"]`, doc));
    root.appendChild(style);
  }

  const known = Array.isArray(regions) ? regions : null;
  const defs = frameElements(placedSlide(slide, known));
  const regionEls = new Map();
  const hookOf = (name) => (Object.hasOwn(hooks ?? {}, name) ? hooks[name] : null);
  const region = (name) => {
    if (!regionEls.has(name)) {
      const r = doc.createElement("div");
      r.className = "sd-region";
      if (hookOf(name)) r.classList.add(`sd-${hookOf(name)}`);
      r.dataset.region = name;
      r.style.gridArea = name;
      // Inline, so no layout CSS can undo it: themes may query this container's width (@container sd-title).
      if (name === "title") r.style.container = "sd-title / inline-size";
      regionEls.set(name, r);
      root.appendChild(r);
    }
    return regionEls.get(name);
  };
  for (const name of known ?? []) region(name);

  const boxes = new Map();
  for (const def of defs) {
    const el = doc.createElement("div");
    el.className = "sd-el";
    if (def.id === "title") el.classList.add("sd-title");
    if (def.id === "kicker") el.classList.add("sd-kicker");
    el.dataset.el = def.id;
    if (def.type) el.dataset.type = def.type;
    boxes.set(def.id, el);
    if (def.box) {
      const { x = 0, y = 0, w, h } = def.box;
      el.dataset.box = "";
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      if (w !== undefined) el.style.width = `${w}px`;
      if (h !== undefined) el.style.height = `${h}px`;
      continue; // appended after the regions, so boxes float above them
    }
    const name = def.region ?? "main";
    if (hookOf(name)) el.classList.add(`sd-${hookOf(name)}`);
    if (known && !known.includes(name)) {
      problems.push({ element: def.id, line: `${slide.id}/${def.id}: unknown region '${name}' in layout '${layout}' (regions: ${known.join(", ")})` });
    }
    region(name).appendChild(el);
  }
  for (const def of defs) if (def.box) root.appendChild(boxes.get(def.id));

  const box = (id) => {
    const el = boxes.get(id);
    if (!el) throw new Error(`no element '${id}' in slide '${slide.id}'`);
    return el;
  };

  return {
    root,
    problems,
    mountPoint: box,
    setVisible(id, visible, collapse) {
      const el = box(id);
      el.classList.toggle("sd-hidden", !visible);
      el.classList.toggle("sd-collapsed", !visible && collapse === true);
    },
    showError(id, message) {
      const host = id == null ? root : box(id);
      const div = doc.createElement("div");
      div.className = id == null ? "sd-error sd-slide-error" : "sd-error";
      div.setAttribute("role", "alert");
      div.textContent = message;
      if (id != null) host.classList.add("sd-failed");
      host.appendChild(div);
    },
    reveal() {
      root.classList.remove("sd-booting");
    },
    destroy() {
      root.remove();
    },
  };
}
