# diagram

Nodes, arrows and nested groups on an explicit grid, appearing by step. Labels are inline Markdown and wrap
inside their node.

| Prop | Type | Default | Transition | Meaning |
|---|---|---|---|---|
| `cols`, `rows` | integer >= 1 | (required) | snap | The grid. Cells share the element's size equally, with `--sd-diagram-gap` between them. |
| `nodes` | `[{ id, label, sub?, shape, kind?, col, row, colspan?, rowspan? }]` | (required) | snap | `shape` is `box`, `pill`, `circle` (sized to its label, capped by the cell), `card` (fills its cell, with a stripe on its left edge) or `text` (no outline). `kind` colours the node from the categorical palette. `col` and `row` are 0-based. |
| `edges` | `[{ id?, from, to, label?, dashed? }]` | none | snap | An arrow from a node or group to another. Its id is `id`, else `"<from>-><to>"`. `label` is plain text beside the midpoint. |
| `groups` | `[{ id, label?, contains, dashed? }]` | none | snap | A box around all its members (node and group ids, so groups nest). The label is drawn inside the box's top padding, above its members. |
| `shown` | `string[]` | everything | draw | The ids visible (nodes, groups, edges by edge id). Anything not listed is hidden and keeps its place. |
| `highlight` | `string[]` | none | fade | The ids emphasised; the outlines and lines of the rest turn the theme's dim color (`--sd-color-dim`, opacity stays 1) and their text turns muted. |

Behaviour:
- **Driven by props only.** Set `shown` and `highlight` per step with `set` (or `advance` over a list of
  `shown` arrays). An edge is visible only when `shown` lists its id, so reveal it after its nodes.
- **Entrance.** The diagram builds its own entrance (`"x-enter": "own"` in its schema): when the element appears on an
  animated step, its box stays still and its parts build from nothing to the state of that step, in order. The groups
  fade in, then the nodes pop in (the shared `pop` motion), one after another, `--sd-stagger` apart; then the edges draw
  from source to target and their labels fade in (dashed edges fade). It waits for its stagger slot like any entering
  element, and its parts are hidden the moment it shows. With `enter: "none"`, or a box motion such as `enter: "rise"`,
  the diagram shows its state at once (the box moves instead).
- **Change motion** (forward by exactly one step only; any other move renders directly): while the diagram stays shown,
  newly shown groups fade in and nodes pop in, staggered by `--sd-stagger` over `--sd-duration` (or the step's
  `transition`), then newly shown edges draw from source to target and their label fades in (dashed edges fade). A
  highlight change tweens the outline, fill and text colors over `--sd-duration-fast`. Going back hides parts again
  with no motion.
- **Idempotent.** Every `update` writes the state from the props first and removes the inline styles the
  motion used, so the markup after playing equals the markup after jumping.
- **Placement.** Explicit only. The grid cell is a node's slot; the drawn shape is sized to its label
  (plus `--sd-diagram-pad`; a `text` node is just its text; a circle's diameter covers its label), centred
  in its cell and capped at it. With no groups the cells fill the element: `cellW = (width - (cols-1)·gap) /
  cols`, and a node's cell starts at `col·(cellW + gap)`; spans cover the gaps between their cells. A
  group's box is the union of all its members' drawn shapes, shown or not (so it never resizes between
  steps), grown by the pad on every side; a labelled group's top padding also holds one label line, so
  nested labels stack and never meet. The grid is inset by how far the groups reach past their members.
- **Cards and kinds.** A `card` is a rounded rectangle that is its cell (it is not sized to its label), with a
  stripe `--sd-diagram-stripe` wide (a grid unit) on its left edge, clipped to its corners. The label is
  left- and top-aligned at the note size, the sub under it at the label size in muted, both inside the card
  padded by `--sd-diagram-pad`, with the stripe's width added on the left; a label too long for its card overflows
  it, as elsewhere. A `kind` is any string: each distinct kind takes the next colour of
  `ctx.palette("categorical")` in order of first appearance in `nodes`, whatever `shown` says, so every step
  agrees. It colours a card's stripe (ink without a kind) and the outline of a box, pill or circle; a `text` node
  ignores it. A dimmed node's stripe and outline turn `--sd-color-dim` with the rest of it. More kinds than the
  palette has colours is an element error (``diagram has <n> kinds; the categorical palette has <m> colours``).
  A node with a kind is drawn in a group `g.sd-diagram-paint` inside its `g.sd-diagram-node`, which carries
  the colour as `--sd-kind` and `data-kind` on the node; a node without a kind is drawn as before.
- **Edges** run between the borders of the drawn shapes of their ends, along the line between their
  centres (a circle's border is its circle). Edges may connect groups. Edge labels are drawn above the
  nodes, over a background backing.
- **Spacing tokens.** `--sd-diagram-gap` (48px), `--sd-diagram-pad` (16px) and `--sd-diagram-stripe` (a grid
  unit) in the theme; a theme without them gets 3 × and 1 × `--sd-space`, and a grid unit for the stripe. The gap must be at least twice the pad so neighbouring group
  boxes never touch; `validate` checks the theme's values.
- **Text.** Node labels are the note size, subs, edge labels and group labels the label size, all at least
  `--sd-min-audience-font`. A label too long for its node is never shrunk: it overflows the node (no
  clipping), so `check` reports it if it leaves the region. Labels that collide inside one diagram are not
  seen by `check` (it compares elements), so look at a screenshot.
- **Errors.** An id in `edges`, `groups[].contains`, `shown` or `highlight` that names nothing, a duplicate
  id or a group that contains itself is an element error naming the id, and a `diagram-id` problem in
  `validate`. Sibling groups that share cells, and a gap below twice the pad, are `diagram-overlap`
  problems in `validate`, and so is a node sitting in a group's cells without being a member; the diagram
  still renders.

See `example.js` for a slide that uses it.
