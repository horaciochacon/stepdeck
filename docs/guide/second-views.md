# Show where we are: second views

A long talk needs landmarks. While one figure carries a slide, the audience still wants to know which stage of the process this result belongs to, or which part of the country the map has zoomed into. A **second view** answers that: a small copy of a `diagram` or a `map`, drawn from the same data as the main figure, kept in a corner with the part under discussion lit.

This page shows three ways to build one: a compact `diagram` that shares its definition with the full diagram, a compact `map` beside a chart, and a locator inset on a map. It is for people who write decks by hand, and for agents that build them. Every prop is in the [`diagram`](../reference/components/diagram.md#compact) and [`map`](../reference/components/map.md#compact) references, and the convention behind second views is in the [component contract](../reference/component-contract.md#second-views).

The examples run on a deck made with `new`, in two themes. Their files are synthetic.

## What a second view is

A second view is the same element, drawn small:

- **`compact: true`** on a `diagram` or a `map` draws it at a small size, inside a frame, from the same props as the full view. Every id means the same in both views, so a step's `shown`, `highlight` or `view` reads the same on both.
- **`caption`** is the only text a compact view has: one line at the label size, in a band at the top. Everything else that is text at full size (node labels, group legends, edge labels, map names, the map legend) is left out, because it would be too small to read.
- **`inset: { locator: true }`** on a `map` is a second view inside the map's own figure: an overview in a corner, with a box that marks what the map shows now.
- **The frame** (its stroke, fill and corner radius) belongs to the theme. Both built-in themes draw one frame look for the compact views and the map's inset: see [Themes](../reference/themes.md#second-views).

A compact view is a normal element: you place it in a region or in a `box`, you give it an `id`, and a step changes its props. The sections below show where to put it and how to keep it honest.

## One definition for both views

A compact copy only works if it is the same diagram. Copying the nodes by hand into two slides lets them drift apart: a renamed node, a moved column, a colour that no longer matches. Keep the definition in one data file, and bind both views to it.

`data/process.json`:

```json
{
  "cols": 4,
  "rows": 1,
  "nodes": [
    { "id": "collect", "label": "Collect", "sub": "survey rounds", "shape": "card", "kind": "data", "col": 0, "row": 0 },
    { "id": "clean", "label": "Clean", "sub": "one row per person", "shape": "card", "kind": "data", "col": 1, "row": 0 },
    { "id": "fit", "label": "Fit", "sub": "the model", "shape": "card", "kind": "model", "col": 2, "row": 0 },
    { "id": "report", "label": "Report", "sub": "tables and figures", "shape": "card", "kind": "output", "col": 3, "row": 0 }
  ],
  "edges": [
    { "id": "to-clean", "from": "collect", "to": "clean" },
    { "id": "to-fit", "from": "clean", "to": "fit" },
    { "id": "to-report", "from": "fit", "to": "report" },
    { "id": "again", "from": "report", "to": "collect", "route": "over", "label": "next round", "flow": true }
  ],
  "groups": [
    { "id": "analysis", "label": "Analysis", "contains": ["fit", "report"] }
  ]
}
```

In each slide that draws the diagram, bind every structural prop (`cols`, `rows`, `nodes`, `edges` and `groups`) to it, and spread the result into the element's props. The full diagram keeps its state (`shown`) in the slide. Save each slide on this page as `slides/<id>.js` and add its id to `slides` in `deck.js`.

```js
const process = {
  cols: "{{data/process.json#/cols}}",
  rows: "{{data/process.json#/rows}}",
  nodes: "{{data/process.json#/nodes}}",
  edges: "{{data/process.json#/edges}}",
  groups: "{{data/process.json#/groups}}",
};

export default {
  id: "process",
  layout: "full-bleed",
  title: "How a round runs",
  elements: [
    { id: "flow", region: "main", type: "diagram", props: { ...process, shown: ["collect"] } },
  ],
  steps: [
    { id: "start" },
    { id: "stages", set: { flow: { shown: ["collect", "clean", "fit", "report", "analysis"] } } },
    { id: "arrows", set: { flow: { shown: ["collect", "clean", "fit", "report", "analysis", "to-clean", "to-fit", "to-report"] } } },
    { id: "loop", set: { flow: { shown: ["collect", "clean", "fit", "report", "analysis", "to-clean", "to-fit", "to-report", "again"] } } },
  ],
};
```

Why this works, and what to keep in mind:

- **A binding that is the whole string resolves to the raw value.** `"{{data/process.json#/nodes}}"` becomes the array itself, not text (see [Data and bindings](data-and-bindings.md#bind-a-value-into-a-prop)). No engine feature is involved: it is the ordinary binding, and `validate` resolves bindings before it checks a prop, so a wrong pointer or a node with a missing key is reported on the slide that binds it.
- **Bind all five props, in both views.** A prop you leave out of one view is one that can differ. A diagram with no groups still binds `groups` (an empty array in the file), so adding a group later changes both views at once.
- **Ids stay the same, so the kinds' colours do too.** Each distinct `kind` takes the next colour of the theme's categorical palette in order of first appearance in `nodes`, whatever `shown` says. Two views of one `nodes` array therefore paint every card the same colour.
- **State stays in the slide.** `shown`, `highlight`, `compact` and `caption` are per view and per step, so they are not in the data file.

## The compact copy in a corner box

A result slide shows its own figure; the compact diagram sits in a corner `box` and says which stage the figure belongs to. This slide uses `figure-notes`: a chart in `main`, a note and the copy in the notes column. The chart reads `data/stage-times.csv`:

```csv
stage,hours
Collect,40
Clean,22
Fit,65
Report,18
```

The slide binds the same five props:

```js
const process = {
  cols: "{{data/process.json#/cols}}",
  rows: "{{data/process.json#/rows}}",
  nodes: "{{data/process.json#/nodes}}",
  edges: "{{data/process.json#/edges}}",
  groups: "{{data/process.json#/groups}}",
};

export default {
  id: "result",
  layout: "figure-notes",
  title: "Fitting takes longest",
  elements: [
    { id: "times", region: "main", type: "chart.bar",
      props: { data: "data/stage-times.csv", x: "stage", y: "hours", orient: "horizontal",
               axes: { x: "Hours per round" }, highlight: "Fit" } },
    { id: "note", region: "notes", type: "text",
      props: { role: "note", text: "Fitting takes nearly half of a round." } },
    { id: "where", type: "diagram", box: { x: 1264, y: 700, w: 560, h: 200 },
      props: { ...process, compact: true, caption: "You are here", highlight: ["fit"] } },
    { id: "source", region: "footer", type: "text", props: { role: "source", text: "Source: synthetic example data." } },
  ],
  steps: [
    { id: "fit" },
    { id: "report", set: { times: { highlight: "Report" }, where: { highlight: ["report"] } } },
  ],
};
```

On the next slide, bind the same five props again and change `highlight` and `caption`: the copy follows the story from one result to the next.

What the compact view draws:

- **Shapes only.** Each node's shape fills its cell: a box or card is its cell, a pill is its cell with round ends, a circle is the largest circle in it. A card keeps its coloured stripe. No label, sub, group legend or edge label is created. A `text` node carries only words, so it, and the edges that touch it, are left out.
- **Lighting.** With no `highlight`, every part has its normal look. With one, a lit node takes its kind's colour (the accent when it has none) as a thicker outline over a light tint of that colour, and everything else goes to the theme's dim grey. The highlighted id can be a node, an edge or a group, as in the full view.
- **Routed edges.** A routed edge keeps its lane: here the loop `again` runs over the top. A flowing edge stands still in a compact view, drawn dashed, so a copy that stays on screen for whole slides does not pull the eye from the slide's own figure.

How to size and place it:

- **Give each cell about 40 px or more.** A cell's width is about `(w − 2 × pad − (cols − 1) × gap) / cols`, and its height about `(h − 2 × pad − caption band − (rows − 1) × gap) / rows`, where the pad and the gap are the theme's compact values (6 px and 16 px in both built-in themes) and the caption band is one label line plus the pad. A routed edge takes one compact gap off the side it runs on, and a group takes a little padding around its members. The 560 × 200 px box above gives cells about 120 px wide and high. Fewer cells in a small box, or a taller box, keep the shapes readable.
- **Keep the title short, or put the copy where the title band is free.** A box floats above the layout, so nothing moves around it. The title spans the width of the canvas, so a copy in the top right corner collides with a long title, and `check` reports a caption that overlaps the title as overlapping text. Here the copy sits low in the notes column, clear of the title band.
- **Keep the caption short.** The caption is one line at the label size, in ink, and is never shrunk or wrapped: a caption too long for the box's width overflows it. About 35 characters fit a 560 px box. In a `region`, `check` reports a caption that leaves it (`text-outside-region`). In a `box`, it catches an overflow only when the caption leaves the canvas or lands on other text, so a caption that runs past the frame's edge into empty canvas passes the check. Look at a screenshot: `node cli/index.js shoot <deck>`.
- **The band is reserved for the whole slide.** When any step of the slide has a compact caption, every step of that element keeps the band, so nothing in the drawing moves when the caption comes or goes. A caption change crossfades.

## A compact map beside a chart

The same idea works for a map: a small locator in a corner `box` next to a chart, the region under discussion lit. The map is drawn from the same boundaries file a full-size map slide would use, with the same `id`, so a region id means the same everywhere.

The data is the stepdeck repository's fictional country: copy `site/gallery/data/map/regions.geojson` and `rates.csv` into your deck's `data/`. The regions have a `code` and a `name`, and `rates.csv` has one `rate` per `code`.

```js
export default {
  id: "region",
  layout: "figure-notes",
  title: "Rates differ across the regions",
  elements: [
    { id: "rates", region: "main", type: "chart.bar",
      props: { data: "data/rates.csv", x: "code", y: "rate", orient: "vertical",
               axes: { y: "Cases per 1,000" }, highlight: "W4" } },
    { id: "where", type: "map", box: { x: 1264, y: 400, w: 560, h: 420 },
      props: { boundaries: "data/regions.geojson", id: "code", compact: true, caption: "West", highlight: ["W4"] } },
    { id: "source", region: "footer", type: "text", props: { role: "source", text: "Source: synthetic example data." } },
  ],
  steps: [
    { id: "west" },
    { id: "south", set: { rates: { highlight: "S1" }, where: { caption: "South", highlight: ["S1"] } } },
  ],
};
```

- **What it leaves out.** A compact map draws no names, no legend, no time-lapse panel and no inset. `labels`, `legend`, `numbers` and `inset` are ignored, and `validate` warns (`map-compact-ignored`) about each one a compact map sets. `legend: false` is fine.
- **What still works.** Layers, `shown`, `view` and its flights, and `frame` work as at full size. Points draw at their size.
- **Lighting.** A highlighted region's land is filled with a light tint of the accent, under its ink outline, and the other regions keep the surface colour. A shown `areas` layer covers the land instead, and dims the other regions as it does at full size.
- **The caption** is the same one line as on a diagram, with the same limits: look at a screenshot.
- **Size.** The projection is fitted to the box less the frame's padding and the caption band, so a box with about the aspect of the map fills best.

## A locator inset on a map

When the main map itself zooms, the audience can lose the overall picture. A locator inset keeps it: a small overview of the whole map in a corner, with a box that marks where the main map is now.

```js
export default {
  id: "locator",
  layout: "full-bleed",
  title: "Zooming in on the west coast",
  elements: [
    { id: "map", region: "main", type: "map",
      props: { boundaries: "data/regions.geojson", id: "code", name: "name",
               layers: { rate: { areas: "data/rates.csv", value: "rate", label: "Cases per 1,000", classes: [5, 10, 15], types: { code: "string" } } },
               shown: ["rate"], legend: "bottom-right",
               inset: { view: null, at: "top-right", locator: true } } },
    { id: "source", region: "main", type: "text", props: { role: "source", text: "Source: synthetic example data." } },
  ],
  steps: [
    { id: "country" },
    { id: "west", set: { map: { view: "W4" } } },
    { id: "coast", set: { map: { view: ["W4", "S1"] } } },
  ],
};
```

- **`locator: true`** makes the inset an overview of `inset.view`, which is typically `null`, the whole map. The box is drawn inside the inset and follows every flight of the main map. There are no leaders.
- **`view` is optional on the inset** and defaults to the whole map, so `inset: { locator: true }` is enough.
- **The box is cut to the inset.** When the main map shows more than the inset does, or runs past its edge, the box is clipped to the inset's frame.
- **Corners.** The inset sits in `at` (default `top-right`) and shows the same layers and highlight as the map. Keep it and the legend in different corners.
- **Without `locator`** the inset is the zoom it always was: a closer view of a region, with its box on the main map and two leaders.

The inset draws the same frame as the compact views, from the theme's tokens.

## Check it

A second view is checked like any other element:

```sh
node cli/index.js validate ../my-talk
node cli/index.js check ../my-talk
node cli/index.js check ../my-talk --theme academic-light
node cli/index.js shoot ../my-talk
```

- **`validate`** resolves the bindings, so the shared definition is checked on every slide that uses it. It warns `diagram-caption-unused` for a `caption` on a diagram that is not compact, and `map-compact-ignored` for a prop a compact map ignores. It also checks the compact gap and pad against each other, as it does the full gap and pad.
- **`check`** measures a compact view's caption like any text: size, contrast, overlap with the title or a note. It has no rule of its own for a second view.
- **`shoot` and `dump`.** `dump` reports a compact element with its caption as its text. A screenshot is how you see what neither tool judges: a caption that runs past the frame in a `box`, cells that are too small, a corner that crowds the title.
- **Two themes.** A frame that looks right in one theme can crowd in the other. Run `check` and `shoot` in both.

## From a custom component

A custom component can mount a compact `diagram` or `map` beside its own drawing with `ctx.mount`: see [Mount a compact view](custom-components.md#mount-a-compact-view).

## See also

- [`diagram`](../reference/components/diagram.md): compact, cards and kinds, routed and flowing edges.
- [`map`](../reference/components/map.md): compact and the locator inset.
- [Data and bindings](data-and-bindings.md): bindings, and why a whole-string binding resolves to the raw value.
- [Themes](../reference/themes.md#second-views): the frame tokens.
- [Animation and motion](animation-and-motion.md#ambient-motion): why a flowing edge stands still in a compact view.
- [Checking a deck](checking-a-deck.md): `validate`, `check`, `shoot` and `dump`.
