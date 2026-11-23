# diagram

Nodes, arrows and nested groups on an explicit grid, appearing by step. Labels are inline Markdown and wrap
inside their node.

| Prop | Type | Default | Transition | Meaning |
|---|---|---|---|---|
| `cols`, `rows` | integer >= 1 | (required) | snap | The grid. Cells share the element's size equally, with `--sd-diagram-gap` between them. |
| `nodes` | `[{ id, label, sub?, shape, kind?, col, row, colspan?, rowspan? }]` | (required) | snap | `shape` is `box`, `pill`, `circle` (sized to its label, capped by the cell), `card` (fills its cell, with a stripe on its left edge) or `text` (no outline). `kind` colours the node from the categorical palette. `col` and `row` are 0-based. |
| `edges` | `[{ id?, from, to, label?, dashed?, route?, flow? }]` | none | snap | An arrow from a node or group to another. Its id is `id`, else `"<from>-><to>"`. `label` is plain text beside the midpoint. `route` (`over`, `under`, `left`, `right`) draws it around the grid in a lane on that side. `flow` draws it dashed, its dashes marching from source to target while the page animates. |
| `groups` | `[{ id, label?, contains, dashed? }]` | none | snap | A box around all its members (node and group ids, so groups nest). The label is drawn inside the box's top padding, above its members. |
| `shown` | `string[]` | everything | draw | The ids visible (nodes, groups, edges by edge id). Anything not listed is hidden and keeps its place. |
| `highlight` | `string[]` | none | fade | The ids emphasised; the outlines and lines of the rest turn the theme's dim color (`--sd-color-dim`, opacity stays 1) and their text turns muted. |
| `compact` | boolean | `false` | snap | Draw the same definition small, as a second view: shapes only, no label text, inside the theme's second-view frame. |
| `caption` | string | none | fade | With `compact`, one line of inline Markdown at the label size in a band at the top. Without `compact` it draws nothing (`validate` warns). |

Behaviour:
- **Driven by props only.** Set `shown` and `highlight` per step with `set` (or `advance` over a list of
  `shown` arrays). An edge is visible only when `shown` lists its id, so reveal it after its nodes.
- **Entrance.** The diagram builds its own entrance (`"x-enter": "own"` in its schema): when the element appears on an
  animated step, its box stays still and its parts build from nothing to the state of that step, in order. The groups
  fade in, then the nodes pop in (the shared `pop` motion), one after another, `--sd-stagger` apart; then the edges draw
  from source to target and their labels fade in (dashed and flowing edges fade). It waits for its stagger slot like
  any entering element, and its parts are hidden the moment it shows. With `enter: "none"`, or a box motion such as
  `enter: "rise"`, the diagram shows its state at once (the box moves instead).
- **Change motion** (forward by exactly one step only; any other move renders directly): while the diagram stays shown,
  newly shown groups fade in and nodes pop in, staggered by `--sd-stagger` over `--sd-duration` (or the step's
  `transition`), then newly shown edges draw from source to target and their label fades in (dashed and flowing edges
  fade). A highlight change tweens the outline, fill and text colors over `--sd-duration-fast` (in compact, a node's
  outline width snaps). A caption change fades the old caption out and the new one in, each over half of
  `--sd-duration`. Going back hides parts again with no motion.
- **Idempotent.** Every `update` writes the state from the props first and removes the inline styles the
  motion used, so the markup after playing equals the markup after jumping.
