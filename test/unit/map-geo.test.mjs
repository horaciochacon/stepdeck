// core/map.js: the geography on ctx.map. Reading boundaries (winding fixed on copies), the fitted base projection,
// views (zoom transforms over the base) and the coarse inverse lookup from canvas pixels to raster cells. All in Node,
// on the fictional fixtures; no DOM.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { d3 } from "#engine/core/d3.js";
import { applyView, boundaries, lookup, lut, mapKit, projection, view } from "#engine/core/map.js";
import { SlideController } from "#engine/core/controller.js";
import { makeFormat } from "#engine/core/format.js";

const DATA = fileURLToPath(new URL("../fixtures/decks/map/data/", import.meta.url));
const read = (name) => JSON.parse(readFileSync(DATA + name, "utf8"));
const SIZE = [960, 540];
const BOUNDS = [-19, -31, -10, -23];

const fitted = (kind, geojson, size = SIZE) => {
  const { features } = boundaries(geojson, { id: "code" });
  return { features, base: projection(kind, features, size) };
};
const pathBounds = (base, features) => d3.geoPath(base).bounds({ type: "FeatureCollection", features });
const near = (a, b, tolerance = 1) => Math.abs(a - b) <= tolerance;
/** True when [[x0, y0], [x1, y1]] (to `tolerance` pixels: d3's fit is exact to about a pixel) fills the padded extent of a canvas in width or in height (and stays inside it). */
const fillsExtent = ([[x0, y0], [x1, y1]], [w, h], tolerance = 1) => {
  const pad = 0.06 * Math.min(w, h);
  const inside = x0 >= pad - tolerance && y0 >= pad - tolerance && x1 <= w - pad + tolerance && y1 <= h - pad + tolerance;
  return inside && (near(x1 - x0, w - 2 * pad, tolerance) || near(y1 - y0, h - 2 * pad, tolerance));
};

// --- boundaries ----------------------------------------------------------------------------------------------------

test("boundaries: reads features by id, in file order", () => {
  const b = boundaries(read("regions.geojson"), { id: "code", name: "name", file: "regions.geojson" });
  assert.equal(b.features.length, 9);
  assert.deepEqual(b.ids.slice(0, 2), ["N1", "N2"]);
  assert.ok(b.ids.every((id) => typeof id === "string"));
  assert.equal(b.byId.get("N1"), b.features[0]);
  assert.equal(b.names.get("N1"), "North");
});

test("boundaries: a missing id option reads the feature's own id; numbers become strings", () => {
  const point = { type: "Polygon", coordinates: [[[0, 0], [0, 1], [1, 1], [0, 0]]] };
  const b = boundaries({ type: "FeatureCollection", features: [{ type: "Feature", id: 7, properties: {}, geometry: point }] }, {});
  assert.deepEqual(b.ids, ["7"]);
  assert.equal(b.names.get("7"), "7", "a missing name option falls back to the id");
});

test("boundaries: counter-clockwise rings are rewound, on copies", () => {
  const ccw = read("square-ccw.geojson");
  const before = JSON.stringify(ccw);
  const { features } = boundaries(ccw, { id: "code" });
  assert.equal(JSON.stringify(ccw), before, "the parsed file is never mutated");
  assert.ok(d3.geoArea(features[0]) < 0.01, "a small square, not the rest of the sphere");
  assert.ok(d3.geoArea(ccw.features[0]) > 2 * Math.PI, "the original keeps its winding");

  const [cw, flipped] = [fitted("equal-earth", read("square-cw.geojson")), fitted("equal-earth", ccw)];
  const [a, b] = [pathBounds(cw.base, cw.features), pathBounds(flipped.base, flipped.features)];
  assert.deepEqual(a.flat().map((n) => n.toFixed(6)), b.flat().map((n) => n.toFixed(6)), "the same fit as the clockwise file");
  assert.ok(fillsExtent(b, SIZE), "fills the extent");
});

