// Reveal shell (spec §9): presenting. reveal.js is only the host for keyboard navigation, scaling, the
// presenter view (notes plugin: notes, timer, next) and the overview. The engine owns everything else.
//
// createRevealHost({ document, engineRoot, env, api, mount, preview, motion, errors }) -> Promise<host>
//   Called by boot({ shell: "reveal" }) once the deck is loaded. It injects core/stepdeck.css,
//   vendor/reveal/reveal.css (no reveal theme) and core/shells/reveal.css, imports the vendored
//   reveal.js and notes plugin (UMD, read from globalThis), builds one <section> per slide and
//   initializes reveal. host = { current, initial, show(slide, step), navigated(slide, step), idle(),
//   showFatal(root), destroy() }, the interface boot drives (see core/stepdeck.js).
//
// Sections: <section data-sd-slide=<id> data-notes=…> holds <div class="sd-host"> (the slide's one
//   canvas; until it is mounted, a placeholder with the slide title, which is what the overview shows)
//   and one empty <span class="fragment"> per step after step 0. Reveal fragment index f (-1 / none
//   shown) is engine step f + 1. data-notes on the section and on every fragment is
//   stateAt(slide, k).notes, HTML-escaped (the speaker view shows it as HTML), so the notes plugin
//   sends exactly the step's notes.
// Navigation: reveal's events (slidechanged, fragmentshown, fragmenthidden) are read through
//   Reveal.getIndices() and turned into STEPDECK.goTo(slide, step); the controller decides whether a
//   move animates (forward by one). STEPDECK.goTo from anywhere else moves reveal to match.
// Hash: the engine owns `#/<slide-id>/<step-id-or-number>`. Reveal's own hash, history and hashchange
//   handling are off. The hash is parsed on load (then the `slide`/`step` query flags, then the first
//   slide), written on every change with history.replaceState, and followed on `hashchange`.
// Mounting: the slide shown and its neighbours (±1) are mounted while laid out (reveal keeps them
//   display:block), each exactly once: a slide's frame always replaces its host's content. The slide
//   left is paused; slides are destroyed only on teardown (pagehide). A failed slide shows its error on
//   its own canvas only. A neighbour's prefetch (its goTo to the arriving state) is tracked by idle()
//   but never awaited by show(), so a slow neighbour cannot hold up the slide asked for.
// Preview frames (`?receiver`, the speaker view's iframes): no animation (boot), media muted, the hash
//   left to reveal (they are driven by the speaker view's postMessage calls), and a "motion off"
//   indicator when reduced motion is active without ?motion=full.
import { stateAt, parseStepRef } from "../fold.js";
import { message, escapeHtml } from "../kit.js";
import { CANVAS } from "../constants.js";
import { stripAccent } from "../accent.js";

function loadCss(doc, href) {
  if (doc.querySelector(`link[rel="stylesheet"][href="${href}"]`)) return Promise.resolve();
  return new Promise((resolve) => {
    const link = doc.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.onload = link.onerror = () => resolve();
    doc.head.appendChild(link);
  });
}

/**
 * `#/<slide>/<step>` -> { slide, step } (step: digits are an index, else an id); null for no engine
 * hash (empty, or not of that shape); { error } for a hash whose escapes do not decode.
 */
export function parseHash(hash) {
  const m = /^#\/([^/]+)(?:\/([^/]*))?\/?$/.exec(hash ?? "");
  if (!m) return null;
  let slide;
  let step;
  try {
    slide = decodeURIComponent(m[1]);
    step = m[2] ? decodeURIComponent(m[2]) : "";
  } catch {
    return { error: `cannot decode '${hash}'` };
  }
  return { slide, step: parseStepRef(step) };
}

export const formatHash = (slide, stepId) => `#/${encodeURIComponent(slide)}/${encodeURIComponent(stepId)}`;

