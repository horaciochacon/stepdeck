# Writing a custom component

This page walks you through writing a deck component: a component that lives in your deck's `components/` folder and that slides use like a built-in. It is for people who write decks by hand and for contributors who need something the 13 built-in components do not show.

You will scaffold a component with `new-component`, describe its props in `schema.json`, write `mount` and `update` so that a played step ends exactly where a jumped step does, declare it in `deck.js`, and check it with the CLI. The worked example is a counter that counts up to a new value when a step plays.

This page is a tutorial. For the exact signatures of `mount`, `update`, the `info` argument, `ctx` and child handles, see the [component contract](../reference/component-contract.md). Agents follow [skill/references/custom-components.md](../../skill/references/custom-components.md) instead.

Commands run from the repository root as `node cli/index.js`, as on the other guide pages. The examples use a deck made with `node cli/index.js new ../my-talk`.

## Decide whether you need one

Write a component only when no built-in, and no mix of built-ins, shows what the slide needs. Typical reasons are a bespoke diagram or chart drawn with d3, an animated explanation with its own stages, or a drawing that places built-ins inside it. For small visual touches, use the slide's `style`; for region sizes, use `regions`; for text, use `text` or `markdown`. The full list is in [When to write one](../../skill/references/custom-components.md#when-to-write-one).

Check the catalog before you start:

```sh
node cli/index.js catalog ../my-talk
```

## Scaffold the component

```sh
node cli/index.js new-component my.counter ../my-talk
```

The name comes first, then the deck folder. The deck folder defaults to the current folder.

```text
created ../my-talk/components/my.counter/ (index.js, schema.json, example.js, README.md)
added "my.counter" to components in deck.js
try it: copy ../my-talk/components/my.counter/example.js to slides/, add its id to slides in deck.js, then
  node /…/stepdeck/cli/index.js validate /…/my-talk
  node /…/stepdeck/cli/index.js check /…/my-talk --played
```

`new-component` copies the four files of `templates/component/` into `components/<name>/`. It replaces `__NAME__` with the name and `__ID__` with a slide id made from it (`my-counter-example`).

| File | What it holds |
|---|---|
| `index.js` | The component: `mount(el, props, ctx)` returns an instance with `update(props, info)`. |
| `schema.json` | The props, as JSON Schema 2020-12. Read by `validate` and `catalog`. |
| `example.js` | A slide that uses the component. `catalog` points to it. |
| `README.md` | Notes for whoever uses the component. `catalog <name> --json` includes it. |

The starter draws a list and marks every item up to `stage`. It already passes `validate` and `check --played`, so you can try it before you change anything: copy `components/my.counter/example.js` to `slides/my-counter-example.js`, add `"my-counter-example"` to `slides` in `deck.js`, and run the two commands it printed. Replace all four files with your own content; the example and README must match your props. The sections below give the counter's `schema.json`, `index.js`, `example.js` and `README.md`.

### Name rules

| Rule | Error when broken (exit 2) |
|---|---|
| The name has a dot namespace, such as `my.counter`. | `'counter' needs a namespace, e.g. 'my.counter' (deck components are namespaced so they never collide with a built-in)` |
| Lowercase letters, digits and dashes, in dot-separated parts. | `'My.Counter' is not a component name: use lowercase letters, digits and dashes in dot-separated parts, e.g. 'my.chart'` |
| Not a built-in name. | `'chart.line' is a built-in component; pick another namespace, e.g. 'my.line'` |
| `components/<name>/` does not exist yet. | `components/my.counter/ already exists` |
| The deck folder holds `deck.js`. | `no deck.js in <dir>; run new-component in a deck folder (or pass it)` |

### Declare it in `deck.js`

Every deck component must be listed in `components` in `deck.js`. Nothing scans the folder: a slide that uses an unlisted component fails `validate` with `unknown-component`.

`new-component` edits `deck.js` for you when the edit is safe: `components` is one literal array of strings, or there is no `components` key and exactly one `slides:` line to insert it before. It re-imports `deck.js` after the edit and reverts the file if the result is not the old deck plus the name. Otherwise it leaves `deck.js` alone and prints the line to add:

```text
deck.js not edited: add "my.counter" to components in deck.js: components: ["my.counter"]
```

After the edit, the starter deck reads:

```js
components: ["my.counter"],
slides: ["title", "chart", "closing"],
```

## Describe the props in `schema.json`

`schema.json` is JSON Schema 2020-12 with `"type": "object"` and `"additionalProperties": false`. Both `validate` and `catalog` read it; neither imports `index.js`.

