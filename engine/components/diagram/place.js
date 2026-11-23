// diagram: placement and problems, pure functions of the props (no DOM, no imports), so `validate` can
// load this file in plain Node.
//
// edgeId(edge) -> string
//   An edge's id: `edge.id`, else "<from>-><to>".
//
// kindOrder(nodes) -> string[]
//   The distinct `kind` values of `nodes` in order of first appearance, skipping `text` nodes (they ignore
//   their kind) and nodes without one. `shown` plays no part: a hidden node still holds its kind's place,
//   so every step and a compact copy agree on which colour a kind has.
//
// placeDiagram(props, { width, height, gap, pad, legend = 0, sizes = null, compact = false })
//   -> { cells: Map<id, {x,y,w,h}>, nodes: Map<id, {x,y,w,h}>,
//        groups: Map<id, {x,y,w,h,depth,label?:{x,y,w,h}}>,
//        edges: [{ id, from, to, x1,y1,x2,y2 }, or for a routed edge { id, from, to, route, x1,y1,x2,y2, points }] }
//   Grid. `cols` x `rows` cells with `gap` between them fill the box, inset by how far the groups reach
//   past their members (see Groups; 0 with no groups) and by the lanes (see Lanes; 0 with no routed edge).
//   With neither:
//     cellW = (width - (cols-1)*gap) / cols,   x(col) = col * (cellW + gap)
//   and the same for rows. A node spanning colspan x rowspan cells covers the gaps between them.
//   Lanes. An edge with a `route` (over, under, left, right) whose two ends are placed takes a lane on that side,
//   outside the grid and outside how far the groups reach, whether it is shown or not, so nothing moves between
//   steps. A lane is gap / 2 wide, plus one `legend` line when the edge has a label; a side's lanes stack outward
//   in the order of `edges`, lane 0 nearest the grid, and the cells shrink by each side's lanes.
//   Nodes. The cell (`cells`) is only the placement slot. The drawn box (`nodes`) is the node's measured
//   size from `sizes` (Map<id, {w,h}>: label plus padding, measured by the component), capped at the cell
//   and centred in it; a circle is square, its diameter capped by the cell's smaller side. Without a size
//   the drawn box is the whole cell, and so it is for a `card`, whatever size was measured.
//   Groups. `depth` is a group's nesting height: 0 when it holds only nodes, 1 + the largest depth of its
//   child groups otherwise. The box is the union of all its members' drawn boxes (nodes, and child group
//   boxes, recursively), shown or not, so a group never resizes between steps; grown by `pad` on the sides
//   and bottom and by `pad` + `legend` at the top when the group has a label (`legend` is the height of
//   one label line). So each level adds pad, labelled levels add one legend line each, and nested labels
//   never meet: `label` is the legend's box, inside the group's top padding (pad / 2 below its border).
//   A child group sits at least `pad` inside its parent.
//   Edges. From the border of the source's drawn box to the border of the target's, along the line between
//   their centres. A circle node's border is its circle (radius: half its box's smaller side); every
//   other node and every group is its box. Coincident centres give a zero-length edge at the centre.
//   A routed edge leaves its source at the middle of the side facing its lane (a circle at its top, bottom, left
//   or right point), runs along the lane's middle and enters its target the same way: `points` is
//   [exit, (exit.x, laneY), (entry.x, laneY), entry] over or under, [exit, (laneX, exit.y), (laneX, entry.y),
//   entry] left or right, and (x1, y1), (x2, y2) are its first and last points. A self-loop (`from` === `to`)
//   leaves a quarter of the side before its middle and comes back a quarter after it (left to right over or
//   under, top to bottom on a side; on a circle, half the radius either side, on the circle), so it reads as a
//   loop.
//   Compact (`compact`: the diagram drawn small, with no text). `sizes` is ignored for every shape, so each
//   drawn shape fills its cell (a circle: the largest circle in it, centred). `text` nodes are not placed:
//   they are absent from `cells` and `nodes`, edges that touch one are absent from `edges` (and reserve no
//   lane), and groups treat them as non-members. `legend` is 0, so no group has a `label` box and no lane a
//   label line. Cell sizes are never negative, so an element too small for its gaps and padding still gives
//   finite boxes of size 0.
//   Unknown ids (see diagramProblems) are skipped here: a group with no known member and an edge with an
//   unknown end are left out, and a `contains` cycle is cut, so placement never throws or loops.
//
// routePath(points, radius) -> string
//   The svg path data of a routed edge: the points joined by straight segments, each corner rounded by a
//   quadratic curve of radius min(radius, half of each segment that meets there).
//
// diagramProblems(props, { gap, pad } = {}) -> [{ rule, id, message, limit, fix }]
//   rule "diagram-id":      an id in edges (from, to), groups[].contains, shown or highlight that names
//                           nothing; a duplicate id; a group that contains itself (a cycle).
//   rule "diagram-overlap": sibling groups (same parent group, or both top-level) whose cell rectangles
//                           intersect; a node that is not a member of a group but sits in the group's cell
//                           rectangle (groups already in a sibling overlap are skipped); and gap < 2 x pad
//                           when both numbers are given. With `props.compact` the fix names the compact
//                           tokens instead.
//   `id` is the offending id (null for the gap rule); `message` names it. `validate` maps each item to a
//   Problem (measured = message) and the component throws on the first "diagram-id" item.

