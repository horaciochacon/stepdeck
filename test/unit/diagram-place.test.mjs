// diagram: grid placement, group bounds, edge ends and problems (pure functions, no DOM).
import { test } from "node:test";
import assert from "node:assert/strict";
import { placeDiagram, diagramProblems, diagramSpacing, edgeId, kindOrder, routePath } from "#engine/components/diagram/place.js";

const OPTS = { width: 1600, height: 600, gap: 48, pad: 16 };
const contains = (outer, inner, margin) =>
  inner.x - outer.x >= margin - 1e-9 &&
  inner.y - outer.y >= margin - 1e-9 &&
  outer.x + outer.w - (inner.x + inner.w) >= margin - 1e-9 &&
  outer.y + outer.h - (inner.y + inner.h) >= margin - 1e-9;

const nested = {
  cols: 4,
  rows: 2,
  nodes: [
    { id: "a", label: "A", shape: "box", col: 0, row: 0 },
    { id: "b", label: "B", shape: "box", col: 1, row: 0 },
    { id: "c", label: "C", shape: "circle", col: 2, row: 1 },
    { id: "d", label: "D", shape: "pill", col: 3, row: 0 },
  ],
  edges: [{ from: "a", to: "b" }, { from: "b", to: "c", label: "then" }, { id: "back", from: "c", to: "a" }],
  groups: [
    { id: "inner", contains: ["a", "b"] },
    { id: "outer", label: "All", contains: ["inner", "c"] },
  ],
};

test("node box from cell", () => {
  const props = { cols: 4, rows: 2, nodes: [{ id: "n", label: "N", shape: "box", col: 1, row: 0 }] };
  const { nodes } = placeDiagram(props, OPTS);
  const cellW = (1600 - 3 * 48) / 4;
  const cellH = (600 - 1 * 48) / 2;
  const n = nodes.get("n");
  assert.equal(n.x, (1600 - 3 * 48) / 4 + 48);
  assert.equal(n.y, 0);
  assert.equal(n.w, cellW);
  assert.equal(n.h, cellH);
});

test("colspan and rowspan cover the gaps between their cells", () => {
  const props = { cols: 4, rows: 2, nodes: [{ id: "n", label: "N", shape: "box", col: 0, row: 0, colspan: 2, rowspan: 2 }] };
  const n = placeDiagram(props, OPTS).nodes.get("n");
  assert.equal(n.w, 2 * ((1600 - 3 * 48) / 4) + 48);
  assert.equal(n.h, 600);
});

test("nested group contains child group", () => {
  const { nodes, groups } = placeDiagram(nested, OPTS);
  const inner = groups.get("inner");
  const outer = groups.get("outer");
  assert.equal(inner.depth, 0, "a group of nodes only has depth 0");
  assert.equal(outer.depth, 1, "a group holding a group has depth 1");
  for (const id of ["a", "b"]) assert.ok(contains(inner, nodes.get(id), 16), `inner holds ${id} with pad`);
  assert.ok(contains(outer, inner, 16), "outer holds inner with a margin of at least pad");
  assert.ok(contains(outer, nodes.get("c"), 16));
  // Exactly pad x (1 + depth) around the union of the member cells.
  assert.equal(inner.x, nodes.get("a").x - 16);
  assert.equal(outer.x, nodes.get("a").x - 32);
  // Everything stays inside the diagram box.
  for (const g of groups.values()) {
    assert.ok(g.x >= 0 && g.y >= 0 && g.x + g.w <= 1600 + 1e-9 && g.y + g.h <= 600 + 1e-9, "group inside the box");
  }
});

const intersects = (a, b) => Math.min(a.x + a.w, b.x + b.w) > Math.max(a.x, b.x) && Math.min(a.y + a.h, b.y + b.h) > Math.max(a.y, b.y);

test("a labelled group's top padding grows by one legend line", () => {
  const plain = placeDiagram(nested, OPTS);
  const roomy = placeDiagram(nested, { ...OPTS, legend: 20 });
  const outer = roomy.groups.get("outer");
  const inner = roomy.groups.get("inner");
  assert.equal(outer.y, 0, "the grid is inset so the outer box starts at the top");
  assert.equal(inner.y - outer.y, 16 + 20, "pad + legend above the labelled outer group's members");
  assert.ok(roomy.nodes.get("a").y > plain.nodes.get("a").y);
  assert.deepEqual(outer.label, { x: outer.x + 16, y: outer.y + 8, w: outer.w - 32, h: 20 });
  assert.equal(inner.label, undefined, "an unlabelled group has no legend box");
});