test("boundaries: every polygon of a MultiPolygon is rewound by its own area", () => {
  const { features } = boundaries(read("antimeridian.geojson"), { id: "code" });
  assert.ok(d3.geoArea(features[0]) < 0.01);
  assert.equal(features[0].geometry.coordinates.length, 2);
});

test("boundaries: already clockwise rings are kept", () => {
  const cw = read("square-cw.geojson");
  const { features } = boundaries(cw, { id: "code" });
  assert.deepEqual(features[0].geometry.coordinates, cw.features[0].geometry.coordinates);
});

test("boundaries: errors", () => {
  const poly = { type: "Polygon", coordinates: [[[0, 0], [0, 1], [1, 1], [0, 0]]] };
  const feature = (props, geometry = poly) => ({ type: "Feature", properties: props, geometry });
  const collection = (...features) => ({ type: "FeatureCollection", features });
  const fails = (geojson, message, options = { id: "code", file: "regions.geojson" }) =>
    assert.throws(() => boundaries(geojson, options), { message });

  fails(collection(feature({ code: "A" }), feature({ code: "B" }), feature({ name: "C" })), "regions.geojson: feature 3 has no 'code'");
  fails(collection(feature({ code: "A" }), feature({ code: "" })), "regions.geojson: feature 2 has no 'code'");
  fails(collection(feature({ code: "North" }), feature({ code: "North" })), "regions.geojson: region 'North' appears twice");
  fails(collection(feature({ code: "A" }, { type: "LineString", coordinates: [[0, 0], [1, 1]] })),
    "regions.geojson: only Polygon and MultiPolygon features are supported (found LineString)");
  fails(collection(feature({ code: "A" }, null)),
    "regions.geojson: only Polygon and MultiPolygon features are supported (found no geometry)");
  fails({ type: "Feature", properties: {}, geometry: poly }, "regions.geojson: not a FeatureCollection");
  fails(collection(feature({ code: "A" })), "boundaries: feature 1 has no 'id'", { file: undefined });
});

test("boundaries: size limits", () => {
  const poly = { type: "Polygon", coordinates: [[[0, 0], [0, 1], [1, 1], [0, 0]]] };
  const many = Array.from({ length: 6000 }, (_, i) => ({ type: "Feature", properties: { code: `R${i}` }, geometry: poly }));
  assert.throws(() => boundaries({ type: "FeatureCollection", features: many }, { id: "code", file: "big.geojson" }),
    { message: "big.geojson: 6,000 regions is more than 5,000" });
  const at = { type: "FeatureCollection", features: many.slice(0, 5000) };
  assert.equal(boundaries(at, { id: "code" }).ids.length, 5000, "5,000 regions are allowed");

  // 300,000 positions in 3 rings of 100,000, spread over a MultiPolygon with a hole, so every ring counts.
  const ring = (n) => Array.from({ length: n }, (_, i) => [(i % 100) / 1000, Math.floor(i / 100) / 100000]);
  const dense = (rings) => ({ type: "FeatureCollection", features: [{ type: "Feature", properties: { code: "A" }, geometry: { type: "MultiPolygon", coordinates: rings } }] });
  assert.throws(() => boundaries(dense([[ring(100000), ring(100000)], [ring(100000)]]), { id: "code", file: "dense.geojson" }),
    { message: "dense.geojson: 300,000 points is more than 250,000" });
  assert.equal(boundaries(dense([[ring(125000), ring(125000)]]), { id: "code" }).ids.length, 1, "250,000 positions are allowed");
});

// --- projection ----------------------------------------------------------------------------------------------------

