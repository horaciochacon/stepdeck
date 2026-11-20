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

Built-ins live in the engine's `components/` and are listed in `components/index.json`: `text`, `chart.line`, `chart.bar`, `terminal`, `markdown`, `big-number`, `list`, `diagram`, `chat`, `timeline`, `image`. Deck components live in the deck's `components/` and must be listed in `deck.js`:

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
        if (info.animate && shown > before) {
          const reached = rows.slice(before + 1, shown + 1).map((r) => r.li);
          await ctx.animate.stagger(reached, (li, i, opts) => ctx.animate.fadeIn(li, opts), { signal: info.signal, duration: info.transition?.duration });
        }
        for (const r of rows) r.li.style.opacity = "";
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
| `el` | The element's box: a `div.sd-el[data-el][data-type]` inside its region (or positioned on the canvas when the element has a `box`). Build inside it; never replace it. |
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

The visibility class (`sd-hidden` or `sd-collapsed`) is applied before that element's `update` is called.

Calls for one instance never overlap. On one step, the slide's elements update in parallel. When a new `goTo` arrives, the engine aborts the running step's signal, waits for its updates to settle, and then applies only the latest target; intermediate targets are dropped.

### `UpdateInfo`

| Field | Type | Meaning |
|---|---|---|
| `step` | `string \| number` | The step id, or the step index when the step has no id. For logging only: never branch on it. |
| `prevStep` | `string \| number \| null` | The previously applied step, the same way; `null` on the first update. |
| `animate` | `boolean` | Play motion. True only when the shell asked for motion and the move is forward by exactly one step from the last applied step. |
| `signal` | `AbortSignal` | Aborts when a newer `goTo` supersedes this step, when the slide is paused or destroyed, or when this element's watchdog fires. |
| `transition` | `{ duration?, stagger? } \| null` | The step's `transition`, as written in the slide; `null` when the step has none. |
| `prev` | `object \| null` | The previous resolved props; `null` on the first update. |
| `changed` | `string[]` | Top-level keys whose values differ from `prev`, added and removed keys included. All keys on the first update; `[]` when only visibility changed. |
| `entered` | `boolean` | The element just became visible. On the first update: it is visible. |

`schema/stepdeck.d.ts` declares `transition?: Transition`; at runtime the field is always present and is `null` when the step has none.

When does `animate` come true? The shell requests motion only when the page is not in capture mode (`?capture`), not a presenter preview frame (`?receiver`), and motion is on (no `prefers-reduced-motion`, or `?motion=full`). Both shells render slide changes with `animate: false`; only a step change within the current slide passes the shell's motion request. The controller then narrows it to a forward move of exactly one step. A jump, a backward move and the first render never animate. See [Animation and motion](../guide/animation-and-motion.md).

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

The `ctx.animate` helpers default to 400 ms when `duration` is `undefined`. Pass `info.transition?.duration`, which is `undefined` both when there is no transition and when it has no `duration`. Do not pass `info.transition && info.transition.duration`: when `transition` is `null` that yields `null`, which the helpers read as 0 and snap.

The engine passes `transition.stagger` through untouched; no helper applies it automatically. Pass it to `ctx.animate.stagger` yourself if your component supports it.

## Optional members

| Member | Called by | Meaning |
|---|---|---|
| `anchor(ref)` | Nothing in the engine today. | Canvas-pixel box `{ x, y, w, h }` of a named part, or `null`. Reserved for future annotation elements. Only `chart.line` implements it (`anchor("series:<name>")`). |
| `pause()` | `controller.pause()`, which the reveal shell calls on the slide you leave. The bare shell never pauses: it destroys the slide on every slide change. | Stop media and timers. The controller aborts the running step first, then calls `pause` on the instance and on its `ctx.mount` children. |
| `destroy()` | `controller.destroy()`: the bare shell on every slide change, the reveal shell on `pagehide`. Also a mount that settles after its watchdog fired. | Tear down. The controller calls the instance's `destroy`, then destroys its `ctx.mount` children, newest first. |