test("two nested labelled groups: label boxes do not intersect each other or the members", () => {
  const props = {
    cols: 3,
    rows: 1,
    nodes: ["p1", "p2", "p3"].map((id, i) => ({ id, label: id, shape: "pill", col: i, row: 0 })),
    groups: [
      { id: "agent", label: "Agent", contains: ["p1", "p2", "p3"] },
      { id: "folder", label: "Project folder", contains: ["agent"] },
      { id: "computer", label: "Computer", contains: ["folder"] },
    ],
  };
  const { groups, nodes } = placeDiagram(props, { ...OPTS, legend: 33 });
  const labels = ["computer", "folder", "agent"].map((id) => groups.get(id).label);
  for (let i = 0; i < labels.length; i++) {
    for (let j = i + 1; j < labels.length; j++) assert.ok(!intersects(labels[i], labels[j]), `labels ${i} and ${j} intersect`);
    for (const n of nodes.values()) assert.ok(!intersects(labels[i], n), `label ${i} covers a node`);
  }
  assert.ok(!intersects(groups.get("computer").label, groups.get("folder")), "a label sits above its child group's box");
  assert.ok(!intersects(groups.get("folder").label, groups.get("agent")));
  for (const g of groups.values()) assert.ok(g.y >= 0 && g.y + g.h <= 600 + 1e-9);
});

test("measured sizes: the drawn box is centred in its cell and capped at it", () => {
  const props = { cols: 4, rows: 2, nodes: [
    { id: "n", label: "N", shape: "box", col: 1, row: 0 },
    { id: "big", label: "B", shape: "box", col: 2, row: 0 },
    { id: "c", label: "C", shape: "circle", col: 3, row: 0 },
  ] };
  const sizes = new Map([["n", { w: 100, h: 60 }], ["big", { w: 5000, h: 40 }], ["c", { w: 120, h: 80 }]]);
  const { cells, nodes } = placeDiagram(props, { ...OPTS, sizes });
  const cell = cells.get("n");
  const n = nodes.get("n");
  assert.deepEqual([n.w, n.h], [100, 60]);
  assert.equal(n.x + n.w / 2, cell.x + cell.w / 2);
  assert.equal(n.y + n.h / 2, cell.y + cell.h / 2);
  assert.equal(nodes.get("big").w, cells.get("big").w, "capped at the cell");
  const c = nodes.get("c");
  assert.deepEqual([c.w, c.h], [120, 120], "a circle is square, sized by its larger side");
});

test("measured sizes: edges run between the drawn boxes, not the cells", () => {
  const props = { cols: 2, rows: 1, nodes: [
    { id: "a", label: "A", shape: "box", col: 0, row: 0 },
    { id: "t", label: "T", shape: "text", col: 1, row: 0 },
  ], edges: [{ from: "a", to: "t" }] };
  const sizes = new Map([["a", { w: 200, h: 80 }], ["t", { w: 60, h: 40 }]]);
  const { cells, nodes, edges } = placeDiagram(props, { ...OPTS, sizes });
  const [e] = edges;
  assert.equal(e.x1, nodes.get("a").x + 200);
  assert.equal(e.x2, nodes.get("t").x);
  assert.ok(e.x2 > cells.get("t").x + 100, "the edge reaches into the target's cell, up to the text");
  assert.ok(e.x1 < cells.get("a").x + cells.get("a").w - 100);
});

test("a node that is not a member must not sit in a group's cells", () => {
  const props = { cols: 3, rows: 1, nodes: [
    { id: "a", label: "A", shape: "box", col: 0, row: 0 },
    { id: "b", label: "B", shape: "box", col: 1, row: 0 },
    { id: "c", label: "C", shape: "box", col: 2, row: 0 },
  ], groups: [{ id: "g", contains: ["a", "c"] }] };
  const p = diagramProblems(props);
  assert.deepEqual(p.map((x) => [x.rule, x.id]), [["diagram-overlap", "b"]]);
  assert.match(p[0].message, /'g'/);
});