/** Per step k: { notes } from stateAt; a slide that cannot fold gets empty notes. */
function stepInfo(spec, count) {
  return Array.from({ length: count }, (_, k) => {
    try {
      return stateAt(spec, k);
    } catch {
      return { notes: undefined, title: undefined };
    }
  });
}

export async function createRevealHost({ document: doc, engineRoot, env, api, mount, preview, motion, errors, start }) {
  const win = doc.defaultView;
  const at = (path) => new URL(path, engineRoot).href;
  await Promise.all([
    loadCss(doc, at("core/stepdeck.css")),
    loadCss(doc, at("vendor/reveal/reveal.css")),
    loadCss(doc, at("core/shells/reveal.css")),
  ]);
  // UMD bundles: as ES modules they find no `exports`/`define` and assign globalThis.Reveal / RevealNotes.
  await import(at("vendor/reveal/reveal.js"));
  await import(at("vendor/reveal/plugin/notes.js"));
  const Reveal = globalThis.Reveal;
  const RevealNotes = globalThis.RevealNotes;

  const ids = env.ids;
  const stepsOf = (id) => api.steps[id];
  const indexOf = (id, ref) => {
    const list = stepsOf(id) ?? ["0"];
    const r = String(ref);
    if (/^\d+$/.test(r) && !list.includes(r)) return Number(r) < list.length ? Number(r) : -1;
    return list.indexOf(r);
  };
  /** A navigation target -> { slide, index } or { error } (unknown slide or step, bad hash). */
  const resolve = (slide, step) => {
    if (!ids.includes(slide)) return { error: `unknown slide '${slide}' (slides: ${ids.join(", ")})` };
    const index = indexOf(slide, step ?? 0);
    if (index < 0) return { error: `unknown step '${step}' in slide '${slide}' (steps: ${stepsOf(slide).join(", ")})` };
    return { slide, index };
  };
  /** A parsed hash -> its error, or the resolved target. */
  const fromHash = (t) => (t.error ? t : resolve(t.slide, t.step));

  // --- DOM: one section per slide ---
  const reveal = doc.createElement("div");
  reveal.className = "reveal sd-reveal";
  const slidesEl = doc.createElement("div");
  slidesEl.className = "slides";
  reveal.appendChild(slidesEl);
  const hosts = new Map();
  for (const id of ids) {
    const spec = env.specs.get(id);
    const count = stepsOf(id).length;
    const info = spec && !spec.error ? stepInfo(spec, count) : [{}];
    const section = doc.createElement("section");
    section.dataset.sdSlide = id;
    section.setAttribute("data-notes", escapeHtml(info[0]?.notes ?? ""));
    const host = doc.createElement("div");
    host.className = "sd-host";
    const placeholder = doc.createElement("div");
    placeholder.className = "sd-placeholder";
    const h = doc.createElement("h2");
    // The raw title string, shown outside its element: plain text, without the accent phrase marks.
    const title = info[0]?.title ?? (typeof spec?.title === "string" ? spec.title : null);
    const accent = info[0]?.elements ? info[0].elements.title?.props?.accent === true : true;
    h.textContent = title === null ? id : accent ? stripAccent(title) : title;
    placeholder.appendChild(h);
    host.appendChild(placeholder);
    section.appendChild(host);
    for (let k = 1; k < count; k++) {
      const frag = doc.createElement("span");
      frag.className = "fragment sd-step";
      frag.dataset.fragmentIndex = String(k - 1);
      frag.setAttribute("data-notes", escapeHtml(info[k]?.notes ?? ""));
      section.appendChild(frag);
    }
    slidesEl.appendChild(section);
    hosts.set(id, host);
  }
  doc.body.appendChild(reveal);

  // --- preview frames: muted media, motion indicator ---
  if (preview) {
    const mute = (root) => {
      for (const m of root.querySelectorAll?.("audio, video") ?? []) {
        m.muted = true;
        m.autoplay = false;
      }
    };
    mute(doc);
    new win.MutationObserver((records) => {
      for (const r of records) for (const n of r.addedNodes) if (n.nodeType === 1) {
        if (n.matches("audio, video")) n.muted = true;
        mute(n);
      }
    }).observe(doc.body, { childList: true, subtree: true });
    if (!motion) {
      const badge = doc.createElement("div");
      badge.className = "sd-motion-off";
      badge.textContent = "motion off";
      doc.body.appendChild(badge);
    }
  }

  // --- reveal ---
  // Reveal reads location.hash at init even with hash: false; the engine applies its own target
  // once reveal is ready, so whatever reveal picks first does not matter.
  // A preview frame is loaded at `#/<h>/<v>` without the fragment. Reveal's init `slidechanged` would be
  // posted to the speaker view (postMessageEvents) and relayed to the main window, sending the talk
  // back to step 0 of the slide. So postMessageEvents (read from the query at init) is held back
  // during init, then switched on and the `ready` handshake replayed.
  let relayEvents = false;
  if (preview) {
    const url = new URL(win.location.href);
    if (/^true$/i.test(url.searchParams.get("postMessageEvents") ?? "")) {
      relayEvents = true;
      url.searchParams.delete("postMessageEvents");
      win.history.replaceState(win.history.state, "", url.href);
    }
  }
  await Reveal.initialize({
    width: CANVAS.w,
    height: CANVAS.h,
    margin: 0,
    minScale: 0.05,
    maxScale: 8,
    center: false,
    hash: false,
    history: false,
    respondToHashChanges: false,
    fragmentInURL: false,
    transition: "none",
    backgroundTransition: "none",
    autoAnimate: false,
    controls: false,
    progress: true,
    slideNumber: false,
    autoPlayMedia: preview ? false : null,
    plugins: RevealNotes ? [RevealNotes] : [],
  });
  if (relayEvents) {
    Reveal.configure({ postMessageEvents: true });
    if (win.parent !== win) {
      win.parent.postMessage(JSON.stringify({ namespace: "reveal", eventName: "ready", state: Reveal.getState() }), "*");
    }
  }

  // --- mounting ---
  const runtimes = new Map(); // id -> Promise<runtime>
  const pending = new Set();
  const lastIndex = (id) => stepsOf(id).length - 1;
  const track = (p) => {
    pending.add(p);
    p.finally(() => pending.delete(p)).catch(() => {});
  };
  // `runtimes` holds the mount alone. A neighbour's prefetch (rt.goTo to the state reveal will show
  // when it arrives there) runs beside it, tracked by idle() but never awaited by show(): a component
  // that is slow to settle on a neighbour must not hold up navigation to the slide asked for.
  const ensure = (id, step) => {
    if (!runtimes.has(id)) {
      const p = mount(id, (root) => hosts.get(id).replaceChildren(root));
      runtimes.set(id, p);
      track(p);
      if (step !== null) track(p.then((rt) => rt.goTo(step, { animate: false })));
    }
    return runtimes.get(id);
  };
  const approach = (id) => {
    const i = ids.indexOf(id);
    if (i > 0) ensure(ids[i - 1], lastIndex(ids[i - 1]));
    if (i >= 0 && i < ids.length - 1) ensure(ids[i + 1], 0);
  };

  // --- engine <-> reveal ---
  let target = null; // { slide, index }: the latest navigation asked of the engine
  const writeHash = () => {
    if (preview || !target) return;
    const stepId = stepsOf(target.slide)?.[target.index];
    if (stepId === undefined) return;
    const hash = formatHash(target.slide, stepId);
    if (win.location.hash !== hash) win.history.replaceState(win.history.state, "", hash);
  };
  const syncReveal = () => {
    const h = ids.indexOf(target.slide);
    if (h === -1 || target.index < 0) return;
    const cur = Reveal.getIndices();
    const f = target.index - 1;
    if (cur.h !== h || (cur.f ?? -1) !== f) Reveal.slide(h, 0, f);
  };
  const fromReveal = () => {
    const { h, f } = Reveal.getIndices();
    const slide = ids[h];
    if (slide === undefined) return;
    const index = (f ?? -1) + 1;
    if (target && target.slide === slide && target.index === index) return;
    api.goTo(slide, index);
  };
  for (const type of ["slidechanged", "fragmentshown", "fragmenthidden"]) Reveal.on(type, fromReveal);

  // While presenting, a bad hash (unknown slide or step, bad escape) records an error and the talk
  // stays where it is; the hash is written back to match it.
  const onHashChange = () => {
    const t = parseHash(win.location.hash);
    if (!t) return;
    const r = fromHash(t);
    if (r.error) {
      errors.push(`stepdeck: ${r.error} in the URL hash`);
      writeHash();
      return;
    }
    api.goTo(r.slide, r.index);
  };
  if (!preview) win.addEventListener("hashchange", onHashChange);

  // --- initial target ---
  // Audience window: the engine hash, then ?slide=&step= (boot), then the first slide.
  // Preview frame: where reveal already is (the speaker view loads it at reveal's `#/<h>/<v>`). It must
  // not move on its own: the speaker view relays a preview's slide changes back to the main window.
  let initial = null;
  if (preview) {
    const { h, f } = Reveal.getIndices();
    if (ids[h] !== undefined) initial = { slide: ids[h], step: (f ?? -1) + 1 };
  } else {
    // On load, a bad hash records an error: an unknown step opens its slide at step 0; an unknown slide
    // or a bad escape opens the deck as if there were no hash.
    const t = parseHash(win.location.hash);
    if (t) {
      const r = fromHash(t);
      if (!r.error) initial = { slide: r.slide, step: r.index };
      else {
        errors.push(`stepdeck: ${r.error} in the URL hash`);
        if (!t.error && ids.includes(t.slide)) initial = { slide: t.slide, step: 0 };
      }
    }
    // No usable hash: boot's start (?slide=&step=, else the first slide). An unknown step there opens
    // the slide at step 0 too; an unknown slide is left to boot, which shows it as a fatal error.
    if (!initial && start && ids.includes(start.slide)) {
      const r = resolve(start.slide, start.step);
      if (!r.error) initial = { slide: r.slide, step: r.index };
      else {
        errors.push(`stepdeck: ${r.error}`);
        initial = { slide: start.slide, step: 0 };
      }
    }
  }

  const host = {
    current: null,
    initial,
    // Returns false to refuse a target (unknown slide or step): the error is recorded and the talk,
    // reveal and the hash stay where they are.
    navigated(slide, step) {
      const r = resolve(slide, step);
      if (r.error) {
        errors.push(`stepdeck: ${r.error}`);
        return false;
      }
      target = r;
      writeHash();
      syncReveal();
    },
    async show(slide, step) {
      if (!hosts.has(slide)) throw new Error(`unknown slide '${slide}' (slides: ${ids.join(", ")})`);
      const previous = host.current;
      const rt = await ensure(slide, null);
      if (previous && previous !== rt) {
        try {
          previous.pause();
        } catch (e) {
          errors.push(`${previous.id}: ${message(e)}`);
        }
      }
      host.current = rt;
      approach(slide);
      await rt.goTo(step ?? 0, { animate: false });
    },
    idle: async () => {
      while (pending.size) await Promise.allSettled([...pending]);
    },
    showFatal(root) {
      const first = hosts.values().next().value;
      first?.replaceChildren(root);
    },
    async destroy() {
      win.removeEventListener("hashchange", onHashChange);
      for (const p of runtimes.values()) (await p.catch(() => null))?.destroy();
      runtimes.clear();
    },
  };
  // Teardown: a page kept in the back/forward cache (persisted) stays mounted.
  win.addEventListener("pagehide", (e) => {
    if (!e.persisted) void host.destroy();
  });
  return host;
}
