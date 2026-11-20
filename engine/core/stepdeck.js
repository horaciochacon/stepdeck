// stepdeck runtime entry: boot({ shell, deckUrl }) loads a deck and exposes window.STEPDECK (spec §9).
//
// boot({ shell = "bare", deckUrl, document, location }) -> STEPDECK (also set on window.STEPDECK,
// synchronously, before anything is awaited):
//   ready        Promise<void>; resolves once the first slide is shown and its step applied.
//                Never rejects: every failure is recorded in `errors` and shown on the canvas.
//   slides       string[]  slide ids, in deck order (filled before ready resolves)
//   steps        Record<slide, string[]>  step ids (a step without id is its index as a string;
//                a slide without steps has ["0"])
//   errors       string[] (getter): boot errors plus the errors of the slide on screen.
//                Element errors read "<slide>/<element>: <message>", slide errors "<slide>: <message>".
//   settled()    Promise<void>; resolves when the pending navigation and every update finished.
//   goTo(slide, step)  Promise<void>; shows that slide at that step (id or number). Never rejects.
//   state()      { slide, step, stepId, title, notes, elements } of the slide on screen, or null.
//
// Paths: the engine root comes from this module's URL (…/core/stepdeck.js -> …/). The deck root is
// `deckUrl` resolved against the page (a trailing "/" is added), or the page's own directory. It must be
// same-origin with the page (spec §3): another origin is refused with an on-canvas error, never imported.
// boot imports <deck>/deck.js and <deck>/slides/<id>.js, reads
// <engine>/layouts/<layout>/{layout.css,schema.json} and <engine>/themes/<theme>/{tokens.css,palettes.json}, plus the
// theme's optional theme.css (a missing one is no error).
// Cascade layers (default-theme spec §5.1): core/stepdeck.css is sd-core, layout CSS sd-layout, theme.css
// sd-theme, sd-deck (declared and empty, reserved for per-deck overrides) and a slide's `style` sd-slide, each
// sheet prefixed with the order (LAYER_ORDER). The theme's
// tokens.css (custom properties and @font-face only) is not layered.
// Components: built-ins are listed in <engine>/components/index.json; deck components are listed in
// an optional `components: [...]` array in deck.js (folders <deck>/components/<name>/).
//
// Shells: "bare" (core/render.html, one slide at a time; every CLI command) and "reveal" (presenting:
// core/shells/reveal.js, loaded on demand, with the engine-owned `#/<slide>/<step>` hash). A shell is a
// host { current, show(slide, step), showFatal(root), initial?, navigated?(slide, step) -> false to refuse,
// idle?() }:
// boot keeps the navigation queue, and the host decides what is mounted and where.
//
// Query flags (readFlags, shared by every shell): slide, step, capture (html.capture, ctx.capture, no
// animation), motion=full (animate even with prefers-reduced-motion), lang=, theme=. `receiver` marks a
// presenter preview frame: never animates (it is not part of STEPDECK.flags).
import { SlideController } from "./controller.js";
import { createRegistry } from "./registry.js";
import { createDataLoader } from "./data.js";
import { makeFormat } from "./format.js";
import { t as translate } from "./i18n.js";
import { renderSlideFrame, placedSlide } from "./layout.js";
import { createBareShell } from "./shells/bare.js";
import { parseStepRef } from "./fold.js";
import { message } from "./kit.js";
import { DEFAULT_LAYOUT, DEFAULT_THEME, LAYER_ORDER, THEME_NAME, inLayer } from "./constants.js";

export const ENGINE_ROOT = new URL("../", import.meta.url);
export { parseStepRef };

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}
const fetchJSON = async (url) => JSON.parse(await fetchText(url));

export function stepIds(slide) {
  return Array.isArray(slide?.steps) && slide.steps.length > 0
    ? slide.steps.map((s, i) => (s && s.id != null ? String(s.id) : String(i)))
    : ["0"];
}

/**
 * Rewrites relative `url(...)` references in `css` against `base` (the stylesheet's own URL). Theme
 * tokens are injected as an inline <style>, where a relative URL would resolve against the page.
 * Absolute, root-relative, data: and fragment URLs are kept as they are.
 */