test("group box ignores shown", () => {
  const all = placeDiagram(nested, OPTS);
  const some = placeDiagram({ ...nested, shown: ["a"] }, OPTS);
  const none = placeDiagram({ ...nested, shown: [] }, OPTS);
  assert.deepEqual([...some.groups], [...all.groups]);
  assert.deepEqual([...none.groups], [...all.groups]);
  assert.deepEqual([...none.nodes], [...all.nodes]);
});

test("edge id default", () => {
  assert.equal(edgeId({ from: "a", to: "b" }), "a->b");
  assert.equal(edgeId({ id: "x", from: "a", to: "b" }), "x");
});

test("edges run border to border along the line between centres", () => {
  const { nodes, edges } = placeDiagram(nested, OPTS);
  assert.deepEqual(edges.map((e) => e.id), ["a->b", "b->c", "back"]);
  const ab = edges[0];
  const a = nodes.get("a");
  const b = nodes.get("b");
  // Same row: horizontal, from a's right border to b's left border.
  assert.equal(ab.x1, a.x + a.w);
  assert.equal(ab.x2, b.x);
  assert.equal(ab.y1, a.y + a.h / 2);
  assert.equal(ab.y2, b.y + b.h / 2);
  // To a circle: the end sits on the circle (radius from the cell's smaller side).
  const bc = edges[1];
  const c = nodes.get("c");
  const r = Math.min(c.w, c.h) / 2;
  assert.ok(Math.abs(Math.hypot(bc.x2 - (c.x + c.w / 2), bc.y2 - (c.y + c.h / 2)) - r) < 1e-6);
  // The start sits on b's border.
  const onBorder = Math.abs(bc.x1 - b.x) < 1e-6 || Math.abs(bc.x1 - (b.x + b.w)) < 1e-6 || Math.abs(bc.y1 - b.y) < 1e-6 || Math.abs(bc.y1 - (b.y + b.h)) < 1e-6;
  assert.ok(onBorder, "the start is on the source's border");
});

test("edges may connect groups", () => {
  const props = { ...nested, edges: [{ from: "inner", to: "d" }] };
  const { groups, nodes, edges } = placeDiagram(props, OPTS);
  const g = groups.get("inner");
  const d = nodes.get("d");
  assert.equal(edges[0].x1, g.x + g.w);
  assert.equal(edges[0].x2, d.x);
});

test("an edge between boxes with the same centre does not divide by zero", () => {
  const props = { cols: 1, rows: 1, nodes: [{ id: "a", label: "A", shape: "box", col: 0, row: 0 }], groups: [{ id: "g", contains: ["a"] }], edges: [{ from: "g", to: "a" }] };
  const [e] = placeDiagram(props, OPTS).edges;
  for (const k of ["x1", "y1", "x2", "y2"]) assert.ok(Number.isFinite(e[k]), k);
});

test("problems name unknown ids", () => {
  const p = diagramProblems({ ...nested, shown: ["nope"] });
  assert.equal(p.length, 1);
  assert.equal(p[0].rule, "diagram-id");
  assert.equal(p[0].id, "nope");
  assert.match(p[0].message, /nope/);
});

test("unknown ids in edges, contains and highlight are diagram-id problems", () => {
  const props = {
    ...nested,
    edges: [{ from: "a", to: "zz" }],
    groups: [{ id: "inner", contains: ["a", "qq"] }],
    highlight: ["a->zz", "ww"],
  };
  const p = diagramProblems(props);
  assert.deepEqual(p.map((x) => x.rule), ["diagram-id", "diagram-id", "diagram-id"]);
  assert.deepEqual(p.map((x) => x.id).sort(), ["qq", "ww", "zz"]);
});

test("shown and highlight may name edges by their id", () => {
  assert.deepEqual(diagramProblems({ ...nested, shown: ["a", "a->b", "back", "outer"], highlight: ["b->c"] }), []);
});