test("projection: kinds, and the message for an unknown one", () => {
  const { features } = boundaries(read("regions.geojson"), { id: "code" });
  for (const kind of ["equal-earth", "natural-earth", "mercator", "conic-equal-area"]) {
    const base = projection(kind, features, SIZE);
    const [[x0, y0], [x1, y1]] = pathBounds(base, features);
    assert.ok([x0, y0, x1, y1].every(Number.isFinite), kind);
    assert.ok(x0 >= 0 && y0 >= 0 && x1 <= SIZE[0] && y1 <= SIZE[1], `${kind} stays inside the canvas`);
  }
  assert.throws(() => projection("x", features, SIZE), { message: "unknown projection 'x' (use equal-earth, natural-earth, mercator or conic-equal-area)" });
  assert.throws(() => projection("equal-earth", [], SIZE), { message: "projection needs at least one region" });
});

test("projection: fitted with a 6% margin of the smaller side", () => {
  const { features, base } = fitted("equal-earth", read("regions.geojson"));
  assert.ok(fillsExtent(pathBounds(base, features), SIZE), "one side touches the padded box, none crosses it");
});

test("projection: rotated to the centre longitude", () => {
  const { features, base } = fitted("equal-earth", read("regions.geojson"));
  const [[west], [east]] = d3.geoBounds({ type: "FeatureCollection", features });
  const [lambda, phi] = base.rotate();
  assert.ok(near(lambda, -(west + east) / 2, 1e-9) && phi === 0);
});

test("projection: antimeridian region fits", () => {
  const size = [800, 600];
  const { features, base } = fitted("equal-earth", read("antimeridian.geojson"), size);
  const bounds = pathBounds(base, features);
  assert.ok(bounds.flat().every(Number.isFinite), "no NaN");
  assert.ok(bounds[1][0] - bounds[0][0] <= size[0], "the box is one piece, not stretched round the world");
  assert.ok(fillsExtent(bounds, size), "and it fills the extent");
  const [[west], [east]] = d3.geoBounds({ type: "FeatureCollection", features });
  assert.ok(west > east, "d3 reports the box as crossing the antimeridian");
  assert.ok(near(base.rotate()[0], -179, 1e-9), "centred on 179 degrees east, the middle of 176 and -178");
});

test("projection: conic parallels", () => {
  const { features, base } = fitted("conic-equal-area", read("regions.geojson"));
  const [[, south], [, north]] = d3.geoBounds({ type: "FeatureCollection", features });
  const span = north - south;
  const [p0, p1] = base.parallels();
  assert.ok(Math.abs(p0 - (south + span / 6)) < 1e-9);
  assert.ok(Math.abs(p1 - (south + (5 * span) / 6)) < 1e-9);
});

// --- views ---------------------------------------------------------------------------------------------------------

test("view: home is identity", () => {
  const { base } = fitted("natural-earth", read("regions.geojson"));
  assert.deepEqual(view(base, null, SIZE), { k: 1, x: 0, y: 0 });
  assert.deepEqual(applyView({ k: 1, x: 0, y: 0 }, [12, 34]), [12, 34]);
  assert.deepEqual(applyView({ k: 2, x: 5, y: -7 }, [10, 20]), [25, 33]);
});

test("view: a region fills the padded extent and sits in the middle", () => {
  const { features, base } = fitted("equal-earth", read("regions.geojson"));
  const target = [features[2]];
  const v = view(base, target, SIZE);
  assert.ok(v.k > 1);
  const [[x0, y0], [x1, y1]] = pathBounds(base, target);
  const [a, b] = [applyView(v, [x0, y0]), applyView(v, [x1, y1])];
  assert.ok(near((a[0] + b[0]) / 2, SIZE[0] / 2, 1e-6) && near((a[1] + b[1]) / 2, SIZE[1] / 2, 1e-6), "centred");
  assert.ok(fillsExtent([a, b], SIZE, 1e-6), "fills the padded extent, crosses nothing");
});