| Key | What it is for |
|---|---|
| `description` (top level) | The catalog entry. Its first sentence is the summary in `catalog/index.json`. |
| `required` | Props a slide must set. |
| `properties.<prop>.description` | What the prop means. Required on every prop. |
| `properties.<prop>.examples` | A non-empty array of sample values. Required on every prop. |
| `properties.<prop>.x-transition` | How a change of the prop animates: `tween` (numbers interpolate), `draw` (lines draw along their length), `fade` or `snap` (no motion). Required on every prop. |
| `properties.<prop>.default` | Documentation only. `validate` does not fill it in, so `index.js` must apply the default itself. |
| `x-enter` (top level, optional) | `"own"` when the component builds its own entrance (a count-up, lines that draw, items that rise in turn) instead of letting the engine move its box. See [Own the entrance, or let the box move](#own-the-entrance-or-let-the-box-move). |

`x-transition` is metadata: the catalog lists every prop that is not `snap` as one that animates, but the engine never reads it. Your `index.js` must implement the motion the annotation promises. `x-enter` is read by the engine, and the catalog shows it as `enter: own`.

The counter's schema:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "my.counter",
  "description": "One large number with a label, counting from its previous value to the new one when a step plays. The number is formatted in the deck language.",
  "x-enter": "own",
  "type": "object",
  "additionalProperties": false,
  "required": ["value"],
  "properties": {
    "value": {
      "type": "number",
      "description": "The number to show. Drive it with `advance` or `set` it in steps; a played step counts to it.",
      "examples": [1250, 0.42],
      "x-transition": "tween"
    },
    "label": {
      "type": "string",
      "description": "A short line under the number.",
      "examples": ["people screened"],
      "x-transition": "fade"
    },
    "format": {
      "type": "string",
      "minLength": 1,
      "default": ",.0f",
      "description": "A d3-format specifier for the number.",
      "examples": [",.0f", ".0%"],
      "x-transition": "snap"
    }
  }
}
```

## Write `mount` and `update`

A component is a renderer of props. Everything on screen is a function of the props it was last given, so a step reached by jumping looks exactly like the same step reached by playing. `check --played` tests this at every step: it compares what each element shows after a jump with what it shows after an animated arrival, and reports `played-mismatch` when they differ.

The engine calls `update` after `mount` and then whenever the element's resolved props or its visibility change. It asks for motion only on a forward move of exactly one step with motion on; on a jump, a backward move or the first render, `info.animate` is false. See [Animation and motion](animation-and-motion.md) for when motion plays.

### Own the entrance, or let the box move

When an element appears on an animating step, the engine moves its box: it plays the slide's `enter`, or the theme's `--sd-enter` (`rise` in `modern`), in the element's stagger slot. A plain component gets that for free and **must not fade itself in when `info.entered` is true**; it animates only changes while it stays visible.

A component whose content has a natural build can play that build instead. Declare `"x-enter": "own"` at the top of `schema.json`. On the step where the element appears, after its stagger hold, `update` then gets `info.entrance`:

- `{ motion: "draw", duration }`: play the build from empty to the props while the box stays still. `duration` is the element's own `enter.duration`, or `undefined`: then time it with `ctx.motion.timing(info)`.
- `{ motion: "none" }`: the slide asked for a box motion (`enter: "rise"`, say) or for none; render at once.

The engine shows the element and calls `update` in the same synchronous block, so **write the build's start state before the first `await`**: then the finished state never paints first. `info.entrance` is `null` in every other update. The counter below owns its entrance: it counts up from 0.

### The shape of `update`

Keep one `render(props)` that writes the whole state, and use it like this in every `update`:

1. Remember where the drawing is now, if a tween needs a start value.
2. Call `render(props)`, so the end state is written even if nothing animates.
3. If the component builds its entrance (`info.entrance?.motion === "draw"`), or `canAnimate(info)` and the element did not just appear, start the motion with `ctx.motion.timing(info)`, and `await` it. Start every motion before the first `await`.
4. Call `render(props)` again and clear any inline style the motion left, such as `opacity`.

`canAnimate(info)` is `info.animate === true && !info.signal?.aborted`. The built-ins import it from `core/kit.js`; a deck component defines the same one-line test itself, as below.

`ctx.motion.timing(info)` gives `{ duration, ease, stagger, signal }` from the theme's motion tokens, overridden by the step's `transition`, with `info.signal`. Awaiting the `ctx.motion` and `ctx.animate` helpers with that signal matters. When a newer step aborts this one, each helper jumps to its end state and resolves, and `STEPDECK.settled()` waits for your promise. An update that has not settled after 10 seconds fails the element (see the [contract](../reference/component-contract.md)).

### The counter

`components/my.counter/index.js`:

```js
// my.counter: one large number with a label. Everything on screen is a function of the props,
// so a step reached by jumping looks exactly like the same step reached by playing.

// The same test as canAnimate in the engine's core/kit.js: the engine asked for motion
// and the step has not been aborted yet.
const canAnimate = (info) => info.animate === true && !info.signal?.aborted;