export const edgeId = (edge) => edge?.id ?? `${edge?.from}->${edge?.to}`;

const list = (v) => (Array.isArray(v) ? v : []);
/** The sides a routed edge's lane may take (an edge's `route`). */
const ROUTES = ["over", "under", "left", "right"];

/** The distinct kinds of `nodes`, first appearance first; text nodes and nodes without a kind take no place. */
export function kindOrder(nodes) {
  const kinds = [];
  for (const n of list(nodes)) {
    if (n?.shape !== "text" && typeof n?.kind === "string" && n.kind !== "" && !kinds.includes(n.kind)) kinds.push(n.kind);
  }
  return kinds;
}
const quote = (ids) => ids.map((s) => `'${s}'`).join(", ");
const int = (v, fallback) => (Number.isInteger(v) ? v : fallback);

/** The cell rectangle of a node: [c0, c1) x [r0, r1). */
const cellsOf = (n) => {
  const c0 = int(n.col, 0);
  const r0 = int(n.row, 0);
  return { c0, r0, c1: c0 + Math.max(1, int(n.colspan, 1)), r1: r0 + Math.max(1, int(n.rowspan, 1)) };
};
/** Whether two cell rectangles share at least one cell. */
const overlaps = (p, q) => Math.max(p.c0, q.c0) < Math.min(p.c1, q.c1) && Math.max(p.r0, q.r0) < Math.min(p.r1, q.r1);
const unionCells = (a, b) => (a ? { c0: Math.min(a.c0, b.c0), r0: Math.min(a.r0, b.r0), c1: Math.max(a.c1, b.c1), r1: Math.max(a.r1, b.r1) } : { ...b });

/**
 * Walks the groups bottom-up. -> Map<groupId, { cells, depth }> for every group with at least one known
 * member. Child groups are followed through `contains`; a cycle is cut where it closes.
 */
function groupCells(props) {
  const nodes = new Map(list(props.nodes).map((n) => [n?.id, n]));
  const groups = new Map(list(props.groups).map((g) => [g?.id, g]));
  const out = new Map();
  const visiting = new Set();
  const visit = (id) => {
    if (out.has(id)) return out.get(id);
    if (visiting.has(id)) return null; // a cycle: cut it here
    visiting.add(id);
    let cells = null;
    let depth = 0;
    for (const m of list(groups.get(id)?.contains)) {
      if (nodes.has(m) && !groups.has(m)) cells = unionCells(cells, cellsOf(nodes.get(m)));
      else if (groups.has(m)) {
        const child = visit(m);
        if (!child) continue;
        cells = unionCells(cells, child.cells);
        depth = Math.max(depth, child.depth + 1);
      }
    }
    visiting.delete(id);
    const result = cells ? { cells, depth } : null;
    out.set(id, result);
    return result;
  };
  for (const id of groups.keys()) visit(id);
  for (const [id, v] of out) if (!v) out.delete(id);
  return out;
}

/** `props` without its `text` nodes and the edges that touch them (a compact copy has no text). */
function withoutText(props) {
  const text = new Set(list(props?.nodes).filter((n) => n?.shape === "text").map((n) => n?.id));
  return {
    ...props,
    nodes: list(props?.nodes).filter((n) => n?.shape !== "text"),
    edges: list(props?.edges).filter((e) => !text.has(e?.from) && !text.has(e?.to)),
    groups: list(props?.groups).map((g) => ({ ...g, contains: list(g?.contains).filter((m) => !text.has(m)) })),
  };
}

