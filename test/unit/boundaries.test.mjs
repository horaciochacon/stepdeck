// cli/boundaries.js: `stepdeck boundaries`, open admin boundaries from geoBoundaries. Every test serves the
// fictional country XYZ (test/fixtures/boundaries/) through an injected `fetch`: nothing here touches the network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { boundaries as readBoundaries, MAX_POINTS, MAX_REGIONS } from "#engine/core/map.js";
import { boundaries } from "../../cli/boundaries.js";

const FIXTURES = fileURLToPath(new URL("../fixtures/boundaries/", import.meta.url));
const text = (name) => readFileSync(FIXTURES + name, "utf8");
const API = text("api.json");
const API_URL = "https://www.geoboundaries.org/api/current/gbOpen/XYZ/ADM1/";
const SIMPLIFIED_URL = "https://media.example.test/gbOpen/XYZ/ADM1/geoBoundaries-XYZ-ADM1_simplified.geojson";
const FULL_URL = "https://media.example.test/gbOpen/XYZ/ADM1/geoBoundaries-XYZ-ADM1.geojson";

/** A `fetch` that serves `routes` (url -> body text, or a Response) and records every URL it is asked for. */
function serve(routes) {
  const calls = [];
  const fetch = async (url) => {
    calls.push(url);
    const answer = routes[url];
    if (answer === undefined) return new Response("not found", { status: 404 });
    return answer instanceof Response ? answer : new Response(answer, { status: 200 });
  };
  return { fetch, calls };
}
const xyz = () => serve({ [API_URL]: API, [SIMPLIFIED_URL]: text("simplified.geojson"), [FULL_URL]: text("full.geojson") });

/** Runs `body(deck)` in a fresh deck folder, removed afterwards. */
async function inDeck(body) {
  const deck = mkdtempSync(join(tmpdir(), "stepdeck-boundaries-"));
  try {
    return await body(deck);
  } finally {
    rmSync(deck, { recursive: true, force: true });
  }
}
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const rings = (feature) => (feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates);

/** A FeatureCollection of `n` tiny squares, each its own region. */
const squares = (n) => ({
  type: "FeatureCollection",
  features: Array.from({ length: n }, (_, i) => {
    const x = (i % 100) * 0.01, y = Math.floor(i / 100) * 0.01;
    return {
      type: "Feature",
      properties: { shapeISO: `XY-${i}` },
      geometry: { type: "Polygon", coordinates: [[[x, y], [x + 0.005, y], [x + 0.005, y + 0.005], [x, y + 0.005], [x, y]]] },
    };
  }),
});
/** One region whose single ring has `n` positions (closed). */
const longRing = (n) => ({
  type: "FeatureCollection",
  features: [{
    type: "Feature",
    properties: { shapeISO: "XY-A" },
    geometry: { type: "Polygon", coordinates: [Array.from({ length: n }, (_, i) => (i === n - 1 ? [0, 10] : [Math.sin(i) * 10, Math.cos(i) * 10 + i * 1e-3]))] },
  }],
});

test("boundaries: fetches the API, then the simplified file", async () => {
  const { fetch, calls } = xyz();
  await inDeck((deck) => boundaries({ iso3: "xyz", level: "ADM1", deck, fetch }));
  assert.deepEqual(calls, [API_URL, SIMPLIFIED_URL]);
});

test("boundaries: --full uses gjDownloadURL", async () => {
  const { fetch, calls } = xyz();
  await inDeck(async (deck) => {
    const out = await boundaries({ iso3: "XYZ", level: "ADM1", deck, full: true, fetch });
    assert.deepEqual(calls, [API_URL, FULL_URL]);
    assert.equal(readJson(out.file).features.length, 2);
    assert.equal(readJson(out.file.replace(/\.geojson$/, ".source.json")).url, FULL_URL);
  });
});

