// SlideController: drives one slide's components through its steps (spec §6.2, §6.3).
// No DOM required: the shell injects mount points and the visibility callback, so this runs in Node.
//
// new SlideController({ slide, registry, ctxBase, mountPoint, settleTimeout })
//   slide       the slide spec (core/fold.js shape)
//   registry    { get(type) -> Promise<ComponentModule> }   (core/registry.js)
//   mountPoint  (elementId) -> el                            the element's box, laid out by the shell
//   settleTimeout  ms, default SETTLE_TIMEOUT_MS (10 s): the watchdog on every mount and update call
//   maxRun         ms, default MAX_RUN_MS (20 s): the longest run one update may declare with info.expect
//   ctxBase:
//     setVisible(id, visible, collapse)   required; the shell applies visibility to the element's box
//     enterBox(id, name, { duration, ease, signal }) -> Promise
//                                          optional; plays the box's entrance `name`. Called right after
//                                          setVisible(id, true), in the same synchronous block.
//     exitBox(id, name, { duration, ease, signal }, collapse) -> Promise
//                                          optional; plays the box's out motion, then hides the box itself.
//                                          Without these two (Node tests, older shells) visibility snaps.
//     load(path, opts?)                    data loader (core/data.js); also used for bindings
//     format(spec)                         makeFormat(lang) (core/format.js); also used for bindings
//     t(key)                               i18n bound to the deck language
//     capture                              boolean, passed through to ctx
//     tokens, palette                      passed through to ctx; tokens also give the step's motion
//                                          timing (--sd-duration, --sd-easing, --sd-stagger, --sd-enter)
//     d3                                   optional; defaults to core/d3.js
//     onError(id, error)                   optional; called once when an element fails (the shell shows it)
//
// ctx.stepProps is the element's props at every step of its slide: a frozen array, index = step index, length =
// the slide's step count. Entry k is stateAt(slide, k).elements[id].props resolved like update's props, or null when
// step k does not fold or the element's bindings fail there (that step's own goTo reports the error). It is computed
// once in mount(), before the element's mount, so a component can fix a scale across steps. A child mounted with
// ctx.mount gets null.
//
// ctx.size is { w, h } in canvas pixels (offsetWidth/offsetHeight, unaffected by the shell's scaling).
// ctx.motion is makeMotion(tokens) (core/motion.js): the named motions with the theme's defaults.
// ctx.chart is chartKit (core/chart.js): the one frozen chart-building-blocks object, the same for every component
// and child.
// ctx.map is mapKit (core/map.js): the frozen geography building blocks (boundaries, projection, view, lookup, painters), the same
// for every component and child.
//
// ctx.mount(type, el, props) -> Promise<handle>   (spec §6.3: built-ins inside a custom component)
//   Resolves `type` through the same registry (deck components first, then built-ins; so a custom
//   component can mount another deck component too), resolves bindings in `props`, and mounts the
//   component into `el` with a child ctx (same d3/data/format/t/tokens/palette/animate/motion/chart/map/capture; `size`
//   measured from `el`; its own ctx.mount for deeper nesting). The handle is
//     { instance, update(props, info), pause(), destroy() }
//   update resolves bindings, then calls instance.update(props, info') where info' is the parent's
//   `info` (animate, signal, entered, entrance, step, transition, expect: the parent supplies them; pass the parent's
//   signal so an abort propagates) with `prev` and `changed` replaced by the child's own last props and
//   changed keys. The handle never skips an update: skipping no-ops is the parent's call. A child that gets
//   entered: true with no entrance renders at once (the parent's box carries the entrance); a parent that
//   wants its child to build passes `entrance` through.
//   handle.destroy() is idempotent and removes the child from the parent's list (swap a child freely);
//   after it, pause is a no-op and update throws.
//   Children are tracked per parent element and are paused/destroyed with it (children after the parent,
//   newest first), also when the parent's own mount throws or the slide is destroyed while it mounts.
//   A child that throws (in mount or in update) rejects the promise the parent awaits, so it ends as the
//   parent element's error; a parent that swallows it keeps the slide working either way.
//
// Lifecycle:
//   mount()   mounts every element (hidden ones too) with its step-0 resolved props. It does not
//             apply visibility and does not count as an applied state. It also reads, once per type,
//             whether the component owns its entrance (`"x-enter": "own"` in registry.schema(type));
//             a schema that cannot be read counts as not owned.
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
//
//             On an animating step, elements that change visibility move (core/choreography.js):
//             - Entering elements (hidden -> visible) take stagger slots in slide order: element i is
//               held i * stagger + its own `delay` ms (abort-aware). Then, in one synchronous block, it
//               gets setVisible(id, true), enterBox when its box moves, and its update. A component
//               that owns its entrance builds itself instead of the box moving: its update gets
//               info.entrance = { motion: "draw" | "none", duration } (duration: the element's own, or
//               undefined). info.entrance is null in every other update.
//             - Exiting elements (visible -> hidden) start at once: exitBox, then update. An exit that
//               snaps (collapse: true, or "none") gets setVisible at once instead.
//             Timing comes from ctxBase.tokens and the step's transition (core/motion.js timing); an
//             element's own `duration` wins. A step whose duration is 0 holds nothing and snaps.
//             On abort every held element is released at once and moves with the aborted signal.
//             Elsewhere (first goTo, jumps, backward, animate not requested) nothing is held and
//             visibility snaps, as above. Each element's hold, box motion and update run inside its
//             watchdog; the step settles when all of them have.
//   finish()  ends the motion at once: the goTo being applied is superseded by the same target without animation
//             (its updates see their signal abort and snap), and a newer queued target is made non-animated.
//             Resolves when the latest target is applied; at once when idle. The shell calls it when the page
//             is hidden, where the browser stops animation frames and throttles timers.
//   settled() resolves when no goTo is in flight.
//   pause()   aborts the in-flight goTo and calls instance.pause(). An element still held for its stagger
//             slot is released by that abort only after pause() returns: it then gets setVisible, enterBox
//             and update (with the aborted signal, so everything snaps) after its instance's pause().
//   destroy() aborts, drops pending targets and calls instance.destroy().
//   state     null until the first goTo; then { step, stepId, elements, title, notes, transition }
//             (stateAt shape; elements[id].props are binding-resolved for live elements).
//   errors    "<slide>/<element>: <message>" lines. A failing element (unknown component, binding
//             error, mount or update throwing) is recorded once and gets no further mount/update calls.
//   Watchdog: a mount or update call that has not settled after `settleTimeout` fails its element with
//             "<slide>/<element>: did not settle within 10s", aborts that element's signal and lets the
//             slide go on (a component that never settles must not freeze the talk). A mount that
//             settles after its watchdog fired is destroyed at once; a late update is ignored.
//             An update may declare a long run with info.expect(ms): the deadline becomes
//             max(deadline, now + ms + settleTimeout), so it only extends. ms must be a finite number >= 0
//             (TypeError otherwise) and at most `maxRun` (Error otherwise), and no deadline may pass
//             maxRun + 2 × settleTimeout from the start of the update (Error otherwise: repeated calls cannot
//             extend it for ever); all throw inside the update, so they end as that element's error. Mount
//             has no expect. A ctx.mount child gets the parent's expect through the spread info, so it extends
//             the parent element's deadline, on the parent's clock.
import { initialElements, stateAt, stepCount, stepIndex } from "./fold.js";
import { resolveElementProps } from "./bindings.js";
import { animate as animateHelpers, wait } from "./animate.js";
import { MOTION_NAMES, makeMotion, timing } from "./motion.js";
import { DEFAULT_ENTER, motionParts, resolveEntrance, resolveExit, slotDelays } from "./choreography.js";
import { d3 as defaultD3 } from "./d3.js";
import { chartKit } from "./chart.js";
import { mapKit } from "./map.js";
import { MAX_RUN_MS } from "./constants.js";

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
 * One call's watchdog. `race(promise)` rejects with "did not settle within <ms>" (after calling onTimeout)
 * when the deadline passes first; the timer is always cleared. `expect(runMs)` is the update's declared long run
 * (`info.expect`): the deadline becomes max(deadline, now + runMs + ms), so it only ever extends. A `runMs`
 * that is not a finite number >= 0 throws a TypeError; one above `maxRun` throws an Error, and so does a call
 * whose deadline would pass `maxRun + 2 × ms` from the start of the call: the runs one update declares, together
 * with the time before and after them, stay within that, however many calls declare them. The bound is on the
 * deadline, not on a sum of the declared runs, so a `ctx.mount` child that declares the run its parent declared
 * (both on the parent's clock) counts once. All three throw from inside the component's update, so they end as
 * that element's error. Once the call has settled or timed out, `expect` still validates but changes nothing.
 */
function deadline(ms, onTimeout, maxRun) {
  let timer;
  let start = 0;
  let end = 0;
  let over = false;
  let fail;
  const arm = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      over = true;
      try {
        onTimeout?.();
      } finally {
        fail(new Error(`did not settle within ${durationText(ms)}`));
      }
    }, Math.max(0, end - Date.now()));
  };
  return {
    race(promise) {
      const timeout = new Promise((_, reject) => (fail = reject));
      start = Date.now();
      end = start + ms;
      arm();
      return Promise.race([promise, timeout]).finally(() => {
        over = true;
        clearTimeout(timer);
      });
    },
    expect(runMs) {
      if (typeof runMs !== "number" || !Number.isFinite(runMs) || runMs < 0) {
        throw new TypeError("info.expect(ms) needs a number of milliseconds ≥ 0");
      }
      if (runMs > maxRun) throw new Error(`a run of ${(runMs / 1000).toFixed(1)} s is longer than ${maxRun / 1000} s; split it across steps`);
      const next = Date.now() + runMs + ms;
      if (over) return;
      if (next > start + maxRun + 2 * ms) {
        throw new Error(`the runs declared in one update add up to more than ${maxRun / 1000} s; split them across steps`);
      }
      if (next <= end) return;
      end = next;
      arm();
    },
  };
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

