// Flowcharts for the docs viewer: draws the small subset of Mermaid `flowchart` that the docs use as an
// inline SVG, with no dependency. A pure module: no DOM, no imports, nothing runs at import time.
//
// parseFlowchart(source) -> { direction, nodes, edges, groups } | null
//   direction "LR" or "TD" ("TB" reads as "TD"). nodes: { id, lines, shape: "box" | "decision", group }.
//   edges: { from, to, label, dashed }. groups (one level of `subgraph id["title"]` ... `end`): { id, title }.
//   Understood: `A[text]`, `A["text"]`, `A{text}`, a bare id, `<br/>` in a label, chains of `-->`,
//   `-->|label|`, `-- label -->`, `-.->` and `-. label .->`, blank lines and `%%` comments.
// renderFlowchart(source, { id }) -> an <svg> string | null
//   `id` makes the arrowhead marker's id unique in the page. A left-to-right chart wider than the page
//   is drawn top-down instead.
//
// Both return null for anything outside the subset (another shape, `&`, styles, nested subgraphs, a
// self-loop, a back edge that could not be routed around the drawing): the viewer then shows the source
// rather than a wrong drawing.

const NODE = /^(\w+)(?:\["([^"]*)"\]|\[([^\]"]*)\]|\{"([^"]*)"\}|\{([^}"]*)\})?/;
const EDGES = [
  [/^-->\|([^|]*)\|/, false],
  [/^-->/, false],
  [/^-\.->\|([^|]*)\|/, true],
  [/^-\.->/, true],
  [/^--\s+"([^"]*)"\s+-->/, false],
  [/^--\s+(.+?)\s+-->/, false],
  [/^-\.\s+"([^"]*)"\s+\.->/, true],
  [/^-\.\s+(.+?)\s+\.->/, true],
];
const SUBGRAPH = /^subgraph\s+(\w+)(?:\["([^"]*)"\]|\[([^\]"]*)\])?$/;
const BREAK = /<br\s*\/?>/i;

export function parseFlowchart(source) {
  const lines = String(source).split("\n").map((l) => l.trim()).filter((l) => l !== "" && !l.startsWith("%%"));
  const head = /^(?:flowchart|graph)\s+(LR|TD|TB)$/.exec(lines.shift() ?? "");
  if (!head) return null;
  const nodes = new Map();
  const edges = [];
  const groups = [];
  let group = null;

  const node = (m) => {
    const [, id, q1, plain, q2, braces] = m;
    const text = q1 ?? plain ?? q2 ?? braces;
    let n = nodes.get(id);
    if (!n) {
      n = { id, lines: [id], shape: "box", group: group?.id ?? null };
      nodes.set(id, n);
    }
    if (text !== undefined) {
      n.lines = text.split(BREAK).map((s) => s.trim());
      n.shape = q2 !== undefined || braces !== undefined ? "decision" : "box";
    }
    return n;
  };

  for (const line of lines) {
    if (line === "end") {
      if (!group) return null;
      group = null;
      continue;
    }
    const sub = SUBGRAPH.exec(line);
    if (sub) {
      if (group) return null;
      group = { id: sub[1], title: sub[2] ?? sub[3] ?? sub[1] };
      groups.push(group);
      continue;
    }
    let m = NODE.exec(line);
    if (!m || ["subgraph", "style", "classDef", "class", "click", "linkStyle", "direction"].includes(m[1])) return null;
    let from = node(m);
    let rest = line.slice(m[0].length);
    while (rest.trim() !== "") {
      if (!/^\s/.test(rest)) return null;
      rest = rest.trimStart();
      const hit = EDGES.map(([re, dashed]) => [re.exec(rest), dashed]).find(([x]) => x);
      if (!hit) return null;
      rest = rest.slice(hit[0][0].length);
      if (!/^\s/.test(rest)) return null;
      rest = rest.trimStart();
      m = NODE.exec(rest);
      if (!m) return null;
      const to = node(m);
      rest = rest.slice(m[0].length);
      if (from.id === to.id || edges.some((e) => e.from === from.id && e.to === to.id)) return null;
      edges.push({ from: from.id, to: to.id, label: hit[0][1]?.trim() || null, dashed: hit[1] });
      from = to;
    }
  }
  if (group || nodes.size === 0) return null;
  return { direction: head[1] === "LR" ? "LR" : "TD", nodes: [...nodes.values()], edges, groups };
}

