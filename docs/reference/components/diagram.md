# diagram

`diagram` draws nodes, arrows and nested groups on an explicit grid, and reveals them step by step. This page lists every prop, how the component places and draws each part, how it animates, and which mistakes `validate` and `check` catch. It is for anyone writing slides by hand or reviewing what an agent wrote. Agents get the same facts from [skill/references/components.md](../../../skill/references/components.md) and `node cli/index.js catalog diagram <deck>`.

Sources: [`components/diagram/schema.json`](../../../engine/components/diagram/schema.json), [`components/diagram/index.js`](../../../engine/components/diagram/index.js), [`components/diagram/place.js`](../../../engine/components/diagram/place.js), [`core/stepdeck.css`](../../../engine/core/stepdeck.css), [`cli/validate.js`](../../../cli/validate.js). For the other components, see the [components reference](index.md).

## Use it

The kit example deck builds one labelled arrow over three steps (`examples/kit/slides/concept.js`):

```js
export default {
  id: "concept",
  layout: "full-bleed",
  title: "The idea in one arrow",
  elements: [
    { id: "idea", region: "main", type: "diagram",
      props: {
        cols: 3, rows: 1,
        nodes: [
          { id: "exposure", label: "Exposure", sub: "how much, how long", shape: "box", col: 0, row: 0 },
          { id: "outcome", label: "Outcome measured a year later in the same people", sub: "cases per 100", shape: "box", col: 2, row: 0 },
        ],
        edges: [{ id: "link", from: "exposure", to: "outcome", label: "raises the risk of" }],
        shown: ["exposure"],
      } },
    { id: "src", region: "main", type: "text", props: { role: "source", text: "Synthetic concept diagram." } },
  ],
  steps: [
    { id: "exposure" },
    { id: "outcome", set: { idea: { shown: ["exposure", "outcome"] } } },
    { id: "link", set: { idea: { shown: ["exposure", "outcome", "link"] } } },
  ],
};
```

The component's own example (`components/diagram/example.js`) adds nested groups, a dashed edge, every node shape and a final highlight step:

```js
export default {
  id: "diagram-example",
  layout: "full-bleed",
  title: "From data to a result",
  elements: [
    { id: "flow", region: "main", type: "diagram",
      props: {
        cols: 3, rows: 2,
        nodes: [
          { id: "data", label: "Data", sub: "CSV files", shape: "box", col: 0, row: 0 },
          { id: "model", label: "Model", shape: "pill", col: 1, row: 0 },
          { id: "result", label: "Result", shape: "circle", col: 2, row: 0 },
          { id: "check", label: "Checks", shape: "text", col: 1, row: 1 },
        ],
        edges: [
          { from: "data", to: "model" },
          { from: "model", to: "result", label: "predicts" },
          { from: "check", to: "model", dashed: true },
        ],
        groups: [
          { id: "fit", contains: ["data", "model"] },
          { id: "all", label: "Pipeline", contains: ["fit", "result", "check"], dashed: true },
        ],
        shown: ["data"],
      } },
  ],
  steps: [
    { id: "data" },
    { id: "model", set: { flow: { shown: ["data", "model", "data->model", "fit"] } } },
    { id: "result", set: { flow: { shown: ["data", "model", "data->model", "fit", "result", "model->result"] } } },
    { id: "all", set: { flow: { shown: ["data", "model", "result", "check", "data->model", "model->result", "check->model", "fit", "all"] } } },
    { id: "focus", set: { flow: { highlight: ["model", "model->result", "result"] } } },
  ],
};
```

Both slides pass `validate` and `check --played`. For more nesting, see `examples/kit/slides/sandbox.js`, which puts three groups inside each other.

## Props