- **Placement.** Explicit only. The grid cell is a node's slot; the drawn shape is sized to its label
  (plus `--sd-diagram-pad`; a `text` node is just its text; a circle's diameter covers its label), centred
  in its cell and capped at it. With no groups the cells fill the element: `cellW = (width - (cols-1)·gap) /
  cols`, and a node's cell starts at `col·(cellW + gap)`; spans cover the gaps between their cells. A
  group's box is the union of all its members' drawn shapes, shown or not (so it never resizes between
  steps), grown by the pad on every side; a labelled group's top padding also holds one label line, so
  nested labels stack and never meet. The grid is inset by how far the groups reach past their members, and
  by the lanes of routed edges (see below).
- **Cards and kinds.** A `card` is a rounded rectangle that is its cell (it is not sized to its label), with a
  stripe `--sd-diagram-stripe` wide (a grid unit) on its left edge, clipped to its corners. The label is
  left- and top-aligned at the note size in the strong weight, the sub under it at the label size in muted, both
  inside the card padded by `--sd-diagram-pad`, with the stripe's width added on the left; a label too long for
  its card overflows it, as elsewhere. A `kind` is any string: each distinct kind takes the next colour of
  `ctx.palette("categorical")` in order of first appearance in `nodes`, whatever `shown` says, so every step
  agrees. It colours a card's stripe (ink without a kind) and the outline of a box, pill or circle; a `text` node
  ignores it. A dimmed node's stripe and outline turn `--sd-color-dim` with the rest of it. More kinds than the
  palette has colours is an element error (``diagram has <n> kinds; the categorical palette has <m> colours``).
  A node with a kind is drawn in a group `g.sd-diagram-paint` inside its `g.sd-diagram-node`, which carries
  the colour as `--sd-kind` and `data-kind` on the node; a node without a kind is drawn as before.
- **Edges** run between the borders of the drawn shapes of their ends, along the line between their
  centres (a circle's border is its circle). Edges may connect groups. Edge labels are drawn above the
  nodes, over a background backing.
- **Routed edges.** An edge with `route: "over"`, `"under"`, `"left"` or `"right"` goes around the grid instead,
  for a loop back ("next round") or a side loop in a vertical diagram. It leaves its source at the middle of the
  side facing that way (a circle at its top, bottom, left or right point), runs out to a lane outside the grid
  on that side, along the lane, and back into its target's middle on the same side, its corners rounded by a
  grid unit (`--sd-grid`, at most half of either segment). It is a `path.sd-diagram-line` with the same
  arrowhead marker as a straight edge's `line.sd-diagram-line`, and like it stops half an arrowhead short of the
  target, so the arrowhead's tip touches the target's border; it draws on from source to target the same way
  (a dashed or flowing one fades). Every routed edge, shown or not, reserves its own lane, so nothing moves between
  steps: half `--sd-diagram-gap` wide, plus one label line when it has a label, stacked outward in the order of `edges`
  (the first nearest the grid), outside how far the groups reach; the cells shrink by the lanes on each side. A
  label sits on the middle of the lane's run, one line over the background backing, as wide as the run and at
  least four label lines: across on an over or under lane, turned a quarter on a side lane (reading upward on
  the left, downward on the right). A longer label is not wrapped: it runs past its box along the lane, so
  `check` reports it when it leaves the region (a turned one only once it is well past it: look at a
  screenshot). A self-loop (`from` equal to `to`) leaves a quarter of the way along the side facing its lane and
  comes back three quarters of the way along (left to right over or under, top to bottom on a side). In a
  compact diagram a lane is one whole compact gap (not half) with no label line, so its line runs half a compact
  gap off the cells, clear of their outlines, and its last leg is long enough for the arrowhead's tip to reach
  the target's border; an edge left out (it touches a `text` node) reserves none. A diagram without routed edges
  reserves no lane.
- **Flowing edges.** `flow: true` on an edge, straight or routed, draws it dashed (the dashed edge's pattern) and,
  while it is shown and not dimmed, marches its dashes from source to target without end. This is ambient motion:
  a CSS keyframe animation of `stroke-dashoffset` over the theme's `--sd-flow-period` (1600ms), which runs only
  under the root class `sd-ambient`. The shell keeps that class on `<html>` while the page animates, so under
  `?capture`, in a presenter preview frame, with reduced motion (unless `?motion=full`) and while the page is
  hidden the edge stands still, dashed. A dimmed flowing edge stands still, and so does every flowing edge of a
  compact diagram (a copy that stays on screen for whole slides should not pull the eye from the slide's figure).
  The edge's `g` gets `data-flow="true"` (an edge without `flow` has no such attribute); the flow writes no other
  markup and no inline style, so the markup at a step is the same played or jumped, and no update waits on it. A
  flowing edge enters as a dashed one does: it fades in, then flows.
- **Compact.** `compact: true` draws the same definition small, for a "you are here" copy beside a slide's own
  figure: bind `cols`, `rows`, `nodes`, `edges` and `groups` of both views to one data file, so every id and every
  kind colour agree. No label, sub, group legend or edge label is created (the only text is the `caption`), every
  shape fills its cell (a circle is the largest circle in it), and `text` nodes and the edges that touch them are
  left out. The svg gets `data-compact="true"`; its first child is `rect.sd-second-view-frame`, the theme's
  second-view frame (`--sd-inset-stroke`, `--sd-inset-stroke-width`, `--sd-inset-fill`, `--sd-inset-radius`) at
  the element's edge, inset by half its stroke so the stroke stays inside the element. The drawing sits in the
  frame inset by `--sd-diagram-compact-pad`, with `--sd-diagram-compact-gap` between cells, below the caption's
  band (one label line plus the compact pad, reserved when any step of the slide has a compact caption, so
  nothing moves when the caption comes or goes). The caption (`div.sd-second-view-caption` in a foreignObject)
  is one line in ink on the frame's fill; a caption too long for the width overflows, never shrinks. With no
  `highlight` every part keeps its normal look. With one, a lit node takes its kind's colour (the accent without
  a kind) as an outline twice `--sd-rule-width` wide, its stripe too, over a tint of that colour (the share
  `--sd-compact-tint` of it mixed into the background); every other part dims as above, and a lit edge or group
  keeps its look. Highlighting an id the compact view does not draw (a `text` node) is no error: nothing is lit.
  A step that turns `compact` on or off rebuilds the drawing; a caption change crossfades.
- **Spacing tokens.** `--sd-diagram-gap` (48px), `--sd-diagram-pad` (16px) and `--sd-diagram-stripe` (a grid
  unit) in the theme; a theme without them gets 3 × and 1 × `--sd-space`, and a grid unit for the stripe. A
  compact diagram uses `--sd-diagram-compact-gap` (16px) and `--sd-diagram-compact-pad` (6px) instead, else 1 ×
  and 0.25 × `--sd-space`. The gap must be at least twice the pad so neighbouring group boxes never touch;
  `validate` checks the theme's values, the compact pair for a compact diagram.
- **Text.** Node labels are the note size, subs, edge labels and group labels the label size, all at least
  `--sd-min-audience-font`. A label too long for its node is never shrunk: it overflows the node (no
  clipping), so `check` reports it if it leaves the region. Labels that collide inside one diagram are not
  seen by `check` (it compares elements), so look at a screenshot.
- **Errors.** An id in `edges`, `groups[].contains`, `shown` or `highlight` that names nothing, a duplicate
  id or a group that contains itself is an element error naming the id, and a `diagram-id` problem in
  `validate`. Sibling groups that share cells, and a gap below twice the pad, are `diagram-overlap`
  problems in `validate`, and so is a node sitting in a group's cells without being a member; the diagram
  still renders. A `caption` without `compact: true` is a `diagram-caption-unused` warning.

See `example.js` for a slide that uses it.