test("duplicate ids and a group cycle are diagram-id problems", () => {
  const dup = diagramProblems({ ...nested, groups: [{ id: "a", contains: ["b"] }] });
  assert.deepEqual(dup.map((x) => [x.rule, x.id]), [["diagram-id", "a"]]);
  const cycle = diagramProblems({ ...nested, groups: [{ id: "g1", contains: ["g2"] }, { id: "g2", contains: ["g1", "a"] }] });
  assert.ok(cycle.some((x) => x.rule === "diagram-id" && /g1|g2/.test(x.message) && /itself|cycle/.test(x.message)), JSON.stringify(cycle));
  // placeDiagram does not recurse forever on a cycle.
  assert.doesNotThrow(() => placeDiagram({ ...nested, groups: [{ id: "g1", contains: ["g2"] }, { id: "g2", contains: ["g1", "a"] }] }, OPTS));
});

test("sibling overlap", () => {
  const props = {
    cols: 2,
    rows: 2,
    nodes: [
      { id: "a", label: "A", shape: "box", col: 0, row: 0 },
      { id: "b", label: "B", shape: "box", col: 0, row: 0 },
      { id: "c", label: "C", shape: "box", col: 1, row: 1 },
    ],
    groups: [{ id: "g1", contains: ["a"] }, { id: "g2", contains: ["b", "c"] }],
  };
  const p = diagramProblems(props);
  assert.equal(p.length, 1, JSON.stringify(p));
  assert.equal(p[0].rule, "diagram-overlap");
  assert.match(p[0].message, /g1/);
  assert.match(p[0].message, /g2/);
});

test("sibling groups whose cell spans cross overlap even without a shared node cell", () => {
  const props = {
    cols: 3,
    rows: 3,
    nodes: [
      { id: "a", label: "A", shape: "box", col: 0, row: 0 },
      { id: "b", label: "B", shape: "box", col: 2, row: 2 },
      { id: "c", label: "C", shape: "box", col: 1, row: 1 },
    ],
    groups: [{ id: "g1", contains: ["a", "b"] }, { id: "g2", contains: ["c"] }],
  };
  assert.deepEqual(diagramProblems(props).map((x) => x.rule), ["diagram-overlap"]);
});

test("nested groups and groups side by side do not overlap", () => {
  assert.deepEqual(diagramProblems(nested), []);
  const side = { ...nested, groups: [{ id: "left", contains: ["a"] }, { id: "right", contains: ["b"] }] };
  assert.deepEqual(diagramProblems(side), []);
});

test("gap below twice the pad is a diagram-overlap problem (when the sizes are known)", () => {
  assert.deepEqual(diagramProblems(nested, { gap: 48, pad: 16 }), []);
  const p = diagramProblems(nested, { gap: 24, pad: 16 });
  assert.deepEqual(p.map((x) => x.rule), ["diagram-overlap"]);
  assert.match(p[0].message, /24/);
  assert.match(p[0].message, /16/);
});

test("kindOrder: first appearance, text nodes skipped, shown ignored", () => {
  const at = (id, shape, kind) => ({ id, label: id, shape, kind, col: 0, row: 0 });
  const nodes = [at("n1", "box", "b"), at("n2", "card", "a"), at("n3", "pill", "b"), at("n4", "text", "c"), at("n5", "circle", "a"), at("n6", "box", undefined)];
  assert.deepEqual(kindOrder(nodes), ["b", "a"]);
  assert.deepEqual(kindOrder([]), []);
  assert.deepEqual(kindOrder(undefined), []);
});

test("a card fills its cell: its drawn box is the cell, whatever size was measured", () => {
  const props = { cols: 2, rows: 1, nodes: [{ id: "c", label: "C", shape: "card", col: 0, row: 0 }, { id: "b", label: "B", shape: "box", col: 1, row: 0 }] };
  const { cells, nodes } = placeDiagram(props, { ...OPTS, sizes: new Map([["c", { w: 60, h: 40 }], ["b", { w: 60, h: 40 }]]) });
  assert.deepEqual(nodes.get("c"), cells.get("c"));
  assert.equal(nodes.get("b").w, 60, "a box is still sized to its label");
});

const COMPACT = { width: 400, height: 200, gap: 16, pad: 6, compact: true };

test("compact: shapes fill their cells; a circle is the cell's largest circle", () => {
  const props = {
    cols: 2,
    rows: 1,
    nodes: [
      { id: "b", label: "Box", shape: "box", col: 0, row: 0 },
      { id: "c", label: "Circle", shape: "circle", col: 1, row: 0 },
    ],
  };
  const sizes = new Map([["b", { w: 10, h: 10 }], ["c", { w: 10, h: 10 }]]);
  const { cells, nodes } = placeDiagram(props, { ...COMPACT, sizes });
  const cellW = (400 - 16) / 2;
  assert.deepEqual(nodes.get("b"), { x: 0, y: 0, w: cellW, h: 200 });
  assert.deepEqual(cells.get("b"), nodes.get("b"));
  // The cell is 192 x 200: the largest circle is 192 across, centred.
  assert.deepEqual(nodes.get("c"), { x: cellW + 16, y: 4, w: cellW, h: cellW });
});