A throw from `pause` or `destroy` is recorded as that element's error; the other elements are still paused or destroyed. An element that failed after a successful mount is still paused and destroyed; an element whose mount failed is not.

## The rules

Each rule exists so that a step reached by playing looks exactly like the same step reached by jumping. `check --played` tests it at every step: it compares each element's presence, visibility, text and box after a jump with those after an animated arrival from the step before and the step after, and reports `played-mismatch` when they differ.

| Rule | What to do |
|---|---|
| End at the target state, whatever `animate` says. | Keep one `render(props)` that writes the whole state from the props alone. Call it in every `update`, then animate only if `info.animate`. Never accumulate state across calls, and never read the step: drive an internal sequence through a prop (typically `stage` with `advance`). |
| Respect `signal`. | Pass `info.signal` to every `ctx.animate` helper and `await` them. On abort each helper jumps to its end state and resolves. Check `info.signal.aborted` before starting motion of your own. `STEPDECK.settled()` waits for your promise. |
| Leave no animation residue. | After the motion, clear the inline styles it wrote (`opacity`, `transform`, `clip-path`, dash styles), so the markup after a played step equals the markup after a jump. The helpers' end states are listed under [`ctx.animate`](#ctxanimate). |
| Use `el.ownerDocument`, not the global `document`. | The renderer takes a `document` argument, and tests and the CLI run components in other documents. Every built-in creates nodes through `el.ownerDocument`. |
| No network. | Read deck files through `ctx.data` and `ctx.assetUrl`. Presentation makes no remote requests: the CLI's browser blocks every request to another origin and `check` reports it as `network-error`; `validate` reports remote URLs in props and styles as `remote-url`. |
| Settle. | `mount` and `update` must settle within 10 s (see below). |
| Use theme values. | Colors from `var(--sd-color-*)` and `ctx.palette()`, sizes from `--sd-font-size-*` and `--sd-space`, never literals. `check` measures your text like any other: size, contrast, overlap and staying inside the region. |

## Errors and the watchdog

Every `mount` and `update` call runs under a watchdog of `SETTLE_TIMEOUT_MS` = 10 000 ms (`core/controller.js`; configurable through the controller's `settleTimeout`).

- **A call that does not settle in time** fails its element with `did not settle within 10s` and aborts that element's signal only. The rest of the slide goes on.
- **A mount that settles after its watchdog fired** is destroyed at once, with any children it mounted.
- **An update that settles late** is ignored.
- **A thrown error or rejected promise** in `mount` or `update` fails the element. So do an unknown or colliding component name and a binding error.

A failed element is recorded once, as `<slide>/<element>: <message>`, in the controller's `errors` (and so in `STEPDECK.errors`). Its box shows the message and stays visible. It gets no further `update` calls. `check` reports it as `render-error`; `dump` lists it under `errors`.

## `ctx`

`ctx` is built per element (`#ctxFor` in `core/controller.js`). Children mounted with `ctx.mount` get their own.

| Member | Type | What it is |
|---|---|---|
| `ctx.d3` | d3 v7 | The engine's d3 bundle (`core/d3.js`). |
| `ctx.data(path, { types })` | `Promise<any>` | Loads a deck file: `.json`, `.geojson` or `.csv`. Paths are relative to the deck folder. Results are cached and shared between elements: treat them as read-only and copy before sorting. For CSV, declared `types` (`string`, `number`, `date`) win. Errors: `data file not found: <path>`, `invalid data file <path>: …`, `unsupported data file type: …`. |
| `ctx.assetUrl(path)` | `string` | The full URL of a deck file (an image, say) for the browser to fetch. Same path rules as `ctx.data`; nothing is read, so a missing file shows up only when the browser loads it. Throws `data path must be relative to the deck root: <path>` for an absolute, remote or `..` path, and `data path may not contain '%': <path>`. Used by `image`. |
| `ctx.format(spec)` | `(n) => string` | A d3-format function localized to the deck language (`en`, `es`; unknown falls back to `en`). Negative numbers use U+2212. |
| `ctx.t(key)` | `string` | An engine string in the deck language. Keys: `section`, `step`, `of`, `error`, `tasks`, `files`, `ci95`. An unknown key returns the key. |
| `ctx.capture` | `boolean` | True when rendering for screenshots (`?capture`). Nothing animates then; `info.animate` is already false. |
| `ctx.animate` | object | `fadeIn`, `reveal`, `drawPath`, `tween`, `stagger`. See below. |
| `ctx.tokens` | `{ [name]: string }` | Every custom property declared in the theme's `tokens.css`, by full name, with its computed value on the canvas: `ctx.tokens["--sd-font-size-note"]`. |
| `ctx.palette(kind = "categorical")` | `Palette \| null` | `{ name, kind, colors, names, roles }` for `categorical`, `sequential` or `diverging`. `deck.palette` when its kind matches, else the theme default; `null` when there is none. `names` are in the deck language; `roles.accent` is the accent color. |
| `ctx.size` | `{ w, h }` | `el`'s `offsetWidth` and `offsetHeight` in canvas pixels (unaffected by the shell's scaling), measured once when `ctx` is built at mount. It is `{ w: 0, h: 0 }` when the element has no layout. Read `el.offsetWidth` and `el.offsetHeight` again in `update` if you need the current size. |
| `ctx.mount(type, el, props)` | `Promise<ChildHandle>` | Mounts a built-in or deck component inside yours. See below. |