| Prop | Type | Required | Default | Transition | Meaning |
| --- | --- | --- | --- | --- | --- |
| `cols` | integer >= 1 | yes | | snap | Number of grid columns. Cells share the element's width equally, with the diagram gap between them. |
| `rows` | integer >= 1 | yes | | snap | Number of grid rows. Cells share the element's height equally, with the diagram gap between them. |
| `nodes` | array of node objects, at least one | yes | | snap | The nodes, each placed in a grid cell. See [Nodes](#nodes). |
| `edges` | array of edge objects | no | none | snap | Arrows from one node or group to another. See [Edges](#edges). |
| `groups` | array of group objects | no | none | snap | Boxes drawn around their members. See [Groups](#groups). |
| `shown` | string array | no | everything | draw | The ids visible at this step: nodes, groups and edges (by edge id). When set, anything not listed is hidden but keeps its place. |
| `highlight` | string array | no | none | fade | The ids emphasised. Everything else dims: shapes and lines turn the theme's dim color and their text turns muted. An empty array means no highlight. |
| `compact` | boolean | no | `false` | snap | Draw the same definition small, as a second view: shapes only, no label text, inside the theme's second-view frame. See [Compact](#compact). |
| `caption` | string | no | none | fade | With `compact: true`, one line of inline Markdown at the label size in a band at the top. Without `compact` it draws nothing, and `validate` warns (`diagram-caption-unused`). |

The schema sets `additionalProperties: false` on the props and on every node, edge and group object, so a misspelled key is a `validate` error, `unknown-prop`, with a path such as `prop 'nodes.0.colour'`. A wrong type or a value outside an enum (for example `shape: "square"`) is `prop-invalid`.

Ids are shared by nodes, groups and edges: one id may name one thing only, because `shown` and `highlight` refer to all three kinds by id.

### Nodes

| Key | Type | Required | Meaning |
| --- | --- | --- | --- |
| `id` | non-empty string | yes | Unique id, used by edges, groups, `shown` and `highlight`. |
| `label` | string | yes | The node's text, inline Markdown. It wraps inside the node. |
| `sub` | string | no | A second line under the label, inline Markdown, smaller and muted. |
| `shape` | `box` \| `pill` \| `circle` \| `card` \| `text` | yes | The outline: a rectangle with small rounded corners, a fully rounded pill, a circle, a card (see [Cards and kinds](#cards-and-kinds)), or no outline at all. |
| `kind` | non-empty string | no | A kind that colours the node from the theme's categorical palette (see [Cards and kinds](#cards-and-kinds)). A `text` node ignores it. |
| `col` | integer >= 0 | yes | 0-based column of the node's first cell. |
| `row` | integer >= 0 | yes | 0-based row of the node's first cell. |
| `colspan` | integer >= 1 | no | Columns the node covers (default 1). |
| `rowspan` | integer >= 1 | no | Rows the node covers (default 1). |

### Edges

| Key | Type | Required | Meaning |
| --- | --- | --- | --- |
| `id` | non-empty string | no | The edge's id. Defaults to `"<from>-><to>"`, for example `"data->model"`. Give an explicit id when two edges join the same pair, or the second one is a duplicate id. |
| `from` | string | yes | Id of the source node or group. |
| `to` | string | yes | Id of the target node or group. The arrowhead is at this end. |
| `label` | string | no | Plain text beside the arrow's midpoint. |
| `dashed` | boolean | no | Draw the line dashed. |

### Groups

| Key | Type | Required | Meaning |
| --- | --- | --- | --- |
| `id` | non-empty string | yes | Unique id, used by edges, other groups, `shown` and `highlight`. |
| `label` | string | no | Inline Markdown, drawn on one line inside the box's top padding, above the members. |
| `contains` | string array, at least one | yes | Ids of the member nodes and groups. Listing a group makes groups nest. |
| `dashed` | boolean | no | Draw the box dashed. |

### Cards and kinds

A `card` is a rounded rectangle that fills its cell: unlike a box, pill or circle it is not sized to its label. A stripe on its left edge, `--sd-diagram-stripe` wide (a grid unit) and clipped to the card's rounded corners, carries its kind's colour (ink when it has no kind). The label is left- and top-aligned at the note size in the strong weight, the sub under it at the label size in muted. The label area is the cell inset by `--sd-diagram-pad` on every side, plus the stripe's width on the left. A label too long for its card overflows it and is never shrunk, as it does in other nodes.

`kind` is an optional string on any node. Each distinct kind takes the next colour of the theme's categorical palette (`ctx.palette("categorical")`) in order of first appearance in `nodes`, whatever `shown` says, so every step agrees on which colour a kind has. On a card the colour is the stripe; on a box, pill or circle it is the outline; a `text` node ignores its kind and takes no place in the order. Groups and edges have no kind. A dimmed node's stripe and outline go to `--sd-color-dim` like the rest of it, and the change tweens with the other colours.

More distinct kinds than the palette has colours is an element error (see [Element errors](#element-errors)).

A node with a kind is drawn in an inner group (`g.sd-diagram-paint`) that holds its shape, stripe and label and carries the colour as the custom property `--sd-kind`; its `g.sd-diagram-node` gets `data-kind`. The motion never touches the inner group, so the colour survives every step. A node without a kind has no such group.

## Compact

`compact: true` draws the same definition small: a "you are here" copy of a process diagram, in a corner `box` beside a slide's own figure, with the current stage lit. Ids mean the same as in the full view, so `shown` and `highlight` read the same on both. To share the definition, put `cols`, `rows`, `nodes`, `edges` and `groups` in one data file and bind both views to it (see [Data and bindings](../../guide/data-and-bindings.md)); kinds then take the same colours in both, because each kind's colour follows its first appearance in `nodes`.

```js
const process = {
  cols: "{{data/process.json#/cols}}", rows: "{{data/process.json#/rows}}",
  nodes: "{{data/process.json#/nodes}}", edges: "{{data/process.json#/edges}}", groups: "{{data/process.json#/groups}}",
};
// in a slide's elements:
{ id: "where", type: "diagram", box: { x: 1264, y: 600, w: 560, h: 280 },
  props: { ...process, compact: true, caption: "You are here", highlight: ["fit"] } },
```

- **Shapes only.** No label, sub, group legend or edge label is created, so `check`, `dump` and the accessibility tree see only the caption. Every shape fills its cell (a circle is the largest circle in it); a card keeps its stripe. A `text` node carries only words, so it and the edges that touch it are left out; highlighting one is no error, and nothing is lit.
- **The frame.** The svg gets `data-compact="true"` and, as its first child, `rect.sd-second-view-frame`: the theme's second-view frame (`--sd-inset-stroke`, `--sd-inset-stroke-width`, `--sd-inset-fill`, `--sd-inset-radius`; see [Themes](../themes.md)), drawn at the element's edge and inset by half its stroke so the stroke stays inside the element.
- **Spacing.** The drawing sits inside the frame, inset by `--sd-diagram-compact-pad`, with `--sd-diagram-compact-gap` between cells (see [Spacing tokens](#spacing-tokens)). Groups have no legend line.
- **The caption** takes its own band at the top, inside the frame: one label line plus the compact pad, reserved when any step of the slide has a compact caption, so nothing moves when it comes or goes. It is `div.sd-second-view-caption`, at `--sd-font-size-label` in ink, on one line, on the frame's fill (`--sd-inset-fill`, carried by the caption itself so `check`'s contrast test sees it). A caption too long for the width is never shrunk: it overflows. In a region, `check` reports it (`text-outside-region`); in a `box`, it catches it only when it leaves the canvas or overlaps other text, so look at a screenshot.
- **Lighting.** With no `highlight`, every part keeps its normal look. With one, a lit node takes its kind's colour (the accent when it has no kind) as an outline twice `--sd-rule-width` wide, and a card's stripe that colour too, over a tint of it: `--sd-compact-tint` (20% in both built-in themes) of the colour mixed into the background. Every other part dims as at full size. A lit edge or group keeps its look (they have no kind).
- **Steps.** `compact` is structure: a step that turns it on or off rebuilds the drawing, at once. The caption is state: a change crossfades (see [Motion](#motion)).

## Reveal and highlight parts by step

All state lives in `shown` and `highlight`. Change them per step with `set`, as in the examples above, or with `advance` over a list of `shown` arrays. See the [step model](../../guide/step-model.md).

- **`shown` absent**: every node, group and edge is visible.
- **`shown` set**: only the listed ids are visible. An edge is visible only when `shown` lists its edge id, even if both its ends are shown, so add the edge id at the step where the arrow should appear. A hidden part keeps its place (`visibility: hidden`), so nothing moves when parts appear.
- **A group's box covers all its members, shown or not**, so a group never resizes between steps. Showing a group does not show its members; list them too.
- **`highlight`**: the listed parts keep full strength and are drawn after (above) the others. On every other part, the outline of a node or group and the line of an edge (with its arrowhead) turn `--sd-color-dim`, a node or group is filled with the background color, and a node's label text turns `--sd-color-muted`. The arrowhead follows its line through `fill: context-stroke`, which Chromium supports; in a browser without it, a dimmed edge keeps an ink arrowhead. Opacity stays 1, so text keeps its contrast. A `text` node has no shape to dim. Edge labels, group labels and subs (which are already muted) do not change.

## Text

| Part | Format | Size token |
| --- | --- | --- |
| Node `label` | Inline Markdown (`renderInline` in `core/inline.js`) | `--sd-font-size-note` |
| Node `sub` | Inline Markdown | `--sd-font-size-label`, muted |
| Group `label` | Inline Markdown, one line (no wrapping) | `--sd-font-size-label`, muted |
| Edge `label` | Plain text: Markdown characters show as typed | `--sd-font-size-label`, muted |
| `caption` (compact only) | Inline Markdown, one line (no wrapping) | `--sd-font-size-label`, ink |

Inline Markdown means bold, italic, `code`, links, images and line breaks; block syntax such as lists does not apply. Raw HTML is escaped. The sandbox example uses code spans for file names (``label: "`data/`"``).

A label too long for its node is never shrunk and never clipped. It wraps inside the node and, if it still does not fit, overflows the node. `check` reports it only if it leaves the region or the canvas. Labels that collide inside one diagram are not reported, because `check` compares elements, not the parts inside one element. Look at a screenshot (`shoot`).

## Placement

Placement is explicit: nothing is laid out automatically.

- **Grid.** With no groups, the cells fill the element: `cellW = (width - (cols - 1) x gap) / cols`, and column `c` starts at `c x (cellW + gap)`. Rows work the same way. A node with a span covers the gaps between its cells. With groups, the grid is first inset by how far the groups reach past their members.
- **Nodes.** The cell is only the node's slot. The drawn shape is sized to its label plus `--sd-diagram-pad`, centred in the cell and capped at the cell's size. A `text` node is just its text, and a `card` is its cell. A circle's diameter covers its label's diagonal plus the padding, capped by the cell's smaller side.
- **Groups.** A group's box is the union of all its members' drawn shapes, grown by the pad on every side. A labelled group's top padding also holds one label line, so nested labels stack and never meet. A child group sits at least one pad inside its parent.
- **Edges.** An edge runs between the borders of its ends' drawn shapes, along the line between their centres. A circle's border is its circle; every other node and every group is its rectangle. The arrowhead appears at the `to` end. A label sits above a mostly horizontal edge, or to the right of a mostly vertical one, in a layer above the nodes and on a background-colored backing.

### Spacing tokens

| Token | academic-light | Used for |
| --- | --- | --- |
| `--sd-diagram-gap` | 48px | Space between grid cells. |
| `--sd-diagram-pad` | 16px | Padding between a node's label and its outline, and between a group's box and its members. |
| `--sd-diagram-stripe` | `var(--sd-grid)` (8px) | Width of the stripe on a card's left edge. |
| `--sd-diagram-compact-gap` | 16px | Space between grid cells of a compact diagram. |
| `--sd-diagram-compact-pad` | 6px | A compact diagram's group padding, and the inset of its drawing inside the frame. |

A theme without the gap and pad tokens gets 3 x and 1 x `--sd-space`, one without the compact pair 1 x and 0.25 x `--sd-space`, and one without the stripe token a stripe of `--sd-grid`. The gap must be at least twice the pad so that neighbouring group boxes never touch; `validate` checks the theme's values (see [Errors and problems](#errors-and-problems)). Colors, stroke widths and font sizes all come from theme tokens through `core/stepdeck.css`. See [Themes](../themes.md).

### Size

A `diagram` fills the region it is in, in any layout: `core/stepdeck.css` gives every diagram element `flex: 1 1 0`. It shares the region with its siblings, so a source line in the same region takes its own height and the diagram takes the rest (in the kit's `concept` slide, the diagram is 1728 x 730 canvas pixels in `full-bleed` main, next to a source line). You can also give the element a `box` to set its size directly. See [Layouts and themes](../../guide/layouts-and-themes.md).

The component reads the element's size when it renders. If `cols`, `rows`, `nodes`, `edges`, `groups`, `compact` or the element's size change, it rebuilds the whole drawing.

## Motion

The engine animates only a forward move of exactly one step. A jump, a backward move and the first render draw the target state at once, and going back hides parts with no motion. Either way, every update first writes the target state and removes any inline style the motion used, so the markup after playing a step equals the markup after jumping to it. See [Animation and motion](../../guide/animation-and-motion.md).

**Entrance.** The diagram builds its own entrance (`"x-enter": "own"`). On the step where the element appears (through [`from` or `at`](../../guide/step-model.md#visibility-sugar-from-and-at)), in its stagger slot, its box stays still and its parts build from nothing to the state of that step, in the order below. Its parts are hidden the moment it shows. With `enter: "fade"`, `"rise"`, `"wipe"` or `"pop"` the box moves instead and the diagram shows its state at once; with `enter: "none"` nothing moves.

On an animated step (the entrance, or a step while the diagram stays visible), the motion runs in this order:

1. At the same time (in the entrance, the groups first, then the nodes): newly shown groups fade in (the shared `fade` motion); newly shown nodes pop in (the shared `pop` motion: they fade in while scaling up from 0.92), one after another, `--sd-stagger` apart (80ms in `modern`, 60ms in `academic-light`, or the step's `transition.stagger`); parts whose highlight changed tween their outline, fill and label text color, in RGB over `--sd-duration-fast`.
2. Then newly shown edges, staggered: a solid edge draws its line from source to target, its arrowhead appears once the line arrives, and then its label fades in. A dashed edge fades in with its label instead of drawing.

In a compact diagram a node that becomes lit, or stops being lit, tweens its outline and fill colours with the others; the outline's width changes at once. A caption change fades the old caption out and the new one in, each over half of `--sd-duration` (or of the step's `transition.duration`), at the same time as step 1.

Each motion lasts the theme's `--sd-duration` (400ms in both built-in themes), or the step's `transition.duration` (see [Setting a duration on a step](../../guide/animation-and-motion.md#setting-a-duration-on-a-step)) if set; the highlight color tween lasts `--sd-duration-fast` (200ms in both themes) instead, or the step's `transition.duration`. Only parts that change visibility or highlight move. A step that also rebuilds the drawing (see [Size](#size)) plays no motion.

## Errors and problems

### Element errors

The component throws on props that would draw a blank or wrong diagram. The error is shown on the slide in place of the element and listed in `STEPDECK.errors` as `<slide>/<element>: <message>`. `check` reports it as `render-error`, and `dump` lists it in the step's `errors`.

| Message | Cause |
| --- | --- |
| ``diagram needs `cols`, an integer >= 1`` (or `rows`) | `cols` or `rows` is missing, not an integer, or below 1. |
| ``diagram needs a non-empty `nodes` array`` | `nodes` is missing or empty. |
| `diagram: <message> (<limit>)` | The first `diagram-id` problem in the props (see below). |
| `diagram has <n> kinds; the categorical palette has <m> colours` | The nodes use more distinct `kind` values than the theme's categorical palette has colours. |

### What `validate` checks

`validate` folds every step of every slide and checks each `diagram` whose resolved props pass the schema. It runs the same checks the component uses (`diagramProblems` in `components/diagram/place.js`), so these appear before you open a browser. Each problem is reported once per element, at the first step where it appears.

| Rule | Cause | Example measured text |
| --- | --- | --- |
| `diagram-id` | An id in an edge's `from` or `to`, a group's `contains`, `shown` or `highlight` names nothing. | `shown names an unknown id 'ghost'` |
| `diagram-id` | The same id is used twice across nodes, groups and edges. Two edges between the same pair without explicit ids also collide. | `id 'a->b' is used twice` |
| `diagram-id` | A group contains itself, directly or through other groups. | `group 'x' contains itself (x -> y -> x)` |
| `diagram-overlap` | Sibling groups (same parent group, or both top-level) share grid cells. | `sibling groups 'g' and 'h' share cells (from col 0, row 0)` |
| `diagram-overlap` | A node that is not a member of a group sits inside that group's cells. | `node 'n' sits in the cells of group 'g' but is not a member` |
| `diagram-overlap` | The theme's `--sd-diagram-gap` is less than twice its `--sd-diagram-pad` (for a compact diagram, `--sd-diagram-compact-gap` and `--sd-diagram-compact-pad`). | `grid gap 20px is less than twice the group padding 16px` |
| `diagram-caption-unused` (warning) | `caption` is set and `compact` is not `true`, so the caption draws nothing. | `` `caption` does nothing without `compact: true` `` |

Here is `validate` on a scratch slide with several of these mistakes:

```text
bad/d · diagram-id · id 'a->b' is used twice vs unique across nodes, groups and edges · rename one 'a->b' (give a repeated edge an explicit `id`)
bad/d · diagram-id · group 'x' contains itself (x -> y -> x) vs groups nest without cycles · remove 'y' -> 'x' from a contains
bad/d · diagram-id · shown names an unknown id 'ghost' vs ids of nodes, groups and edges: 'a', 'b', 'far', 'g', 'h', 'x', 'y', 'a->b' · fix 'ghost' in shown, or add a node, group or edge with that id
bad/d · diagram-overlap · sibling groups 'g' and 'h' share cells (from col 0, row 0) vs sibling groups cover separate cells · move the members of 'g' or 'h' to other cells, or nest one group inside the other
```

A `diagram-id` problem is also an element error at runtime. A `diagram-overlap` problem is not: the diagram still renders, but its boxes may overlap or touch. The gap check uses the theme's `tokens.css` values only; it does not see a `--sd-diagram-gap` or `--sd-diagram-pad` override (or one of the compact pair) in a slide's `style`. The fix text printed for this problem mentions the slide style, but changing only the slide style does not clear the `validate` problem; raise the gap or lower the pad in the theme's `tokens.css` to clear it (`--sd-diagram-gap` and `--sd-diagram-pad`, or `--sd-diagram-compact-gap` and `--sd-diagram-compact-pad` for a compact diagram). All rules are listed in [Rules](../rules.md).

### Not detected

- **A node outside the grid.** Nothing checks that `col + colspan <= cols` or `row + rowspan <= rows`. A node at `col: 2` in a 2-column diagram is placed past the element's edge by the grid formula, with no error and no `diagram-*` problem. `validate` passes; `check` reports the node only through its label, as `text-outside-region` and/or `text-outside-canvas` (usually both; the numbers below depend on the label):

  ```text
  bad/d/0 · text-outside-canvas · text at 2271,565 42×46 vs inside the canvas 0,0 1920×1080 · ...
  ```

  Keep every `col` below `cols` and every `row` below `rows`, including spans.
- **Two nodes in the same cell.** Nodes that share a cell are not reported; their shapes draw on top of each other.
- **Labels that collide inside the diagram.** See [Text](#text).

After `validate`, run `check --played` and look at `shoot` screenshots, as described in [Checking a deck](../../guide/checking-a-deck.md).

## See also

- [Components](index.md): what all built-in components share.
- [Step model](../../guide/step-model.md): `set`, `advance` and how steps fold.
- `components/diagram/README.md`, `schema.json` and `example.js`: the component's own files.