test("view: a bounds target is fitted over its edges, which curve", () => {
  const { base } = fitted("conic-equal-area", read("regions.geojson"));
  const box = [-18, -30, -11, -24];
  const v = view(base, { bounds: box }, SIZE);
  const sample = [];
  for (let i = 0; i <= 50; i++) {
    const [lon, lat] = [box[0] + ((box[2] - box[0]) * i) / 50, box[1] + ((box[3] - box[1]) * i) / 50];
    sample.push([lon, box[1]], [lon, box[3]], [box[0], lat], [box[2], lat]);
  }
  const screen = sample.map((p) => applyView(v, base(p)));
  const xs = screen.map((p) => p[0]), ys = screen.map((p) => p[1]);
  // The view samples 64 points an edge, this test 50: the curved edges' extremes agree to a fraction of a pixel.
  assert.ok(fillsExtent([[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]], SIZE, 0.25), "the box fills the extent");
});

test("view: a bounds box across the antimeridian is one piece", () => {
  const { base } = fitted("equal-earth", read("antimeridian.geojson"));
  const v = view(base, { bounds: [176, -18, -178, -16] }, SIZE);
  assert.ok(Number.isFinite(v.k) && Number.isFinite(v.x) && Number.isFinite(v.y));
  const [x, y] = applyView(v, base([179, -17]));
  assert.ok(x > 0 && x < SIZE[0] && y > 0 && y < SIZE[1]);
});

test("view: projecting through a view equals scaling the base", () => {
  const { features, base } = fitted("equal-earth", read("regions.geojson"));
  const v = view(base, [features[1], features[2]], SIZE);
  const [tx, ty] = base.translate();
  const scaled = d3.geoEqualEarth().rotate(base.rotate()).scale(base.scale() * v.k).translate([v.k * tx + v.x, v.k * ty + v.y]);
  for (const point of [[-14, -25], [-16.5, -28.2], [-11.3, -24.1]]) {
    const [ax, ay] = applyView(v, base(point));
    const [bx, by] = scaled(point);
    assert.ok(Math.abs(ax - bx) < 1e-9 && Math.abs(ay - by) < 1e-9, `${point}: ${ax},${ay} vs ${bx},${by}`);
  }
});

test("view: a single tiny region", () => {
  const { features, base } = fitted("equal-earth", read("tiny.geojson"));
  const v = view(base, features, SIZE);
  assert.ok([v.k, v.x, v.y].every(Number.isFinite));
  const [[x0, y0], [x1, y1]] = pathBounds(base, features);
  const [a, b] = [applyView(v, [x0, y0]), applyView(v, [x1, y1])];
  assert.ok(fillsExtent([a, b], SIZE, 1e-6), "fills the extent");
  assert.throws(() => view(base, [], SIZE), { message: "view: no regions to fit" });
});

// --- lookup --------------------------------------------------------------------------------------------------------

/** Whether a table's index and the exact one are the same cell, or neighbours; -1 against a cell on the raster's edge counts. */
function neighbours(got, want, [cols, rows]) {
  if (got === want) return true;
  const edge = (i) => i % cols === 0 || i % cols === cols - 1 || Math.floor(i / cols) === 0 || Math.floor(i / cols) === rows - 1;
  if (got < 0 || want < 0) return edge(Math.max(got, want));
  return Math.abs((got % cols) - (want % cols)) <= 1 && Math.abs(Math.floor(got / cols) - Math.floor(want / cols)) <= 1;
}

/** The index an exact invert gives for the centre of canvas pixel (px, py), or -1. */
function exactIndex(base, v, [px, py], bounds, [cols, rows]) {
  const at = base.invert([(px + 0.5 - v.x) / v.k, (py + 0.5 - v.y) / v.k]);
  if (!at || !at.every(Number.isFinite)) return -1;
  const [west, south, east, north] = bounds;
  const [lon, lat] = at;
  if (lon < west || lon >= east || lat <= south || lat > north) return -1;
  const col = Math.floor(((lon - west) / (east - west)) * cols), row = Math.floor(((north - lat) / (north - south)) * rows);
  return row * cols + col;
}