test("compact: text nodes and their edges are left out; a group keeps its other members", () => {
  const props = {
    cols: 3,
    rows: 1,
    nodes: [
      { id: "a", label: "A", shape: "box", col: 0, row: 0 },
      { id: "t", label: "note", shape: "text", col: 1, row: 0 },
      { id: "b", label: "B", shape: "box", col: 2, row: 0 },
    ],
    edges: [{ from: "a", to: "t" }, { from: "t", to: "b" }, { from: "a", to: "b" }],
    groups: [{ id: "g", contains: ["t", "b"] }],
  };
  const full = placeDiagram(props, COMPACT);
  assert.deepEqual([...full.cells.keys()], ["a", "b"]);
  assert.deepEqual([...full.nodes.keys()], ["a", "b"]);
  assert.deepEqual(full.edges.map((e) => e.id), ["a->b"]);
  // The group is the box around `b` alone, as if `t` had never been a member.
  const only = placeDiagram({ ...props, nodes: props.nodes.filter((n) => n.id !== "t"), groups: [{ id: "g", contains: ["b"] }] }, COMPACT);
  assert.deepEqual(full.groups.get("g"), only.groups.get("g"));
  // A group whose members are all text nodes is not drawn.
  const none = placeDiagram({ ...props, groups: [{ id: "g", contains: ["t"] }] }, COMPACT);
  assert.equal(none.groups.size, 0);
});

test("compact: group boxes have no legend line even when labelled", () => {
  const props = {
    cols: 1,
    rows: 1,
    nodes: [{ id: "a", label: "A", shape: "box", col: 0, row: 0 }],
    groups: [{ id: "g", label: "Group", contains: ["a"] }],
  };
  const compact = placeDiagram(props, { ...COMPACT, legend: 40 });
  const plain = placeDiagram({ ...props, groups: [{ id: "g", contains: ["a"] }] }, COMPACT);
  assert.equal(compact.groups.get("g").label, undefined);
  assert.deepEqual(compact.groups.get("g"), plain.groups.get("g"));
  // The same labelled group in a normal diagram does reserve the line.
  assert.ok(placeDiagram(props, { ...COMPACT, compact: false, legend: 40 }).groups.get("g").label);
});

test("compact: a tiny element gives no NaN and no negative size", () => {
  const props = {
    cols: 4,
    rows: 2,
    nodes: [
      { id: "a", label: "A", shape: "box", col: 0, row: 0 },
      { id: "b", label: "B", shape: "circle", col: 3, row: 1 },
      { id: "c", label: "C", shape: "card", col: 1, row: 0, colspan: 2 },
    ],
    edges: [{ from: "a", to: "b" }],
    groups: [{ id: "inner", contains: ["a", "c"] }, { id: "outer", label: "All", contains: ["inner", "b"] }],
  };
  const out = placeDiagram(props, { width: 20, height: 10, gap: 16, pad: 6, compact: true, legend: 30 });
  const numbers = [];
  for (const m of [out.cells, out.nodes, out.groups]) for (const v of m.values()) numbers.push(v.x, v.y, v.w, v.h);
  for (const e of out.edges) numbers.push(e.x1, e.y1, e.x2, e.y2);
  assert.ok(numbers.length > 0);
  assert.ok(numbers.every(Number.isFinite), JSON.stringify(numbers));
  for (const m of [out.cells, out.nodes, out.groups]) for (const v of m.values()) assert.ok(v.w >= 0 && v.h >= 0, JSON.stringify(v));
});

test("diagramSpacing: compact reads the compact tokens", () => {
  const modern = { "--sd-space": "16px", "--sd-diagram-gap": "48px", "--sd-diagram-pad": "16px", "--sd-diagram-compact-gap": "16px", "--sd-diagram-compact-pad": "6px" };
  assert.deepEqual(diagramSpacing(modern, { compact: true }), { gap: 16, pad: 6 });
  assert.deepEqual(diagramSpacing(modern), { gap: 48, pad: 16 });
});