test("boundaries: rounds to the precision and keeps properties", async () => {
  await inDeck(async (deck) => {
    const out = await boundaries({ iso3: "XYZ", level: "ADM1", deck, fetch: xyz().fetch });
    const written = readJson(out.file);
    const [north, south] = written.features;
    assert.deepEqual(north.properties, { shapeName: "Northmark", shapeISO: "XY-NM", shapeID: "XYZ-ADM1-00000000-B1", shapeGroup: "XYZ", shapeType: "ADM1" });
    assert.equal(south.properties.shapeName, "Southmark");
    assert.deepEqual(north.geometry.coordinates[0][0], [10.1235, 20.1235]);
    assert.deepEqual(south.geometry.coordinates[0][0][1], [10.6235, 19.1235]);

    const wide = await boundaries({ iso3: "XYZ", level: "ADM1", deck, out: join(deck, "wide.geojson"), precision: 6, fetch: xyz().fetch });
    assert.deepEqual(readJson(wide.file).features[0].geometry.coordinates[0][0], [10.123456, 20.123456]);
  });
});

test("boundaries: drops duplicate points after rounding and keeps rings closed", async () => {
  await inDeck(async (deck) => {
    const out = await boundaries({ iso3: "XYZ", level: "ADM1", deck, fetch: xyz().fetch });
    // The second point of Northmark's outer ring rounds onto the first: one of the two goes.
    const outer = readJson(out.file).features[0].geometry.coordinates[0];
    assert.deepEqual(outer, [[10.1235, 20.1235], [10.6235, 20.1235], [10.6235, 20.6235], [10.1235, 20.6235], [10.1235, 20.1235]]);
    for (const f of readJson(out.file).features) for (const polygon of rings(f)) for (const ring of polygon) {
      assert.deepEqual(ring[0], ring.at(-1));
      assert.ok(ring.length >= 4);
    }
  });
});

test("boundaries: drops rings under 4 positions and polygons without an outer ring", async () => {
  await inDeck(async (deck) => {
    const out = await boundaries({ iso3: "XYZ", level: "ADM1", deck, fetch: xyz().fetch });
    const [north, south] = readJson(out.file).features;
    // Northmark's hole collapses to a point at 4 decimals: only the outer ring is left.
    assert.equal(north.geometry.coordinates.length, 1);
    // Southmark's second polygon collapses entirely: one polygon is left.
    assert.equal(south.geometry.type, "MultiPolygon");
    assert.equal(south.geometry.coordinates.length, 1);
    assert.equal(out.regions, 2);
    assert.equal(out.points, 10);
    assert.deepEqual(out.warnings, []);
  });
});

test("boundaries: a region that vanishes at the precision is dropped, with a warning", async () => {
  const speck = {
    type: "Feature",
    properties: { shapeISO: "XY-ZZ" },
    geometry: { type: "Polygon", coordinates: [[[5.00001, 5.00001], [5.00002, 5.00001], [5.00002, 5.00002], [5.00001, 5.00002], [5.00001, 5.00001]]] },
  };
  const file = JSON.parse(text("simplified.geojson"));
  file.features.push(speck);
  const { fetch } = serve({ [API_URL]: API, [SIMPLIFIED_URL]: JSON.stringify(file) });
  await inDeck(async (deck) => {
    const out = await boundaries({ iso3: "XYZ", level: "ADM1", deck, fetch });
    assert.equal(out.regions, 2);
    assert.deepEqual(readJson(out.file).features.map((f) => f.properties.shapeISO), ["XY-NM", "XY-SM"]);
    assert.deepEqual(out.warnings, ["1 region vanished at 4 decimals and was left out; raise --precision"]);
  });
});

test("boundaries: writes the source sidecar", async () => {
  await inDeck(async (deck) => {
    const out = await boundaries({ iso3: "XYZ", level: "ADM1", deck, fetch: xyz().fetch });
    assert.equal(out.sourceFile, join(deck, "data", "xyz-adm1.source.json"));
    assert.deepEqual(readJson(out.sourceFile), {
      boundaryID: "XYZ-ADM1-00000000",
      boundarySource: "Xyzland National Mapping Office",
      boundaryLicense: "Creative Commons Attribution 4.0 International (CC BY 4.0)",
      licenseDetail: "Attribute the Xyzland National Mapping Office.",
      licenseSource: "https://example.test/xyzland/licence",
      boundaryYearRepresented: "2020",
      buildDate: "2022-05-06",
      url: SIMPLIFIED_URL,
    });
    assert.equal(out.license, "Creative Commons Attribution 4.0 International (CC BY 4.0)");
    assert.equal(out.sourceLine, "Boundaries: geoBoundaries, Xyzland National Mapping Office (Creative Commons Attribution 4.0 International (CC BY 4.0)).");
  });
});