for (const kind of ["equal-earth", "natural-earth", "mercator", "conic-equal-area"]) {
  test(`lookup: matches an exact invert (${kind})`, () => {
    const { features, base } = fitted(kind, read("regions.geojson"), [320, 200]);
    const grid = [40, 30];
    for (const v of [{ k: 1, x: 0, y: 0 }, view(base, [features[3]], [320, 200])]) {
      const table = lookup(base, v, [320, 200], BOUNDS, grid);
      assert.ok(table instanceof Int32Array);
      assert.equal(table.length, 320 * 200);
      let same = 0, off = 0, inside = 0;
      for (let py = 0; py < 200; py++) {
        for (let px = 0; px < 320; px++) {
          const got = table[py * 320 + px], want = exactIndex(base, v, [px, py], BOUNDS, grid);
          if (want >= 0) inside++;
          if (got === want) { same++; continue; }
          assert.ok(neighbours(got, want, grid), `${kind} (${px},${py}): ${got} vs ${want}`);
          off++;
        }
      }
      assert.ok(inside > 1000, "the raster covers a good part of the canvas");
      assert.ok(same / (same + off) >= 0.99, `${kind}: ${same} exact, ${off} off by one cell`);
    }
  });
}

test("lookup: outside the raster bounds is -1", () => {
  const { base } = fitted("equal-earth", read("regions.geojson"), [320, 200]);
  const table = lookup(base, { k: 1, x: 0, y: 0 }, [320, 200], BOUNDS, [40, 30]);
  const [west, south, east, north] = BOUNDS;
  let inside = 0, outside = 0;
  for (let py = 0; py < 200; py++) {
    for (let px = 0; px < 320; px++) {
      const [lon, lat] = base.invert([px + 0.5, py + 0.5]);
      const clearOut = lon < west - 0.5 || lon > east + 0.5 || lat < south - 0.5 || lat > north + 0.5;
      if (clearOut) { assert.equal(table[py * 320 + px], -1, `(${px},${py})`); outside++; }
      else if (lon > west + 0.5 && lon < east - 0.5 && lat > south + 0.5 && lat < north - 0.5) {
        assert.ok(table[py * 320 + px] >= 0 && table[py * 320 + px] < 40 * 30, `(${px},${py})`);
        inside++;
      }
    }
  }
  assert.ok(inside > 0 && outside > 0);
});

test("lookup: rows run north to south, columns west to east", () => {
  const { base } = fitted("equal-earth", read("regions.geojson"), [320, 200]);
  const table = lookup(base, { k: 1, x: 0, y: 0 }, [320, 200], BOUNDS, [9, 8]);
  const at = ([lon, lat]) => { const [x, y] = base([lon, lat]); return table[Math.floor(y) * 320 + Math.floor(x)]; };
  assert.equal(at([-18.5, -23.5]), 0, "north-west corner cell");
  assert.equal(at([-10.5, -23.5]), 8, "north-east: last column of row 0");
  assert.equal(at([-18.5, -30.5]), 7 * 9, "south-west: first column of the last row");
  assert.equal(at([-10.5, -30.5]), 9 * 8 - 1, "south-east: the last cell");
});

test("lookup: a world raster keeps its place across the antimeridian seam", () => {
  const { base } = fitted("equal-earth", read("antimeridian.geojson"), [200, 120]);
  const v = { k: 1, x: 0, y: 0 };
  const grid = [360, 180], world = [-180, -90, 180, 90];
  const table = lookup(base, v, [200, 120], world, grid, { step: 4 });
  let bad = 0;
  for (let py = 0; py < 120; py++) {
    for (let px = 0; px < 200; px++) {
      const got = table[py * 200 + px], want = exactIndex(base, v, [px, py], world, grid);
      if (!neighbours(got, want, grid)) bad++;
    }
  }
  assert.ok(bad / (200 * 120) < 0.01, `${bad} pixels disagree`);
});