export function rebaseCssUrls(css, base) {
  return css.replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/g, (all, quote, ref) => {
    if (/^(?:[a-z][a-z\d+.-]*:|\/|#)/i.test(ref)) return all;
    return `url("${new URL(ref, base).href}")`;
  });
}

/** The `src` URLs that `css` declares for a family, weight and style (from its @font-face rules). */
function declaredFontUrls(css, family, weight, style) {
  const urls = [];
  for (const [, body] of String(css ?? "").matchAll(/@font-face\s*\{([^}]*)\}/g)) {
    const prop = (name) => new RegExp(`${name}\\s*:\\s*([^;]+)`).exec(body)?.[1].trim().replace(/["']/g, "");
    if (prop("font-family") !== family) continue;
    if ((prop("font-weight") ?? "400").replace("normal", "400") !== String(weight).replace("normal", "400")) continue;
    if ((prop("font-style") ?? "normal") !== style) continue;
    for (const [, url] of body.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) urls.push(url);
  }
  return urls;
}

/**
 * Loads every font face the document declares, so nothing is measured with a fallback font.
 * -> one line per face that failed: "font '<family>' <weight> <style> failed to load (<declared URLs>)".
 */
export async function loadFonts(doc, css = "") {
  const fonts = doc?.fonts;
  if (!fonts || typeof fonts[Symbol.iterator] !== "function") return [];
  const failed = [];
  await Promise.all([...fonts].filter((f) => f.status !== "loaded").map((f) => f.load().catch(() => {
    const family = String(f.family).replace(/["']/g, "");
    const urls = declaredFontUrls(css, family, f.weight, f.style);
    const line = `font '${family}' ${f.weight} ${f.style} failed to load (${urls.join(", ") || "no URL declared in the theme"})`;
    if (!failed.includes(line)) failed.push(line);
  })));
  return failed;
}

function tokenNames(css) {
  return [...new Set(css.match(/--[\w-]+(?=\s*:)/g) ?? [])];
}

/** -> palette(kind): the deck's palette of that kind, built once per kind (a shared value: read-only). */
function makePalette(palettes, deckPalette, lang) {
  const built = new Map();
  const build = (kind) => {
    const all = palettes?.palettes ?? {};
    const name = deckPalette && all[deckPalette]?.kind === kind ? deckPalette : palettes?.default?.[kind];
    const p = all[name];
    if (!p) return null;
    const byId = new Map(p.colors.map((c) => [c.id, c.value]));
    return {
      name,
      kind: p.kind,
      colors: p.colors.map((c) => c.value),
      names: p.colors.map((c) => c.names?.[lang] ?? c.names?.en ?? c.id),
      roles: Object.fromEntries(Object.entries(p.roles ?? {}).map(([role, id]) => [role, byId.get(id)])),
    };
  };
  return (kind = "categorical") => {
    if (!built.has(kind)) built.set(kind, build(kind));
    return built.get(kind);
  };
}

/** Loads deck-wide resources. Problems are pushed to `errors`; only a missing deck.js throws. */
async function loadDeck({ deckRoot, flags, errors }) {
  const deck = (await import(new URL("deck.js", deckRoot).href)).default ?? {};
  const lang = flags.lang ?? deck.lang ?? "en";
  const theme = String(flags.theme ?? deck.theme ?? DEFAULT_THEME);
  // A theme is a folder name (THEME_NAME): anything else (a path such as "../x", from ?theme= or deck.js) is not
  // found, and nothing is fetched for it, so no request leaves themes/.
  const themeOk = THEME_NAME.test(theme);
  const ids = Array.isArray(deck.slides) ? deck.slides.map(String) : [];
  if (ids.length === 0) errors.push("deck: deck.js lists no slides");

  const specs = new Map();
  const themeUrl = (file) => new URL(`themes/${theme}/${file}`, ENGINE_ROOT);
  const [, tokensCss, themeRules, palettes, builtins] = await Promise.all([
    Promise.all(
      ids.map(async (id) => {
        try {
          const spec = (await import(new URL(`slides/${id}.js`, deckRoot).href)).default;
          if (!spec || typeof spec !== "object") throw new Error("slide file has no default export");
          if (spec.id !== id) throw new Error(`slide file exports id '${spec.id}', expected '${id}'`);
          specs.set(id, spec);
        } catch (e) {
          specs.set(id, { error: `${id}: cannot load slide: ${message(e)}` });
        }
      }),
    ),
    (themeOk ? fetchText(themeUrl("tokens.css")) : Promise.reject(new Error("not a theme name: lowercase letters, digits and hyphens"))).then(
      (css) => rebaseCssUrls(css, themeUrl("tokens.css")),
    ).catch((e) => {
      errors.push(`deck: theme '${theme}' not found (${message(e)})`);
      return "";
    }),
    // theme.css is optional: a theme without one (a 404) is styled by the token-driven hook defaults in core.
    // The body is read even then, so the request completes and is never aborted by a later navigation.
    !themeOk ? "" : fetch(themeUrl("theme.css")).then(async (res) => {
      const css = await res.text();
      return res.ok ? rebaseCssUrls(css, themeUrl("theme.css")) : "";
    }).catch(() => ""),
    !themeOk ? null : fetchJSON(new URL(`themes/${theme}/palettes.json`, ENGINE_ROOT)).catch((e) => {
      errors.push(`deck: palettes of theme '${theme}' not found (${message(e)})`);
      return null;
    }),
    fetchJSON(new URL("components/index.json", ENGINE_ROOT)).catch((e) => {
      errors.push(`deck: components/index.json not found (${message(e)})`);
      return [];
    }),
  ]);

  const registry = createRegistry({
    builtinRoot: new URL("components", ENGINE_ROOT).href,
    deckRoot: new URL("components", deckRoot).href,
    builtins,
    deckComponents: Array.isArray(deck.components) ? deck.components : [],
  });
  const load = createDataLoader({ root: deckRoot.href.replace(/\/$/, ""), read: (url) => fetch(url) });
  const layouts = new Map();
  const layout = (name) => {
    if (!layouts.has(name)) {
      const base = new URL(`layouts/${name}/`, ENGINE_ROOT);
      layouts.set(
        name,
        Promise.all([fetchText(new URL("layout.css", base)), fetchJSON(new URL("schema.json", base))]).then(
          ([css, schema]) => ({
            css: inLayer("sd-layout", css),
            regions: (schema.regions ?? []).map((r) => r.name),
            hooks: schema.hooks ?? {},
            kind: schema.kind ?? "content",
          }),
        ),
      );
    }
    return layouts.get(name);
  };

  // One shared sheet per theme: the tokens (unlayered), then theme.css in the sd-theme layer.
  const themeCss = `${LAYER_ORDER}\n${tokensCss}${themeRules.trim() ? `\n${inLayer("sd-theme", themeRules)}` : ""}`;
  return {
    deck,
    ids,
    specs,
    lang,
    themeCss,
    themeTokenNames: tokenNames(tokensCss),
    registry,
    layout,
    load,
    format: makeFormat(lang),
    t: (key) => translate(lang, key),
    palette: makePalette(palettes, deck.palette, lang),
  };
}

/**
 * Mounts one slide into a frame: renders the layout, runs its SlideController and turns every
 * failure into an on-canvas error. Shells call this (bare: one at a time; reveal: current ±1).
 * -> { id, root, errors (getter), goTo(ref, { animate }), settled(), state(), pause(), destroy() }
 * `attach(root)` must put the frame in the document (so it is laid out) before mounting.
 */
export async function mountSlide(env, id, opts = {}) {
  try {
    return await mountSlideUnsafe(env, id, opts);
  } catch (e) {
    // Anything that throws before the controller exists still ends as an on-canvas error.
    return errorRuntime(id, `${id}: ${message(e)}`, opts, env?.themeCss);
  }
}

function errorRuntime(id, line, { attach, document: doc = globalThis.document } = {}, themeCss = "") {
  const frame = renderSlideFrame({ id, elements: [] }, "", themeCss, { document: doc });
  attach(frame.root);
  frame.showError(null, line);
  frame.reveal();
  return {
    id,
    root: frame.root,
    get errors() { return [line]; },
    goTo: async () => {},
    settled: async () => {},
    state: () => null,
    pause() {},
    destroy: () => frame.destroy(),
  };
}

async function mountSlideUnsafe(env, id, { capture = false, attach, document: doc = globalThis.document } = {}) {
  const spec = env.specs.get(id);
  if (!spec || spec.error) return errorRuntime(id, spec?.error ?? `${id}: unknown slide`, { attach, document: doc }, env.themeCss);

  const layoutName = spec.layout ?? DEFAULT_LAYOUT;
  let layout = { css: "", regions: undefined, hooks: {}, kind: "content" };
  let layoutError = null;
  try {
    layout = await env.layout(layoutName);
  } catch (e) {
    layoutError = `${id}: layout '${layoutName}' not found (${message(e)})`;
  }
  // The slide as its layout shows it (a layout without a title region drops the section kicker): the frame and the
  // controller must agree on the elements, or the controller would mount one the frame never laid out.
  const placed = placedSlide(spec, layout.regions);
  const frame = renderSlideFrame(placed, layout.css, env.themeCss, { regions: layout.regions, hooks: layout.hooks, kind: layout.kind, lang: env.lang, document: doc });
  const slideErrors = [];
  const record = (line, elementId = null) => {
    if (slideErrors.includes(line)) return;
    slideErrors.push(line);
    frame.showError(elementId, line);
  };
  attach(frame.root);
  if (layoutError) record(layoutError);
  for (const p of frame.problems) record(p.line, p.element);
  // The theme's faces are declared now (renderSlideFrame injected the tokens): load them all before
  // any component measures text (font-display: block alone still lays out with fallback metrics).
  for (const line of await loadFonts(doc, env.themeCss)) record(`${id}: ${line}`);

  const view = doc.defaultView;
  const tokens = {};
  if (view) {
    const cs = view.getComputedStyle(frame.root);
    for (const name of env.themeTokenNames) tokens[name] = cs.getPropertyValue(name).trim();
  }

  const controller = new SlideController({
    slide: placed,
    registry: env.registry,
    mountPoint: frame.mountPoint,
    ctxBase: {
      setVisible: frame.setVisible,
      onError: (elementId, e) => frame.showError(elementId, `${id}/${elementId}: ${message(e)}`),
      load: env.load,
      format: env.format,
      t: env.t,
      capture,
      tokens,
      palette: env.palette,
    },
  });

  const goTo = async (ref, opts) => {
    try {
      await controller.goTo(ref, opts);
    } catch (e) {
      record(`${id}: ${message(e)}`);
    } finally {
      frame.reveal();
    }
  };

  return {
    id,
    root: frame.root,
    get errors() {
      return [...slideErrors, ...controller.errors];
    },
    goTo,
    settled: () => controller.settled().catch((e) => record(`${id}: ${message(e)}`)),
    state: () => (controller.state ? { slide: id, ...controller.state } : null),
    pause: () => controller.pause(),
    destroy() {
      controller.destroy();
      frame.destroy();
    },
  };
}

/** Query flags shared by every shell (spec §9). `preview` is a presenter preview frame (`?receiver`). */
export function readFlags(location) {
  const q = new URLSearchParams(location?.search ?? "");
  return {
    slide: q.get("slide") ?? undefined,
    step: q.has("step") ? parseStepRef(q.get("step")) : undefined,
    capture: q.has("capture"),
    motion: q.get("motion") ?? undefined,
    lang: q.get("lang") || undefined,
    theme: q.get("theme") || undefined,
    preview: q.has("receiver"),
  };
}

const SHELLS = ["bare", "reveal"];

/** Bare shell host: one slide mounted at a time, destroyed when another is shown. */
function createBareHost({ document: doc, env, capture }) {
  const stage = createBareShell({ document: doc });
  const host = {
    current: null,
    showFatal: (root) => stage.show(root),
    async show(slide, step) {
      host.current?.destroy();
      host.current = null;
      host.current = await mountSlide(env(), slide, { capture, attach: stage.show, document: doc });
      await host.current.goTo(step ?? 0, { animate: false });
    },
  };
  return host;
}

export function boot({ shell = "bare", deckUrl, document: doc = globalThis.document, location = globalThis.location } = {}) {
  const { preview, ...flags } = readFlags(location);
  if (flags.capture) doc.documentElement.classList.add("capture");
  const view = doc.defaultView;
  const reduced = view?.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
  const motion = flags.motion === "full" || !reduced;
  // Presenter preview frames never animate (spec §9).
  const animateRequest = !flags.capture && !preview && motion;

  const bootErrors = [];
  let env = null;
  let host = null; // the shell host: { current, show(slide, step), showFatal(root), navigated?, idle? }
  let nav = Promise.resolve();
  let switches = 0; // navigations queued on `nav` (slide changes) not yet applied
  let resolveReady;
  const ready = new Promise((r) => (resolveReady = r));

  const api = {
    ready,
    slides: [],
    steps: {},
    get errors() {
      return [...bootErrors, ...(host?.current?.errors ?? [])];
    },
    settled: () =>
      nav
        .then(() => host?.idle?.())
        .then(() => host?.current?.settled())
        .then(() => undefined),
    goTo: (slide, step) => {
      // A host may refuse a target (reveal: unknown slide or step) after recording why.
      if (host?.navigated?.(slide, step ?? 0) === false) return Promise.resolve();
      // Same slide, no slide change queued: go straight to the controller, so a new step supersedes
      // (aborts) an in-flight animated one instead of waiting for it to finish. Slide changes stay
      // serialized on `nav`.
      const current = host?.current;
      if (current && current.id === slide && switches === 0) {
        return current.goTo(step ?? 0, { animate: animateRequest });
      }
      switches += 1;
      nav = nav
        .then(() => {
          if (!env || !host) return;
          if (host.current && host.current.id === slide) return host.current.goTo(step ?? 0, { animate: animateRequest });
          return host.show(slide, step);
        })
        .catch((e) => void bootErrors.push(`stepdeck: ${message(e)}`))
        .finally(() => (switches -= 1));
      return nav;
    },
    state: () => host?.current?.state() ?? null,
    flags: { ...flags, motion, animate: animateRequest },
  };
  if (view) view.STEPDECK = api;

  if (!SHELLS.includes(shell)) {
    bootErrors.push(`stepdeck: unknown shell '${shell}' (available: ${SHELLS.join(", ")})`);
    resolveReady();
    return api;
  }
  // The bare stage exists from the start (so a deck that fails to load still shows its error); the
  // reveal shell is built once the deck is loaded.
  if (shell === "bare") host = createBareHost({ document: doc, env: () => env, capture: flags.capture });

  const showFatal = (line) => {
    bootErrors.push(line);
    const root = doc.createElement("div");
    root.className = "sd-canvas";
    const div = doc.createElement("div");
    div.className = "sd-error sd-slide-error";
    div.setAttribute("role", "alert");
    div.textContent = line;
    root.appendChild(div);
    if (host?.showFatal) host.showFatal(root);
    else createBareShell({ document: doc }).show(root);
  };

  (async () => {
    let deckRoot;
    try {
      const raw = deckUrl ?? "./";
      deckRoot = new URL(raw.endsWith("/") ? raw : `${raw}/`, doc.baseURI);
      const page = new URL(doc.baseURI);
      if (deckRoot.origin !== page.origin) {
        showFatal(`deck: deck must be same-origin with the page (got ${deckRoot.origin}, page is ${page.origin}); use a relative path`);
        return;
      }
      env = await loadDeck({ deckRoot, flags, errors: bootErrors });
    } catch (e) {
      showFatal(`deck: cannot load ${deckRoot ? new URL("deck.js", deckRoot).href : "deck.js"}: ${message(e)}`);
      return;
    }
    api.slides.push(...env.ids);
    for (const id of env.ids) api.steps[id] = stepIds(env.specs.get(id));
    if (env.ids.length === 0) return;

    let start = { slide: flags.slide ?? env.ids[0], step: flags.step ?? 0 };
    if (shell === "reveal") {
      const { createRevealHost } = await import("./shells/reveal.js");
      host = await createRevealHost({
        document: doc,
        engineRoot: ENGINE_ROOT,
        env,
        api,
        mount: (id, attach) => mountSlide(env, id, { capture: flags.capture, attach, document: doc }),
        preview,
        motion,
        errors: bootErrors,
        start,
      });
      start = host.initial ?? start;
    }
    if (!env.ids.includes(start.slide)) {
      showFatal(`stepdeck: unknown slide '${start.slide}' (slides: ${env.ids.join(", ")})`);
      return;
    }
    await api.goTo(start.slide, start.step);
  })()
    .catch((e) => bootErrors.push(`stepdeck: ${message(e)}`))
    .finally(() => resolveReady());

  return api;
}