test("boundaries: default output path", async () => {
  await inDeck(async (deck) => {
    const out = await boundaries({ iso3: "XYZ", level: "ADM1", deck, fetch: xyz().fetch });
    assert.equal(out.file, join(deck, "data", "xyz-adm1.geojson"));
    assert.ok(existsSync(out.file));
    const custom = await boundaries({ iso3: "XYZ", level: "ADM1", deck, out: join(deck, "maps", "regions.geojson"), fetch: xyz().fetch });
    assert.equal(custom.file, join(deck, "maps", "regions.geojson"));
    assert.equal(custom.sourceFile, join(deck, "maps", "regions.source.json"));
  });
});

test("boundaries: level accepts 1 and ADM1", async () => {
  for (const level of [1, "1", "ADM1", "adm1"]) {
    const { fetch, calls } = xyz();
    await inDeck(async (deck) => {
      const out = await boundaries({ iso3: "XYZ", level, deck, fetch });
      assert.deepEqual(calls, [API_URL, SIMPLIFIED_URL], `level ${level}`);
      assert.equal(out.file, join(deck, "data", "xyz-adm1.geojson"));
    });
  }
});

test("boundaries: limit warning", async () => {
  const before = process.cwd();
  await inDeck(async (deck) => {
    process.chdir(deck);
    try {
      const api = JSON.stringify({ ...JSON.parse(API), boundaryType: "ADM2" });
      const url = "https://www.geoboundaries.org/api/current/gbOpen/XYZ/ADM2/";
      const many = serve({ [url]: api, [SIMPLIFIED_URL]: JSON.stringify(squares(MAX_REGIONS + 1)) });
      const out = await boundaries({ iso3: "XYZ", level: "ADM2", fetch: many.fetch });
      assert.equal(out.regions, 5001);
      assert.deepEqual(out.warnings, [
        "data/xyz-adm2.geojson: 5,001 regions is over the map's limit of 5,000; simplify it, for example: mapshaper data/xyz-adm2.geojson -simplify 10% -o data/xyz-adm2.geojson",
      ]);

      const heavy = serve({ [url]: api, [SIMPLIFIED_URL]: JSON.stringify(longRing(MAX_POINTS + 1)) });
      const dense = await boundaries({ iso3: "XYZ", level: "ADM2", fetch: heavy.fetch });
      assert.equal(dense.points, MAX_POINTS + 1);
      assert.deepEqual(dense.warnings, [
        "data/xyz-adm2.geojson: 250,001 points is over the map's limit of 250,000; simplify it, for example: mapshaper data/xyz-adm2.geojson -simplify 10% -o data/xyz-adm2.geojson",
      ]);
    } finally {
      process.chdir(before);
    }
  });
});

test("boundaries: 404", async () => {
  await assert.rejects(
    inDeck((deck) => boundaries({ iso3: "XYZ", level: "ADM2", deck, fetch: xyz().fetch })),
    { message: "geoBoundaries has no gbOpen ADM2 for XYZ" },
  );
});

test("boundaries: network error", async () => {
  const offline = async () => { throw new TypeError("fetch failed", { cause: new Error("getaddrinfo ENOTFOUND www.geoboundaries.org") }); };
  await assert.rejects(
    inDeck((deck) => boundaries({ iso3: "XYZ", level: "ADM1", deck, fetch: offline })),
    { message: "could not reach geoBoundaries (getaddrinfo ENOTFOUND www.geoboundaries.org)" },
  );
  const plain = async () => { throw new Error("socket hang up"); };
  await assert.rejects(
    inDeck((deck) => boundaries({ iso3: "XYZ", level: "ADM1", deck, fetch: plain })),
    { message: "could not reach geoBoundaries (socket hang up)" },
  );
  const broken = serve({ [API_URL]: new Response("oops", { status: 503 }) });
  await assert.rejects(
    inDeck((deck) => boundaries({ iso3: "XYZ", level: "ADM1", deck, fetch: broken.fetch })),
    { message: "could not reach geoBoundaries (HTTP 503)" },
  );
});

