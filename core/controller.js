// SlideController: drives one slide's components through its steps (spec §6.2, §6.3).
// No DOM required: the shell injects mount points and the visibility callback, so this runs in Node.
//
// new SlideController({ slide, registry, ctxBase, mountPoint, settleTimeout })
//   slide       the slide spec (core/fold.js shape)
//   registry    { get(type) -> Promise<ComponentModule> }   (core/registry.js)
//   mountPoint  (elementId) -> el                            the element's box, laid out by the shell
//   settleTimeout  ms, default SETTLE_TIMEOUT_MS (10 s): the watchdog on every mount and update call
//   ctxBase:
//     setVisible(id, visible, collapse)   required; the shell applies visibility to the element's box
//     load(path, opts?)                    data loader (core/data.js); also used for bindings
//     format(spec)                         makeFormat(lang) (core/format.js); also used for bindings
//     t(key)                               i18n bound to the deck language
//     capture                              boolean, passed through to ctx
//     tokens, palette                      passed through to ctx
//     d3                                   optional; defaults to core/d3.js
//     onError(id, error)                   optional; called once when an element fails (the shell shows it)
//
// ctx.size is { w, h } in canvas pixels (offsetWidth/offsetHeight, unaffected by the shell's scaling).
//
// ctx.mount(type, el, props) -> Promise<handle>   (spec §6.3: built-ins inside a custom component)
//   Resolves `type` through the same registry (deck components first, then built-ins; so a custom
//   component can mount another deck component too), resolves bindings in `props`, and mounts the
//   component into `el` with a child ctx (same d3/data/format/t/tokens/palette/animate/capture; `size`
//   measured from `el`; its own ctx.mount for deeper nesting). The handle is
//     { instance, update(props, info), pause(), destroy() }
//   update resolves bindings, then calls instance.update(props, info') where info' is the parent's
//   `info` (animate, signal, entered, step, transition: the parent supplies them; pass the parent's
//   signal so an abort propagates) with `prev` and `changed` replaced by the child's own last props and
//   changed keys. The handle never skips an update: skipping no-ops is the parent's call.
//   handle.destroy() is idempotent and removes the child from the parent's list (swap a child freely);
//   after it, pause is a no-op and update throws.
//   Children are tracked per parent element and are paused/destroyed with it (children after the parent,
//   newest first), also when the parent's own mount throws or the slide is destroyed while it mounts.
//   A child that throws (in mount or in update) rejects the promise the parent awaits, so it ends as the
//   parent element's error; a parent that swallows it keeps the slide working either way.
//
// Lifecycle:
//   mount()   mounts every element (hidden ones too) with its step-0 resolved props. It does not
//             apply visibility and does not count as an applied state.
//   goTo(ref, { animate })
//             applies the state at step `ref`. The first goTo after mount calls setVisible and update
//             for every element (prev: null, changed: all keys, entered: visible, animate: false).
//             After that, an element gets setVisible when its visibility changed, and update when its
//             resolved props or its visibility changed (deep compare). `animate` is honored only when
//             moving forward by exactly one step from the last applied step.
//             A new goTo aborts the in-flight one's signal, waits for it to settle and then applies only
//             the latest target (intermediate targets are dropped). Updates of one goTo run in parallel
//             across elements; each element's signal aborts when the goTo is superseded (and on its
//             own watchdog); updates of different goTos never overlap.
//             Resolves when the latest target is applied; rejects only for an unknown step ref.
//   settled() resolves when no goTo is in flight.
//   pause()   aborts the in-flight goTo and calls instance.pause().
//   destroy() aborts, drops pending targets and calls instance.destroy().
//   state     null until the first goTo; then { step, stepId, elements, title, notes, transition }
//             (stateAt shape; elements[id].props are binding-resolved for live elements).
//   errors    "<slide>/<element>: <message>" lines. A failing element (unknown component, binding
//             error, mount or update throwing) is recorded once and gets no further mount/update calls.
//   Watchdog: a mount or update call that has not settled after `settleTimeout` fails its element with
//             "<slide>/<element>: did not settle within 10s", aborts that element's signal and lets the
//             slide go on (a component that never settles must not freeze the talk). A mount that
//             settles after its watchdog fired is destroyed at once; a late update is ignored.
import { stateAt, stepIndex } from "./fold.js";
import { resolveElementProps } from "./bindings.js";
import { animate as animateHelpers } from "./animate.js";
import { d3 as defaultD3 } from "./d3.js";