/** Calls fn and returns its result as a promise; a synchronous throw becomes a rejection. */
function attempt(fn) {
  try {
    return Promise.resolve(fn());
  } catch (error) {
    return Promise.reject(error);
  }
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
  #job = null; // the { index, animate } being applied
  #loop = null;
  #appliedIndex = null;
  #destroyed = false;
  #settleTimeout;
  #maxRun;
  #owns = new Map(); // type -> true when its schema declares "x-enter": "own" (read in mount)
  #order = null; // element id -> index in slide order
  #motion = null; // ctx.motion, shared by every component of the slide

  state = null;
  errors = [];

  constructor({ slide, registry, ctxBase, mountPoint, settleTimeout = SETTLE_TIMEOUT_MS, maxRun = MAX_RUN_MS }) {
    this.#settleTimeout = settleTimeout;
    this.#maxRun = maxRun;
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

  /**
   * `holder` is the parent element's child list (see #mountChild); children destroy with it.
   * `stepProps` is the element's props at every step (see the header); null for a child.
   */
  #ctxFor(el, holder, stepProps = null) {
    const base = this.#ctxBase;
    return {
      d3: base.d3 ?? defaultD3,
      data: base.load,
      assetUrl: base.load?.url,
      format: base.format,
      t: base.t,
      capture: Boolean(base.capture),
      animate: animateHelpers,
      motion: (this.#motion ??= makeMotion(base.tokens ?? {})),
      tokens: base.tokens,
      palette: base.palette,
      chart: chartKit,
      map: mapKit,
      size: sizeOf(el),
      stepProps,
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
    const types = [...new Set(entries.map(([, e]) => e.type))];
    const folded = this.#foldEachStep();
    const [loaded] = await Promise.all([
      Promise.allSettled(
        entries.map(async ([id, e]) =>
          Promise.all([this.#registry.get(e.type), this.#resolve(e.type, e.props), this.#stepPropsOf(id, e.type, folded)]),
        ),
      ),
      Promise.all(types.map((type) => this.#readOwns(type))),
    ]);
    for (const [i, [id]] of entries.entries()) {
      if (this.#destroyed) return;
      const { status, value, reason } = loaded[i];
      if (status === "rejected") {
        this.#fail(id, reason);
        continue;
      }
      try {
        const [mod, props, stepProps] = value;
        const el = this.#mountPoint(id);
        const holder = newHolder();
        let instance;
        const call = Promise.resolve().then(() => mod.mount(el, props, this.#ctxFor(el, holder, stepProps)));
        try {
          const clock = deadline(
            this.#settleTimeout,
            () => {
              // Too late to use: whatever it mounts (children included) is destroyed when it settles.
              call.then((late) => destroyRecord({ instance: late, holder }), () => destroyRecord({ instance: null, holder }))
                .catch(() => {});
            },
            this.#maxRun,
          );
          instance = await clock.race(call);
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

  /** The slide's state at every step, folded once; null for a step that does not fold. */
  #foldEachStep() {
    return Array.from({ length: stepCount(this.#slide) }, (_, k) => {
      try {
        return stateAt(this.#slide, k);
      } catch {
        return null; // that step's own goTo reports the error
      }
    });
  }

  /**
   * ctx.stepProps for element `id`: its resolved props at every step, frozen. An entry is null when the step
   * did not fold or the element's bindings fail there.
   */
  async #stepPropsOf(id, type, folded) {
    const entries = await Promise.all(
      folded.map(async (st) => {
        const e = st?.elements[id];
        if (!e) return null;
        try {
          return await this.#resolve(type, e.props);
        } catch {
          return null;
        }
      }),
    );
    return Object.freeze(entries);
  }

  /** Whether `type` owns its entrance; never throws (an unreadable schema counts as not owned). */
  async #readOwns(type) {
    let owns = false;
    try {
      owns = (await this.#registry.schema?.(type))?.["x-enter"] === "own";
    } catch {
      // The element's box moves instead; a missing component fails on its own when it is loaded.
    }
    this.#owns.set(type, owns);
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

  /**
   * Ends the motion now: the goTo being applied is superseded by the same target, not animated, and a newer
   * queued target is made non-animated. Every update in flight sees its signal abort and snaps to its end state.
   * Resolves when the latest target is applied; at once when idle. Re-queuing the target (rather than only
   * aborting) keeps one still resolving its bindings from being dropped.
   */
  finish() {
    if (this.#destroyed || !this.#loop) return Promise.resolve();
    if (this.#pending) {
      this.#pending = { ...this.#pending, animate: false };
    } else if (this.#job) {
      this.#pending = { index: this.#job.index, animate: false };
    }
    this.#current?.abort();
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
        this.#job = job;
        try {
          await this.#apply(job, ac.signal);
        } finally {
          this.#current = null;
          this.#job = null;
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
    // What moves is decided against the last applied state, before rec.applied moves on.
    const moves = info0.animate ? this.#moves(resolved, info0) : new Map();
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
      const move = moves.get(id);
      // A moving element's visibility is applied by its move: after its hold, or by exitBox.
      if (visibilityChanged && !move) {
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
      const clock = deadline(this.#settleTimeout, () => own.abort(), this.#maxRun);
      const info = {
        ...info0,
        expect: clock.expect,
        signal: AbortSignal.any([signal, own.signal]),
        prev,
        changed: changedKeys(prev, props),
        entered: e.visible && (!last || !last.visible),
        entrance: move?.entrance ?? null,
      };
      const update = () => rec.instance.update(props, info);
      const run = move ? () => this.#play(id, e, move, update, info.signal, own.signal) : update;
      calls.push(
        (async () => {
          try {
            await clock.race(Promise.resolve().then(run));
          } catch (error) {
            this.#fail(id, error);
          }
        })(),
      );
    }
    await Promise.all(calls);
  }

  /**
   * The entrances and exits an animating step plays, by element id:
   *   { delay, box, duration, ease, entrance }   an entering element
   *   { exit, duration, ease }                    an exiting element whose box plays `exit`
   * An exit that snaps (collapse, "none", or no exitBox in ctxBase) has no entry: its visibility is
   * applied at once, as on a non-animating step.
   */
  #moves(resolved, info0) {
    const base = this.#ctxBase;
    const tokens = base.tokens ?? {};
    const { duration, ease, stagger } = timing(tokens, info0);
    const snap = !(duration > 0); // a zero duration snaps the whole step, holds included
    const themeEnter = MOTION_NAMES.includes(tokens["--sd-enter"]) ? tokens["--sd-enter"] : DEFAULT_ENTER;
    const moves = new Map();
    const entering = [];
    const own = {};
    for (const [id, e, , isError] of resolved) {
      if (isError) continue;
      const wasVisible = this.#elements.get(id).applied?.visible === true;
      if (e.visible && !wasVisible) {
        const r = resolveEntrance(e.enter, { owns: this.#owns.get(e.type) === true, themeEnter });
        const entrance = r.own ? { motion: r.own, duration: snap ? 0 : r.duration } : null;
        moves.set(id, { delay: 0, box: r.box, duration: snap ? 0 : (r.duration ?? duration), ease, entrance });
        entering.push(id);
        own[id] = snap ? 0 : r.delay;
      } else if (!e.visible && wasVisible && base.exitBox) {
        const exit = resolveExit(e.exit, e.collapse);
        if (exit !== null) moves.set(id, { exit, duration: snap ? 0 : (motionParts(e.exit).duration ?? duration), ease });
      }
    }
    this.#order ??= new Map(initialElements(this.#slide).map((d, i) => [d.id, i]));
    entering.sort((a, b) => this.#order.get(a) - this.#order.get(b));
    const slots = slotDelays(entering, snap ? 0 : stagger, own);
    for (const id of entering) moves.get(id).delay = slots[id];
    return moves;
  }

  /**
   * One element's move and update; runs inside the element's watchdog. `timedOut` is the watchdog's
   * signal: once it fired the element has failed and gets no update.
   * - Entrance: held until its slot (released at once on abort), then setVisible, enterBox and update in
   *   one synchronous block, so the box's or the component's start state lands before the next paint.
   * - Exit: exitBox (which hides the box when its motion ends), then update.
   */
  async #play(id, e, move, update, signal, timedOut) {
    const base = this.#ctxBase;
    const opts = { duration: move.duration, ease: move.ease, signal };
    if (move.exit) {
      try {
        await base.exitBox(id, move.exit, opts, false);
      } catch (error) {
        try {
          base.setVisible?.(id, false, e.collapse); // end hidden anyway, as the state says
        } catch {
          // The motion's error is the one recorded.
        }
        throw error;
      }
      if (timedOut.aborted || this.#destroyed) return;
      return update();
    }
    await wait(move.delay, signal);
    if (this.#destroyed) return;
    base.setVisible?.(id, true, e.collapse);
    if (timedOut.aborted) return;
    const box = move.box && base.enterBox ? attempt(() => base.enterBox(id, move.box, opts)) : undefined;
    await Promise.all([box, attempt(update)]);
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