test("boundaries: unreadable answer", async () => {
  const unreadable = (what, routes) => assert.rejects(
    inDeck((deck) => boundaries({ iso3: "XYZ", level: "ADM1", deck, fetch: serve(routes).fetch })),
    { message: `geoBoundaries answered something stepdeck cannot read: ${what}` },
  );
  const api = JSON.parse(API);
  const without = (field) => JSON.stringify({ ...api, [field]: undefined });
  await unreadable("the answer is not JSON", { [API_URL]: "<html>maintenance</html>" });
  await unreadable("no simplifiedGeometryGeoJSON", { [API_URL]: without("simplifiedGeometryGeoJSON") });
  await unreadable("no boundaryLicense", { [API_URL]: without("boundaryLicense") });
  await unreadable("the file is not a FeatureCollection", { [API_URL]: API, [SIMPLIFIED_URL]: JSON.stringify({ type: "Feature" }) });
  await unreadable("the file is not JSON", { [API_URL]: API, [SIMPLIFIED_URL]: "<html></html>" });
  // --full needs gjDownloadURL, not the simplified one.
  await assert.rejects(
    inDeck((deck) => boundaries({ iso3: "XYZ", level: "ADM1", deck, full: true, fetch: serve({ [API_URL]: without("gjDownloadURL") }).fetch })),
    { message: "geoBoundaries answered something stepdeck cannot read: no gjDownloadURL" },
  );
});

test("boundaries: bad level", async () => {
  for (const level of ["ADM6", "6", "county", "ADM", 1.5]) {
    await assert.rejects(
      inDeck((deck) => boundaries({ iso3: "XYZ", level, deck, fetch: xyz().fetch })),
      { message: `${level} is not an admin level (use ADM0 to ADM5)` },
      `level ${level}`,
    );
  }
});

test("boundaries: bad country code and precision", async () => {
  const { fetch, calls } = xyz();
  await assert.rejects(boundaries({ iso3: "XY", level: "ADM1", fetch }), { message: "XY is not a country code (three letters, for example URY)" });
  await assert.rejects(boundaries({ iso3: "X1Z", level: "ADM1", fetch }), { message: "X1Z is not a country code (three letters, for example URY)" });
  await assert.rejects(boundaries({ iso3: "XYZ", level: "ADM1", precision: 2.5, fetch }), { message: "precision must be a whole number from 0 to 10" });
  await assert.rejects(boundaries({ iso3: "XYZ", level: "ADM1", precision: 11, fetch }), { message: "precision must be a whole number from 0 to 10" });
  assert.deepEqual(calls, [], "nothing is fetched for a bad request");
});

test("boundaries: the written file loads in map", async () => {
  await inDeck(async (deck) => {
    const out = await boundaries({ iso3: "XYZ", level: "ADM1", deck, fetch: xyz().fetch });
    const loaded = readBoundaries(readJson(out.file), { id: "shapeISO", name: "shapeName", file: "data/xyz-adm1.geojson" });
    assert.deepEqual(loaded.ids, ["XY-NM", "XY-SM"]);
    assert.equal(loaded.names.get("XY-SM"), "Southmark");
  });
});

test("boundaries: a source field the API omits is written as null", async () => {
  const api = JSON.parse(API);
  for (const f of ["licenseDetail", "licenseSource", "boundaryID", "boundaryYearRepresented", "buildDate"]) delete api[f];
  const { fetch } = serve({ [API_URL]: JSON.stringify(api), [SIMPLIFIED_URL]: text("simplified.geojson") });
  await inDeck(async (deck) => {
    const out = await boundaries({ iso3: "XYZ", level: "ADM1", deck, fetch });
    const source = readJson(out.sourceFile);
    assert.deepEqual(Object.keys(source), ["boundaryID", "boundarySource", "boundaryLicense", "licenseDetail", "licenseSource", "boundaryYearRepresented", "buildDate", "url"]);
    for (const f of ["licenseDetail", "licenseSource", "boundaryID", "boundaryYearRepresented", "buildDate"]) assert.equal(source[f], null, f);
    assert.equal(source.boundaryLicense, "Creative Commons Attribution 4.0 International (CC BY 4.0)");
  });
});

