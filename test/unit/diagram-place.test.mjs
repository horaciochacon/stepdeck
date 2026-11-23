// diagram: grid placement, group bounds, edge ends and problems (pure functions, no DOM).
import { test } from "node:test";
import assert from "node:assert/strict";
import { placeDiagram, diagramProblems, edgeId, kindOrder } from "#engine/components/diagram/place.js";

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