/** Point on the border of `box` (a circle when `round`) from its centre towards (tx, ty). */
function borderPoint(box, round, tx, ty) {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const dx = tx - cx;
  const dy = ty - cy;
  const len = Math.hypot(dx, dy);
  if (!(len > 1e-9)) return [cx, cy];
  const ux = dx / len;
  const uy = dy / len;
  const t = round
    ? Math.min(box.w, box.h) / 2
    : Math.min(Math.abs(ux) > 1e-12 ? box.w / 2 / Math.abs(ux) : Infinity, Math.abs(uy) > 1e-12 ? box.h / 2 / Math.abs(uy) : Infinity);
  return [cx + ux * t, cy + uy * t];
}

/**
 * The middle of `box`'s side facing `side` (over, under, left, right); for a circle (`round`), its point there.
 * `shift` -1 or 1 moves the point a quarter of the side back or on along it (x for over and under, y for left and
 * right; on a circle, half the radius, the point staying on the circle), so a self-loop leaves and comes back apart.
 */
function sidePoint(box, round, side, shift = 0) {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const r = Math.min(box.w, box.h) / 2;
  const along = side === "over" || side === "under" ? box.w : box.h;
  const t = shift === 0 ? 0 : shift * (round ? r / 2 : along / 4);
  const depth = round ? (t === 0 ? r : Math.sqrt(r * r - t * t)) : 0;
  if (side === "over") return [cx + t, round ? cy - depth : box.y];
  if (side === "under") return [cx + t, round ? cy + depth : box.y + box.h];
  if (side === "left") return [round ? cx - depth : box.x, cy + t];
  return [round ? cx + depth : box.x + box.w, cy + t];
}

/**
 * The svg path data of a routed edge: `points` joined by straight segments, each corner rounded by a quadratic
 * curve of radius min(`radius`, half of each segment that meets there); a corner on a zero-length segment stays
 * square. Coordinates are written to a hundredth of a pixel.
 */