test("diagramSpacing: compact falls back to the space token", () => {
  assert.deepEqual(diagramSpacing({ "--sd-space": "16px" }, { compact: true }), { gap: 16, pad: 4 });
  assert.deepEqual(diagramSpacing({ "--sd-space": "16px" }), { gap: 48, pad: 16 });
});

test("the gap problem of a compact diagram names the compact tokens", () => {
  const compact = diagramProblems({ cols: 1, rows: 1, nodes: [], compact: true }, { gap: 10, pad: 6 });
  assert.equal(compact.length, 1);
  assert.match(compact[0].fix, /--sd-diagram-compact-gap/);
  assert.match(diagramProblems({ cols: 1, rows: 1, nodes: [] }, { gap: 10, pad: 6 })[0].fix, /--sd-diagram-gap/);
});

// Routed edges: a lane outside the grid on the side the edge names, half the gap wide (plus one legend line when
// the edge has a label), stacked outward in edge order.
const pair = (route, extra = {}) => ({
  cols: 2,
  rows: 1,
  nodes: [{ id: "a", label: "A", shape: "box", col: 0, row: 0 }, { id: "b", label: "B", shape: "box", col: 1, row: 0 }],
  edges: [{ from: "a", to: "b", route, ...extra }],
});
const column = (route, shape = "box") => ({
  cols: 1,
  rows: 2,
  nodes: [{ id: "a", label: "A", shape, col: 0, row: 0 }, { id: "b", label: "B", shape: "box", col: 0, row: 1 }],
  edges: [{ from: "a", to: "b", route }],
});

test("routed: lanes are reserved on each side used, shown or not, and shrink the cells", () => {
  const props = {
    cols: 4,
    rows: 2,
    nodes: [
      { id: "a", label: "A", shape: "box", col: 0, row: 0 },
      { id: "b", label: "B", shape: "box", col: 0, row: 1 },
      { id: "c", label: "C", shape: "box", col: 3, row: 0 },
      { id: "d", label: "D", shape: "box", col: 3, row: 1 },
    ],
    edges: [{ from: "a", to: "b" }],
  };
  const plain = placeDiagram(props, OPTS);
  const sides = placeDiagram({ ...props, edges: [...props.edges, { from: "a", to: "b", id: "l", route: "left" }, { from: "c", to: "d", id: "r", route: "right", label: "back" }], shown: [] }, { ...OPTS, legend: 20 });
  const lanes = 48 / 2 + (48 / 2 + 20);
  assert.equal(sides.cells.get("a").w, plain.cells.get("a").w - lanes / 4, "the cells give up the two lanes, over cols");
  assert.equal(sides.cells.get("a").h, plain.cells.get("a").h, "no lane above or below");
  assert.equal(sides.cells.get("a").x, 24, "the grid starts after the left lane");
  assert.equal(sides.cells.get("c").x + sides.cells.get("c").w, 1600 - 44, "and ends before the right one");
  // No routed edge: no lane at all, so a diagram without one keeps its cells.
  assert.deepEqual([...placeDiagram({ ...props, edges: [{ from: "a", to: "b", label: "x" }] }, { ...OPTS, legend: 20 }).cells], [...plain.cells]);
  // Over and under lanes take height instead.
  const ou = placeDiagram({ ...props, edges: [{ from: "a", to: "c", route: "over" }, { from: "b", to: "d", route: "under" }] }, OPTS);
  assert.equal(ou.cells.get("a").h, plain.cells.get("a").h - (24 + 24) / 2, "a lane above and one below, over rows");
  assert.equal(ou.cells.get("a").w, plain.cells.get("a").w);
  assert.equal(ou.cells.get("a").y, 24);
});

