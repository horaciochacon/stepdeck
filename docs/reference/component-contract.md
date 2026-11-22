# Component contract

This page is the exact contract between the engine and a component. It covers the folder a component lives in, how the engine finds it, every call the engine makes (`mount`, `update`, `anchor`, `pause`, `destroy`), the `info` argument, the `ctx` object, the watchdog and the rules every component must follow. It is for people who write deck components and for contributors who change the built-ins or the controller.

For a step-by-step tutorial, read [Writing a custom component](../guide/custom-components.md) first. Agents follow [skill/references/custom-components.md](../../skill/references/custom-components.md). The source of truth is the code: `core/controller.js` (the caller), `core/registry.js` (the lookup) and `schema/stepdeck.d.ts` (the types).

## Where a component lives

A component is a folder named after the component, dots included:

```text
components/<name>/
  index.js      the code: a module whose default export has mount()
  schema.json   the props, as JSON Schema 2020-12
  README.md     notes for users of the component (optional)
  example.js    a slide that uses it (optional)
```

| File | Read by | Required |
|---|---|---|
| `index.js` | The runtime only, through the registry. `validate` and `catalog` never import it. | Yes |
| `schema.json` | `validate` (props at every step; `component-missing` when absent), `catalog`. | Yes |
| `README.md` | `catalog <name> --json` (`readme`, `null` when absent). | No |
| `example.js` | `catalog` (`example` path, `null` when absent). | No |

Because only the browser runs `index.js`, the behaviour of `mount` and `update` is checked by `dump`, `check` and `check --played`, never by `validate`.

Built-ins live in the engine's `components/` and are listed in `components/index.json`: `text`, `chart.line`, `chart.bar`, `chart.points`, `terminal`, `markdown`, `big-number`, `list`, `diagram`, `chat`, `timeline`, `image`, `map`. Deck components live in the deck's `components/` and must be listed in `deck.js`:

```js
// deck.js (examples/spike)
components: ["demo.story"],
```

### How the registry finds a component

`createRegistry` in `core/registry.js` is told which names exist; it never scans folders.

1. If the name is in `deck.js` `components`:
   - and it is also a built-in name, lookup fails with `component '<n>' collides with built-in; use a namespace like 'my.<n>'`;
   - otherwise the deck folder is used.
2. Else, if it is a built-in name, the engine folder is used.
3. Else lookup fails with `unknown component '<n>'`, plus `; did you mean '<x>'?` when a known name is within `max(2, floor(length / 3))` edits.

The registry imports `<folder>/index.js` and uses `mod.default ?? mod`, so both a default export and named exports (`export function mount`) work. Modules and schemas are cached per name; a failed load is evicted, so a later lookup retries.

A lookup failure fails only the element that uses the name. `validate` reports the same cases before you open a browser: `component-collision` (for every declared deck component, used or not), `unknown-component` and `component-missing`.

### Names

`deck.js` accepts any name matching `^[a-z0-9][a-z0-9._-]*$`, and the registry only rejects collisions. `new-component` is stricter: it requires a dot namespace (`/^[a-z0-9][a-z0-9-]*(\.[a-z0-9][a-z0-9-]*)+$/`, for example `my.flow`), so a deck component can never collide with a built-in added later. Use a namespace for every deck component.

## The module

```ts
interface ComponentModule<P> {
  mount(el: HTMLElement, props: P, ctx: ComponentContext): ComponentInstance<P> | Promise<ComponentInstance<P>>;
}

interface ComponentInstance<P> {
  update(props: P, info: UpdateInfo<P>): void | Promise<void>;
  anchor?(ref: string): Box | null;
  pause?(): void;
  destroy?(): void;
}
```

The starter that `new-component` copies (`templates/component/index.js`) has this shape, shortened here:

```js
export default {
  mount(el, props, ctx) {
    const doc = el.ownerDocument;
    const list = doc.createElement("ol");
    el.appendChild(list);
    let rows = []; // [{ li, dot, label }], one per item, rebuilt by render when the items change
    // ...
    /** Writes the whole drawing for these props: the single source of truth. Returns the current item's index. */
    function render(props) { /* ... */ }

    let shown = render(props);

    return {
      async update(props, info) {
        const before = shown;
        shown = render(props);
        try {
          // A change only: on the step where the element appears (info.entered), the engine moves its box.
          if (info.animate && !info.entered && !info.signal?.aborted && shown > before) {
            const reached = rows.slice(before + 1, shown + 1).map((r) => r.li);
            for (const li of reached) li.style.opacity = "0"; // the start state, before any await
            const timing = ctx.motion.timing(info);
            await ctx.animate.stagger(reached, (li, i, o) => {
              li.style.opacity = "";
              return ctx.motion.in(li, "fade", { ...timing, signal: o.signal });
            }, timing);
          }
        } finally {
          for (const r of rows) r.li.style.opacity = "";
        }
      },
      destroy() {
        list.remove();
      },
    };
  },
};
```

## `mount(el, props, ctx)`

Builds the component's DOM inside `el` and returns the instance, or a promise of it.

