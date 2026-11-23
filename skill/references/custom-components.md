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
- **Optional, top level: `"x-enter": "own"`**, when the component has a natural build (a count-up, lines that draw, items that rise in turn) and should play it when the element appears, instead of the engine moving its box. See the rules below.
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
        // … animate only a change, only when the engine says so. Start the motion before the first await, so its
        // start state is written in the same task as the end state and the end state never paints first. When
        // the element just appeared (info.entered), the engine already moves its box: never fade yourself in then.
        const runs = [caption.update({ text: `Stage ${props.stage}`, role: "note" }, info)];
        if (info.animate && !info.entered && info.changed.includes("stage")) {
          runs.push(ctx.motion.in(root, "fade", ctx.motion.timing(info)));   // theme timing, or the step's transition
        }
        await Promise.all(runs);         // await both: settled() waits for them, and an abort snaps them
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
  - **Never fade yourself in when `info.entered` is true.** The engine's entrance already moves the element's box (the theme's `rise` or `fade`, or the slide's `enter`), in its stagger slot. Animate only changes while the element stays visible.
  - **Or own the entrance.** With `"x-enter": "own"` in `schema.json`, the box stays still and the update where the element appears gets `info.entrance = { motion: "draw", duration }`: play your build from empty to the props, over `duration` or `ctx.motion.timing(info)`. `{ motion: "none" }` means render at once (the slide set a box motion or `"none"`). Write the build's start state **before the first `await`**, so the finished state never flashes. `info.entrance` is `null` in every other update.
  - Time everything with `ctx.motion.timing(info)` (`{ duration, ease, stagger, signal }` from the theme, overridden by the step's `transition`), and move parts with `ctx.motion.in(node, name, opts)` / `ctx.motion.out(node, name, opts)` (`fade`, `rise`, `wipe`, `pop`), so your component moves like the built-ins.
  - Pass `info.signal` to every helper and `await` it, so an abort snaps to the end state and `STEPDECK.settled()` waits for you.
  - Start a change's motion (or write its start state) before your first `await`, as the sample does with `Promise.all`; started after an `await`, the end state paints for a frame first.
  - `mount` and `update` must settle. A call still pending after 10 s fails the element (`did not settle within 10s`, a `render-error` in `check`).
  - End with no inline animation residue, such as a leftover `opacity`.
- **`info`** carries:
  - `prev`: the previous props, `null` on the first update;
  - `changed`: the top-level keys that changed, all of them at first;
  - `entered`: true if the element just became visible;
  - `entrance`: `{ motion, duration }` on the entrance of a component with `"x-enter": "own"`, else `null`;
  - `step` and `prevStep`;
  - `animate`, `signal` and `transition`.
- **The engine skips `update`** when the resolved props and the visibility did not change, so a count-up never re-runs on a no-op step.
- **Every element mounts with its step-0 props**, hidden ones too. The first `update` is a full render: `prev: null`, `animate: false`.
- **Calls never overlap.** One instance never has two `update` calls in flight.
- **Errors stay in the element.** A throw or rejection in `mount` or `update` fails that element only. Its box shows the message, and `check` reports `render-error`.
- **A compact view mounted with `ctx.mount("diagram" | "map", el, props)`** (the second-view convention: `compact: true` and a `caption`) follows two rules. Take the shared definition as a prop the slide binds whole (`"{{data/process.json#}}"`), as the gallery's `gallery.where` does (`site/gallery/components/gallery.where/`).
  - **Mount it in an HTML element of your own beside your SVG, never inside it.** A chart's `settle` clears every `[style]` under its own SVG, and a compact view writes inline styles. Give that element a size.
  - **Keep its caption non-empty on every step, or always absent.** A child has no step list (`ctx.stepProps` is `null`), so its caption band comes from its current props only: a caption that is empty on one step and not on another redraws the copy and moves its grid. Pass your `info` to `handle.update`, and call it in every `update` (the engine never updates a child), so played equals jumped. A compact diagram never flows.
- **Ambient motion** (endless, such as a marching dash) is CSS only, under `html.sd-ambient`, switched by an attribute you write from your props, and never waited on: no timer, no `requestAnimationFrame`, no `getAnimations`, `animationend` or `.finished`.
  - Add your own `<style>` once, in `mount`, through `el.ownerDocument`, with every selector under `html.sd-ambient` and your own class (a slide's scoped `style` cannot select `<html>`).
  - The shell keeps `sd-ambient` on `<html>` only while the page animates (off in `?capture`, a preview frame, reduced motion and a hidden page), so a still frame must say the same.

### `ctx`

| Member | What it is |
|---|---|
| `ctx.d3` | d3 v7. |
| `ctx.mount(type, el, props)` | Mounts a built-in or deck component inside yours. **Returns `Promise<handle>`**, where `handle = { instance, update(props, info), pause(), destroy() }`. `handle.update` resolves the child's bindings and passes your `info` on (`animate`, `signal`, `entered`, `entrance`, …). A child that gets `entered` without `entrance` renders at once (your box carries the entrance). Children pause and are destroyed with the parent. `destroy()` is idempotent, so you can swap a child. |
| `ctx.data(path, { types })` | Loads a deck file (`.json`, `.geojson`, `.csv`), cached and **shared: read-only**, so copy it before sorting. For CSV, the declared `types` (`string`, `number`, `date`) win. |
| `ctx.assetUrl(path)` | The URL of a deck file (an image, say) for the browser to fetch. Same path rules as `ctx.data` (relative to the deck root, no `..`, no `%`, not remote), and it throws otherwise. Nothing is read, so a missing file shows up only when the browser loads it. |
| `ctx.format(spec)` | A d3-format function localized by the deck `lang`. |
| `ctx.t(key)` | Engine strings in the deck language. |
| `ctx.tokens` | Theme values by full name, e.g. `ctx.tokens["--sd-font-size-note"]`. |
| `ctx.palette(kind)` | `{ name, kind, colors, names, roles }` for `categorical`, `sequential` or `diverging`. `names` are in the deck language. `roles.accent` is the accent color. |
| `ctx.size` | `{ w, h }` of `el` in canvas pixels, measured at mount. Read `el.offsetWidth`/`offsetHeight` yourself if you need the size at update time. |
| `ctx.motion` | The named motions with the theme's timing: `in(node, name, opts)`, `out(node, name, opts)` (`fade`, `rise`, `wipe`, `pop`, `draw`, `none`), `timing(info, { factor, fast })` → `{ duration, ease, stagger, signal }`. They put back the inline styles they touched and resolve at the end state, also when aborted. |
| `ctx.animate` | `fadeIn(el)`, `reveal(el)`, `drawPath(path)`, `tween(from, to, onValue)`, `stagger(items, fn)`. Each takes `{ duration, signal }` (pass `ctx.motion.timing(info)`) and resolves at the end state, also when it is aborted. |
| `ctx.capture` | True when rendering for screenshots, where nothing animates. |
| `ctx.stepProps` | `ctx.stepProps[k]` is what `update` gets as `props` at step `k`: the element's props after the patches up to that step, bindings resolved. Frozen, computed before `mount`. An entry is `null` when that step fails (skip it); the array itself is `null` for a `ctx.mount` child (use `ctx.stepProps ?? [props]`). Use it to size an axis from every step. |
| `ctx.chart` | The chart building blocks, frozen and the same for every component: `loadTable`, `tickFormat`, `extentOf`, `rank`, `splitAt`, `spread`, `fit`, `wrapLabel`, `drawOrder`, `swarm`, `frame`, `keyed`, `settle`, `dot`, `whisker`, `band`, `rule`, `axis`, `halo`, `canvasLayer`, `paintLines`, `morph`, `entrance`, `undraw`, `lerp`, `signature`, `focusPaint`, `tweenColor`, `textColor`, `colorScale`, `legendRow`, `classIndex`, `classLabels`. These 33 names are the public set; use them instead of importing from `core/`. See below. |
| `ctx.map` | The map building blocks, frozen and the same for every component: `boundaries`, `projection`, `view`, `applyView` (geography); `loadRaster`, `lut`, `landCells`, `rasterGaps`, `lookup`, `paintRaster` (rasters); `paintAreas`, `paintBorders`, `paintPoints` (regions and points); `insetFrame`, `scaleBar` (inset and scale bar). These 15 names are the public set; colours and legend rows come from `ctx.chart.colorScale` and `ctx.chart.legendRow`. See below. |

### Charts from the engine's pieces

For a bespoke chart, build on `ctx.chart` instead of drawing everything yourself. The full signatures are in `docs/reference/component-contract.md` (the `ctx.chart` section, one example per group). The order that matters:

1. **Load and frame.** `await ctx.chart.loadTable(props, ctx, "my.chart", [["x", props.x], ["y", props.y]])` checks the columns and returns the rows. `ctx.chart.frame(el, ctx, margin)` gives `{ w, h, font, charW, margin, pw, ph }`; margins come from `font` and `charW`, so the layout never depends on font timing.
2. **One scale for every step.** `ctx.chart.extentOf(rows, (ctx.stepProps ?? [props]).map((p) => p?.y), { zero: true })` covers the column of every step, so a step that switches `y` moves the marks and never the axis. Blank cells are missing, never zero.
3. **Joins, then settle, then attributes.** `ctx.chart.keyed(selection, data, key, enter)` marks leavers with `.sd-exiting` and removes nothing; `ctx.chart.settle(svg.node())` then removes them and every `style` and `opacity` the motion left; then you write every attribute. Settle the SVG root, never the element box.
4. **Marks.** `dot`, `whisker`, `rule`, `axis` and `halo` write attributes and generic classes the theme styles. `axis(g, { scale, length, ticks, format })` draws a value axis (grid lines and tick labels) and joins its own ticks: call it where you write attributes, with `fade: t` on a played change's frames and without it for the end state. Colours come from `ctx.palette()` and tokens; text coloured from a palette goes through `textColor(color, ctx.tokens["--sd-color-background"])`. Dim through `focusPaint`, never opacity.
5. **Motion.** `await ctx.chart.morph(info, ctx, (t) => place(t))` only when `info.animate && last && !info.entered && !info.signal?.aborted`; a component that owns its entrance reads `ctx.chart.entrance(info, ctx)`. Write the end state after, from props alone. In a frame, `ctx.chart.lerp(from, to, t)` blends a value: it is exactly `to` at `t` = 1, and `to` when `from` is missing (a new mark).
6. **Layout is deterministic.** `rank`, `drawOrder` and `swarm` are pure functions of data and props: no `Math.random`. A missing value is a gap (a `null` point breaks a `paintLines` line), never a zero. `halo` on a dot does nothing (a dot already has its outline).

The stepdeck gallery's slope chart, `gallery.slope` (`site/gallery/components/gallery.slope/`, the `custom-slope` slide), is a whole chart built in this order from `ctx.chart` alone, with no `import`: `loadTable`, `frame` and `tickFormat`, one scale over every step with `extentOf`, `keyed` joins then `settle`, `dot` and `halo`, labels ranked with `rank` and kept apart with `spread`, one `morph` for a played change, `focusPaint` and `tweenColor` for `highlight`, `textColor` for its labels, and an owned entrance with `entrance`, `undraw` and `ctx.animate.drawPath`. The guide `docs/guide/custom-components.md` ("Build a chart from the engine's pieces") describes it and walks a smaller chart through the order above.

### Maps from the engine's pieces

Use the built-in `map` first: it covers choropleths, rasters, points, flights, an inset and time-lapses. For a map story it does not tell, build on `ctx.map` and `ctx.chart`. The signatures are in `docs/reference/component-contract.md` (the `ctx.map` section, one example per group), and `docs/guide/custom-components.md` ("Build a map from the engine's pieces") walks a whole component through. The order:

1. **At mount, the geometry.** `ctx.map.boundaries(await ctx.data(path), { id, file: path })` checks the GeoJSON, fixes the winding and returns `{ features, byId, ids }`: use its `features`, never the raw file. `ctx.map.projection("conic-equal-area", features, [w, h])` is the base projection (the built-in map's default; `"equal-earth"` for a world map), fixed for the element's life; make one `Path2D` per region with `ctx.d3.geoPath(base)`.
2. **The join is strict.** Read the values with `ctx.chart.loadTable`, compare keys with region ids as text, and throw on a key that matches no region, so a data mismatch is an error on the slide, never a blank region.
3. **Colours from the theme.** `ctx.chart.colorScale({ classes }, palettes)` gives `color(value)` (`null` for no value, which the painters hatch) and a `legend` that `ctx.chart.legendRow` draws.
4. **Views are three numbers.** `ctx.map.view(base, [feature] or null or { bounds }, [w, h])` is `{ k, x, y }`. A flight on a played step is `ctx.chart.morph` blending them with `ctx.chart.lerp`, painting every frame through the view of the moment.
5. **Painters are pure.** `paintAreas`, `paintBorders`, `paintPoints` and `paintRaster` clear their canvas (one `ctx.chart.canvasLayer` each, with a `name`; `maxRatio: 1` for a raster), paint a plain scene and return a signature to put on the canvas. End every update by painting the end state from the props, so played equals jumped.

The map's files are the project's, made by its own code, as for the built-in (see [components](components.md), `map`).

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