test("routed: lanes stack outward in edge order; a labelled lane is one legend line wider", () => {
  const props = {
    ...pair("over"),
    edges: [{ id: "inner", from: "a", to: "b", route: "over" }, { id: "outer", from: "b", to: "a", route: "over", label: "again" }],
  };
  const { cells, edges } = placeDiagram(props, { ...OPTS, legend: 20 });
  // Lane 0 (24 wide) is nearest the grid, lane 1 (24 + 20) outside it: the grid starts 68 down.
  assert.equal(cells.get("a").y, 68);
  const laneY = (e) => e.points[1][1];
  assert.equal(laneY(edges[0]), 68 - 12, "lane 0's middle");
  assert.equal(laneY(edges[1]), 68 - 24 - 22, "lane 1's middle, one lane further out");
  assert.deepEqual(edges.map((e) => e.route), ["over", "over"]);
  // The same edges in the other order swap lanes.
  const swapped = placeDiagram({ ...props, edges: [...props.edges].reverse() }, { ...OPTS, legend: 20 });
  assert.equal(laneY(swapped.edges[0]), 68 - 22, "the labelled edge, now first, is nearest");
  assert.equal(laneY(swapped.edges[1]), 68 - 44 - 12);
});

test("routed: over leaves the top middle, runs on the lane, enters the target's top middle", () => {
  const [e] = placeDiagram(pair("over"), OPTS).edges;
  // The lane (24) is above the grid; cells are 776 x 576 from y 24.
  assert.deepEqual(e.points, [[388, 24], [388, 12], [1212, 12], [1212, 24]]);
  assert.deepEqual([e.x1, e.y1, e.x2, e.y2], [388, 24, 1212, 24], "the ends are the first and last points");
  assert.equal(e.route, "over");
});

test("routed: under, left and right leave and enter on their own side", () => {
  const [under] = placeDiagram(pair("under"), OPTS).edges;
  assert.deepEqual(under.points, [[388, 576], [388, 588], [1212, 588], [1212, 576]]);
  // A column of two cells, 1576 x 276, below each other, with the lane on the left or on the right.
  const [left] = placeDiagram(column("left"), OPTS).edges;
  assert.deepEqual(left.points, [[24, 138], [12, 138], [12, 462], [24, 462]]);
  const [right] = placeDiagram(column("right"), OPTS).edges;
  assert.deepEqual(right.points, [[1576, 138], [1588, 138], [1588, 462], [1576, 462]]);
});

test("routed: a circle node leaves from its circle's point, not its box's side", () => {
  // The circle's box is its whole cell (1576 x 276): radius 138 around (812, 138), so its left point is x 674.
  const { nodes, edges } = placeDiagram(column("left", "circle"), OPTS);
  const c = nodes.get("a");
  assert.deepEqual([c.x, c.w], [24, 1576]);
  assert.deepEqual(edges[0].points[0], [812 - 138, 138]);
  assert.deepEqual(edges[0].points.at(-1), [24, 462], "the box target enters at its side");
  // With the lane on the right the cell starts at x 0: the circle is around (788, 138).
  const [right] = placeDiagram(column("right", "circle"), OPTS).edges;
  assert.deepEqual(right.points[0], [788 + 138, 138]);
});