export default {
  mount(el, props, ctx) {
    const doc = el.ownerDocument;
    const accent = ctx.palette("categorical")?.roles?.accent ?? "var(--sd-color-accent)";

    const root = doc.createElement("div");
    Object.assign(root.style, {
      display: "flex", flexDirection: "column", alignItems: "center", gap: "var(--sd-space)",
    });
    const number = doc.createElement("div");
    Object.assign(number.style, {
      fontSize: "var(--sd-font-size-display)", fontWeight: "var(--sd-font-weight-title)",
      fontVariantNumeric: "tabular-nums", color: accent,
    });
    const label = doc.createElement("div");
    Object.assign(label.style, { fontSize: "var(--sd-font-size-body)", color: "var(--sd-color-muted)" });
    root.append(number, label);
    el.appendChild(root);

    let shown = 0; // the number drawn now; a count may stop half-way

    /** Draws the number n with the props' format. */
    function drawNumber(n, props) {
      shown = n;
      number.textContent = ctx.format(props.format ?? ",.0f")(n);
    }

    /** Writes the whole state for these props: the single source of truth. */
    function render(props) {
      const value = Number(props.value);
      if (typeof props.value !== "number" || !Number.isFinite(value)) {
        throw new Error(`my.counter needs a numeric \`value\`, got ${JSON.stringify(props.value)}`);
      }
      drawNumber(value, props);
      root.dataset.value = String(value);
      label.textContent = props.label ?? "";
    }

    render(props);

    return {
      async update(props, info) {
        // Its own entrance ("x-enter": "own" in schema.json): count up from 0 while the box stays still.
        const draw = info.entrance?.motion === "draw" && !info.signal?.aborted;
        const from = draw ? 0 : shown;
        render(props); // the end state first, so it is right even when nothing plays

        // An element that just appeared any other way renders at once: its box moves, or nothing does.
        if (draw || (canAnimate(info) && !info.entered)) {
          const opts = ctx.motion.timing(info); // the theme's duration and easing, or the step's transition
          if (draw && info.entrance.duration !== undefined) opts.duration = info.entrance.duration;
          const runs = [];
          // Started before the first await: the count's first frame (the 0) is drawn in the same task as
          // the engine shows the element, so the final number never flashes first.
          if (draw || info.changed.includes("value")) {
            runs.push(ctx.animate.tween(from, props.value, (n) => drawNumber(n, props), opts));
          }
          if (!draw && info.changed.includes("label")) runs.push(ctx.motion.in(label, "fade", opts));
          await Promise.all(runs);
        }

        render(props); // the end state again, whether motion ran, was aborted or never started
        label.style.opacity = ""; // ctx.motion.in puts back what it touched; this guards the end state anyway
      },
      destroy() {
        root.remove();
      },
    };
  },
};
```

What each part does:

| Part | Why |
|---|---|
| `el.ownerDocument` | Create nodes in the element's own document, not the global `document`. |
| `ctx.palette(...)` and `var(--sd-...)` | Colors and sizes come from the theme, so the component follows the deck's theme. No literal colors or pixel sizes. |
| `shown` | The tween starts from what is drawn now. If a step is interrupted half-way, the next update counts from there. |
| `info.entrance`, `info.entered`, `info.changed` | The count from 0 is the component's own entrance (`x-enter: own`). Otherwise motion plays only for what changed while the element stays visible: the count when `value` changed, a fade of the label when `label` changed. On a step where the element appears with a box motion (or none), it renders at once. |
| `ctx.motion.timing(info)` | Durations and easing come from the theme's tokens, or the step's `transition`, so the counter moves like the built-ins. |
| `props.format ?? ",.0f"` | The schema's `default` is documentation; the component applies it. |
| `throw` in `render` | An error stays in this element: its box shows the message and `check` reports `render-error`. |
| The second `render(props)` and the cleared `opacity` | The end state is identical however the update ended, so the markup after playing equals the markup after jumping. |

### The example slide

Rewrite `components/my.counter/example.js` so it uses your props. This one drives `value` with `advance` and changes the label with `set`:

```js
export default {
  id: "my-counter-example",
  layout: "statement",
  title: "Screening so far",
  elements: [
    { id: "count", type: "my.counter",
      props: { value: 120, label: "people screened in week 1" },
      advance: { prop: "value", values: [120, 480, 1250] } },
  ],
  steps: [
    { id: "week1" },
    { id: "week2", set: { count: { label: "people screened by week 2" } } },
    { id: "week3", set: { count: { label: "people screened by week 3" } } },
  ],
};
```

`set` patches the element's props directly: `set: { count: { label: "…" } }`. Writing `set: { count: { props: { label: "…" } } }` fails `validate` with `unknown-prop`. See [The step model](step-model.md).

To try it, copy the file to `slides/my-counter-example.js` (replace the starter's copy if you made one) and add `"my-counter-example"` to `slides` in `deck.js`, if it is not there yet:

```js
components: ["my.counter"],
slides: ["title", "chart", "closing", "my-counter-example"],
```

`check --played` only exercises the counter on a slide listed in `slides`.

### The README

`README.md` is for whoever uses the component, and `catalog my.counter --json` includes it. The starter's README describes the list and its `stage` prop, so rewrite it: say what the component shows, list its props, and say how to try it. For the counter:

```markdown
# my.counter

One large number with a label. When a step plays, it counts from the number shown to the new `value`.

| Prop | Type | Default | Transition | Meaning |
|---|---|---|---|---|
| `value` | number | (required) | tween | The number to show. |
| `label` | string | `""` | fade | A short line under the number. |
| `format` | string | `",.0f"` | snap | A d3-format specifier for the number. |

Try it: copy `example.js` to `slides/my-counter-example.js` and add `"my-counter-example"` to `slides` in `deck.js`.
```

## Use `ctx`

`mount` receives `ctx` as its third argument. The [contract](../reference/component-contract.md) lists every member with its signature; this table maps common jobs to members.

| Job | Member |
|---|---|
| Load a deck data file (`.json`, `.geojson`, `.csv`) | `await ctx.data(path, { types })`. Paths are relative to the deck folder. Results are cached and shared, so copy before you sort or change them. |
| Get a URL for an image or other file in the deck | `ctx.assetUrl(path)` |
| Format a number in the deck language | `ctx.format(spec)` returns a d3-format function. The counter uses it. |
| Get an engine string in the deck language | `ctx.t(key)`, for example `ctx.t("ci95")`. |
| Get data colors | `ctx.palette(kind)` for `categorical`, `sequential` or `diverging`: `{ name, kind, colors, names, roles }`, or `null`. `roles.accent` is the accent color. |
| Read a theme value in JavaScript | `ctx.tokens["--sd-font-size-note"]` |
| Know the element's size | `ctx.size` is `{ w, h }` in canvas pixels, measured at mount, before the slide's other elements have settled the box. For geometry, read `el.offsetWidth || ctx.size.w` (and the height) at each `update`. |
| Animate a part with a named motion | `ctx.motion.in(node, name, opts)` and `ctx.motion.out(node, name, opts)`, with `fade`, `rise`, `wipe`, `pop`; `ctx.motion.timing(info)` for the theme's timing. They put back the inline styles they touched. |
| Animate anything else | `ctx.animate.fadeIn`, `reveal`, `drawPath`, `tween`, `stagger`. Each takes `{ duration, signal }` (pass `ctx.motion.timing(info)`) and resolves at the end state, also on abort. |
| Know whether this is a screenshot render | `ctx.capture` |
| Draw with d3 | `ctx.d3` |
| Place a built-in or another deck component inside yours | `await ctx.mount(type, el, props)` returns a handle with `update(props, info)`, `pause()` and `destroy()`. Pass your `info` to `handle.update`. Children are paused and destroyed with the parent. |
| Keep a scale the same on every step | `ctx.stepProps[k]` is what `update` gets as `props` at step `k` (`null` when that step fails, and `null` altogether for a `ctx.mount` child). Size an axis from all of them. |
| Draw a chart from ready-made pieces | `ctx.chart`: table loading, scale extents, the plot frame, keyed joins, dots, whiskers, rules, halos, a canvas layer, morph and entrance helpers, colour helpers. See [Build a chart from the engine's pieces](#build-a-chart-from-the-engines-pieces). |
| Draw a map | `ctx.map`: boundaries, the projection, views, the raster lookup and the painters, with `ctx.chart`'s colour scales and legend rows. See [Build a map from the engine's pieces](#build-a-map-from-the-engines-pieces). |

## Build a chart from the engine's pieces

A chart is more than a drawing. Its axis has to stay put as steps change, its marks have to come and go cleanly, and a played step has to end where a jump does. The engine's own charts are made of pieces that a deck component gets as `ctx.chart`, so you do not rewrite them. This section builds a small dot plot, `my.dots`, in the order a chart is made: `frame`, then `extentOf` over `ctx.stepProps`, then `keyed`, the marks, `morph` and `settle`. Every piece is listed in the [component contract](../reference/component-contract.md#ctxchart).

Scaffold it as before (`new-component my.dots`), then replace `schema.json`:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "my.dots",
  "description": "One dot per category at its value, with the value beside it. The value axis is the same on every step, and a played step slides each dot to its new place.",
  "type": "object",
  "additionalProperties": false,
  "required": ["data", "x", "y"],
  "properties": {
    "data": {
      "type": "string",
      "description": "Path to a CSV file, relative to the deck root.",
      "examples": ["data/speed.csv"],
      "x-transition": "snap"
    },
    "x": {
      "type": "string",
      "description": "Column holding the category of each row.",
      "examples": ["task"],
      "x-transition": "snap"
    },
    "y": {
      "type": "string",
      "description": "Column holding each row's value. A change slides the dots; the axis covers the column of every step.",
      "examples": ["before_days", "agent_days"],
      "x-transition": "tween"
    },
    "format": {
      "type": "string",
      "description": "A d3-format specifier for the value labels.",
      "examples": [",.0f", ".1%"],
      "x-transition": "snap"
    }
  }
}
```