/** Default watchdog per mount/update call (ms): well above the longest built-in motion. */
export const SETTLE_TIMEOUT_MS = 10_000;

const isObject = (v) => v !== null && typeof v === "object";

export function deepEqual(a, b) {
  if (a === b) return true;
  if (!isObject(a) || !isObject(b)) return Number.isNaN(a) && Number.isNaN(b);
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => Object.hasOwn(b, k) && deepEqual(a[k], b[k]));
}

const durationText = (ms) => (ms >= 1000 && ms % 1000 === 0 ? `${ms / 1000}s` : `${ms}ms`);

/**
 * Races `promise` against a timer of `ms`: rejects with "did not settle within …" (after calling
 * onTimeout) when the timer wins. The timer is always cleared.
 */
function watchdog(promise, ms, onTimeout) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      try {
        onTimeout?.();
      } finally {
        reject(new Error(`did not settle within ${durationText(ms)}`));
      }
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** Top-level keys whose values differ (added and removed keys included). */
function changedKeys(prev, next) {
  if (prev === null) return Object.keys(next);
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
  return [...keys].filter((k) => !(Object.hasOwn(prev, k) && Object.hasOwn(next, k) && deepEqual(prev[k], next[k])));
}

// Canvas pixels: offsetWidth/offsetHeight ignore the shell's CSS scale transform, while
// getBoundingClientRect would report scaled pixels. Plain objects (Node tests) fall back.
function sizeOf(el) {
  if (el && typeof el.offsetWidth === "number") return { w: el.offsetWidth, h: el.offsetHeight };
  if (el && typeof el.getBoundingClientRect === "function") {
    const r = el.getBoundingClientRect();
    return { w: r.width, h: r.height };
  }
  return { w: 0, h: 0 };
}

// Child bookkeeping (ctx.mount): every mounted element owns a holder listing the handles of the
// components it mounted through ctx.mount. A closed holder destroys children as they arrive.
const newHolder = () => ({ children: [], closed: false });

/** Runs every fn, in order, even when one throws; then throws the first failure. */
function runAll(fns) {
  let failure = null;
  for (const fn of fns) {
    try {
      fn();
    } catch (error) {
      failure ??= error;
    }
  }
  if (failure) throw failure;
}

function pauseHolder(holder, instance) {
  runAll([() => instance?.pause?.(), ...holder.children.map((child) => () => child.pause())]);
}

/**
 * Destroys the instance, then its children newest first; throws the first failure after all ran. A child
 * the instance destroys itself is destroyed once (a handle's destroy is idempotent).
 */
function destroyRecord({ instance, holder }) {
  holder.closed = true;
  runAll([() => instance?.destroy?.(), ...holder.children.splice(0).reverse().map((child) => () => child.destroy())]);
}

export class SlideController {
  #slide;
  #registry;
  #ctxBase;
  #mountPoint;
  #elements = new Map(); // id -> { instance, holder (ctx.mount children), applied: { props, visible } | null }
  #failed = new Set();
  #mounting = null;
  #pending = null; // latest requested { index, animate }
  #current = null; // AbortController of the goTo being applied
  #loop = null;
  #appliedIndex = null;
  #destroyed = false;
  #settleTimeout;

  state = null;
  errors = [];

  constructor({ slide, registry, ctxBase, mountPoint, settleTimeout = SETTLE_TIMEOUT_MS }) {
    this.#settleTimeout = settleTimeout;
    this.#slide = slide;
    this.#registry = registry;
    this.#ctxBase = ctxBase ?? {};
    this.#mountPoint = mountPoint;
  }