test("boundaries: the file to download must be https", async () => {
  const api = JSON.stringify({ ...JSON.parse(API), simplifiedGeometryGeoJSON: SIMPLIFIED_URL.replace("https:", "http:") });
  const { fetch, calls } = serve({ [API_URL]: api });
  await assert.rejects(
    inDeck((deck) => boundaries({ iso3: "XYZ", level: "ADM1", deck, fetch })),
    { message: "geoBoundaries answered something stepdeck cannot read: simplifiedGeometryGeoJSON is not an https URL" },
  );
  assert.deepEqual(calls, [API_URL]);
});

test("boundaries: an existing output is replaced, and said so", async () => {
  await inDeck(async (deck) => {
    const first = await boundaries({ iso3: "XYZ", level: "ADM1", deck, fetch: xyz().fetch });
    assert.deepEqual(first.replaced, []);
    const again = await boundaries({ iso3: "XYZ", level: "ADM1", deck, fetch: xyz().fetch });
    assert.deepEqual(again.replaced, [first.file, first.sourceFile]);
    assert.deepEqual(readdirSync(join(deck, "data")).sort(), ["xyz-adm1.geojson", "xyz-adm1.source.json"], "no temp files are left");
  });
});

test("boundaries: after a 404 nothing is written", async () => {
  await inDeck(async (deck) => {
    await assert.rejects(boundaries({ iso3: "XYZ", level: "ADM2", deck, fetch: xyz().fetch }), /has no gbOpen ADM2/);
    assert.equal(existsSync(join(deck, "data")), false);
  });
});

test("boundaries: a timeout is could not reach", async () => {
  const slow = async () => { throw new DOMException("The operation was aborted due to timeout", "TimeoutError"); };
  await assert.rejects(
    inDeck((deck) => boundaries({ iso3: "XYZ", level: "ADM1", deck, fetch: slow })),
    { message: "could not reach geoBoundaries (The operation was aborted due to timeout)" },
  );
});

test("boundaries: a failed write leaves a source file but no truncated or licence-less GeoJSON", async () => {
  await inDeck(async (deck) => {
    const out = join(deck, "regions.geojson");
    mkdirSync(out); // the GeoJSON cannot be put there
    await assert.rejects(boundaries({ iso3: "XYZ", level: "ADM1", deck, out, fetch: xyz().fetch }));
    assert.ok(existsSync(join(deck, "regions.source.json")), "the licence is written first");
    assert.deepEqual(readdirSync(deck).sort(), ["regions.geojson", "regions.source.json"], "no temp files are left");
  });
});

// The command line: arguments that are refused before any request is made (so no network either).
const CLI = fileURLToPath(new URL("../../cli/index.js", import.meta.url));
const cli = (...args) => spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8" });

test("boundaries: the command takes a country and a level", () => {
  const missing = cli("boundaries", "XYZ");
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /^stepdeck: boundaries needs a country and a level: stepdeck boundaries URY ADM1/);
  const level = cli("boundaries", "XYZ", "ADM9");
  assert.equal(level.status, 2);
  assert.match(level.stderr, /^stepdeck: ADM9 is not an admin level \(use ADM0 to ADM5\)/);
  const json = cli("boundaries", "XYZ", "ADM9", "--json");
  assert.deepEqual(JSON.parse(json.stdout), { error: "ADM9 is not an admin level (use ADM0 to ADM5)" });
  const precision = cli("boundaries", "XYZ", "ADM1", "--precision", "many");
  assert.match(precision.stderr, /precision must be a whole number from 0 to 10/);
  assert.match(cli("--help").stdout, /boundaries <ISO3> <ADM0-ADM5>/);
});