And `components/my.dots/index.js`:

```js
// my.dots: one dot per category at its value, with the value beside it. Built only on `ctx.chart`.
// The value axis is the same on every step, and a played step slides each dot to its new place.
const SVG = "http://www.w3.org/2000/svg";

export default {
  mount(el, props, ctx) {
    const { chart: C, d3 } = ctx;
    const svg = d3.select(el).append(() => el.ownerDocument.createElementNS(SVG, "svg")).attr("display", "block");
    const plot = svg.append("g");
    const axisG = plot.append("g"); // first, so the grid lines sit behind the dots
    const names = plot.append("g");
    const dots = plot.append("g");
    const values = plot.append("g");
    const ink = ctx.tokens["--sd-color-ink"].trim();
    const color = ctx.palette("categorical")?.colors?.[0] ?? ink;
    let last = new Map(); // key -> the x each dot ended at: where a played step slides from

    /** The rows, the frame and the scales for these props. */
    async function layout(props) {
      const rows = await C.loadTable(props, ctx, "my.dots", [["x", props.x], ["y", props.y]]);
      const f = C.frame(el, ctx, ({ font, charW }) => ({ left: charW * 20, right: font * 3, top: font, bottom: font * 2 }));
      // The domain covers the y column of every step, so the axis does not move when a step switches `y`.
      const columns = (ctx.stepProps ?? [props]).map((p) => p?.y);
      const x = d3.scaleLinear().domain(C.extentOf(rows, columns, { zero: true })).nice().range([0, f.pw]);
      // Every row keeps its band, so a value that goes missing on one step moves no other row...
      const y = d3.scaleBand().domain(rows.map((r) => String(r[props.x]))).range([0, f.ph]).padding(0.3);
      // ...and a row without a number has no dot: a missing value is never drawn as zero.
      const marks = rows.filter((r) => Number.isFinite(r[props.y])).map((r) => ({ key: String(r[props.x]), value: r[props.y] }));
      const ticks = x.ticks(5);
      return { f, x, y, marks, ticks, fmt: C.tickFormat(ctx, props.format, ticks) };
    }

    /** The keyed joins: a new mark is created, one that left gets .sd-exiting (nothing is removed yet). */
    function join({ marks }) {
      const key = (d) => d.key;
      C.keyed(names.selectAll("text"), marks, key, (enter) => enter.append("text"));
      C.keyed(dots.selectAll("circle"), marks, key, (enter) => enter.append("circle"));
      C.keyed(values.selectAll("text"), marks, key, (enter) => enter.append("text"));
    }

    /** Writes every attribute; `t` runs from 0 to 1 while a played step slides the dots. */
    function place({ f, x, y, ticks, fmt }, t) {
      svg.attr("width", f.w).attr("height", f.h);
      plot.attr("transform", `translate(${f.margin.left},${f.margin.top})`);
      // The value axis: grid lines up the plot, labels below it. Its scale is the same on every step, so its
      // ticks never change and it needs no `fade`.
      C.axis(axisG, { scale: x, orient: "x", length: f.ph, ticks, format: fmt });
      // From the x the dot ended at to its new one; a dot with no last x starts where it ends.
      const cx = (d) => C.lerp(last.get(d.key), x(d.value), t);
      const cy = (d) => y(d.key) + y.bandwidth() / 2;
      names.selectAll("text:not(.sd-exiting)").attr("x", -f.font * 0.5).attr("y", cy).attr("dy", "0.35em")
        .attr("text-anchor", "end").attr("fill", ink).attr("font-size", f.font).text((d) => d.key);
      C.dot(dots.selectAll("circle:not(.sd-exiting)").attr("cx", cx).attr("cy", cy), { r: f.font * 0.4, color });
      const labels = values.selectAll("text:not(.sd-exiting)").attr("x", (d) => cx(d) + f.font * 0.7).attr("y", cy).attr("dy", "0.35em")
        .attr("fill", ink).attr("font-size", f.font).text((d) => fmt(d.value));
      C.halo(labels); // a background outline, so the label reads over anything behind it
    }

    return {
      async update(props, info = {}) {
        const m = await layout(props);
        join(m); // the joins first: they mark the leavers
        // Only a change slides: on the step where the element appears, its box moves.
        if (info.animate && last.size && !info.entered && !info.signal?.aborted) {
          await C.morph(info, ctx, (t) => place(m, t), { factor: 1 });
        }
        C.settle(svg.node()); // removes the leavers and whatever the motion left
        place(m, 1); // the end state, every attribute, however the step ended
        last = new Map(m.marks.map((d) => [d.key, m.x(d.value)]));
      },
      destroy() {
        svg.remove();
      },
    };
  },
};
```