### `ctx.animate`

Every helper takes `{ duration, signal }` (`duration` in ms, default 400; `<= 0` jumps to the end) and returns a promise that always settles. Abort never rejects: the helper jumps to its end state and resolves. The only rejection is an error thrown by your own callback or element, which then fails the element. The easing is cubic in-out. The helpers use `requestAnimationFrame`, or a 16 ms timer where there is none (Node).

| Helper | Motion | End state |
|---|---|---|
| `fadeIn(el, opts)` | Opacity 0 to 1. | `style.opacity = "1"` |
| `reveal(el, opts)` | Wipe in from the left with `clip-path`. | No `clip-path`. |
| `drawPath(path, opts)` | Draws an SVG path along its length with `stroke-dashoffset`. | No dash styles. |
| `tween(from, to, onValue, opts)` | Numbers only. `onValue(from)` first, one call per frame, `onValue(to)` always last. When `duration` <= 0 or the signal is already aborted, only `onValue(to)` is called. Takes an extra `ease`. | Whatever `onValue(to)` writes. |
| `stagger(items, fn, opts)` | Starts `fn(item, i, { duration, signal })` for item `i` after `i × stagger` ms (default 60; 0 when `duration` is 0). On abort every pending item starts at once with the aborted signal. Takes an extra `stagger`. | Waits for every item; rejects with the first error. |

`fadeIn` leaves `opacity: 1` inline: clear it after awaiting, as the starter does.

### `ctx.mount(type, el, props)`

Places another component inside yours, for example a built-in `text` under your own drawing. From `examples/spike/components/demo.story/index.js`:

```js
const caption = doc.createElement("div");
root.appendChild(caption);
const text = await ctx.mount("text", caption, { text: CAPTIONS[clampStage(props.stage)], role: "body" });
// later, in update(props, info):
await text.update({ text: CAPTIONS[stage], role: "body" }, info);
```

It resolves `type` through the same registry (deck components first, then built-ins), resolves the bindings in `props`, and mounts the component into `el` with a child `ctx` (the same `d3`, `data`, `assetUrl`, `format`, `t`, `tokens`, `palette`, `animate`, `capture`; `size` measured from `el`; its own `mount`). It resolves to a handle:

| Handle member | Meaning |
|---|---|
| `instance` | The child's instance. |
| `update(props, info)` | Resolves the child's bindings, then calls the child's `update` with your `info` (`animate`, `signal`, `entered`, `step`, `transition`, …), with `prev` and `changed` replaced by the child's own. The first call has `prev: null` and every key changed. Pass your `signal` so an abort reaches the child. |
| `pause()` | Pauses the child and its children. A no-op after `destroy`. |
| `destroy()` | Idempotent. Destroys the child and its children and removes it from your list, so you can swap a child. |

Semantics:

- **The engine never updates children.** Your `update` calls `handle.update`, including on its own first update. The handle never skips a call; skipping no-ops is your decision. A built-in that renders nothing until its first update (such as `image`) stays empty until you call it.
- **Children belong to the parent element.** They are paused with it and destroyed after it, newest first. This also happens when the parent's own `mount` throws, and when the slide is destroyed while the parent or child is still mounting: the child is destroyed together with the parent once the parent's mount settles, or at once if it arrives after that.
- **No separate watchdog.** A child's `mount` and `update` run inside the parent's call, under the parent's watchdog.
- **Errors propagate.** An unknown type rejects with the registry's message. A child that throws in `mount` or `update` rejects the promise you await, so it fails the parent element unless you catch it.
- `handle.update` after `destroy` throws `ctx.mount('<type>'): update called on a destroyed child`. A child destroyed while its props were resolving throws `ctx.mount('<type>'): child destroyed while its props resolved`.
- There is no nesting depth limit.

## Helpers inside the engine

The built-ins import small helpers from three engine modules. They are internal: they may change without notice, and a deck component should not import them, because the engine's path differs between the repository and a deck's `stepdeck/` copy. Use `ctx` instead, and copy a one-liner if you need it.

| Module | What the built-ins use from it |
|---|---|
| `core/kit.js` | `canAnimate(info)` (`info.animate === true && !info.signal?.aborted`), `motion(info)` (`{ signal, duration: info.transition?.duration }`), `motionMs(info, ctx, factor)` (the transition's duration, else `factor` × `--sd-duration` (400 ms when the token is missing)), `measureWidth`/`measureHeight`, `svgEl`, `el`, `sizeSvg`, `escapeHtml`, `inkMix`. |
| `core/animate.js` | The `ctx.animate` helpers, plus `clearInlineStyle(...nodes)` (removes every inline style and the `style` attribute), `rise` (fade in while rising by `--sd-space`), `typeCount` and `typingMs` (28 ms per character, at most 1400 ms). |
| `core/chart.js` | `loadTable` (loads a CSV and checks the named columns), `tickFormat`, `opacityAttr`. Used by `chart.line` and `chart.bar`. |

## `schema.json`

Use JSON Schema 2020-12 with `"type": "object"` and `"additionalProperties": false`.

| Requirement | Checked by | Problem when missing |
|---|---|---|
| A top-level `description`. Its first sentence is the catalog summary. | `catalog` | `catalog-schema` (warning) |
| On every prop: `description`, a non-empty `examples` array, and `x-transition` (`tween`, `draw`, `fade` or `snap`). | `catalog` | `catalog-schema`: `prop '<key>' lacks …` |
| The schema compiles with Ajv in strict mode. | `validate`, for every deck and built-in component, used or not. | `component-schema` |
| The slide's props match the schema at every step, after bindings are resolved. | `validate` | `unknown-prop`, `prop-invalid` |

`cli/ajv.js` registers `x-transition`, and any other keyword starting with `x-`, as a no-op annotation, so strict mode accepts them and still rejects a misspelled real keyword. `x-transition` is metadata only: the catalog lists every prop that is not `snap` under `animates`, and the engine never reads it. Your code must implement the motion the schema advertises.

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
- [Built-in components](components/index.md): what the 11 built-ins render.
- [skill/references/custom-components.md](../../skill/references/custom-components.md): the agent version.
- `schema/stepdeck.d.ts`: `ComponentModule`, `ComponentInstance`, `UpdateInfo`, `ComponentContext`, `ChildHandle`.