export function routePath(points, radius) {
  const pts = list(points);
  if (pts.length === 0) return "";
  const cap = Number.isFinite(radius) ? Math.max(0, radius) : 0;
  const n = (v) => String(Math.round(v * 100) / 100);
  const at = ([x, y]) => `${n(x)},${n(y)}`;
  let d = `M${at(pts[0])}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [p, q, s] = [pts[i - 1], pts[i], pts[i + 1]];
    const into = Math.hypot(q[0] - p[0], q[1] - p[1]);
    const out = Math.hypot(s[0] - q[0], s[1] - q[1]);
    const r = Math.min(cap, into / 2, out / 2);
    if (!(r > 0)) {
      d += ` L${at(q)}`;
      continue;
    }
    const a = [q[0] - ((q[0] - p[0]) / into) * r, q[1] - ((q[1] - p[1]) / into) * r];
    const b = [q[0] + ((s[0] - q[0]) / out) * r, q[1] + ((s[1] - q[1]) / out) * r];
    d += ` L${at(a)} Q${at(q)} ${at(b)}`;
  }
  if (pts.length > 1) d += ` L${at(pts.at(-1))}`;
  return d;
}

export function placeDiagram(props, { width, height, gap, pad, legend = 0, sizes = null, compact = false }) {
  if (compact) {
    legend = 0;
    sizes = null;
    props = withoutText(props);
  }
  const cols = Math.max(1, int(props?.cols, 1));
  const rows = Math.max(1, int(props?.rows, 1));
  const gc = groupCells(props ?? {});
  const groupDefs = new Map(list(props?.groups).map((g) => [g?.id, g]));
  const nodeIds = new Set(list(props?.nodes).map((n) => n?.id));
  const labelled = (id) => Boolean(groupDefs.get(id)?.label) && legend > 0;
  const topPad = (id) => pad + (labelled(id) ? legend : 0);

  // How far a group reaches beyond its members, on the sides and at the top (children add up).
  const reach = new Map();
  const reachOf = (id, seen = new Set()) => {
    if (reach.has(id)) return reach.get(id);
    seen.add(id);
    let side = 0;
    let top = 0;
    for (const m of list(groupDefs.get(id)?.contains)) {
      if (!gc.has(m) || nodeIds.has(m) || seen.has(m)) continue;
      const r = reachOf(m, seen);
      side = Math.max(side, r.side);
      top = Math.max(top, r.top);
    }
    const r = { side: pad + side, top: topPad(id) + top };
    reach.set(id, r);
    return r;
  };
  let inset = 0;
  let insetTop = 0;
  for (const id of gc.keys()) {
    const r = reachOf(id);
    inset = Math.max(inset, r.side);
    insetTop = Math.max(insetTop, r.top);
  }
  // Lanes: each routed edge whose two ends are placed, shown or not, takes a lane on its side, half the gap wide
  // (plus one legend line when labelled); a side's lanes stack outward in edge order, lane 0 nearest the grid.
  const placed = (id) => (typeof id === "string" && nodeIds.has(id)) || gc.has(id);
  const band = { over: 0, under: 0, left: 0, right: 0 };
  const lanes = new Map(); // edge index -> { side, mid: from the band's inner edge out to the lane's middle }
  for (const [i, e] of list(props?.edges).entries()) {
    if (!ROUTES.includes(e?.route) || !placed(e.from) || !placed(e.to)) continue;
    const w = gap / 2 + (e.label ? legend : 0);
    lanes.set(i, { side: e.route, mid: band[e.route] + w / 2 });
    band[e.route] += w;
  }

  const cellW = Math.max(0, (width - band.left - band.right - 2 * inset - (cols - 1) * gap) / cols);
  const cellH = Math.max(0, (height - band.over - band.under - insetTop - inset - (rows - 1) * gap) / rows);
  const rect = ({ c0, r0, c1, r1 }) => ({
    x: band.left + inset + c0 * (cellW + gap),
    y: band.over + insetTop + r0 * (cellH + gap),
    w: (c1 - c0) * cellW + (c1 - c0 - 1) * gap,
    h: (r1 - r0) * cellH + (r1 - r0 - 1) * gap,
  });

  // Nodes: the cell is the slot; the drawn box is the measured size (when given), capped at the cell and
  // centred in it. A circle's box is square: its diameter is capped by the cell's smaller side.
  const cells = new Map();
  const nodes = new Map();
  const shapes = new Map();
  for (const n of list(props?.nodes)) {
    if (typeof n?.id !== "string" || nodes.has(n.id)) continue;
    const cell = rect(cellsOf(n));
    cells.set(n.id, cell);
    shapes.set(n.id, n.shape);
    const size = n.shape === "card" ? null : sizes?.get?.(n.id);
    if (!size) {
      if (compact && n.shape === "circle") {
        const d = Math.min(cell.w, cell.h);
        nodes.set(n.id, { x: cell.x + (cell.w - d) / 2, y: cell.y + (cell.h - d) / 2, w: d, h: d });
      } else nodes.set(n.id, cell);
      continue;
    }
    let w = Math.min(size.w, cell.w);
    let h = Math.min(size.h, cell.h);
    if (n.shape === "circle") w = h = Math.min(Math.max(size.w, size.h), cell.w, cell.h);
    nodes.set(n.id, { x: cell.x + (cell.w - w) / 2, y: cell.y + (cell.h - h) / 2, w, h });
  }

  // Groups, bottom-up: the union of the members' drawn boxes (nodes, child group boxes), shown or not,
  // grown by pad on the sides and bottom and by pad (+ one legend line when labelled) at the top.
  const groups = new Map();
  const boxOfGroup = (id, seen = new Set()) => {
    if (groups.has(id)) return groups.get(id);
    seen.add(id);
    let u = null;
    for (const m of list(groupDefs.get(id)?.contains)) {
      const b = nodeIds.has(m) ? nodes.get(m) : gc.has(m) && !seen.has(m) ? boxOfGroup(m, seen) : null;
      if (!b) continue;
      u = u ? { x0: Math.min(u.x0, b.x), y0: Math.min(u.y0, b.y), x1: Math.max(u.x1, b.x + b.w), y1: Math.max(u.y1, b.y + b.h) } : { x0: b.x, y0: b.y, x1: b.x + b.w, y1: b.y + b.h };
    }
    if (!u) return null;
    const t = topPad(id);
    const box = { x: u.x0 - pad, y: u.y0 - t, w: u.x1 - u.x0 + 2 * pad, h: u.y1 - u.y0 + pad + t, depth: gc.get(id).depth };
    if (labelled(id)) box.label = { x: box.x + pad, y: box.y + pad / 2, w: Math.max(0, box.w - 2 * pad), h: legend };
    groups.set(id, box);
    return box;
  };
  for (const g of list(props?.groups)) if (gc.has(g?.id)) boxOfGroup(g.id);

  const boxOf = (id) => groups.get(id) ?? nodes.get(id) ?? null;
  const round = (id) => !groups.has(id) && shapes.get(id) === "circle";
  // A lane's line: the y of an over or under lane's middle, the x of a left or right one.
  const laneAt = ({ side, mid }) =>
    side === "over" ? band.over - mid : side === "under" ? height - band.under + mid : side === "left" ? band.left - mid : width - band.right + mid;
  const edges = [];
  for (const [i, e] of list(props?.edges).entries()) {
    const a = boxOf(e?.from);
    const b = boxOf(e?.to);
    if (!a || !b) continue;
    const lane = lanes.get(i);
    if (lane) {
      // A self-loop leaves a quarter of the side before its middle and comes back a quarter after it.
      const self = e.from === e.to;
      const exit = sidePoint(a, round(e.from), lane.side, self ? -1 : 0);
      const entry = sidePoint(b, round(e.to), lane.side, self ? 1 : 0);
      const at = laneAt(lane);
      const points = lane.side === "over" || lane.side === "under"
        ? [exit, [exit[0], at], [entry[0], at], entry]
        : [exit, [at, exit[1]], [at, entry[1]], entry];
      edges.push({ id: edgeId(e), from: e.from, to: e.to, route: lane.side, x1: exit[0], y1: exit[1], x2: entry[0], y2: entry[1], points });
      continue;
    }
    const [x1, y1] = borderPoint(a, round(e.from), b.x + b.w / 2, b.y + b.h / 2);
    const [x2, y2] = borderPoint(b, round(e.to), a.x + a.w / 2, a.y + a.h / 2);
    edges.push({ id: edgeId(e), from: e.from, to: e.to, x1, y1, x2, y2 });
  }
  return { cells, nodes, groups, edges };
}

export function diagramProblems(props, { gap, pad } = {}) {
  const compactTokens = props?.compact === true;
  const out = [];
  const nodes = list(props?.nodes);
  const groups = list(props?.groups);
  const edges = list(props?.edges);
  const nodeIds = nodes.map((n) => n?.id).filter((id) => typeof id === "string");
  const groupIds = groups.map((g) => g?.id).filter((id) => typeof id === "string");
  const edgeIds = edges.map(edgeId);
  const ends = new Set([...nodeIds, ...groupIds]);
  const all = new Set([...ends, ...edgeIds]);
  const endsText = `node and group ids: ${quote([...ends])}`;
  const allText = `ids of nodes, groups and edges: ${quote([...all])}`;
  const unknown = (id, where, limit) =>
    out.push({ rule: "diagram-id", id, message: `${where} names an unknown id '${id}'`, limit, fix: `fix '${id}' in ${where}, or add a node, group or edge with that id` });

  // Duplicates: one id may name one thing only (nodes, groups and edges share `shown` and `highlight`).
  const seen = new Set();
  for (const id of [...nodeIds, ...groupIds, ...edgeIds]) {
    if (seen.has(id)) {
      out.push({ rule: "diagram-id", id, message: `id '${id}' is used twice`, limit: "unique across nodes, groups and edges", fix: `rename one '${id}' (give a repeated edge an explicit \`id\`)` });
    }
    seen.add(id);
  }

  for (const e of edges) {
    for (const end of ["from", "to"]) if (!ends.has(e?.[end])) unknown(e?.[end], `edge '${edgeId(e)}' (${end})`, endsText);
  }
  for (const g of groups) {
    for (const m of list(g?.contains)) if (!ends.has(m)) unknown(m, `group '${g?.id}' (contains)`, endsText);
  }

  // Cycles in `contains` (a group inside itself, directly or through other groups).
  const byId = new Map(groups.map((g) => [g?.id, g]));
  const inCycle = new Set();
  for (const start of groupIds) {
    if (inCycle.has(start)) continue;
    const path = [];
    const walk = (id) => {
      path.push(id);
      for (const m of list(byId.get(id)?.contains)) {
        if (!byId.has(m)) continue;
        if (m === start) return [...path, m];
        if (path.includes(m)) continue;
        const found = walk(m);
        if (found) return found;
      }
      path.pop();
      return null;
    };
    const cycle = walk(start);
    if (cycle) {
      for (const id of cycle) inCycle.add(id);
      out.push({ rule: "diagram-id", id: start, message: `group '${start}' contains itself (${cycle.join(" -> ")})`, limit: "groups nest without cycles", fix: `remove '${cycle.at(-2)}' -> '${start}' from a contains` });
    }
  }

  for (const key of ["shown", "highlight"]) {
    for (const id of list(props?.[key])) if (!all.has(id)) unknown(id, key, allText);
  }

  // Sibling groups must not share cells.
  const gc = groupCells(props ?? {});
  const parent = new Map();
  for (const g of groups) for (const m of list(g?.contains)) if (byId.has(m) && !parent.has(m) && m !== g.id) parent.set(m, g.id);
  const involved = new Set(); // groups already reported in a sibling overlap
  const placed = [...new Set(groupIds)].filter((id) => gc.has(id));
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const [a, b] = [placed[i], placed[j]];
      if ((parent.get(a) ?? null) !== (parent.get(b) ?? null)) continue;
      const p = gc.get(a).cells;
      const q = gc.get(b).cells;
      if (overlaps(p, q)) {
        const [c0, r0] = [Math.max(p.c0, q.c0), Math.max(p.r0, q.r0)];
        involved.add(a).add(b);
        out.push({
          rule: "diagram-overlap",
          id: b,
          message: `sibling groups '${a}' and '${b}' share cells (from col ${c0}, row ${r0})`,
          limit: "sibling groups cover separate cells",
          fix: `move the members of '${a}' or '${b}' to other cells, or nest one group inside the other`,
        });
      }
    }
  }

  // A node that is not a member of a group (at any depth) must not sit in that group's cells.
  const descendants = (id, seen = new Set()) => {
    for (const m of list(byId.get(id)?.contains)) {
      if (seen.has(m)) continue;
      seen.add(m);
      if (byId.has(m)) descendants(m, seen);
    }
    return seen;
  };
  for (const g of placed) {
    if (involved.has(g)) continue;
    const inside = descendants(g);
    const p = gc.get(g).cells;
    for (const n of nodes) {
      if (typeof n?.id !== "string" || inside.has(n.id)) continue;
      if (overlaps(p, cellsOf(n))) {
        out.push({
          rule: "diagram-overlap",
          id: n.id,
          message: `node '${n.id}' sits in the cells of group '${g}' but is not a member`,
          limit: "a group's cells hold only its members",
          fix: `add '${n.id}' to the contains of '${g}', or move it to a cell outside the group`,
        });
      }
    }
  }

  if (Number.isFinite(gap) && Number.isFinite(pad) && gap < 2 * pad) {
    out.push({
      rule: "diagram-overlap",
      id: null,
      message: `grid gap ${gap}px is less than twice the group padding ${pad}px`,
      limit: `gap >= ${2 * pad}px`,
      fix: compactTokens
        ? "raise --sd-diagram-compact-gap or lower --sd-diagram-compact-pad in the theme (or the slide style)"
        : "raise --sd-diagram-gap or lower --sd-diagram-pad in the theme (or the slide style)",
    });
  }
  return out;
}

/**
 * Gap and group padding in px from theme token values (strings such as "48px"): --sd-diagram-gap and
 * --sd-diagram-pad, else 3 x and 1 x --sd-space. With `compact`, --sd-diagram-compact-gap and
 * --sd-diagram-compact-pad, else 1 x and 0.25 x --sd-space. -> { gap, pad }, each a number or NaN when unknown.
 */
export function diagramSpacing(tokens, { compact = false } = {}) {
  const px = (name) => {
    const m = /^\s*(-?\d+(?:\.\d+)?)px\s*$/.exec(String(tokens?.[name] ?? ""));
    return m ? Number(m[1]) : NaN;
  };
  const space = px("--sd-space");
  const [gapName, padName, gapFactor, padFactor] = compact ? ["--sd-diagram-compact-gap", "--sd-diagram-compact-pad", 1, 0.25] : ["--sd-diagram-gap", "--sd-diagram-pad", 3, 1];
  const gap = px(gapName);
  const pad = px(padName);
  return { gap: Number.isFinite(gap) ? gap : gapFactor * space, pad: Number.isFinite(pad) ? pad : padFactor * space };
}