The pieces, in the order `layout` and `update` take them:

| Step | Piece | Why |
|---|---|---|
| Load | `C.loadTable` | Loads `props.data` and checks that every column the props name exists: a typo is an element error that names the column, not a blank chart. |
| Frame | `C.frame` | The element's size and the plot inside it, from margins you give in `font` and character widths (`charW`), so the layout never waits for font loading. |
| Scale | `C.extentOf` over `ctx.stepProps` | The extent of the `y` column of **every step**, not only the current one, so a step that switches `y` moves the dots and never the axis. `p?.y` skips a `null` step (one that failed), and `ctx.stepProps ?? [props]` covers a component mounted by `ctx.mount`, which has none. The built-in charts keep their axes still the same way: see [Charts keep one scale across steps](step-model.md#charts-keep-one-scale-across-steps). |
| Joins | `C.keyed` | A mark that is new is created; one that is gone gets the class `sd-exiting` and stays until `settle`, so a motion could still fade it. The keys are the category names, so a dot is the same dot from step to step. |
| Marks | `C.axis`, `C.dot`, `C.halo` | The value axis, grid lines and tick labels in the theme's colours; a dot with the theme's background outline; and a halo behind each value so it reads over anything. Colours come from `ctx.palette()` and the theme's tokens, never literals. `C.axis` joins its own ticks, so it is called in `place`, not in `join`. |
| Motion | `C.morph`, `C.lerp` | `morph` plays `place(m, t)` for `t` from 0 to 1 over `--sd-duration` (`factor: 1`; the default is twice that), or the step's `transition`, with the theme's easing and the step's `signal`. Only a change slides: when the element has just appeared (`info.entered`), its box moves instead. `lerp` moves each dot `t` of the way, and is exactly at the end at `t` = 1. |
| Settle | `C.settle` | Removes the marks that left and whatever style or opacity the motion wrote. Then `place(m, 1)` writes every attribute from the props, so the end state is the same however the step was reached. |

The order inside `update` matters: the joins first, because they mark the leavers; then `settle`, which removes them; then every attribute. Pass `settle` the SVG root, never the element's box. A row with no number keeps its band but gets no dot, not a dot at zero.

The example slide drives `y` with `set`, like the others. It puts the source line in `footer`, so the dot plot is alone in `main` and fills it: a deck component has no fill rule of its own.

```js
export default {
  id: "my-dots-example",
  layout: "figure-notes",
  title: "From weeks to days",
  elements: [
    { id: "dots", region: "main", type: "my.dots",
      props: { data: "data/speed.csv", x: "task", y: "before_days", format: ",.0f" } },
    { id: "src", region: "footer", type: "text", props: { role: "source", text: "Source: synthetic task durations." } },
  ],
  steps: [
    { id: "before" },
    { id: "agent", set: { dots: { y: "agent_days" } } },
  ],
};
```

Its `data/speed.csv`:

```csv
task,before_days,agent_days
Clean the data,25,3
Write the report,18,3
Check the figures,12,2
```

`validate` and `check --played` pass on this deck, and the axis stays put between the two steps.

`ctx.chart` has more for other charts: an interval whisker, a forecast band, labels kept apart, a canvas layer for many thin lines, a fixed draw order, and a colour that stays readable as text. Each group has its own example in the contract. A chart that builds its own entrance reads `C.entrance(info, ctx)` and draws its lines with `C.undraw` and `ctx.animate.drawPath`.

The gallery's slope chart, [`gallery.slope`](../../site/gallery/components/gallery.slope/index.js), goes further with the same pieces in about 100 lines and no `import`: labels ranked with `C.rank` and kept apart with `C.spread` that slide to their new rank on a played step, `highlight` with `C.focusPaint` and `C.tweenColor`, and lines that draw in as its own entrance. It passes `check --played` like a built-in; its slide is `custom-slope` in the [gallery](../../site/gallery/), and the files are listed under [A complete example in the repository](#a-complete-example-in-the-repository).

## Build a map from the engine's pieces

The built-in [`map`](../reference/components/map.md) covers choropleths, rasters, points, flights, an inset and time-lapses. A map story it does not tell is a deck component built on the same pieces: `ctx.map` for the geography (boundaries, the projection, views, the painters) and `ctx.chart` for the colour scale, the legend row, the canvas layers and the motion. The files are the same as the built-in's, made by your project's code: see [From your analysis code to a map slide](maps-from-your-code.md). Every piece is listed in the [component contract](../reference/component-contract.md#ctxmap).

This section builds `my.regions`: regions coloured by a CSV column in stepped classes, a legend row, and a `focus` prop that flies the map to a region on a played step. Scaffold it (`new-component my.regions`), then replace `schema.json`:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "my.regions",
  "description": "Regions of a GeoJSON file coloured by a CSV column in stepped classes, with a legend row. A played change of `focus` flies the map to a region.",
  "type": "object",
  "additionalProperties": false,
  "required": ["boundaries", "id", "data", "value", "classes"],
  "properties": {
    "boundaries": {
      "type": "string",
      "description": "Path to a GeoJSON FeatureCollection of the regions, relative to the deck root. Read once, at mount.",
      "examples": ["data/regions.geojson"],
      "x-transition": "snap"
    },
    "id": {
      "type": "string",
      "description": "The feature property that identifies a region, and the CSV column that names each row's region. Read once, at mount.",
      "examples": ["code"],
      "x-transition": "snap"
    },
    "data": {
      "type": "string",
      "description": "Path to a CSV file with one row per region, relative to the deck root.",
      "examples": ["data/rates.csv"],
      "x-transition": "snap"
    },
    "value": {
      "type": "string",
      "description": "The column whose values colour the regions. A region without a value is hatched.",
      "examples": ["rate"],
      "x-transition": "snap"
    },
    "classes": {
      "type": "array",
      "items": { "type": "number" },
      "minItems": 1,
      "description": "Class breaks, in increasing order.",
      "examples": [[5, 10, 15]],
      "x-transition": "snap"
    },
    "label": {
      "type": "string",
      "description": "The title of the legend row.",
      "examples": ["Cases per 1,000"],
      "x-transition": "snap"
    },
    "focus": {
      "type": "string",
      "description": "A region to fly to; without it the map shows every region. A played change flies there.",
      "examples": ["W4"],
      "x-transition": "tween"
    }
  }
}
```

And `components/my.regions/index.js`:

```js
// my.regions: regions coloured by a CSV column in stepped classes, with a legend row, and a `focus` that flies the
// map to a region. Built only on `ctx.map` and `ctx.chart`. Every update paints the end state from its props.
export default {
  async mount(el, props, ctx) {
    const { map: M, chart: C, d3 } = ctx;
    const doc = el.ownerDocument;
    const token = (name) => ctx.tokens[name].trim();
    // The regions are fixed for the element's life.
    const { features, byId, ids } = M.boundaries(await ctx.data(props.boundaries), { id: props.id, file: props.boundaries });
    const palettes = { sequential: ctx.palette("sequential"), diverging: ctx.palette("diverging"), categorical: ctx.palette("categorical") };
    let stage = null; // everything that depends on the element's size: built at an update, and again when the size changes
    let last = null; // the view the map ended at: where a played step flies from

    /** The stage for a box of `w` × `h`: the base projection, one Path2D per region, the canvases and the legend. */
    function build(w, h) {
      const base = M.projection("conic-equal-area", features, [w, h]);
      const path = d3.geoPath(base);
      const paths = new Map(ids.map((id) => [id, new Path2D(path(byId.get(id)))]));
      const res = { path: (id) => paths.get(id), centroid: (id) => path.centroid(byId.get(id)) };
      const areas = C.canvasLayer(el, { left: 0, top: 0, pw: w, ph: h, name: "areas" });
      const borders = C.canvasLayer(el, { left: 0, top: 0, pw: w, ph: h, name: "borders" }); // made second: on top
      const legend = el.appendChild(doc.createElement("div"));
      legend.className = "sd-map-legend"; // the core's legend panel, on the background colour
      legend.dataset.at = "bottom-left";
      return { w, h, base, res, areas, borders, legend };
    }

    /** Removes the stage's nodes. */
    function dispose() {
      if (stage) for (const node of [stage.areas, stage.borders, stage.legend]) node.remove();
      stage = null;
    }

    /** Paints the regions of stage `s` with their fills (a Map; no entry is the hatch) and their borders, through `view`. */
    function paint(s, fills, view) {
      const { areas, borders, res } = s;
      const hatch = { line: token("--sd-color-dim"), background: token("--sd-color-surface") };
      const stroke = token("--sd-color-background");
      areas.setAttribute("data-sig", M.paintAreas(areas, { source: props.boundaries, view, alpha: 1, hatch,
        items: ids.map((id) => ({ id, fill: fills.get(id) ?? null, stroke, width: 1, dot: false })) }, res));
      borders.setAttribute("data-sig", M.paintBorders(borders, { source: props.boundaries, view,
        items: ids.map((id) => ({ id, stroke: token("--sd-color-rule"), width: 1, alpha: 1, dot: false })) }, res));
    }

    return {
      async update(next, info = {}) {
        // The size is the element's now: `ctx.size` was measured at mount, before the slide's other elements had settled
        // the box, and an element that appears on a later step has no box until then (`ctx.size` is the fallback).
        const [w, h] = [el.offsetWidth || ctx.size.w, el.offsetHeight || ctx.size.h];
        if (stage && (stage.w !== w || stage.h !== h)) { dispose(); last = null; } // a new size: a new stage, no flight
        if (!w || !h) return; // no box to draw in yet: the update that shows the element draws everything
        stage ??= build(w, h);
        const s = stage; // this update's stage, taken before any await: once the element is destroyed, `stage` is null
        // The join: every row names a region, as text. A key that matches none is an error, never a missing value.
        const rows = await C.loadTable(next, ctx, "my.regions", [["id", next.id], ["value", next.value]]);
        const scale = C.colorScale({ classes: next.classes }, palettes, { format: ctx.format(",") });
        const fills = new Map();
        for (const row of rows) {
          const key = String(row[next.id]).trim();
          if (!byId.has(key)) throw new Error(`${next.data}: key '${key}' matches no region`);
          const color = scale.color(row[next.value]);
          if (color) fills.set(key, color);
        }
        s.legend.replaceChildren(C.legendRow(doc, scale.legend, { title: next.label, noData: ids.some((id) => !fills.has(id)), t: ctx.t }));

        if (next.focus && !byId.has(next.focus)) throw new Error(`region '${next.focus}' not found`);
        const view = M.view(s.base, next.focus ? [byId.get(next.focus)] : null, [w, h]);
        const moves = last && (last.k !== view.k || last.x !== view.x || last.y !== view.y);
        if (info.animate && moves && !info.entered && !info.signal?.aborted) {
          const from = last;
          await C.morph(info, ctx, (t) => paint(s, fills, { k: C.lerp(from.k, view.k, t), x: C.lerp(from.x, view.x, t), y: C.lerp(from.y, view.y, t) }));
        }
        paint(s, fills, view); // the end state, however the step ended
        last = view;
      },
      destroy: dispose,
    };
  },
};
```

The pieces, in the order `mount` and `update` take them:

| Step | Piece | Why |
|---|---|---|
| Regions | `M.boundaries` | Checks the GeoJSON (Polygons and MultiPolygons, an id on every feature, no id twice, within the limits) and fixes the winding, so a file from `sf` or `geopandas` draws right. It returns new features, `byId` and the `ids`; never draw the raw file. |
| Projection | `M.projection`, `d3.geoPath` | The base projection, fitted to the regions in the element's size, which `update` reads from the element (`el.offsetWidth || ctx.size.w`) and which can differ from the size at mount; the stage is built again when it changes. A `Path2D` per region, in base-projected pixels, is drawn again at every view without projecting again. |
| Canvases | `C.canvasLayer` | One named layer per painter, stacked in the order they are made: the borders over the areas. They are made with the stage, at the element's size. |
| Join | `C.loadTable`, then your own check | `loadTable` checks that the columns exist. The join is yours: a key that names no region throws, so a mismatch in the data is an error on the slide, never a region quietly left blank. |
| Colours | `C.colorScale`, `C.legendRow` | Stepped classes from the theme's sequential palette, and the legend row with a "no data" swatch when a region has no value. `.sd-map-legend` is the core's legend panel, on the background colour. |
| View | `M.view` | The transform that fits the `focus` region, or the whole map. A view is three numbers, `k`, `x` and `y`. |
| Motion | `C.morph`, `C.lerp` | A played change of `focus` blends the three numbers from the last view to the new one over twice `--sd-duration`, or the step's `transition`, and paints every frame through the view of the moment. A straight blend is enough here; the built-in follows `d3.interpolateZoom`, which zooms out and in again on a long flight. |
| Paint | `M.paintAreas`, `M.paintBorders` | Clear the canvas, paint the scene, return a signature of it. A region with no fill is hatched. The signatures go on the canvases as `data-sig`, so `dump` shows what was painted. |

`update` ends by painting the end state from its props, whether the step played, jumped or was aborted, so a played step ends where a jump does, pixels included. It takes the stage into `s` before its first `await`: the element can be destroyed while it waits (the slide is left mid-flight), and `destroy` sets `stage` to null, so code after an `await` that read `stage` would throw; `s` is the stage the update started with, and painting it once it is detached does no harm. The boundaries are read once, at mount, so a step cannot change them here (the built-in can). The size is read at every update, not taken from `ctx.size`: that is measured at mount, before the slide's other elements have settled the box, and an element that is hidden with `collapse: true` has no box until it appears.

The example slide flies from the whole map to one region, then to another. The source line is in `footer`, so the map is alone in `main` and fills it.

```js
export default {
  id: "my-regions-example",
  layout: "figure-notes",
  title: "Rates by region",
  elements: [
    { id: "regions", region: "main", type: "my.regions",
      props: { boundaries: "data/regions.geojson", id: "code", data: "data/rates.csv", value: "rate",
               classes: [5, 10, 15], label: "Cases per 1,000" } },
    { id: "src", region: "footer", type: "text", props: { role: "source", text: "Synthetic data." } },
  ],
  steps: [
    { id: "all" },
    { id: "west", set: { regions: { focus: "W4" } } },
    { id: "east", set: { regions: { focus: "E1" } } },
  ],
};
```

Its data files are the gallery's: copy [`site/gallery/data/map/regions.geojson`](../../site/gallery/data/map/regions.geojson) and [`rates.csv`](../../site/gallery/data/map/rates.csv) into the deck's `data/`. `validate`, `check` and `check --played` pass on it in both built-in themes.

For a raster, the same order holds with the Rasters group of the contract: `M.loadRaster` reads the file, `M.lut` turns a colour scale into a colour per grey level, and `M.paintRaster` draws it through a lookup table per view (`M.lookup`), hatching land without data. The inset's box, leader lines and scale bar are `M.insetFrame` and `M.scaleBar` on an SVG over the canvases.

The gallery's before/after swipe, [`gallery.swipe`](../../site/gallery/components/gallery.swipe/index.js), is a map story the built-in does not tell, built the same way in about 100 lines and no `import`. It lays two frames of one raster on two canvases (`C.canvasLayer` with `maxRatio: 1`, each painted with `M.paintRaster` through `M.lookup` and `M.lut` and a `C.colorScale` over the raster's value range), clips the second from the divider to the right edge with a CSS `clip-path`, and draws the borders over both with `M.paintBorders`. A played change of `at` is one `C.morph` of the clip and a line; every canvas carries `data-frame`, `data-at` and `data-sig`, so `check --played` sees what it shows. It reads its size at every `update` (`el.offsetWidth || ctx.size.w`) and builds its canvases again when it changes, because `ctx.size` is measured at mount, before the slide's other elements have settled the box, and a swipe that appears on a later step has no box until then. Its slide is `map-swipe` in the [gallery](../../site/gallery/), and its test is [`custom-swipe.test.mjs`](../../test/browser/custom-swipe.test.mjs).

## Verify it

Run these after every change. All of them work on a deck made by `new`.

```sh
node cli/index.js validate ../my-talk
node cli/index.js catalog my.counter ../my-talk
node cli/index.js check ../my-talk --played
```

For the deck built on this page (the three slides of `new` plus `my-counter-example`) they print:

```text
validate: 4 slides, 0 errors, 0 warnings
```

```text
my.counter · component (deck)
One large number with a label, counting from its previous value to the new one when a step plays. The number is formatted in the deck language.

props (name, transition, required, description):
  value   tween  required  The number to show. Drive it with `advance` or `set` it in steps; a played step counts to it.
          e.g. 1250, 0.42
  label   fade   optional  A short line under the number.
          e.g. "people screened"
  format  snap   optional  A d3-format specifier for the number.
          e.g. ",.0f", ".0%"

example: components/my.counter/example.js
```

```text
check: 4 slides, 9 steps, 10 played arrivals compared, 0 problems
```

`check` and `dump` need Chrome and Playwright; see the [quickstart](quickstart.md#requirements). `catalog` with a name prints one entry; without a name it rewrites `<deck>/catalog/`.

### Problems you are likely to see

| Rule | Command | What it means |
|---|---|---|
| `component-schema` | `validate` | `schema.json` does not compile as JSON Schema 2020-12, for example `"type": "numbr"`. Checked for every listed component, used or not. |
| `prop-invalid` | `validate` | A slide's props break the schema at some step, after bindings are resolved. Example: `value = "480" vs must be number`. |
| `unknown-prop` | `validate` | A slide sets a prop the schema does not have. A common cause is `set: { id: { props: … } }`. |
| `unknown-component` | `validate` | A slide uses a type that is neither a built-in nor listed in `deck.js` `components`. |
| `component-missing` | `validate` | `deck.js` lists a component with no `components/<name>/schema.json`. |
| `component-collision` | `validate` | A deck component has a built-in's name. |
| `catalog-schema` | `catalog` (warning) | A prop lacks `description`, `examples` or `x-transition`. `validate` does not report it. |
| `render-error` | `check` | `mount` or `update` threw, rejected, or did not settle within 10 seconds. |
| `played-mismatch` | `check --played` | The element looks different after an animated arrival than after a jump. Look for state kept across calls, or inline styles left after motion. |

`check` also measures your component's text like any other: font size, contrast, overlap and staying inside the region. See [Checking a deck](checking-a-deck.md) and the [rules reference](../reference/rules.md).

### Browser tests in the repository

Contributors who add a component to a deck inside the repository, such as `examples/spike`, can test it with the helpers in `test/browser/helpers.mjs`. They build bare-shell URLs relative to the repository root, so they only work for decks inside the repo:

| Helper | What it asserts |
|---|---|
| `expectJumpEqualsPlayed` | Playing forward step by step ends at the same `outerHTML` as jumping, at every step. |
| `expectBackwardEqualsJump` | Moving back one step ends where a jump does. |
| `expectInterruptEqualsJump` | Re-targeting mid-motion ends where a jump does, with no inline styles left. |
| `expectAnimatedStepMoves` | A forward step really animates: a sample taken mid-motion differs from the end state. |

Run them with `STEPDECK_PLAYWRIGHT=<playwright folder> npm run test:browser`. See [Testing](../contributing/testing.md).

## A complete example in the repository

`examples/spike` has a deck component, `demo.story`, that draws its own SVG and mounts the built-in `text` through `ctx.mount`:

| File | What it shows |
|---|---|
| [`examples/spike/components/demo.story/index.js`](../../examples/spike/components/demo.story/index.js) | A tweened marker, a `render(stage, x)` that writes the whole drawing, and a nested `text` updated with the parent's `info` in one `Promise.all`. |
| [`examples/spike/components/demo.story/schema.json`](../../examples/spike/components/demo.story/schema.json) | One `stage` prop with `x-transition: tween`. |
| [`examples/spike/slides/story.js`](../../examples/spike/slides/story.js) | A slide that drives `stage` with `advance`. |
| [`examples/spike/deck.js`](../../examples/spike/deck.js) | `components: ["demo.story"]`. |
| [`test/browser/custom.test.mjs`](../../test/browser/custom.test.mjs) | Browser tests for it. |

The gallery has a chart built the same way, from `ctx.chart` alone, `gallery.slope`:

| File | What it shows |
|---|---|
| [`site/gallery/components/gallery.slope/index.js`](../../site/gallery/components/gallery.slope/index.js) | A slope chart with no `import`: one scale over every step (`C.extentOf` over `ctx.stepProps`), `C.keyed` joins, then `C.settle`, then every attribute; one `C.morph` for a played change, ranked labels (`C.rank`, `C.spread`) that slide to their new place, focus-dim with `C.focusPaint` and `C.tweenColor`, and an owned entrance (`C.entrance`, `C.undraw`, `ctx.animate.drawPath`). |
| [`site/gallery/components/gallery.slope/schema.json`](../../site/gallery/components/gallery.slope/schema.json) | A closed schema with `"x-enter": "own"` and `description`, `examples` and `x-transition` on every prop. |
| [`site/gallery/components/gallery.slope/example.js`](../../site/gallery/components/gallery.slope/example.js) | The gallery slide: the right end moves from 2010 to 2020 and 2030, then one region is highlighted. |
| [`site/gallery/deck.js`](../../site/gallery/deck.js) | `components: ["gallery.slope"]`. |
| [`test/browser/custom-slope.test.mjs`](../../test/browser/custom-slope.test.mjs) | Played equals jumped, a scale that never moves, labels that slide to their new rank, and the entrance drawn from a deck with a copied engine. |

The cookbook recipe [A custom component driven by `stage`](../../skill/references/cookbook.md#a-custom-component-driven-by-stage) shows the starter's example slide.

## See also

- [Component contract](../reference/component-contract.md): exact signatures of `mount`, `update`, `info`, `ctx` and child handles.
- [Animation and motion](animation-and-motion.md): when motion plays and why a jump and a played step end in the same state.
- [skill/references/custom-components.md](../../skill/references/custom-components.md): the same workflow, for agents.
- [Adding a component](../contributing/adding-a-component.md): adding a built-in component to the engine.