// Sizes, in SVG user units (CSS px at natural size). Text is not measured (no DOM): widths are estimated
// from the character count, a little wide, so a label never leaves its box.
const CHAR = 7.4;
const LINE = 18;
const PAD_X = 14;
const PAD_Y = 10;
const LABEL_CHAR = 6.9;
const LABEL_H = 18;
const SEP = 28; // between neighbours in a rank
const RANK_GAP = 44;
const LANE_GAP = 64; // between the main part and a subgraph, and between subgraphs
const GROUP_PAD = 16;
const GROUP_TITLE = 22;
const ARC_STEP = 24; // distance between the back edges drawn around the chart
const MAX_WIDTH = 960;

const labelWidth = (text) => Math.ceil(text.length * LABEL_CHAR) + 12;

/**
 * Places the graph: layered, top-down or left-to-right. Returns null when a back edge cannot be drawn
 * around the chart. Internally `main` is the axis the ranks advance on and `cross` the axis inside a rank.
 */
export function layoutFlowchart(graph, direction = graph.direction) {
  const TD = direction === "TD";
  const index = new Map(graph.nodes.map((n, i) => [n.id, i]));
  const items = graph.nodes.map((n, i) => {
    const w = Math.ceil(Math.max(...n.lines.map((l) => l.length)) * CHAR) + 2 * PAD_X + (n.shape === "decision" ? 20 : 0);
    const h = n.lines.length * LINE + 2 * PAD_Y;
    const lane = n.group === null ? 0 : 1 + graph.groups.findIndex((g) => g.id === n.group);
    return { node: n, order: i, w, h, lane, cross: TD ? w : h, main: TD ? h : w, up: [], down: [], rank: 0, pos: 0 };
  });

  // Back edges: an edge to a node that is still open in a depth-first walk in source order.
  const out = items.map(() => []);
  graph.edges.forEach((e, i) => out[index.get(e.from)].push(i));
  const state = items.map(() => 0);
  const back = new Set();
  const visit = (u) => {
    state[u] = 1;
    for (const i of out[u]) {
      const v = index.get(graph.edges[i].to);
      if (state[v] === 1) back.add(i);
      else if (state[v] === 0) visit(v);
    }
    state[u] = 2;
  };
  items.forEach((_, u) => state[u] === 0 && visit(u));
  const forward = graph.edges.map((e, i) => ({ ...e, i, u: index.get(e.from), v: index.get(e.to) })).filter((e) => !back.has(e.i));
  const backward = graph.edges.map((e, i) => ({ ...e, i, u: index.get(e.from), v: index.get(e.to) })).filter((e) => back.has(e.i));

  // Ranks: the longest path from a source; then a node nothing points to moves next to its first target.
  for (let pass = 0; pass < items.length; pass++) {
    let moved = false;
    for (const e of forward) {
      if (items[e.v].rank < items[e.u].rank + 1) {
        items[e.v].rank = items[e.u].rank + 1;
        moved = true;
      }
    }
    if (!moved) break;
  }
  items.forEach((it, u) => {
    const outs = forward.filter((e) => e.u === u);
    if (outs.length > 0 && !forward.some((e) => e.v === u)) it.rank = Math.min(...outs.map((e) => items[e.v].rank)) - 1;
  });

  // Rank lists. An edge that spans several ranks gets a zero-size dummy in each rank between.
  const rankCount = Math.max(...items.map((it) => it.rank)) + 1;
  const ranks = Array.from({ length: rankCount }, () => []);
  for (const it of items) ranks[it.rank].push(it);
  for (const e of forward) {
    let prev = items[e.u];
    e.chain = [];
    for (let r = prev.rank + 1; r < items[e.v].rank; r++) {
      const dummy = { node: null, order: prev.order + 0.5, w: 0, h: 0, lane: items[e.u].lane, cross: 0, main: 0, up: [prev], down: [], rank: r, pos: 0 };
      prev.down.push(dummy);
      ranks[r].push(dummy);
      e.chain.push(dummy);
      prev = dummy;
    }
    prev.down.push(items[e.v]);
    items[e.v].up.push(prev);
  }

  // Order inside each rank: source order, then barycentre sweeps, keeping the order with fewest crossings.
  // Subgraph members stay together, after the nodes outside every subgraph.
  const sortRank = (rank, key) => {
    const keyed = rank.map((it, i) => [it, key(it, i)]);
    keyed.sort((a, b) => a[0].lane - b[0].lane || a[1] - b[1]);
    keyed.forEach(([it], i) => {
      rank[i] = it;
      it.index = i;
    });
  };
  const crossings = () => {
    let total = 0;
    for (const rank of ranks) {
      const links = rank.flatMap((it) => it.down.map((d) => [it.index, d.index]));
      for (let a = 0; a < links.length; a++) for (let b = a + 1; b < links.length; b++) if ((links[a][0] - links[b][0]) * (links[a][1] - links[b][1]) < 0) total++;
    }
    return total;
  };
  for (const rank of ranks) sortRank(rank, (it) => it.order);
  let best = { count: crossings(), order: ranks.map((r) => [...r]) };
  const mean = (list, fallback) => (list.length === 0 ? fallback : list.reduce((s, x) => s + x.index, 0) / list.length);
  for (let sweep = 0; sweep < 6 && best.count > 0; sweep++) {
    if (sweep % 2 === 0) for (let r = 1; r < rankCount; r++) sortRank(ranks[r], (it, i) => mean(it.up, i));
    else for (let r = rankCount - 2; r >= 0; r--) sortRank(ranks[r], (it, i) => mean(it.down, i));
    const count = crossings();
    if (count < best.count) best = { count, order: ranks.map((r) => [...r]) };
  }
  best.order.forEach((order, r) => {
    ranks[r] = order;
    order.forEach((it, i) => (it.index = i));
  });

  // Cross-axis positions, one lane at a time: pack each rank, then pull every item towards its
  // neighbours in the ranks before and after, keeping the order and the separation.
  const laneCount = 1 + graph.groups.length;
  let laneStart = 0;
  for (let lane = 0; lane < laneCount; lane++) {
    const rows = ranks.map((rank) => rank.filter((it) => it.lane === lane));
    const gap = (a, b) => (a.cross + b.cross) / 2 + SEP;
    const settle = (row, want) => {
      const lo = [];
      const hi = [];
      row.forEach((it, i) => (lo[i] = i === 0 ? want[i] : Math.max(want[i], lo[i - 1] + gap(row[i - 1], it))));
      for (let i = row.length - 1; i >= 0; i--) hi[i] = i === row.length - 1 ? want[i] : Math.min(want[i], hi[i + 1] - gap(row[i], row[i + 1]));
      row.forEach((it, i) => (it.pos = (lo[i] + hi[i]) / 2));
    };
    for (const row of rows) {
      let at = 0;
      const packed = row.map((it, i) => (at = i === 0 ? 0 : at + gap(row[i - 1], it)));
      settle(row, packed.map((p) => p - at / 2));
    }
    const pull = (row, side) =>
      settle(row, row.map((it) => {
        const near = it[side].filter((x) => x.lane === lane);
        return near.length === 0 ? it.pos : near.reduce((s, x) => s + x.pos, 0) / near.length;
      }));
    for (let pass = 0; pass < 4; pass++) {
      for (let r = 1; r < rankCount; r++) pull(rows[r], "up");
      for (let r = rankCount - 2; r >= 0; r--) pull(rows[r], "down");
    }
    for (let r = 1; r < rankCount; r++) pull(rows[r], "up");
    const all = rows.flat();
    if (all.length === 0) continue;
    const min = Math.min(...all.map((it) => it.pos - it.cross / 2));
    const max = Math.max(...all.map((it) => it.pos + it.cross / 2));
    for (const it of all) it.pos += laneStart - min;
    laneStart += max - min + LANE_GAP;
  }

  // Edge labels sit in the gap after their source's rank. Labels that would collide side by side take
  // separate slots along the edge, so each gap is as deep as its slots need.
  const slots = ranks.map(() => []);
  const labelled = forward.filter((e) => e.label).map((e) => {
    const next = e.chain[0] ?? items[e.v];
    const w = labelWidth(e.label);
    return { e, rank: items[e.u].rank, mid: (items[e.u].pos + next.pos) / 2, half: (TD ? w : LABEL_H) / 2 + 4, size: TD ? LABEL_H : w };
  });
  for (const l of labelled.sort((a, b) => a.mid - b.mid)) {
    let slot = slots[l.rank].find((members) => members.every((o) => Math.abs(o.mid - l.mid) >= o.half + l.half));
    if (!slot) slots[l.rank].push((slot = []));
    slot.push(l);
  }

  // Main-axis positions: a rank is as deep as its deepest node; the gap after it holds its label slots.
  const rankAt = [];
  let at = 0;
  ranks.forEach((rank, r) => {
    const depth = Math.max(0, ...rank.map((it) => it.main));
    rankAt[r] = { start: at, end: at + depth };
    const sizes = slots[r].map((members) => Math.max(...members.map((l) => l.size)));
    const used = sizes.reduce((sum, size) => sum + size, 0) + 4 * Math.max(0, sizes.length - 1);
    const gap = Math.max(RANK_GAP, used + 28);
    let slotAt = at + depth + (gap - used) / 2;
    slots[r].forEach((members, i) => {
      for (const l of members) l.e.labelAt = slotAt + sizes[i] / 2;
      slotAt += sizes[i] + 4;
    });
    at += depth + gap;
  });
  const point = (cross, main) => (TD ? { x: cross, y: main } : { x: main, y: cross });
  for (const it of ranks.flat()) {
    const band = rankAt[it.rank];
    Object.assign(it, point(it.pos, (band.start + band.end) / 2));
  }

  const nodes = items.map((it) => ({ id: it.node.id, lines: it.node.lines, shape: it.node.shape, x: it.x, y: it.y, w: it.w, h: it.h }));
  const labels = [];
  const paths = [];
  const f = (n) => Math.round(n * 10) / 10;
  const curve = (a, b) => (TD ? `C${f(a.x)},${f((a.y + b.y) / 2)} ${f(b.x)},${f((a.y + b.y) / 2)} ${f(b.x)},${f(b.y)}` : `C${f((a.x + b.x) / 2)},${f(a.y)} ${f((a.x + b.x) / 2)},${f(b.y)} ${f(b.x)},${f(b.y)}`);
  // The cross coordinate of curve(a, b) where its main coordinate is `m`.
  const along = (a, b, m) => {
    const [m0, m1, c0, c1] = TD ? [a.y, b.y, a.x, b.x] : [a.x, b.x, a.y, b.y];
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 24; i++) {
      const t = (lo + hi) / 2;
      if (m0 + (m1 - m0) * (1.5 * (1 - t) * t + t ** 3) < m) lo = t;
      else hi = t;
    }
    return c0 + (c1 - c0) * (3 * lo * lo - 2 * lo ** 3);
  };
  const side = (it, sign) => point(it.pos, (TD ? it.y : it.x) + (sign * it.main) / 2);

  for (const e of forward) {
    const start = side(items[e.u], 1);
    let d = `M${f(start.x)},${f(start.y)}`;
    let from = start;
    let first = null;
    for (const stop of [...e.chain, items[e.v]]) {
      const band = rankAt[stop.rank];
      const enter = stop.node ? side(stop, -1) : point(stop.pos, band.start);
      d += curve(from, enter);
      if (e.label) first ??= point(along(from, enter, e.labelAt), e.labelAt);
      from = enter;
      if (!stop.node) {
        from = point(stop.pos, band.end);
        d += `L${f(from.x)},${f(from.y)}`;
      }
    }
    paths.push({ d, dashed: e.dashed });
    if (e.label) labels.push({ text: e.label, x: first.x, y: first.y, w: labelWidth(e.label), h: LABEL_H });
  }

  // Back edges run around the chart: below it when it reads left to right, on its right when top-down.
  // Each must start and end on the node nearest that side of its rank, or the line would cross a node.
  if (backward.length > 0) {
    if (graph.groups.length > 0) return null;
    const far = Math.max(...items.map((it) => it.pos + it.cross / 2));
    const span = (e) => items[e.u].rank - items[e.v].rank;
    backward.sort((a, b) => span(a) - span(b));
    const into = new Map();
    for (const e of backward) into.set(e.v, (into.get(e.v) ?? 0) + 1);
    const seen = new Map();
    let lane = far;
    for (const e of backward) {
      const u = items[e.u];
      const v = items[e.v];
      if (ranks[u.rank].at(-1) !== u || ranks[v.rank].at(-1) !== v) return null;
      const n = into.get(e.v);
      const j = seen.get(e.v) ?? 0;
      seen.set(e.v, j + 1);
      // Several arrows into one node land side by side, the shortest nearest the source.
      const landing = Math.min(12, (v.main - 16) / Math.max(1, n - 1)) * ((n - 1) / 2 - j);
      lane += ARC_STEP;
      const a = TD ? { x: u.x + u.w / 2, y: u.y } : { x: u.x, y: u.y + u.h / 2 };
      const b = TD ? { x: v.x + v.w / 2, y: v.y + landing } : { x: v.x + landing, y: v.y + v.h / 2 };
      const r = 8;
      const d = TD
        ? `M${f(a.x)},${f(a.y)}L${f(lane - r)},${f(a.y)}Q${f(lane)},${f(a.y)} ${f(lane)},${f(a.y - r)}L${f(lane)},${f(b.y + r)}Q${f(lane)},${f(b.y)} ${f(lane - r)},${f(b.y)}L${f(b.x)},${f(b.y)}`
        : `M${f(a.x)},${f(a.y)}L${f(a.x)},${f(lane - r)}Q${f(a.x)},${f(lane)} ${f(a.x - r)},${f(lane)}L${f(b.x + r)},${f(lane)}Q${f(b.x)},${f(lane)} ${f(b.x)},${f(lane - r)}L${f(b.x)},${f(b.y)}`;
      paths.push({ d, dashed: e.dashed, extent: TD ? { x: lane, y: a.y } : { x: a.x, y: lane } });
      if (e.label) {
        // Top-down, the label stands beside its line and the next line goes around it.
        const w = labelWidth(e.label);
        labels.push({ text: e.label, x: TD ? lane + 2 + w / 2 : (a.x + b.x) / 2, y: TD ? (a.y + b.y) / 2 : lane, w, h: LABEL_H });
        if (TD) lane += w;
      }
    }
  }

  const groups = graph.groups.flatMap((g) => {
    const inside = nodes.filter((_, i) => graph.nodes[i].group === g.id);
    if (inside.length === 0) return [];
    const x0 = Math.min(...inside.map((n) => n.x - n.w / 2)) - GROUP_PAD;
    const x1 = Math.max(...inside.map((n) => n.x + n.w / 2), x0 + GROUP_PAD + labelWidth(g.title)) + GROUP_PAD;
    const y0 = Math.min(...inside.map((n) => n.y - n.h / 2)) - GROUP_PAD - GROUP_TITLE;
    const y1 = Math.max(...inside.map((n) => n.y + n.h / 2)) + GROUP_PAD;
    return [{ title: g.title, x: x0, y: y0, w: x1 - x0, h: y1 - y0 }];
  });

  // Fit: move everything so the drawing starts at a small margin.
  const boxes = [
    ...nodes.map((n) => [n.x - n.w / 2, n.y - n.h / 2, n.x + n.w / 2, n.y + n.h / 2]),
    ...labels.map((l) => [l.x - l.w / 2, l.y - l.h / 2, l.x + l.w / 2, l.y + l.h / 2]),
    ...groups.map((g) => [g.x, g.y, g.x + g.w, g.y + g.h]),
    ...paths.filter((p) => p.extent).map((p) => [p.extent.x, p.extent.y, p.extent.x, p.extent.y]),
  ];
  const M = 6;
  const dx = M - Math.min(...boxes.map((b) => b[0]));
  const dy = M - Math.min(...boxes.map((b) => b[1]));
  const width = Math.ceil(Math.max(...boxes.map((b) => b[2])) + dx + M);
  const height = Math.ceil(Math.max(...boxes.map((b) => b[3])) + dy + M);
  return { direction, width, height, dx: f(dx), dy: f(dy), nodes, paths, labels, groups };
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