  #fail(id, error) {
    if (this.#failed.has(id)) return;
    this.#failed.add(id);
    this.errors.push(`${this.#slide.id}/${id}: ${error?.message ?? String(error)}`);
    try {
      this.#ctxBase.onError?.(id, error);
    } catch {
      // A broken error hook must not break the slide; the error is already recorded.
    }
  }

  #resolve(type, props) {
    return resolveElementProps(type, props, this.#ctxBase.load, this.#ctxBase.format);
  }

  /** `holder` is the parent element's child list (see #mountChild); children destroy with it. */
  #ctxFor(el, holder) {
    const base = this.#ctxBase;
    return {
      d3: base.d3 ?? defaultD3,
      data: base.load,
      assetUrl: base.load?.url,
      format: base.format,
      t: base.t,
      capture: Boolean(base.capture),
      animate: animateHelpers,
      tokens: base.tokens,
      palette: base.palette,
      size: sizeOf(el),
      mount: (type, target, props) => this.#mountChild(holder, type, target, props),
    };
  }

  /** Mounts `type` into `target` for a parent whose children are `holder`. See the header. */
  async #mountChild(holder, type, target, props) {
    const [mod, resolved] = await Promise.all([this.#registry.get(type), this.#resolve(type, props ?? {})]);
    const own = newHolder();
    let instance;
    try {
      instance = await mod.mount(target, resolved, this.#ctxFor(target, own));
    } catch (error) {
      destroyRecord({ instance: null, holder: own });
      throw error;
    }
    let last = null; // like the controller: the first update is a full render (prev null)
    let destroyed = false;
    const resolveNext = (next) => this.#resolve(type, next ?? {});
    const handle = {
      instance,
      async update(next, info = {}) {
        if (destroyed) throw new Error(`ctx.mount('${type}'): update called on a destroyed child`);
        const props = await resolveNext(next);
        if (destroyed) throw new Error(`ctx.mount('${type}'): child destroyed while its props resolved`);
        const prev = last;
        last = props;
        return instance.update?.(props, { ...info, prev, changed: changedKeys(prev, props) });
      },
      pause() {
        if (!destroyed) pauseHolder(own, instance);
      },
      /** Idempotent; also leaves the parent's child list, so a swapped child is never destroyed twice. */
      destroy() {
        if (destroyed) return;
        destroyed = true;
        const i = holder.children.indexOf(handle);
        if (i !== -1) holder.children.splice(i, 1);
        destroyRecord({ instance, holder: own });
      },
    };
    if (holder.closed) {
      handle.destroy(); // the parent is gone already (destroyed while this child was mounting)
    } else {
      holder.children.push(handle);
    }
    return handle;
  }

  mount() {
    this.#mounting ??= this.#mountAll();
    return this.#mounting;
  }

  async #mountAll() {
    const { elements } = stateAt(this.#slide, 0);
    // Load modules and resolve bindings in parallel, then mount in element order (deterministic).
    const entries = Object.entries(elements);
    const loaded = await Promise.allSettled(entries.map(async ([, e]) => Promise.all([this.#registry.get(e.type), this.#resolve(e.type, e.props)])));
    for (const [i, [id]] of entries.entries()) {
      if (this.#destroyed) return;
      const { status, value, reason } = loaded[i];
      if (status === "rejected") {
        this.#fail(id, reason);
        continue;
      }
      try {
        const [mod, props] = value;
        const el = this.#mountPoint(id);
        const holder = newHolder();
        let instance;
        const call = Promise.resolve().then(() => mod.mount(el, props, this.#ctxFor(el, holder)));
        try {
          instance = await watchdog(call, this.#settleTimeout, () => {
            // Too late to use: whatever it mounts (children included) is destroyed when it settles.
            call.then((late) => destroyRecord({ instance: late, holder }), () => destroyRecord({ instance: null, holder }))
              .catch(() => {});
          });
        } catch (err) {
          destroyRecord({ instance: null, holder }); // children the parent mounted before it threw
          throw err;
        }
        const rec = { instance, holder, applied: null };
        if (this.#destroyed) {
          destroyRecord(rec);
          return;
        }
        this.#elements.set(id, rec);
      } catch (err) {
        this.#fail(id, err);
      }
    }
  }

  goTo(ref, { animate = false } = {}) {
    let index;
    try {
      index = stepIndex(this.#slide, ref);
    } catch (error) {
      return Promise.reject(error);
    }
    if (this.#destroyed) return Promise.resolve();
    this.#pending = { index, animate: animate === true };
    this.#current?.abort();
    this.#loop ??= this.#drain();
    return this.#loop;
  }

  settled() {
    return this.#loop ?? Promise.resolve();
  }

  async #drain() {
    try {
      await this.mount();
      while (this.#pending && !this.#destroyed) {
        const job = this.#pending;
        this.#pending = null;
        const ac = new AbortController();
        this.#current = ac;
        try {
          await this.#apply(job, ac.signal);
        } finally {
          this.#current = null;
        }
      }
    } finally {
      this.#loop = null;
    }
  }

  async #apply({ index, animate }, signal) {
    const st = stateAt(this.#slide, index);
    const live = Object.entries(st.elements).filter(([id]) => this.#elements.has(id) && !this.#failed.has(id));

    const settled = await Promise.allSettled(live.map(async ([, e]) => this.#resolve(e.type, e.props)));
    const resolved = live.map(([id, e], i) => (settled[i].status === "fulfilled" ? [id, e, settled[i].value] : [id, e, settled[i].reason, true]));
    if (signal.aborted || this.#destroyed) return; // superseded while resolving: drop this target

    const steps = this.#slide.steps ?? [];
    const idOf = (i) => (i === null ? null : (steps[i]?.id ?? i));
    const info0 = {
      step: idOf(index),
      prevStep: idOf(this.#appliedIndex),
      animate: animate && this.#appliedIndex !== null && index === this.#appliedIndex + 1,
      signal,
      transition: st.transition,
    };
    this.#appliedIndex = index;
    // state.elements[id].props are the resolved props for live elements (raw props for failed ones).
    const elements = { ...st.elements };
    for (const [id, e, props, isError] of resolved) if (!isError) elements[id] = { ...e, props };
    this.state = { step: index, stepId: info0.step, ...st, elements };

    const calls = [];
    for (const [id, e, props, isError] of resolved) {
      if (isError) {
        this.#fail(id, props);
        continue;
      }
      const rec = this.#elements.get(id);
      const last = rec.applied;
      const visibilityChanged = !last || last.visible !== e.visible;
      const propsChanged = !last || !deepEqual(last.props, props);
      rec.applied = { props, visible: e.visible };
      if (visibilityChanged) {
        try {
          this.#ctxBase.setVisible?.(id, e.visible, e.collapse);
        } catch (error) {
          this.#fail(id, error);
          continue;
        }
      }
      if (!propsChanged && !visibilityChanged) continue;
      const prev = last ? last.props : null;
      // Each element gets its own signal: superseding the goTo aborts all of them, the watchdog only its own.
      const own = new AbortController();
      const info = {
        ...info0,
        signal: AbortSignal.any([signal, own.signal]),
        prev,
        changed: changedKeys(prev, props),
        entered: e.visible && (!last || !last.visible),
      };
      calls.push(
        (async () => {
          try {
            await watchdog(
              Promise.resolve().then(() => rec.instance.update(props, info)),
              this.#settleTimeout,
              () => own.abort(),
            );
          } catch (error) {
            this.#fail(id, error);
          }
        })(),
      );
    }
    await Promise.all(calls);
  }

  pause() {
    this.#current?.abort();
    for (const [id, rec] of this.#elements) {
      try {
        pauseHolder(rec.holder, rec.instance);
      } catch (error) {
        this.#fail(id, error);
      }
    }
  }

  destroy() {
    this.#destroyed = true;
    this.#pending = null;
    this.#current?.abort();
    for (const [id, rec] of this.#elements) {
      try {
        destroyRecord(rec);
      } catch (error) {
        this.#fail(id, error);
      }
    }
    this.#elements.clear();
  }
}