// --- the kit and the controller -------------------------------------------------------------------------------------

test("mapKit: frozen, exactly the public names", () => {
  assert.ok(Object.isFrozen(mapKit));
  assert.deepEqual(Object.keys(mapKit).sort(), [
    "applyView", "boundaries", "insetFrame", "loadRaster", "lookup", "lut", "paintAreas", "paintPoints", "paintRaster", "projection",
    "rasterGaps", "scaleBar", "view",
  ]);
  for (const [name, value] of Object.entries(mapKit)) assert.equal(typeof value, "function", name);
});

test("controller gives every component and child ctx.map === mapKit", async () => {
  const seen = [];
  const child = { mount(el, props, ctx) { seen.push(["child", ctx.map]); return {}; } };
  const parent = {
    async mount(el, props, ctx) {
      seen.push(["parent", ctx.map]);
      await ctx.mount("child", { id: "inside" }, {});
      return {};
    },
  };
  const modules = { parent, child };
  const registry = {
    async get(name) {
      if (!(name in modules)) throw new Error(`unknown component '${name}'`);
      return modules[name];
    },
    async schema() { return {}; },
  };
  const ctxBase = { setVisible() {}, load: async () => ({}), format: makeFormat("en"), t: (k) => k, capture: false, tokens: {}, palette: () => null };
  const slide = { id: "s", elements: [{ id: "a", type: "parent", props: {} }, { id: "b", type: "child", props: {} }], steps: [{ id: "s0" }] };
  const c = new SlideController({ slide, registry, ctxBase, mountPoint: (id) => ({ id }) });
  await c.mount();
  assert.deepEqual(c.errors, []);
  assert.deepEqual(seen.map(([who]) => who).sort(), ["child", "child", "parent"]);
  for (const [who, map] of seen) assert.equal(map, mapKit, `${who} ctx.map`);
});

// --- lut ------------------------------------------------------------------------------------------------------------

test("lut: a colour per level from the level's value, 1,024 RGBA bytes", () => {
  const seen = [];
  const table = lut({ value: { scale: "linear", min: 0, max: 255 } }, (value, level) => {
    seen.push([level, value]);
    return level === 255 ? "rgba(10, 20, 30, 0.5)" : `rgb(${level}, ${255 - level}, 7)`;
  });
  assert.ok(table instanceof Uint8ClampedArray);
  assert.equal(table.length, 1024);
  assert.equal(seen.length, 256);
  assert.deepEqual(seen[3], [3, 3], "colorOf gets the level's value and the level");
  assert.deepEqual(Array.from(table.slice(0, 4)), [0, 255, 7, 255]);
  assert.deepEqual(Array.from(table.slice(254 * 4, 255 * 4)), [254, 1, 7, 255]);
  assert.deepEqual(Array.from(table.slice(255 * 4)), [10, 20, 30, 128], "opacity is the alpha byte");
});

test("lut: a log scale asks for log values, a class list for names, and a level without a colour is transparent", () => {
  const log = [];
  lut({ value: { scale: "log", min: 1, max: 1000 } }, (value, level) => (log.push(value), level < 128 ? null : "#fff"));
  assert.equal(log[0], 1);
  assert.ok(Math.abs(log[255] - 1000) < 1e-9);
  const classes = [];
  const table = lut({ value: { classes: ["Forest", "Urban"] } }, (name) => (classes.push(name), name === "Forest" ? "#102030" : undefined));
  assert.deepEqual(classes, ["Forest", "Urban"], "levels past the list are not asked about");
  assert.deepEqual(Array.from(table.slice(0, 4)), [16, 32, 48, 255]);
  assert.ok(table.slice(4).every((byte) => byte === 0), "every other level is transparent black");
  assert.throws(() => lut({ value: { classes: ["A"] } }, () => "not a colour"), /^Error: lut: 'not a colour' is not a colour$/);
});
