# Custom components

## When to write one

Write a custom component when the catalog has nothing that shows what the slide needs. Typical cases:
- a bespoke diagram or chart drawn with d3;
- an animated explanation with its own stages, driven by a `stage` prop through `advance`;
- a composite that places built-ins inside your own drawing, through `ctx.mount`.

Do **not** write one for:
- small visual touches: use the slide's `style` (scoped CSS);
- region sizes: use the slide's `regions` grid variables;
- text that a `text` or `markdown` element can carry.

## Scaffold and declare

```sh
node "$STEPDECK/cli/index.js" new-component my.flow my-talk
```

This creates `my-talk/components/my.flow/`, holding `index.js`, `schema.json`, `example.js` and `README.md`. It also adds the name to `components: []` in `my-talk/deck.js`. If it cannot edit `deck.js` safely, it prints the line to add instead.
- **Names are namespaced:** lowercase parts joined by dots, as in `my.flow`.
- **Built-in names are taken.** A deck component named like a built-in is an error (`component-collision`), even when no slide uses it.
- **Every deck component must be listed** in `deck.js` `components`. Nothing scans folders, so an unlisted component is `unknown-component`.

To try the starter, copy `components/my.flow/example.js` to `slides/my-flow-example.js`, add `"my-flow-example"` to `slides` in `deck.js`, then run `validate` and `check --played`. The starter already passes both. Change it from there.

## `schema.json`

Use JSON Schema 2020-12, with `"type": "object"` and `"additionalProperties": false`.
- The top-level `description` is the catalog entry. Its first sentence is the summary.
- **Every prop needs** a `description`, `examples` (a non-empty array) and an `x-transition`. The transition says how a change of that prop animates:
  - `tween`: numbers interpolate;
  - `draw`: lines draw along their length;
  - `fade`;
  - `snap`: no animation.
- The catalog warns `catalog-schema` when one of these is missing. A schema that does not compile fails validate (`component-schema`).
- Validate checks every slide's props against this schema **at every step**, after bindings are resolved.

## The contract

```js
// components/my.flow/index.js
export default {
  async mount(el, props, ctx) {          // build DOM once inside el; may be async
    const root = el.ownerDocument.createElement("div");
    el.appendChild(root);
    const caption = await ctx.mount("text", root.appendChild(el.ownerDocument.createElement("div")),
                                    { text: "", role: "note" });   // reuse a built-in

    function render(p) { /* write the whole state for p: the single source of truth */ }
    render(props);

    return {
      async update(props, info) {        // idempotent: any state, reached in any order
        render(props);                   // the end state first …
        await caption.update({ text: `Stage ${props.stage}`, role: "note" }, info);
        if (info.animate) {              // … animate only when the engine says so, and await it
          await ctx.animate.fadeIn(root, { signal: info.signal, duration: info.transition?.duration });
        }
        root.style.opacity = "";         // leave no animation residue
      },
      destroy() { root.remove(); },      // optional; pause() and anchor(ref) are optional too
    };
  },
};
```

### The rules

- **`update` is idempotent.**
  - It renders exactly the props it is given, from any previous state. Keep one `render(props)` that writes everything.
  - Never accumulate state across calls. `check --played` compares played and jumped arrivals and reports `played-mismatch` when they differ.
- **Props only.**
  - A component never reads the slide's step number: `info.step` is for logging.
  - A slide drives an internal sequence through a prop, typically `stage` with `advance`.
- **Animate only when `info.animate` is true.** That is a forward move by exactly one step, motion on, not in capture.
  - Pass `info.signal` to every helper and `await` it, so an abort snaps to the end state and `STEPDECK.settled()` waits for you.
  - `mount` and `update` must settle. A call still pending after 10 s fails the element (`did not settle within 10s`, a `render-error` in `check`).
  - End with no inline animation residue, such as a leftover `opacity`.
- **`info`** carries:
  - `prev`: the previous props, `null` on the first update;
  - `changed`: the top-level keys that changed, all of them at first;
  - `entered`: true if the element just became visible;
  - `step` and `prevStep`;
  - `animate`, `signal` and `transition`.
- **The engine skips `update`** when the resolved props and the visibility did not change, so a count-up never re-runs on a no-op step.
- **Every element mounts with its step-0 props**, hidden ones too. The first `update` is a full render: `prev: null`, `animate: false`.
- **Calls never overlap.** One instance never has two `update` calls in flight.
- **Errors stay in the element.** A throw or rejection in `mount` or `update` fails that element only. Its box shows the message, and `check` reports `render-error`.

### `ctx`

| Member | What it is |
|---|---|
| `ctx.d3` | d3 v7. |
| `ctx.mount(type, el, props)` | Mounts a built-in or deck component inside yours. **Returns `Promise<handle>`**, where `handle = { instance, update(props, info), pause(), destroy() }`. `handle.update` resolves the child's bindings and passes your `info` on (`animate`, `signal`, …). Children pause and are destroyed with the parent. `destroy()` is idempotent, so you can swap a child. |
| `ctx.data(path, { types })` | Loads a deck file (`.json`, `.geojson`, `.csv`), cached and **shared: read-only**, so copy it before sorting. For CSV, the declared `types` (`string`, `number`, `date`) win. |
| `ctx.assetUrl(path)` | The URL of a deck file (an image, say) for the browser to fetch. Same path rules as `ctx.data` (relative to the deck root, no `..`, no `%`, not remote), and it throws otherwise. Nothing is read, so a missing file shows up only when the browser loads it. |
| `ctx.format(spec)` | A d3-format function localized by the deck `lang`. |
| `ctx.t(key)` | Engine strings in the deck language. |
| `ctx.tokens` | Theme values by full name, e.g. `ctx.tokens["--sd-font-size-note"]`. |
| `ctx.palette(kind)` | `{ name, kind, colors, names, roles }` for `categorical`, `sequential` or `diverging`. `names` are in the deck language. `roles.accent` is the accent color. |
| `ctx.size` | `{ w, h }` of `el` in canvas pixels, measured at mount. Read `el.offsetWidth`/`offsetHeight` yourself if you need the size at update time. |
| `ctx.animate` | `fadeIn(el)`, `reveal(el)`, `drawPath(path)`, `tween(from, to, onValue)`, `stagger(items, fn)`. Each takes `{ duration, signal }` and resolves at the end state, also when it is aborted. |
| `ctx.capture` | True when rendering for screenshots, where nothing animates. |

### Styling

- **Colors:** `var(--sd-color-ink)`, `--sd-color-muted`, `--sd-color-rule`, and `ctx.palette()` for data colors. Never literal hex.
- **Sizes:** `--sd-font-size-*` and `--sd-space`. Text stays at or above 28px (`--min-audience-font`).
- **Contrast:** `check` measures your text like any other: font size, contrast, overlap, and staying inside the region.
- **Room:** a deck's own component does not get core's fill rule, which is written per built-in type, so a figure-like custom component fills its region only when it is the only element in a filling region, or when it is placed with `box`.

## Types

`schema/stepdeck.d.ts` is copied into every deck by `new`, at `my-talk/stepdeck/schema/stepdeck.d.ts` (in the stepdeck repo: `$STEPDECK/engine/schema/stepdeck.d.ts`). Nothing imports it at run time. It types:
- the specs;
- `ComponentModule`, `ComponentInstance`, `UpdateInfo`, `ComponentContext` and `ChildHandle`;
- the CLI's `--json` output.

Point your editor at it if you want completion.