export function renderFlowchart(source, { id = "flow" } = {}) {
  const graph = parseFlowchart(source);
  if (!graph) return null;
  let layout = layoutFlowchart(graph);
  if (layout && layout.direction === "LR" && layout.width > MAX_WIDTH) layout = layoutFlowchart(graph, "TD");
  if (!layout) return null;
  const f = (n) => Math.round(n * 10) / 10;
  const name = new Map(graph.nodes.map((n) => [n.id, n.lines.join(" ")]));
  const summary = graph.edges.map((e) => `${name.get(e.from)} to ${name.get(e.to)}${e.label ? ` (${e.label})` : ""}`).join("; ");
  const text = (lines, x, y, step) => {
    const top = y - ((lines.length - 1) * step) / 2;
    return `<text x="${f(x)}" y="${f(top)}" text-anchor="middle" dominant-baseline="central">${lines.map((l, i) => `<tspan x="${f(x)}" y="${f(top + i * step)}">${esc(l)}</tspan>`).join("")}</text>`;
  };
  const parts = [];
  for (const g of layout.groups) {
    parts.push(`<g class="flow-group"><rect x="${f(g.x)}" y="${f(g.y)}" width="${f(g.w)}" height="${f(g.h)}" rx="8"/><text x="${f(g.x + GROUP_PAD)}" y="${f(g.y + GROUP_PAD + 2)}" dominant-baseline="central">${esc(g.title)}</text></g>`);
  }
  for (const p of layout.paths) parts.push(`<path class="flow-edge${p.dashed ? " flow-dashed" : ""}" d="${p.d}" marker-end="url(#${id}-arrow)"/>`);
  for (const n of layout.nodes) {
    const x = n.x - n.w / 2;
    const y = n.y - n.h / 2;
    const shape =
      n.shape === "decision"
        ? `<polygon points="${[[x + 12, y], [x + n.w - 12, y], [x + n.w, n.y], [x + n.w - 12, y + n.h], [x + 12, y + n.h], [x, n.y]].map(([a, b]) => `${f(a)},${f(b)}`).join(" ")}"/>`
        : `<rect x="${f(x)}" y="${f(y)}" width="${f(n.w)}" height="${f(n.h)}" rx="6"/>`;
    parts.push(`<g class="flow-node" data-shape="${n.shape}">${shape}${text(n.lines, n.x, n.y, LINE)}</g>`);
  }
  for (const l of layout.labels) {
    parts.push(`<g class="flow-label"><rect x="${f(l.x - l.w / 2)}" y="${f(l.y - l.h / 2)}" width="${f(l.w)}" height="${f(l.h)}" rx="3"/>${text([l.text], l.x, l.y, LINE)}</g>`);
  }
  return (
    `<svg class="flow-svg" xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}" role="img" aria-label="${esc(`Flowchart: ${summary}`)}">` +
    `<defs><marker id="${esc(id)}-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path class="flow-arrow" d="M0,0L10,5L0,10z"/></marker></defs>` +
    `<g transform="translate(${layout.dx},${layout.dy})">${parts.join("")}</g></svg>`
  );
}