test("routed: a self-loop and an edge to a group give finite points", () => {
  const props = {
    cols: 3,
    rows: 1,
    nodes: [
      { id: "a", label: "A", shape: "box", col: 0, row: 0 },
      { id: "b", label: "B", shape: "circle", col: 1, row: 0 },
      { id: "c", label: "C", shape: "box", col: 2, row: 0 },
    ],
    groups: [{ id: "g", label: "G", contains: ["b", "c"] }],
    edges: [
      { id: "self", from: "a", to: "a", route: "over" },
      { id: "round", from: "b", to: "b", route: "under", label: "again" },
      { id: "togroup", from: "a", to: "g", route: "under" },
      { id: "fromgroup", from: "g", to: "a", route: "over" },
      { id: "samecolumn", from: "c", to: "c", route: "left" },
    ],
  };
  const { groups, nodes, edges } = placeDiagram(props, { ...OPTS, legend: 20 });
  assert.equal(edges.length, 5);
  for (const e of edges) {
    assert.equal(e.points.length, 4, e.id);
    assert.ok(e.points.flat().every(Number.isFinite), `${e.id}: ${JSON.stringify(e.points)}`);
  }
  const by = Object.fromEntries(edges.map((e) => [e.id, e]));
  // A self-loop leaves a quarter of the side before its middle and comes back a quarter after it.
  const a = nodes.get("a");
  assert.deepEqual(by.self.points[0], [a.x + a.w / 2 - a.w / 4, a.y], "a self-loop leaves its top a quarter left of the middle");
  assert.deepEqual(by.self.points.at(-1), [a.x + a.w / 2 + a.w / 4, a.y], "and comes back a quarter right of it");
  assert.ok(by.self.points[1][1] < a.y && by.self.points[1][1] === by.self.points[2][1], "over its lane");
  // On a circle the two ends are half the radius either side of the bottom point, on the circle.
  const b = nodes.get("b");
  const [cx, cy, r] = [b.x + b.w / 2, b.y + b.h / 2, Math.min(b.w, b.h) / 2];
  const [out, back] = [by.round.points[0], by.round.points.at(-1)];
  assert.deepEqual([out[0], back[0]], [cx - r / 2, cx + r / 2]);
  for (const p of [out, back]) {
    assert.ok(Math.abs(Math.hypot(p[0] - cx, p[1] - cy) - r) < 1e-9, `on the circle: ${p}`);
    assert.ok(p[1] > cy, "below its centre");
  }
  // On a side lane: from a quarter above the middle to a quarter below.
  const c = nodes.get("c");
  assert.deepEqual([by.samecolumn.points[0], by.samecolumn.points.at(-1)], [[c.x, c.y + c.h / 4], [c.x, c.y + (3 * c.h) / 4]]);
  const g = groups.get("g");
  assert.deepEqual(by.togroup.points.at(-1), [g.x + g.w / 2, g.y + g.h], "an edge to a group enters its box's bottom middle");
  assert.deepEqual(by.fromgroup.points[0], [g.x + g.w / 2, g.y], "an edge from a group leaves its box's top middle");
});

test("routed in compact: the lane is half the compact gap with no label line, points are finite, and an edge left out reserves no lane", () => {
  const props = {
    cols: 3,
    rows: 1,
    nodes: [
      { id: "a", label: "A", shape: "box", col: 0, row: 0 },
      { id: "t", label: "note", shape: "text", col: 1, row: 0 },
      { id: "b", label: "B", shape: "circle", col: 2, row: 0 },
    ],
    edges: [{ from: "b", to: "a", route: "over", label: "again" }, { from: "t", to: "b", route: "under" }],
  };
  const { cells, edges } = placeDiagram(props, { ...COMPACT, legend: 40 });
  assert.equal(cells.get("a").y, 8, "one lane above, half the compact gap, with no label line");
  assert.equal(cells.get("a").h, 200 - 8, "no lane below: the edge from the text node is left out");
  assert.deepEqual(edges.map((e) => e.id), ["b->a"]);
  assert.equal(edges[0].points[1][1], 4, "the line runs along the lane's middle");
  assert.ok(edges[0].points.flat().every(Number.isFinite));
  // A tiny element still gives finite points.
  const tiny = placeDiagram(props, { ...COMPACT, width: 10, height: 6 });
  assert.ok(tiny.edges[0].points.flat().every(Number.isFinite), JSON.stringify(tiny.edges[0].points));
});

test("routed: an edge with an unknown end reserves no lane", () => {
  const props = { ...pair("over"), edges: [{ from: "a", to: "ghost", route: "over" }] };
  const { cells, edges } = placeDiagram(props, OPTS);
  assert.deepEqual(edges, []);
  assert.equal(cells.get("a").y, 0);
});

test("routePath: straight segments with rounded corners, radius capped at half a segment", () => {
  // The first corner rounds by the full radius (8); the last segment is 5 long, so the second corner by 2.5.
  assert.equal(routePath([[0, 0], [0, -40], [30, -40], [30, -35]], 8), "M0,0 L0,-32 Q0,-40 8,-40 L27.5,-40 Q30,-40 30,-37.5 L30,-35");
  assert.equal(routePath([[0, 0], [100, 0], [100, 10]], 8), "M0,0 L95,0 Q100,0 100,5 L100,10");
  assert.equal(routePath([[0, 0], [100, 0]], 8), "M0,0 L100,0", "two points: one straight segment");
  // A zero-length segment (a self-loop's run) leaves its corners square, with no NaN.
  assert.equal(routePath([[5, 10], [5, 2], [5, 2], [5, 10]], 8), "M5,10 L5,2 L5,2 L5,10");
  assert.equal(routePath([[0.123456, 1], [2, 1]], 8), "M0.12,1 L2,1", "coordinates are written to a hundredth");
});