| Argument | What it is |
|---|---|
| `el` | The element's box: a `div.sd-el[data-el][data-type]` inside its region (or positioned on the canvas when the element has a `box`). Build inside it; never replace it. When the element has a `ghost`, `el` already holds its placeholder (`div.sd-ghost`) as its first child, before you build: append your nodes inside `el`, never empty it (`el.innerHTML = …`, `el.replaceChildren(…)`, `el.textContent = …`), and keep references to the nodes you create instead of reaching them by index (`el.firstChild`, `el.children[0]`). |
| `props` | The element's props at step 0, with bindings resolved. |
| `ctx` | The [context](#ctx), built for this element. |

What the engine guarantees:

- **Every element mounts**, hidden ones included, with its step-0 resolved props. An element hidden until step 3 is already mounted when step 0 shows.
- **Mounts run in element order, one after another.** The modules and the bindings of all elements load in parallel first; then each `mount` is awaited before the next one starts. A slow `mount` delays the elements after it.
- **Mount is not a state.** No visibility has been applied yet, and the first `update` follows. The canvas is laid out (with the `sd-booting` class, `visibility: hidden`) and the theme fonts are loaded, so the component can measure.
- In the reveal shell a slide mounts when it comes near: the current slide and its neighbours.

If the module cannot be loaded, a binding fails, or `mount` throws or rejects, the element fails (see [Errors](#errors-and-the-watchdog)) and the rest of the slide carries on.

## `update(props, info)`

Renders the given state. It may return nothing or a promise; the engine waits for the promise.

The engine calls `update`:

- **Once for every live element on the first `goTo`** after mount, hidden elements included. This is a full render: `prev: null`, `changed` = every key, `animate: false`, `prevStep: null`, `entered` = whether the element is visible.
- **After that, only when the element's resolved props or its visibility changed** (deep comparison). A step that changes nothing for an element skips it, so a count-up never re-runs on a no-op step.
- **When only visibility changed**, with `changed: []`. `entered` is `true` when it became visible and `false` when it was hidden.

The visibility class (`sd-hidden` or `sd-collapsed`) is applied before that element's `update` is called. On an animating step this takes the element's motion into account: an entering element is held until its stagger slot, then shown and updated in one synchronous block (with its box motion started in the same block); a leaving element plays its out motion first, is hidden when it ends, and is updated after that. A leaving element with `collapse: true`, or `exit: "none"`, is hidden at once. See [Animation and motion](../guide/animation-and-motion.md#choreography-within-a-step).

Calls for one instance never overlap. On one step, the slide's elements update in parallel. When a new `goTo` arrives, the engine aborts the running step's signal, waits for its updates to settle, and then applies only the latest target; intermediate targets are dropped.

### `UpdateInfo`

| Field | Type | Meaning |
|---|---|---|
| `step` | `string \| number` | The step id, or the step index when the step has no id. For logging only: never branch on it. |
| `prevStep` | `string \| number \| null` | The previously applied step, the same way; `null` on the first update. |
| `animate` | `boolean` | Play motion. True only when the shell asked for motion (never while the page is hidden) and the move is forward by exactly one step from the last applied step. |
| `signal` | `AbortSignal` | Aborts when a newer `goTo` supersedes this step, when the slide is paused or destroyed, or when this element's watchdog fires. |
| `transition` | `{ duration?, stagger? } \| null` | The step's `transition`, as written in the slide; `null` when the step has none. |
| `prev` | `object \| null` | The previous resolved props; `null` on the first update. |
| `changed` | `string[]` | Top-level keys whose values differ from `prev`, added and removed keys included. All keys on the first update; `[]` when only visibility changed. |
| `entered` | `boolean` | The element just became visible. On the first update: it is visible. |
| `entrance` | `{ motion, duration } \| null` | Set only for a component whose `schema.json` declares `"x-enter": "own"`, in the update where its element becomes visible on an animating step (after its stagger hold); `null` in every other update. `motion` is `"draw"` (play your build from empty to these props; the box stays still) or `"none"` (render at once: the box moves instead, or nothing does). `duration` is the element's own `enter.duration` in ms (0 on a step whose duration is 0), or `undefined`: then time the build with `ctx.motion.timing(info)`. See [Owning the entrance](#owning-the-entrance). |
| `expect` | `(ms: number) => void` | Declares a long run for this update: the watchdog now waits `ms` plus `SETTLE_TIMEOUT_MS` from the call. See [Long runs: `info.expect`](#long-runs-infoexpect). |

`schema/stepdeck.d.ts` declares `transition?: Transition`; at runtime the field is always present and is `null` when the step has none.

When does `animate` come true? The shell requests motion only when the page is not in capture mode (`?capture`), not a presenter preview frame (`?receiver`), motion is on (no `prefers-reduced-motion`, or `?motion=full`), and the page is not hidden. Both shells render slide changes with `animate: false`; only a step change within the current slide passes the shell's motion request. The controller then narrows it to a forward move of exactly one step. A jump, a backward move and the first render never animate. See [Animation and motion](../guide/animation-and-motion.md).

**Hidden pages.** A hidden page (`document.visibilityState` is `"hidden"`) never animates: browsers deliver no animation frames to it and throttle its timers, so motion there would stall until the watchdog failed the element. A `goTo` asked while the page is hidden passes `animate: false`. When the page becomes hidden in the middle of a motion, the engine aborts that update's `info.signal` and applies the same target again without motion. This is the abort your component already handles: every `ctx.animate` helper jumps to its end state and resolves, and a component's own motion must do the same on `info.signal`, then leave exactly the end state `update` writes for the target.

A probe of the controller in Node, with an element `a` advanced by `advance`, an element `b` shown `from: 1` and an element `c` that never changes, gives:

```text
goTo(0)                    a: changed [n], entered true,  prev null, animate false, transition null
                           b: changed [k], entered false, prev null, animate false
                           c: changed [k], entered true,  prev null, animate false
goTo("two", animate)       a: changed [n], entered false, animate true, transition { duration: 200 }
                           b: changed [],  entered true,  animate true
                           c: (skipped)
goTo(2, animate)           (no update: nothing changed; info.step would be the number 2)
```

### Durations

Time your motion with `ctx.motion.timing(info, { factor, fast })`. It returns `{ duration, ease, stagger, signal }`: the theme's `--sd-duration` (× `factor`; `--sd-duration-fast` with `fast: true`), `--sd-easing` and `--sd-stagger`, each overridden by the step's `transition` (`duration` as it is, not scaled), and `info.signal`. A duration of 0 also gives a stagger of 0. Pass the result to `ctx.motion.in`/`out` and to every `ctx.animate` helper, `stagger` included, so your items follow the theme and the step.

The `ctx.animate` helpers on their own default to 400 ms and a 60 ms stagger when `duration` or `stagger` is `undefined`. If you call them without `ctx.motion.timing`, pass `info.transition?.duration`, which is `undefined` both when there is no transition and when it has no `duration`. Do not pass `info.transition && info.transition.duration`: when `transition` is `null` that yields `null`, which the helpers read as 0 and snap.

### Owning the entrance

When an element becomes visible on an animating step, the engine moves its box with the slide's `enter` or the theme's `--sd-enter`. A component therefore **must not fade itself in on `info.entered`**: the motion would play twice. Animate only changes while the element stays visible.

The box motion writes inline `opacity`, `transform` and `clip-path` on `el` while it plays (an exit too), and puts back exactly what was there when it ends. Inline styles beat stylesheet rules, so a slide's `style` (or a theme rule) that sets one of those three properties on the element box itself does not apply until the motion ends, and then it jumps in. Put such styling on a node inside the box instead, and leave those three properties on `el` to the engine.

A component whose content has a natural build (lines that draw, items that rise in turn) can play it instead. Declare `"x-enter": "own"` at the top level of `schema.json`; the engine reads it once per type when the slide mounts. Then:

- with `enter` unset or `"draw"`, the box stays still and `update` gets `info.entrance.motion === "draw"`: play the build from empty to the props, over `info.entrance.duration` or `ctx.motion.timing(info)`;
- with `enter` set to `"fade"`, `"rise"`, `"wipe"` or `"pop"`, the box moves and `update` gets `info.entrance.motion === "none"`: render at once;
- with `enter: "none"`, nothing moves and `info.entrance.motion` is `"none"`.

The engine holds the element until its stagger slot, then calls `setVisible` and `update` in one synchronous block. **Write the build's start state synchronously at the top of `update`, before any `await`**, so the finished state never paints before the build starts. The nine built-ins with `x-enter: own` (`chart.line`, `chart.bar`, `chart.points`, `big-number`, `list`, `chat`, `diagram`, `terminal`, `timeline`) all follow this pattern.

## Optional members

| Member | Called by | Meaning |
|---|---|---|
| `anchor(ref)` | Nothing in the engine today. | Canvas-pixel box `{ x, y, w, h }` of a named part, or `null`. Reserved for future annotation elements. Only `chart.line` implements it (`anchor("series:<name>")`). |
| `pause()` | `controller.pause()`, which the reveal shell calls on the slide you leave. The bare shell never pauses: it destroys the slide on every slide change. | Stop media and timers. The controller aborts the running step first, then calls `pause` on the instance and on its `ctx.mount` children. An element that was still held for its stagger slot is released by that abort a moment later: it is shown and gets its `update` (with the aborted signal, so it renders at once) after its `pause` was called. |
| `destroy()` | `controller.destroy()`: the bare shell on every slide change, the reveal shell on `pagehide`. Also a mount that settles after its watchdog fired. | Tear down. The controller calls the instance's `destroy`, then destroys its `ctx.mount` children, newest first. |

A throw from `pause` or `destroy` is recorded as that element's error; the other elements are still paused or destroyed. An element that failed after a successful mount is still paused and destroyed; an element whose mount failed is not.

## The rules

Each rule exists so that a step reached by playing looks exactly like the same step reached by jumping. `check --played` tests it at every step: it compares each element's presence, visibility, text, box and canvas state after a jump with those after an animated arrival from the step before and the step after, and reports `played-mismatch` when they differ.

| Rule | What to do |
|---|---|
| End at the target state, whatever `animate` says. | Keep one `render(props)` that writes the whole state from the props alone. Call it in every `update`, then animate only if `info.animate`. Never accumulate state across calls, and never read the step: drive an internal sequence through a prop (typically `stage` with `advance`). |
| Respect `signal`. | Pass `info.signal` to every `ctx.animate` helper and `await` them. On abort each helper jumps to its end state and resolves. Check `info.signal.aborted` before starting motion of your own. `STEPDECK.settled()` waits for your promise. |
| Leave no animation residue. | After the motion, clear the inline styles it wrote (`opacity`, `transform`, `clip-path`, dash styles), so the markup after a played step equals the markup after a jump. The helpers' end states are listed under [`ctx.animate`](#ctxanimate); `ctx.motion.in` puts back what it touched. |
| Do not fade in on `entered`. | The engine's box motion is the entrance. Animate changes only, or declare `"x-enter": "own"` and build on `info.entrance` (see [Owning the entrance](#owning-the-entrance)). |
| Write a start state synchronously. | A build's start state (and any item hidden until its turn) is written before the first `await` in `update`, so the end state never paints first. |
| Use `el.ownerDocument`, not the global `document`. | The renderer takes a `document` argument, and tests and the CLI run components in other documents. Every built-in creates nodes through `el.ownerDocument`. |
| No network. | Read deck files through `ctx.data` and `ctx.assetUrl`. Presentation makes no remote requests: the CLI's browser blocks every request to another origin and `check` reports it as `network-error`; `validate` reports remote URLs in props and styles as `remote-url`. |
| Settle. | `mount` and `update` must settle within 10 s, or within what `info.expect` declared (see below). |
| Use theme values. | Colors from `var(--sd-color-*)` and `ctx.palette()`, sizes from `--sd-font-size-*` and `--sd-space`, never literals. `check` measures your text like any other: size, contrast, overlap and staying inside the region. |

## Errors and the watchdog

Every `mount` and `update` call runs under a watchdog of `SETTLE_TIMEOUT_MS` = 10 000 ms (`core/controller.js`; configurable through the controller's `settleTimeout`). An `update` that declares a long run with [`info.expect`](#long-runs-infoexpect) gets more time: a run of up to `MAX_RUN_MS` = 20 000 ms (`core/constants.js`; the controller's `maxRun`), and never a deadline more than `MAX_RUN_MS` + 2 × `SETTLE_TIMEOUT_MS` (40 s) after the update started.

- **A call that does not settle in time** fails its element with `did not settle within 10s` and aborts that element's signal only. The rest of the slide goes on.
- **A mount that settles after its watchdog fired** is destroyed at once, with any children it mounted.
- **An update that settles late** is ignored.
- **A thrown error or rejected promise** in `mount` or `update` fails the element. So do an unknown or colliding component name and a binding error.

A failed element is recorded once, as `<slide>/<element>: <message>`, in the controller's `errors` (and so in `STEPDECK.errors`). Its box shows the message and stays visible. It gets no further `update` calls. `check` reports it as `render-error`; `dump` lists it under `errors`.

### Long runs: `info.expect`

A time-lapse can run longer than 10 s on purpose. Call `info.expect(ms)` in `update`, before the long `await`, to say how long the run will take:

```js
async update(props, info) {
  info.expect(15_000); // this update plays a 15 s time-lapse
  await playTimeLapse(props, info.signal);
}
```

- **The deadline becomes `max(deadline, now + ms + SETTLE_TIMEOUT_MS)`.** It only extends: a call that would end the deadline sooner changes nothing, and several calls keep the latest end.
- **Each call is capped at `MAX_RUN_MS`** (20 000 ms). A longer `ms` throws `a run of 25.0 s is longer than 20 s; split it across steps`: split the run across steps.
- **So is the whole update.** No call may set a deadline more than `MAX_RUN_MS` + 2 × `SETTLE_TIMEOUT_MS` (20 + 2 × 10 = 40 s) after the update started, so calling `expect` again after each `await` cannot keep an update alive for ever. Such a call throws `the runs declared in one update add up to more than 20 s; split them across steps`. The bound is on the deadline, not on a sum of what was declared: a child that declares the run its parent declared counts once, and an update that spends up to 10 s loading before it declares a 20 s run still gets the whole run.
- **A bad `ms` throws a `TypeError`** (`info.expect(ms) needs a number of milliseconds ≥ 0`) when it is not a finite number ≥ 0.
- **Every throw fails the element** like any other error thrown from `update`.
- **Only `update` has it.** A `mount` always has 10 s.
- **A `ctx.mount` child can call it too.** Its `info` carries the parent's `expect`, so the child extends the parent element's deadline.
- **Still abort-aware.** The element's `signal` aborts as before when a newer `goTo` supersedes the step, so a long run must still end at once on abort.

## `ctx`

`ctx` is built per element (`#ctxFor` in `core/controller.js`). Children mounted with `ctx.mount` get their own.

| Member | Type | What it is |
|---|---|---|
| `ctx.d3` | d3 v7 | The engine's d3 bundle (`core/d3.js`). |
| `ctx.data(path, { types })` | `Promise<any>` | Loads a deck file: `.json`, `.geojson` or `.csv`. Paths are relative to the deck folder. Results are cached and shared between elements: treat them as read-only and copy before sorting. For CSV, declared `types` (`string`, `number`, `date`) win. Errors: `data file not found: <path>`, `invalid data file <path>: …`, `unsupported data file type: …`. |
| `ctx.assetUrl(path)` | `string` | The full URL of a deck file (an image, say) for the browser to fetch. Same path rules as `ctx.data`; nothing is read, so a missing file shows up only when the browser loads it. Throws `data path must be relative to the deck root: <path>` for an absolute, remote or `..` path, and `data path may not contain '%': <path>`. Used by `image`. |
| `ctx.format(spec)` | `(n) => string` | A d3-format function localized to the deck language (`en`, `es`; unknown falls back to `en`). Negative numbers use U+2212. |
| `ctx.t(key)` | `string` | An engine string in the deck language. Keys: `section`, `step`, `of`, `error`, `tasks`, `files`, `ci95`, `forecast`, `noData`, `total`. An unknown key returns the key. |
| `ctx.capture` | `boolean` | True when rendering for screenshots (`?capture`). Nothing animates then; `info.animate` is already false. |
| `ctx.animate` | object | `fadeIn`, `reveal`, `drawPath`, `tween`, `stagger`. See below. |
| `ctx.motion` | object | The named motions with the theme's defaults: `in`, `out`, `timing`, `names`. See below. |
| `ctx.tokens` | `{ [name]: string }` | Every custom property declared in the theme's `tokens.css`, by full name, with its computed value on the canvas: `ctx.tokens["--sd-font-size-note"]`. |
| `ctx.palette(kind = "categorical")` | `Palette \| null` | `{ name, kind, colors, names, roles }` for `categorical`, `sequential` or `diverging`. `deck.palette` when its kind matches, else the theme default; `null` when there is none. `names` are in the deck language; `roles.accent` is the accent color. |
| `ctx.size` | `{ w, h }` | `el`'s `offsetWidth` and `offsetHeight` in canvas pixels (unaffected by the shell's scaling), measured once when `ctx` is built at mount. It is `{ w: 0, h: 0 }` when the element has no layout. Read `el.offsetWidth` and `el.offsetHeight` again in `update` if you need the current size. |
| `ctx.mount(type, el, props)` | `Promise<ChildHandle>` | Mounts a built-in or deck component inside yours. See below. |
| `ctx.stepProps` | `ReadonlyArray<Props \| null> \| null` | This element's resolved props at every step of its slide. A frozen array, computed once before `mount`; `null` for a child mounted with `ctx.mount`. See [`ctx.stepProps`](#ctxstepprops). |
| `ctx.chart` | `ChartKit` | The chart building blocks (layout maths, marks, joins, motion, canvas layer): one frozen object, the same for every component and child. See [`ctx.chart`](#ctxchart). |
| `ctx.map` | `MapKit` | The geography building blocks (boundaries, projection, views, the raster lookup, the vector painters): one frozen object, the same for every component and child. See [`ctx.map`](#ctxmap). |

### `ctx.animate`

Every helper takes `{ duration, signal }` (`duration` in ms, default 400; `<= 0` jumps to the end) and returns a promise that always settles. Abort never rejects: the helper jumps to its end state and resolves. The only rejection is an error thrown by your own callback or element, which then fails the element. The easing is cubic in-out. The helpers use `requestAnimationFrame`, or a 16 ms timer where there is none (Node).

| Helper | Motion | End state |
|---|---|---|
| `fadeIn(el, opts)` | Opacity 0 to 1. | `style.opacity = "1"` |
| `reveal(el, opts)` | Wipe in from the left with `clip-path`. | No `clip-path`. |
| `drawPath(path, opts)` | Draws an SVG path along its length with `stroke-dashoffset`. | No dash styles. |
| `tween(from, to, onValue, opts)` | Numbers only. `onValue(from)` first, one call per frame, `onValue(to)` always last. When `duration` <= 0 or the signal is already aborted, only `onValue(to)` is called. Takes an extra `ease`. | Whatever `onValue(to)` writes. |
| `stagger(items, fn, opts)` | Starts `fn(item, i, { duration, signal })` for item `i` after `i × stagger` ms (default 60; 0 when `duration` is 0). On abort every pending item starts at once with the aborted signal. Takes an extra `stagger`. | Waits for every item; rejects with the first error. |

`fadeIn` leaves `opacity: 1` inline: clear it after awaiting.

### `ctx.motion`

The named motions of `core/motion.js`, with the theme's tokens filled in. Every call writes only `opacity`, `transform` and `clip-path` on the node, and resolves (never rejects) at its end state on abort or a duration of 0.

| Member | What it does |
|---|---|
| `in(node, name, opts)` | Plays `name` (`fade`, `rise`, `wipe`, `pop`, `draw`, `none`; `draw` enters as a `wipe` on a node) to the shown state, then puts back exactly the inline `opacity`, `transform` and `clip-path` the node had when the call started. The start state is written synchronously, when the call is made. |
| `out(node, name, opts)` | Plays `name` to the hidden state and leaves it there (`rise` moves up as it fades, `pop` shrinks to 0.96, `draw` fades). Resolves with the inline values it replaced, so you can hide the node and then restore them. |
| `timing(info, { factor, fast })` | `{ duration, ease, stagger, signal }` from `--sd-duration` (or `--sd-duration-fast`), `--sd-easing` and `--sd-stagger`, overridden by `info.transition`. See [Durations](#durations). |
| `names` | `["fade", "rise", "wipe", "pop", "draw", "none"]`. |

`opts` is `{ duration, ease, signal, distance }`. A missing (or `undefined`) option takes the theme's value: `--sd-duration`, `--sd-easing`, and for `rise` `--sd-motion-distance`. An unknown name throws `unknown motion '<name>' (motions: fade, rise, wipe, pop, draw, none)`.

### `ctx.mount(type, el, props)`

Places another component inside yours, for example a built-in `text` under your own drawing. From `examples/spike/components/demo.story/index.js`:

```js
const caption = doc.createElement("div");
root.appendChild(caption);
const text = await ctx.mount("text", caption, { text: CAPTIONS[clampStage(props.stage)], role: "body" });
// later, in update(props, info):
await text.update({ text: CAPTIONS[stage], role: "body" }, info);
```

It resolves `type` through the same registry (deck components first, then built-ins), resolves the bindings in `props`, and mounts the component into `el` with a child `ctx` (the same `d3`, `data`, `assetUrl`, `format`, `t`, `tokens`, `palette`, `animate`, `motion`, `capture`; `size` measured from `el`; its own `mount`). It resolves to a handle:

| Handle member | Meaning |
|---|---|
| `instance` | The child's instance. |
| `update(props, info)` | Resolves the child's bindings, then calls the child's `update` with your `info` (`animate`, `signal`, `entered`, `entrance`, `step`, `transition`, …), with `prev` and `changed` replaced by the child's own. The first call has `prev: null` and every key changed. Pass your `signal` so an abort reaches the child. A child that gets `entered: true` with no `entrance` renders at once, because your box carries the entrance; a parent that owns its entrance passes `entrance` through, so a child chart or list builds with it. |
| `pause()` | Pauses the child and its children. A no-op after `destroy`. |
| `destroy()` | Idempotent. Destroys the child and its children and removes it from your list, so you can swap a child. |

Semantics:

- **The engine never updates children.** Your `update` calls `handle.update`, including on its own first update. The handle never skips a call; skipping no-ops is your decision. A built-in that renders nothing until its first update (such as `image`) stays empty until you call it.
- **Children belong to the parent element.** They are paused with it and destroyed after it, newest first. This also happens when the parent's own `mount` throws, and when the slide is destroyed while the parent or child is still mounting: the child is destroyed together with the parent once the parent's mount settles, or at once if it arrives after that.
- **No separate watchdog.** A child's `mount` and `update` run inside the parent's call, under the parent's watchdog; a child's `info.expect` extends it.
- **Errors propagate.** An unknown type rejects with the registry's message. A child that throws in `mount` or `update` rejects the promise you await, so it fails the parent element unless you catch it.
- `handle.update` after `destroy` throws `ctx.mount('<type>'): update called on a destroyed child`. A child destroyed while its props were resolving throws `ctx.mount('<type>'): child destroyed while its props resolved`.
- There is no nesting depth limit.

### `ctx.stepProps`

`ctx.stepProps[k]` is what `update` would receive as `props` at step `k` (an index, not a step id): the element's props after the slide's patches up to and including step `k`, with the bindings resolved the same way. The array has one entry per step (a slide without `steps` has one), is frozen, and is computed once, before your `mount` runs. A component that draws against a scale can use it to keep that scale the same on every step: the built-in charts size their axes this way (see [Charts keep one scale across steps](../guide/step-model.md#charts-keep-one-scale-across-steps)).

An entry is `null` when step `k` does not fold (for example a patch names an element that does not exist) or when the element's bindings fail at that step. The step's own navigation still reports the error, so skip `null` entries rather than treating them as an error. A child mounted with `ctx.mount` gets `ctx.stepProps === null`: use only its current props then.

```js
// A fixed y domain: the extent of `values` over every step, not only the current one.
const all = (ctx.stepProps ?? [props]).flatMap((p) => p?.values ?? []);
const y = ctx.d3.scaleLinear().domain(ctx.d3.extent(all)).range([height, 0]);
```

### `ctx.chart`

`ctx.chart` is the set of building blocks the built-in charts are made of, for a component that draws its own chart. A component that reads only `ctx.chart` needs no `import`, so it keeps working wherever the engine's files live. The object is frozen and is the same one for every component and child. The marks take d3 selections and write attributes; their colours and sizes are yours, from theme tokens and `ctx.palette()`, and the theme styles what it decides (the background outline of a dot, the ink of a whisker, the halos) through generic classes. Where an option says "value or accessor", a function is called per node as `(d, i, nodes)`.

**Public and internal.** The 33 names below are the contract: a change to one is a changelog entry. Everything else in the engine's `core/chart*.js` files (`chart-layout.js`, `chart-marks.js`, `chart-motion.js`, `chart-rules.js`) and in the built-ins' folders (`components/chart.line/fan.js`, `components/chart.points/model.js`, `components/chart.bar/modes.js` and the like) is internal, because the engine's path differs between the repository and a deck's `stepdeck/` copy and those files change with the charts. Use `ctx.chart`, not an import. A built-in that has a feature you want (the draw fan, the strips) is a reference to read, not an API.

The names are in eleven groups. Each group has its signatures and one short example. The examples are fragments: they assume a selection per kind of mark (`circles`, `whiskers`, `rules`, `labels`, `shade`, and the axis group `axisG`) and the rows, scales (`x`, `y`) and frame (`f`) of the groups before them. The Joins group shows a whole `update`, and `test/fixtures/decks/chart-kit/components/fixture.marks/index.js` is a working component that calls the Data, Frame, Joins, Motion, Marks and Canvas groups.

#### Data

| Name | Signature | What it does |
|---|---|---|
| `loadTable` | `loadTable(props, ctx, name, columns) → Promise<rows>` | Loads `props.data` and checks every column the props name (`columns` is `[prop, column, optional]`); throws the first problem. |
| `tickFormat` | `tickFormat(ctx, spec, ticks) → (n) => string` | The d3-format `spec`, else a fixed precision from the tick step. |
| `extentOf` | `extentOf(rows, columns, { zero }) → [min, max]` | The extent of the finite numbers in `columns`; blank cells are missing. |

Load a table, then size a scale from the rows. `extentOf` takes the finite numbers of the columns, so a blank cell never pulls the scale to zero. Give it the column every step names (see [`ctx.stepProps`](#ctxstepprops)) and the axis stays put as steps change.

```js
const rows = await ctx.chart.loadTable(props, ctx, "my.chart", [["x", props.x], ["y", props.y], ["id", props.id, true]]);
const columns = (ctx.stepProps ?? [props]).map((p) => p?.y); // the y column of every step; a null step is skipped
const [lo, hi] = ctx.chart.extentOf(rows, columns, { zero: true }); // one domain for every step
const fmt = ctx.chart.tickFormat(ctx, props.format?.y, ctx.d3.scaleLinear().domain([lo, hi]).ticks(5));
```

#### Frame

| Name | Signature | What it does |
|---|---|---|
| `frame` | `frame(el, ctx, margin) → { w, h, font, charW, margin, pw, ph }` | The element's size and the plot inside it. `font` is `--sd-font-size-label` (28 without it), `charW` is 0.6 × `font`. `margin` is `{ left, right, top, bottom }` or a function of `{ font, charW, w, h }` returning it; each side is rounded. `pw` and `ph` are at least 1. |

The element's size and the plot inside it. Margins come from character counts, not measured text, so the layout does not depend on font loading.

```js
const f = ctx.chart.frame(el, ctx, ({ font, charW }) => ({ left: charW * 4, right: font, top: font, bottom: font * 2 }));
const x = ctx.d3.scaleLinear().domain([lo, hi]).range([0, f.pw]);
```

#### Joins

| Name | Signature | What it does |
|---|---|---|
| `keyed` | `keyed(selection, data, key, enter) → selection` | A keyed join: an update clears `.sd-exiting`, an exit sets it, nothing is removed. |
| `settle` | `settle(root)` | The start of an end-state write: removes `.sd-exiting` nodes (and their `halo` copies) and every `style` and `opacity` attribute under `root`, and marks what remains as already on screen. Run it after the `keyed` joins, which mark the leavers, and before the attributes: a `settle` before the joins leaves every leaver on screen. Pass the SVG root, never the element box: the canvas layer keeps its inline size and position. |

A keyed join marks leavers instead of removing them, so a morph can fade them out; `settle` then removes them. Joins first, then `settle`, then every attribute (see the update order below).

```js
ctx.chart.keyed(g.selectAll("circle"), rows, (r) => r.key, (enter) => enter.append("circle"));
ctx.chart.settle(svg.node()); // the SVG root, never the element box
```

Write an update as the `keyed` joins, then `settle(svg)`, then every attribute, so a played step ends exactly where a jump does and a mark that left is gone:

```js
async update(props, info = {}) {
  const f = ctx.chart.frame(el, ctx, ({ font, charW }) => ({ left: charW * 4, right: font, top: font, bottom: font * 2 }));
  join(props); // ctx.chart.keyed joins: leavers get .sd-exiting, nothing is removed yet
  if (info.animate && last && !info.entered) await ctx.chart.morph(info, ctx, (t) => draw(f, ctx.chart.lerp(last.k, props.k, t)));
  ctx.chart.settle(svg.node()); // removes the leavers and the animation's leftovers
  draw(f, props.k); // the end state, every attribute
}
```

The same order, step by step, in a component of its own: [Build a chart from the engine's pieces](../guide/custom-components.md#build-a-chart-from-the-engines-pieces).

#### Motion

| Name | Signature | What it does |
|---|---|---|
| `morph` | `morph(info, ctx, frame, { factor, duration }) → Promise` | Plays `frame(t)` for t from 0 to 1 over `duration`, else the step's transition, else `factor` (default 2) × `--sd-duration`, with the theme's easing and the step's `signal`. |
| `entrance` | `entrance(info, ctx, { factor }) → { draw, duration, ease, signal }` | For a component that owns its entrance: `draw` is true for a draw entrance that is not aborted; `duration` is `info.entrance.duration`, else as `morph`'s. |
| `undraw` | `undraw(path)` | Hides an SVG path along its length: the start state of `ctx.animate.drawPath`. |
| `lerp` | `lerp(a, b, t) → value` | `a + (b - a) × t`, and exactly `b` when `t` is 1. When `a` or `b` is `null` or undefined, the result is `b`. |

`morph` runs one tween over the theme's timing and the step's `signal`; you write the end state yourself afterwards. A component that owns its entrance asks `entrance` whether to draw. Inside a frame, `lerp` blends each value from where it was to where it goes: a mark with no previous value (`null`) is drawn where it ends, and at `t` = 1 the value is exactly the end value, as a jump writes it.

```js
const e = ctx.chart.entrance(info, ctx); // { draw, duration, ease, signal }
if (e.draw) ctx.chart.undraw(line.node()); // before the first await: the element is shown in this same task, undrawn
const rows = await ctx.chart.loadTable(props, ctx, "my.chart", columns);
// … the joins, settle and the end state, every attribute …
if (e.draw) await ctx.animate.drawPath(line.node(), { duration: e.duration, signal: e.signal });
else if (info.animate && last && !info.entered) await ctx.chart.morph(info, ctx, (t) => place(t));
// in place(t): each dot from its last x (a Map by key) to its new one; a new dot starts where it ends
circles.attr("cx", (d) => ctx.chart.lerp(lastX.get(d.key), x(d.value), t));
```

#### Order

| Name | Signature | What it does |
|---|---|---|
| `rank` | `rank(items, sort) → keys` | Category keys in display order; missing values last. |

Category keys in display order for a `sort` prop: `"none"`, `"value"`, `"-value"`, `{ by, order }` or a list. It throws a message that names an unknown column or category.

```js
const keys = ctx.chart.rank(rows.map((r) => ({ key: r.group, value: r.score, columns: { later: r.later } })), props.sort);
```

#### Marks

| Name | Signature | What it does |
|---|---|---|
| `dot` | `dot(selection, { r, color, hollow })` | Class `sd-dot` (`sd-dot-hollow` when hollow) and `r`. Filled: `fill` is `color`, and the theme outlines it in the background colour. Hollow: `stroke` is `color`, and the theme fills it with the background colour. Options are values or accessors; positions are yours. |
| `whisker` | `whisker(selection, { at, lo, hi, cap, orient })` | On each `g`, class `sd-whisker` and the lines `sd-whisker-line`, `sd-whisker-cap-lower` and `sd-whisker-cap-upper`, placed from `lo` to `hi` across `at` (`orient`: `"horizontal"`, the default, or `"vertical"`). The theme draws them in the ink colour. |
| `rule` | `rule(selection, { x1, y1, x2, y2, label, anchor }) → selection` | On each `g`, a `line.sd-rule` and, while `label` is not empty, a `text.sd-rule-label` at the rule's `"start"` (default), `"middle"` or `"end"`. |
| `axis` | `axis(g, { scale, orient, length, ticks, format, fade }) → ticks` | A value axis for a continuous `scale`: one `g.sd-axis-tick` per tick, keyed by value, with a `line.sd-axis-grid` across the plot (`length` long) and a `text.sd-axis-label`. `orient` `"y"` (the default) puts the ticks down the plot and the labels left of it; `"x"` puts them along it and the labels below `length`. `ticks` defaults to `scale.ticks(5)`, `format` to `String`. It joins its own ticks, so call it where you write attributes: with `fade` (0 to 1) on the frames of a played change, where a new tick fades in and one that left fades out, and without it for the end state, which removes the ticks that left. |
| `halo` | `halo(selection, { under }) → selection` | Default: class `sd-halo`, a background-colour outline for text (a dot has its outline already, so a halo on a dot changes nothing). `under: true`: a `.sd-halo-under` copy of each line or path before it (its geometry and `transform`, a wider background stroke), returned. Call it again after the geometry changes or the node moves. A copy has the node's tag, so in a parent that holds copies select the marks by class (`path.sd-line`), never by tag alone. |

Marks write attributes and generic classes; the theme styles the classes. Positions, sizes and colours are yours.

```js
ctx.chart.dot(circles, { r: f.font * 0.4, color: (d) => d.color });
ctx.chart.whisker(whiskers, { at: (d) => y(d.key), lo: (d) => x(d.lo), hi: (d) => x(d.hi), cap: f.font * 0.5 });
ctx.chart.rule(rules, { x1: 0, y1: 0, x2: f.pw, y2: 0, label: "Average", anchor: "end" });
ctx.chart.halo(labels); // a background outline, so text reads over a line
const ticks = y.ticks(5), format = ctx.chart.tickFormat(ctx, props.format, ticks);
ctx.chart.axis(axisG, { scale: y, length: f.pw, ticks, format });              // the end state
ctx.chart.axis(axisG, { scale: yAt(t), length: f.pw, ticks, format, fade: t }); // a frame of a played change, with that frame's scale
```

The generic classes, styled by theme tokens only: `.sd-dot`, `.sd-dot-hollow`, `.sd-whisker-line`, `.sd-whisker-cap`, `.sd-rule`, `.sd-rule-label`, `.sd-axis-grid` (the grid colour), `.sd-axis-label` (the muted colour), `.sd-halo`, `.sd-halo-under` and `.sd-canvas-layer` (absolutely placed, no pointer events).

#### Forecast

| Name | Signature | What it does |
|---|---|---|
| `splitAt` | `splitAt(points, at, x) → { observed, forecast }` | Splits points sorted by x at `at`; the boundary point ends one part and starts the other. |
| `band` | `band(points) → d` | The `d` of an interval band over `{ px, lo, hi }`, defined where both bounds are not null; `null` when none is. |

`splitAt` cuts points at an x without losing the join: a cut between two points adds a boundary point that both parts share, and a cut on a point does not duplicate it. `band` draws an interval where both bounds exist.

```js
const { observed, forecast } = ctx.chart.splitAt(points, 2023, (p) => p.x);
shade.attr("d", ctx.chart.band(points.map((p) => ({ px: x(p.x), lo: p.lo === null ? null : y(p.lo), hi: p.hi === null ? null : y(p.hi) }))));
```

#### Labels

| Name | Signature | What it does |
|---|---|---|
| `spread` | `spread(ys, gap, [min, max]) → ys` | Pushes label positions at least `gap` apart. |
| `fit` | `fit(end, start, width, [lo, hi], gap) → { x, anchor, inside }` | Places a label past a mark's end, inside it, or past its start. |
| `wrapLabel` | `wrapLabel(text, maxChars, maxLines) → lines` | Wraps a label. |

Direct labels: keep them apart, keep them on the plot, keep them short.

```js
const ys = ctx.chart.spread(ends.map((p) => y(p.y)), f.font * 1.15, [0, f.ph]); // no two closer than the gap
const at = ctx.chart.fit(x(value), x(0), width, [0, f.pw], f.font * 0.4);       // { x, anchor, inside }
const lines = ctx.chart.wrapLabel("A long category name", 12, 2);               // at most two lines
```

#### Deterministic layout

| Name | Signature | What it does |
|---|---|---|
| `drawOrder` | `drawOrder(ids, seed) → ids` | A fixed pseudo-random order that depends only on the ids and the seed. |
| `swarm` | `swarm(xs, { r, maxDy }) → offsets` | A vertical offset per x that keeps nearby points apart. |

Pure functions of data and props, never of chance: the same input paints the same picture, however the rows are ordered.

```js
const shownIds = ctx.chart.drawOrder(ids, props.seed ?? 1).slice(0, props.shown); // raising `shown` keeps the draws already shown
const dy = ctx.chart.swarm(values.map(x), { r: f.font * 0.3, maxDy: f.ph / 4 });  // a vertical offset per value
```

#### Canvas

| Name | Signature | What it does |
|---|---|---|
| `canvasLayer` | `canvasLayer(el, { left, top, pw, ph, name?, maxRatio? }) → canvas` | A `canvas.sd-canvas-layer` of `el`, at `left`/`top` and `pw` × `ph` in CSS pixels, with a backing store of that size × min(`maxRatio` (default 3), `devicePixelRatio`) and a scaled context: you draw in plot pixels. Without `name` it is the one unnamed layer and ignores the named ones. With `name` it is `canvas[data-layer=name]`, one per name. A new layer goes right after the element's last canvas layer (first child when there is none), so the order of creation is the order of stacking, and the SVG you append paints above all of them. Idempotent. Pass `maxRatio: 1` for a raster you fill pixel by pixel; keep 3 for lines. |
| `paintLines` | `paintLines(canvas, lines, { width, alpha }) → signature` | Clears the canvas and strokes each `{ points, color, alpha?, width? }`. A point with a `null` or non-finite coordinate breaks the line there (a missing value is a gap, never a line to zero); a stretch of fewer than 2 points draws nothing. The signature (hex) is the same for the same picture, so a component can write it to a `data-*` attribute of the canvas. |
| `signature` | `signature() → { text(s), tenth(v), char(code), hex() }` | A 32-bit FNV-1a hasher you feed piece by piece: `text` a string, `char` one UTF-16 unit, `tenth` a number rounded to 0.1 (as `${Math.round(v * 10) / 10}`). `hex()` is the hash so far, 8 hex digits. The same feeds in the same order give the same hash, so a component can sign what it painted on a layer of its own. |

Many thin lines are cheaper on a canvas than in the DOM. The layers sit under your SVG, in the order you create them; you draw in plot pixels. A `null` or non-finite point breaks the line.

```js
const canvas = ctx.chart.canvasLayer(el, { left: f.margin.left, top: f.margin.top, pw: f.pw, ph: f.ph });
const signature = ctx.chart.paintLines(canvas, draws.map((d) => ({ points: d.map((p) => [x(p.x), y(p.y)]), color, alpha: 0.2 })), { width: 2 });
canvas.setAttribute("data-signature", signature); // `dump` and `check --played` compare it

const layer = ctx.chart.canvasLayer(el, { left: 0, top: 0, pw: f.pw, ph: f.ph, name: "shade", maxRatio: 1 }); // a second layer, above the first
const sig = ctx.chart.signature();
sig.text("shade|"); sig.tenth(f.pw); sig.char(10);
layer.setAttribute("data-signature", sig.hex());
```

#### Colour

| Name | Signature | What it does |
|---|---|---|
| `focusPaint` | `focusPaint(ctx, color, dimmed) → color` | The theme's `--sd-color-dim` for a mark out of focus. |
| `tweenColor` | `tweenColor(ctx, from, to, set, opts) → Promise` | An RGB colour tween. |
| `textColor` | `textColor(color, background) → color` | A palette colour darkened (or lightened) until it has 4.5:1 contrast, for text. |
| `colorScale` | `colorScale(spec, palettes, { format }) → { kind, color(value), legend }` | A colour scale: stepped classes, a continuous ramp (linear or log), a diverging scale about a midpoint, or categories. `color` is `null` for a missing value. |
| `legendRow` | `legendRow(doc, legend, { title, noData, t }) → HTMLElement` | A detached `div.sd-legend-row` for a scale's `legend`, with a hatched "no data" swatch when `noData` is set. |
| `classIndex` | `classIndex(value, breaks) → number \| null` | The number of `breaks` at most `value` (a value equal to a break is in the class above it); `null` for a missing value. |
| `classLabels` | `classLabels(breaks, fmt) → labels` | `breaks.length + 1` labels: `< b0`, `b0–b1`, …, `≥ bn` (en dashes). |

Focus-dim goes through `focusPaint`, never through opacity. Text coloured from a palette goes through `textColor`, which reaches 4.5:1.

A scale takes the theme's palettes, so a heatmap, a choropleth and a raster all colour one way. `spec` is `{ classes, midpoint, domain, log, categories, color, values }`; `palettes` is `{ sequential, diverging, categorical }`, as `ctx.palette(kind)` returns them; `format` writes a number in a legend label (default `String`).

- **Classes** (`classes: [5, 10, 20]`): four stepped classes, sampled evenly along the sequential palette, labelled `< 5`, `5–10`, `10–20`, `≥ 20`. With `midpoint` (which must be one of the breaks, else the error is `` `midpoint` must be one of `classes` (5, 10, 20) ``) the classes below it take the first half of the diverging palette and those above it the second, so the midpoint's neutral colour sits where the classes meet.
- **A continuous ramp** (no `classes`): over `domain`, used as given, else the extent of `values` (one value v gives `[v, v + 1]`, none gives `[0, 1]`; a `domain` of one value, `[v, v]`, reads the same, or `[v, 10 v]` with `log`). `log: true` positions values by their logarithm and needs a domain above 0 (a value that is not above 0 has no colour). With `midpoint`, the diverging palette: a given `domain` runs its low end, the midpoint and its high end through 0, 0.5 and 1 on the palette (linear on each side, in the logarithm for `log`), so the two arms may differ in length; a domain read from `values` is made symmetric about the midpoint. A value outside the domain takes the end colour. A blank string is a missing value, never 0.
- **Categories** (`categories: ["forest", "water"]`): the categorical palette in order; more categories than colours throws (`7 categories but the palette has 6 colours`). One category with `color` is a mask, coloured `color`. A value that is not a category has no colour.

`legend` is the plain data a row draws: `{ kind: "steps" | "categories", items: [{ color, label }] }` or `{ kind: "ramp", stops, positions?, labels: [lo, hi] }` (nine stops, evenly spaced on the bar; the labels are the formatted domain ends, for `log` too). A diverging ramp whose midpoint is off the domain's centre (`domain: [-2, 10], midpoint: 0`) adds `positions`, each stop's place on the bar from 0 to 1 (in the logarithm for `log`), so the midpoint's colour sits where the midpoint is, a sixth of the way along here, and `legendRow` writes the gradient with those places. `legendRow` is yours to place: it only builds the row.

```js
const fill = ctx.chart.focusPaint(ctx, color, dimmed); // the theme's --sd-color-dim when dimmed
await ctx.chart.tweenColor(ctx, from, to, (c) => path.attr("stroke", c), ctx.motion.timing(info));
label.attr("fill", ctx.chart.textColor(color, ctx.tokens["--sd-color-background"]));

const palettes = { sequential: ctx.palette("sequential"), diverging: ctx.palette("diverging"), categorical: ctx.palette("categorical") };
const scale = ctx.chart.colorScale({ classes: [5, 10, 20] }, palettes, { format: ctx.format(".0f") }); // or { domain, log } or { midpoint, values }
cells.attr("fill", (d) => scale.color(d.value) ?? missingColor); // null: no value, drawn by you (a hatch, the surface)
el.append(ctx.chart.legendRow(document, scale.legend, { title: "Rate", noData: true, t: ctx.t }));
```

### `ctx.map`

`ctx.map` is the geography the built-in `map` is made of, for a component that draws its own map. Like `ctx.chart` it is one frozen object, the same for every component and child, and a component that reads only `ctx` needs no `import`. It works on lon/lat GeoJSON and canvas pixels. `boundaries`, `projection`, `view`, `applyView` and `lookup` only compute; `loadRaster` reads a raster file; the painters draw regions, their borders, a raster and points on a canvas layer, and the inset frame and the scale bar on an SVG. A map's colours and legend rows come from `ctx.chart` (`colorScale`, `legendRow`; see [Colour](#colour)), and its canvases from `ctx.chart.canvasLayer`.

**Public and internal.** The 15 names below are the contract: a change to one is a changelog entry. The rest of `core/map.js`, `core/map-paint.js` and `core/map-rules.js`, and the built-in's folder `components/map/`, is internal. Use `ctx.map`, not an import.

The names are in four groups. Each group has its signatures and one short example. The examples are fragments: they assume the element `el`, its size `w` × `h` (`ctx.size`), `tokens` (`ctx.tokens`, each value trimmed) and the values of the groups before them. `test/fixtures/decks/map-kit/components/fixture.mapkit/index.js` is a working component that calls every group, and [Build a map from the engine's pieces](../guide/custom-components.md#build-a-map-from-the-engines-pieces) walks a small one through them.

#### Geography

| Name | Signature | What it does |
|---|---|---|
| `boundaries` | `boundaries(geojson, { id, name, file }) → { features, byId, ids, names }` | Validates a parsed FeatureCollection of Polygons and MultiPolygons (what `ctx.data` returns for a `.geojson`) and indexes its regions. A region's id is `properties[id]` as a string, or the feature's own `id` when `id` is omitted; `names` maps each id to `properties[name]`, else the id. `file` only names the file in messages (default `"boundaries"`). Never changes `geojson`: see Winding. |
| `projection` | `projection(spec, features, [w, h]) → projection` | The base projection of an element: `spec` is `"equal-earth"`, `"natural-earth"`, `"mercator"` or `"conic-equal-area"`, rotated to the centre longitude of `features` and fitted to them in `w` × `h` with a margin of 6% of the smaller side. The conic's parallels sit a sixth of the latitude span in from the south and north ends. Fix it for the element's life. |
| `view` | `view(base, target, [w, h]) → { k, x, y }` | A zoom transform over the base's pixels. `target` is `null` (home, `{ k: 1, x: 0, y: 0 }`), an array of features, or `{ bounds: [west, south, east, north] }` in degrees (west greater than east crosses the antimeridian). The target is centred and fitted with the same margin. |
| `applyView` | `applyView(v, [px, py]) → [k·px + x, k·py + y]` | A base-projected point seen through a view. |

**Errors.** Each begins with `<file>: `. `boundaries` throws `not a FeatureCollection`, `feature 3 has no 'code'` (features count from 1), `region 'North' appears twice`, `only Polygon and MultiPolygon features are supported (found LineString)`, `6,000 regions is more than 5,000` and `300,000 points is more than 250,000` (every coordinate of every ring counts). `projection` throws `` unknown projection 'x' (use equal-earth, natural-earth, mercator or conic-equal-area) `` and `projection needs at least one region`; `view` throws `view: no regions to fit`.

**Winding.** GeoJSON written by `sf` or `geopandas` follows RFC 7946, with outer rings counter-clockwise; d3-geo expects the opposite and would read each region as everything but itself. `boundaries` reverses the rings of any polygon whose `d3.geoArea` is above 2π, on copies, so the file you got from `ctx.data` (which is shared and read-only) is untouched. Give `projection`, `view` and your paths the `features` it returns, never the raw file.

**Views are affine.** `fitExtent` changes only scale and translation, so a view is a transform of base-projected pixels: `applyView(v, base(lonLat))` is where a point lands, and cached paths can be redrawn with `ctx2d.setTransform(k, 0, 0, k, x, y)` (divide line widths by `k`) instead of projecting again. A flight between two views is a blend of their three numbers.

```js
const { features, byId } = ctx.map.boundaries(await ctx.data("data/regions.geojson"), { id: "code", name: "name", file: "data/regions.geojson" });
const base = ctx.map.projection("equal-earth", features, [w, h]);            // once, at mount
const home = ctx.map.view(base, null, [w, h]);                              // { k: 1, x: 0, y: 0 }
const west = ctx.map.view(base, [byId.get("W4")], [w, h]);                  // fitted to one region
const box = ctx.map.view(base, { bounds: [-18, -30, -11, -24] }, [w, h]);   // fitted to a box in degrees
const [x, y] = ctx.map.applyView(west, base([-14, -25]));                   // where a lon/lat lands, in canvas px
const mid = { k: ctx.chart.lerp(home.k, west.k, 0.5), x: ctx.chart.lerp(home.x, west.x, 0.5), y: ctx.chart.lerp(home.y, west.y, 0.5) }; // half way along a straight flight
```

#### Rasters

| Name | Signature | What it does |
|---|---|---|
| `loadRaster` | `loadRaster(path, ctx) → Promise<Raster>` | Reads a raster file (the JSON of the raster format) and decodes its first image: `{ path, bounds, value, frames, size, grid(i), decoded(i) }`. |
| `lut` | `lut(raster, colorOf) → Uint8ClampedArray` | The colour of each of a raster's 256 levels, as 1,024 RGBA bytes. |
| `landCells` | `landCells(raster, features) → Uint8Array` | The raster cells whose centres are on land, 1 or 0 each. |
| `rasterGaps` | `rasterGaps(raster, features, { frames }) → Promise<boolean>` | Whether a land cell has no data in one of `frames` (frame indexes; every frame when left out), or some land lies outside the raster's bounds. |
| `lookup` | `lookup(base, v, [w, h], bounds, [cols, rows], { step }) → Int32Array` | For each pixel of the canvas, row-major from the top left, the raster cell under it as `row * cols + col`, or -1 outside the raster or the projection. |
| `paintRaster` | `paintRaster(canvas, scene, res) → string` | Clears a canvas layer and draws pictures of a raster, each built for one view and drawn at another, hatching land without data and, with `clip`, stopping at the coastline. Returns the scene's signature. |

**The raster file.** A raster file is one JSON and its 8-bit greyscale PNGs (with or without alpha; alpha is 0 or 255, and 0 means no data): `bounds` `[west, south, east, north]` in degrees, the outer edges of the edge cells; `value`, `{ scale: "linear" | "log", min, max }` or `{ classes: [...] }`, which says what a grey level 0 to 255 means (`levelValue` in `core/map-rules.js`); and a `src`, or `frames` of `{ src, label, numbers? }` for a time-lapse. The format, and writer functions for R and Python, are in [From your analysis code to a map slide](../guide/maps-from-your-code.md#rasters-a-json-file-and-a-greyscale-png). `loadRaster` reads the JSON through `ctx.data` and fetches each image with `ctx.assetUrl`, so the paths are the deck's: an image's `src` is read relative to the JSON's folder (`data/a/b.json` with `f/1.png` names `data/a/f/1.png`) and must be a path inside the deck (no `..`, no absolute path, no scheme). The raster is cached per `ctx.data` and path, so every element that names the file shares one, and a failed load is retried on the next call.

**Raster errors.** `loadRaster needs ctx.assetUrl` when the `ctx` has none. Otherwise `loadRaster` throws, each starting with the file's path: what the raster format finds wrong in the JSON (`` data/a.json: needs `src` or `frames` ``), `data/f/1.png: not found`, `data/a.json: '../x.png' is not a path inside the deck`, `data/f/1.png: 2400×1800 is more than 2,000×2,000 pixels` (an area limit: 2,001 × 2,000 is over, 2,400 × 1,500 is not), `data/big.json: 101 frames of 1000×1000 is 101 million pixels, more than 100 million; use fewer or smaller frames` (a time-lapse holds at most 100 million pixels, every frame together; it is refused once the first frame gives the size, before any other is decoded) and, from `grid(i)`, `data/f/2.png: 9×6 does not match the first frame (8×6)`.

- **Decoding is exact.** Each image is decoded without colour conversion or premultiplied alpha. `grid(i)` resolves to `{ levels, data }`, two `Uint8Array(cols * rows)` from the north-west pixel: `levels[i]` is the pixel's grey (0 to 255, as stored) and `data[i]` is 1 where its alpha is at least 128, else 0. The level under a pixel with no data is 0. `raster.frames` has one entry per image (`{ label, numbers, src }`, `src` the image's deck path; a single `src` gives one frame, labelled `""`) and `raster.size` is the first image's `[cols, rows]`.
- **Frames on demand.** `grid(i)` decodes frame `i`; the first frame is decoded by `loadRaster`, since it gives the size. A raster keeps at most 12 decoded frames, the least recently used going first (`grid(i)` and `decoded(i)` both use a frame). `decoded(i)` returns the grid if it is decoded now and `undefined` otherwise, without decoding: it is how a painter, which cannot wait, reads a frame the component has already awaited.
- **`lut`.** `colorOf(value, level)` is called for each level with `levelValue`'s value (a number, or a class name) and returns a CSS colour, or `null` for a level with no colour. A level past the end of a class list is never asked about and is transparent, as is one that gets `null`.
- **Land cells.** A land cell is a raster cell whose centre is on land: the one definition of land for a raster, used by the painter and by `rasterGaps`. `landCells(raster, features)` reads `features` (from `boundaries`) as plain lon/lat, a polygon at a time with the even-odd rule, and caches the grid per `features` array and raster geometry, so keep passing the array `boundaries` returned. A raster made by marking the cells whose centres are on land has data on every land cell; a cell centred in the sea has none, and is not land even where it covers some.
- **`rasterGaps`.** True when a land cell has no data in one of `frames`, or when any land lies outside the raster's bounds: exactly the places `paintRaster` hatches, so a "No data" row is shown when there is hatch to explain. A coastal cell centred in the sea is not a gap. `frames` lists frame indexes (`data/a.json: there is no frame 9` for one outside the frames); without it every frame is read. Each frame it reads is decoded once, apart from the raster's own cache, so keep the answer, and for a long time-lapse name the frames your steps show rather than decoding them all.
- **Lining a raster up.** A raster in lon/lat lands on the boundaries in any projection through `lookup`: `bounds` are the outer edges of the edge cells, and rows run north to south, columns west to east, so the index is `row * cols + col` with row 0 the northern edge. The projection is inverted exactly at every `step` pixels (default 8) and longitude and latitude are interpolated between those nodes, so the cell is exact except within a fraction of a pixel of a cell edge. Where an invert fails, the cells around that node are -1. The table is for one `(view, size, bounds, grid)`; keep it until the view or the size changes.

**Painting a raster.** Make the layer with `ctx.chart.canvasLayer(el, { ..., name: "raster", maxRatio: 1 })`: a raster is painted per pixel, so its backing store is at most its CSS size (smaller when the page is zoomed out, where `devicePixelRatio` is below 1). Everything `paintRaster` takes (the views, the lookup tables, the pictures) is in CSS px, the layer's `pw` by `ph`; the painter scales by the backing-store ratio when it draws, as `paintAreas` does. `scene` is `{ source, lut, view, hatch, clip, draws: [{ frame, at, alpha }] }`; `res` is `{ raster, lutData, lookupFor(at, [w, h]), land, landCells, cache }`.

- **A draw is a picture.** Each `draws` entry is a frame as seen through the view `at`: every CSS pixel takes the colour of the raster cell `lookupFor(at, size)` gives it (`size` is the canvas's own CSS size, so a layer smaller than the element has its own tables), coloured by `lutData`. The picture is drawn under the transform that carries `at` to `view`, so `at` can differ from `view` and a flight or a crossfade moves pictures instead of painting them again. Pictures are drawn in order, each at its `alpha`.
- **The hatch is part of the picture.** Where a pixel has no data it shows the hatch if it is on land and stays clear otherwise. On land means: inside the raster, the pixel's cell is a land cell (`res.landCells`); outside the raster (`lookup` gives -1), the regions `res.land` (a `Path2D` in base-projected px) cover the whole pixel. So no-data land is hatched, land the raster does not reach is hatched, and the sea, and the coast under a sea-centred cell, stay clear. The stripes are at 45°, 6 px apart and 1.5 px wide, `hatch.line` over `hatch.background`, measured in CSS px from the canvas's origin, so they look the same at every ratio. `hatch: null` draws none; a `null` `land` or `landCells` leaves that part unhatched. Use the hatch for value rasters; a mask has no "no data".
- **`clip`.** With `clip: true`, a pixel inside the raster that is not on land is clear whatever its cell holds, hatch included, so a coarse cell centred on land stops at the coastline instead of sticking out over the sea. "On land" is the same test as for the hatch outside the raster: the regions `res.land` cover the whole pixel (so the fringe of a coastal pixel the regions only partly cover is clear). `res.land` is then required: without it the painter throws `paintRaster: clip needs res.land`. With `clip: false` (the default when the scene leaves it out) every cell is drawn whole.
- **The cache.** `res.cache` holds the pictures (and the land masks they were made from), keyed by source, frame, `at` (rounded to three decimals), colour table, hatch colours, `clip` and size: the same draw is built once, and a clipped and a whole picture of one raster never share an entry. You own it: empty it when the colour table, the land or a raster file behind a `source` changes. The painter never hashes `res`.
- **Undecoded frames.** A draw whose picture is not cached needs `res.raster.decoded(frame)`; without it the painter throws `paintRaster: frame 3 is not decoded`. Await `raster.grid(frame)` first.
- **The signature** hashes `source`, `lut`, the view, the hatch colours (or none), `clip` and every draw's frame, `at` and alpha, never `res`.

```js
const raster = await ctx.map.loadRaster("data/density.json", ctx);    // { bounds, value, frames, size: [cols, rows], grid, decoded }
const palettes = { sequential: ctx.palette("sequential"), diverging: ctx.palette("diverging"), categorical: ctx.palette("categorical") };
const scale = ctx.chart.colorScale({ domain: [raster.value.min, raster.value.max] }, palettes);
const lutData = ctx.map.lut(raster, (value) => scale.color(value));   // 1,024 RGBA bytes: the colour of each level
const land = new Path2D();                                            // the regions in base-projected px
for (const f of features) land.addPath(new Path2D(ctx.d3.geoPath(base)(f)));
const gaps = await ctx.map.rasterGaps(raster, features, { frames: [0] }); // true: some land has no data, so the legend says "no data"
const lookups = new Map();                                            // yours: one table per view (and size)

const canvas = ctx.chart.canvasLayer(el, { left: 0, top: 0, pw: w, ph: h, name: "raster", maxRatio: 1 });
await raster.grid(0);                                                  // the painter reads decoded frames only
canvas.setAttribute("data-sig", ctx.map.paintRaster(canvas, {
  source: "data/density.json", lut: "density",                        // both are hashed: `lut` is any name for the colour table
  view: home,                                                          // the view the canvas shows now
  hatch: { line: tokens["--sd-color-dim"], background: tokens["--sd-color-surface"] },   // or null
  clip: true,                                                          // clear past the coastline (needs `land`)
  draws: [{ frame: 0, at: home, alpha: 1 }],                           // in order, each at its alpha
}, {
  raster, lutData, land,
  lookupFor: (at, size) => lookups.get(at) ?? lookups.set(at, ctx.map.lookup(base, at, size, raster.bounds, raster.size)).get(at),
  landCells: ctx.map.landCells(raster, features),                      // or null
  cache: new Map(),                                                    // yours: pictures are kept in it
}));
```

#### Regions and points

| Name | Signature | What it does |
|---|---|---|
| `paintAreas` | `paintAreas(canvas, scene, res) → string` | Clears a canvas layer and paints regions, hatched when the fill is `null`, or as dots. Returns the scene's signature. |
| `paintBorders` | `paintBorders(canvas, scene, res) → string` | Clears a canvas layer and strokes region outlines and dot rings, filling nothing, so the layer goes over others. Returns the scene's signature. |
| `paintPoints` | `paintPoints(canvas, scene) → string` | Clears a canvas layer and paints circles at screen size. Returns the scene's signature. |

A painter is pure: it takes plain data, clears its canvas, paints, and returns a signature, 8 hex digits that hash the whole scene (a dump can stand in for the pixels). Make the canvas with `ctx.chart.canvasLayer` (one named layer per painter, so regions, borders and points stack in creation order), and paint again after any change of size.

- **`paintAreas`.** `scene` is `{ source, view, alpha, hatch, items: [{ id, fill, stroke, width, dot }] }`. `res.path(id)` is a `Path2D` and `res.centroid(id)` an `[x, y]`, in base-projected px; the scene holds colours as CSS strings, resolved by you from `ctx.tokens` and `ctx.palette`, and the painter reads no token. `source` names the geometry in the signature; the paths are not hashed. The items are drawn in order under `setTransform(r·k, 0, 0, r·k, r·x, r·y)`, where `r` is the canvas's backing-store ratio and `{ k, x, y }` the view, so `width` is in screen px (the painter divides it by `k`). A `null` fill is the hatch: lines at 45°, 6 px apart and 1.5 px wide, in `hatch.line` over `hatch.background`, pinned to the canvas so it keeps its size and place when the view changes. A `dot` item is not its path: it is a circle of radius 5 px at the centroid, seen through the view but at screen size, with a `width` outline in `stroke`.
- **`paintBorders`.** `scene` is `{ source, view, items: [{ id, stroke, width, alpha, dot }] }` and `res` the one `paintAreas` takes. Nothing is filled, so a borders layer can sit over the areas and over a raster, where `paintAreas` (which always fills) cannot. Each item is stroked in order in `stroke` at its `alpha`: a region's path through the view, `width` px wide on screen at any zoom (the painter divides it by `k`), or, for a `dot` item, the ring of the dot `paintAreas` draws for that region (radius 5 px at `res.centroid(id)`, at screen size). The built-in `map` draws its borders in `--sd-color-rule` and the outline of a highlighted region in ink this way.
- **`paintPoints`.** `scene` is `{ view, alpha, items: [{ id, x, y, r, fill, stroke }] }`: `x` and `y` are base-projected px (placed through the view), `r` a radius in screen px, and `stroke` a 1.5 px outline or `null`.

```js
const path = ctx.d3.geoPath(base);
const paths = new Map(features.map((f) => [f.properties.code, new Path2D(path(f))]));
const res = { path: (id) => paths.get(id), centroid: (id) => path.centroid(byId.get(id)) };   // both in base-projected px
const rates = ctx.chart.colorScale({ classes: [5, 10, 15] }, palettes);   // a stepped scale for the regions' values
const view = home;

const areas = ctx.chart.canvasLayer(el, { left: 0, top: 0, pw: w, ph: h, name: "areas" });
areas.setAttribute("data-sig", ctx.map.paintAreas(areas, {
  source: "data/regions.geojson", view, alpha: 1,
  hatch: { line: tokens["--sd-color-dim"], background: tokens["--sd-color-surface"] },
  items: [
    { id: "N1", fill: rates.color(10.4), stroke: tokens["--sd-color-background"], width: 1, dot: false },
    { id: "N2", fill: null, stroke: tokens["--sd-color-background"], width: 1, dot: false },       // no data: hatched
    { id: "I2", fill: rates.color(1.2), stroke: tokens["--sd-color-background"], width: 1.5, dot: true },  // too small to see: a dot
  ],
}, res));

const borders = ctx.chart.canvasLayer(el, { left: 0, top: 0, pw: w, ph: h, name: "borders" });   // made after the areas: on top
borders.setAttribute("data-sig", ctx.map.paintBorders(borders, {
  source: "data/regions.geojson", view,
  items: [
    { id: "N1", stroke: tokens["--sd-color-rule"], width: 1, alpha: 1, dot: false },
    { id: "I2", stroke: tokens["--sd-color-ink"], width: 1.5, alpha: 1, dot: true },   // a dot's ring, over paintAreas's dot
  ],
}, res));                                                                             // the same res as paintAreas

const points = ctx.chart.canvasLayer(el, { left: 0, top: 0, pw: w, ph: h, name: "points" });     // over the borders
const [px, py] = base([-14.09, -24.48]);                                              // a site's lon/lat, base-projected
points.setAttribute("data-sig", ctx.map.paintPoints(points, {
  view, alpha: 1, items: [{ id: "S01", x: px, y: py, r: 6, fill: ctx.palette("categorical").colors[0], stroke: tokens["--sd-color-background"] }],
}));
```

#### Inset and scale bar

| Name | Signature | What it does |
|---|---|---|
| `insetFrame` | `insetFrame(svg, { box, frame }) → SVGGElement` | One `g.sd-map-inset` on an SVG: two dashed leaders, the box and the frame, all `[x0, y0, x1, y1]` in the element's px. Idempotent. |
| `scaleBar` | `scaleBar(svg, { base, view, at, maxWidth, format }) → SVGGElement` | One `g.sd-map-scale`: a bar of a round length in km starting at `at`, and its label. Idempotent. |

- **`insetFrame`.** One `g.sd-map-inset` holding the leaders (`line.sd-map-inset-leader`, dashed `6 4`), then `rect.sd-map-inset-box` and `rect.sd-map-inset-frame`. When the frame is beside the box, the leaders join the box's two corners facing it to the frame's two corners on its facing side (top to top, bottom to bottom); above or below, left to left and right to right; across a diagonal, the two corners off the diagonal to the same corners of the frame. A frame that overlaps the box has none: its two lines stay, with `display="none"` and no coordinates. A repeat call rewrites the group in place. What the frame shows is yours to draw: the built-in draws a second set of canvases there, through the inset's view.
- **`scaleBar`.** `at` is the bar's start and the place where the scale is measured: the length is the largest 1, 2 or 5 × 10ⁿ km that fits in `maxWidth` px, where one px along the row is `d3.geoDistance` between the two points the view maps to it, on a sphere of 6,371 km. `format` is a number formatter (`ctx.format(",.0f")`) and the label is `` `${format(n)} km` ``. The group holds `line.sd-map-scale-bar`, `path.sd-map-scale-caps` and the `text`, and is empty where the projection cannot be inverted. The frame, the bar and the label are ink, the leaders muted, set in the theme's CSS from its tokens.

```js
const svg = ctx.d3.select(el).append("svg").attr("width", w).attr("height", h).node();   // appended after the canvases: on top
// The box is the part of the map a zoomed view shows: the element's corners, taken back through `west` and seen through `home`.
const corner = ([cx, cy]) => ctx.map.applyView(home, [(cx - west.x) / west.k, (cy - west.y) / west.k]);
ctx.map.insetFrame(svg, { box: [...corner([0, 0]), ...corner([w, h])], frame: [w * 0.62, h * 0.03, w * 0.97, h * 0.38] });
ctx.map.scaleBar(svg, { base, view: home, at: [24, h - 24], maxWidth: w * 0.2, format: ctx.format(",.0f") });
```

## Helpers inside the engine

The built-ins import small helpers from a few engine modules. They are internal: they may change without notice, and a deck component should not import them, because the engine's path differs between the repository and a deck's `stepdeck/` copy. Use `ctx` instead, and copy a one-liner if you need it.

| Module | What the built-ins use from it |
|---|---|
| `core/kit.js` | `canAnimate(info)` (`info.animate === true && !info.signal?.aborted`), `motion(info, ctx, opts)` (`ctx.motion.timing(info, opts)`; without a `ctx`, `{ signal, duration: info.transition?.duration }`), `motionMs(info, ctx, factor)` (the transition's duration, else `factor` × `--sd-duration` (400 ms when the token is missing)), `focusPaint(ctx, color, dimmed)` (the theme's `--sd-color-dim`, else `--sd-color-rule`, for a mark out of focus), `tweenColor(ctx, from, to, set, opts)` (an RGB colour tween through `ctx.animate.tween`), `measureWidth`/`measureHeight`, `svgEl`, `el`, `sizeSvg`, `escapeHtml`, `inkMix`. |
| `core/animate.js` | The `ctx.animate` helpers, plus `clearInlineStyle(...nodes)` (removes every inline style and the `style` attribute), `rise` (a legacy helper: fade in while rising by `--sd-space`; the built-ins use `ctx.motion.in(node, "rise")`), `typeCount` and `typingMs` (28 ms per character, at most 1400 ms). |
| `core/motion.js` | `makeMotion(tokens)`, which is `ctx.motion`; the frame and the controller use its motions and `timing` for element boxes. |
| `core/map.js`, `core/map-paint.js` | `boundaries`, `projection`, `view`, `applyView`, `lookup`, `loadRaster`, `lut`, `landCells`, `rasterGaps`, the painters (`paintAreas`, `paintBorders`, `paintRaster`, `paintPoints`, `insetFrame`, `scaleBar`) and `mapKit`, which is `ctx.map`. Use `ctx.map`, not an import. |
| `core/chart.js` | `loadTable` (loads a CSV and checks the named columns), `tickFormat`, `opacityAttr`, and `chartKit`, which is `ctx.chart` (built from `core/chart-layout.js`, `core/chart-marks.js` and `core/chart-motion.js`). Use `ctx.chart`, not an import. |

## `schema.json`

Use JSON Schema 2020-12 with `"type": "object"` and `"additionalProperties": false`.

| Requirement | Checked by | Problem when missing |
|---|---|---|
| A top-level `description`. Its first sentence is the catalog summary. | `catalog` | `catalog-schema` (warning) |
| Optionally a top-level `"x-enter": "own"`: the component builds its own entrance (see [Owning the entrance](#owning-the-entrance)). Absent, or `"box"`, the element's box moves. | the runtime, `catalog` (`enter`) | `catalog-schema` for any other value |
| On every prop: `description`, a non-empty `examples` array, and `x-transition` (`tween`, `draw`, `fade` or `snap`). | `catalog` | `catalog-schema`: `prop '<key>' lacks …` |
| The schema compiles with Ajv in strict mode. | `validate`, for every deck and built-in component, used or not. | `component-schema` |
| The slide's props match the schema at every step, after bindings are resolved. | `validate` | `unknown-prop`, `prop-invalid` |

`cli/ajv.js` registers `x-transition`, `x-enter` and any other keyword starting with `x-` as a no-op annotation, so strict mode accepts them and still rejects a misspelled real keyword. `x-transition` is metadata only: the catalog lists every prop that is not `snap` under `animates`, and the engine never reads it. Your code must implement the motion the schema advertises. `x-enter` is the exception: the controller reads it (`registry.schema(type)`) to decide who plays the entrance.

The starter's schema:

```json
"stage": {
  "type": "integer",
  "minimum": -1,
  "default": 0,
  "description": "Index of the current item: items up to it are marked and it is shown in bold; -1 marks none. ...",
  "examples": [0, 2],
  "x-transition": "fade"
}
```

## See also

- [Writing a custom component](../guide/custom-components.md): the tutorial.
- [Animation and motion](../guide/animation-and-motion.md): when steps animate.
- [Deck and slide spec](deck-and-slide.md): elements, steps, `advance` and `transition`.
- [Built-in components](components/index.md): what the 13 built-ins render.
- [skill/references/custom-components.md](../../skill/references/custom-components.md): the agent version.
- `schema/stepdeck.d.ts`: `ComponentModule`, `ComponentInstance`, `UpdateInfo`, `ComponentContext`, `ChildHandle`.
