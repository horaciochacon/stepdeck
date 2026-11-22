// `stepdeck boundaries`: one country's admin boundaries from the geoBoundaries API (gbOpen release), fetched at
// authoring time into a deck. For a project that has no boundaries yet: a project's own code normally writes its
// boundaries, with its own ids. The command
//   - reads https://www.geoboundaries.org/api/current/gbOpen/<ISO3>/ADM<n>/, then the simplified GeoJSON it names
//     (or the full one with `full`);
//   - rounds the coordinates, drops the points and rings that rounding collapses, and keeps each feature's properties;
//   - writes data/<iso3>-adm<n>.geojson and, next to it, <same name>.source.json with the licence and the source;
//   - returns the counts, the licence, a suggested source line, a warning for each map limit the file is over, and
//     the files it replaced (an existing output is overwritten).
// `fetch` is injected (default: the global one), so the tests never touch the network.
import { access, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { MAX_POINTS, MAX_REGIONS } from "#engine/core/map.js";

const API = "https://www.geoboundaries.org/api/current/gbOpen";
/** What the answer must carry to write an honest source line, besides the file's URL. */
const SOURCE_FIELDS = ["boundaryID", "boundarySource", "boundaryLicense", "licenseDetail", "licenseSource", "boundaryYearRepresented", "buildDate"];
/** A request that has not answered after this long is given up. */
const TIMEOUT_MS = 120_000;
const MAX_PRECISION = 10;

const count = (n) => n.toLocaleString("en-US");
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const unreadable = (what) => new Error(`geoBoundaries answered something stepdeck cannot read: ${what}`);
const unreachable = (cause) => new Error(`could not reach geoBoundaries (${cause})`);

/** A path as a person would type it from where they are (so the mapshaper line pastes as it stands); absolute when it is not below here. */
export function displayPath(path) {
  const rel = relative(process.cwd(), path);
  return rel === "" || rel.startsWith("..") || isAbsolute(rel) ? path : rel;
}

/**
 * Puts each `[path, text]` in place without a half-way state: every text is first written to a temporary file beside its
 * path, and only when all are written are they renamed, in order. A failed write (a full disk) leaves what was there as it
 * was, and the temporary files are removed.
 */
async function replaceAll(files) {
  const staged = files.map(([path, text]) => ({ path, text, temp: `${path}.${process.pid}.tmp` }));
  try {
    for (const { temp, text } of staged) await writeFile(temp, text);
    for (const { path, temp } of staged) await rename(temp, path);
  } catch (e) {
    await Promise.all(staged.map(({ temp }) => rm(temp, { force: true }).catch(() => {})));
    throw e;
  }
}

const exists = (path) => access(path).then(() => true, () => false);

/** GETs `url` and returns { status, body }; a network failure becomes "could not reach geoBoundaries (<cause>)". */
async function get(fetch, url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    return { status: res.status, body: res.ok ? await res.text() : "" };
  } catch (e) {
    throw unreachable(e.cause?.message ?? e.message);
  }
}

/** The JSON in `body`, or "<what> is not JSON" as an unreadable answer. */
function parse(body, what) {
  try {
    return JSON.parse(body);
  } catch {
    throw unreadable(`${what} is not JSON`);
  }
}

/** A ring rounded to `factor`, consecutive duplicates dropped, closed; undefined when under 4 positions are left. */
function roundRing(ring, factor) {
  const rounded = [];
  for (const position of ring) {
    const next = position.map((v) => Math.round(v * factor) / factor + 0); // + 0 turns -0 into 0
    const last = rounded.at(-1);
    if (!last || next.some((v, i) => v !== last[i])) rounded.push(next);
  }
  const first = rounded[0];
  if (first && rounded.at(-1).some((v, i) => v !== first[i])) rounded.push(first);
  return rounded.length >= 4 ? rounded : undefined;
}

/** A polygon (its rings) rounded; undefined when its outer ring is dropped. Collapsed holes are dropped. */
function roundPolygon(rings, factor) {
  const [outer, ...holes] = rings.map((ring) => roundRing(ring, factor));
  return outer && [outer, ...holes.filter(Boolean)];
}

/** A Polygon or MultiPolygon feature rounded, or undefined when nothing of it is left; other geometries pass as given. */
function roundFeature(feature, factor) {
  const geometry = feature?.geometry;
  if (geometry?.type === "Polygon") {
    const polygon = roundPolygon(geometry.coordinates, factor);
    return polygon && { ...feature, geometry: { ...geometry, coordinates: polygon } };
  }
  if (geometry?.type === "MultiPolygon") {
    const polygons = geometry.coordinates.map((rings) => roundPolygon(rings, factor)).filter(Boolean);
    return polygons.length ? { ...feature, geometry: { ...geometry, coordinates: polygons } } : undefined;
  }
  return feature;
}

/** The positions of a feature's polygons. */
function pointsOf(feature) {
  const polygons = feature.geometry?.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry?.type === "MultiPolygon" ? feature.geometry.coordinates : [];
  return polygons.reduce((sum, rings) => sum + rings.reduce((n, ring) => n + ring.length, 0), 0);
}

/**
 * Fetches one country's admin boundaries from geoBoundaries (gbOpen) and writes them into a deck.
 * @param {object} options
 * @param {string} options.iso3  the country's ISO 3166 alpha-3 code, any case
 * @param {string | number} options.level  `ADM0` to `ADM5`, or `0` to `5`
 * @param {string} [options.deck]  the deck folder (default "."); the file goes to `<deck>/data/<iso3>-adm<n>.geojson`
 * @param {string} [options.out]  the file to write instead; the source file goes next to it
 * @param {boolean} [options.full]  the full-resolution geometry, not the simplified one
 * @param {number} [options.precision]  decimals kept in the coordinates, 0 to 10 (default 4, about 10 m)
 * @param {typeof globalThis.fetch} [options.fetch]  injected for tests
 * @returns {Promise<{ file: string, sourceFile: string, regions: number, points: number, license: string, sourceLine: string, warnings: string[], replaced: string[] }>}
 * @throws `<level> is not an admin level (use ADM0 to ADM5)`, `geoBoundaries has no gbOpen ADM2 for XYZ`,
 *   `could not reach geoBoundaries (<cause>)`, `geoBoundaries answered something stepdeck cannot read: <what>`
 */
export async function boundaries({ iso3, level, deck = ".", out, full = false, precision = 4, fetch = globalThis.fetch }) {
  const adm = /^(?:ADM)?([0-5])$/i.exec(String(level))?.[1];
  if (adm === undefined) throw new Error(`${level} is not an admin level (use ADM0 to ADM5)`);
  if (!/^[A-Za-z]{3}$/.test(String(iso3))) throw new Error(`${iso3} is not a country code (three letters, for example URY)`);
  if (!Number.isInteger(precision) || precision < 0 || precision > MAX_PRECISION) throw new Error(`precision must be a whole number from 0 to ${MAX_PRECISION}`);
  const country = iso3.toUpperCase();

  // The API answer names the files and carries the licence.
  const apiUrl = `${API}/${country}/ADM${adm}/`;
  const answer = await get(fetch, apiUrl);
  if (answer.status === 404) throw new Error(`geoBoundaries has no gbOpen ADM${adm} for ${country}`);
  if (answer.status !== 200) throw unreachable(`HTTP ${answer.status}`);
  const info = parse(answer.body, "the answer");
  if (info === null || typeof info !== "object" || Array.isArray(info)) throw unreadable("the answer is not an object");
  const field = full ? "gjDownloadURL" : "simplifiedGeometryGeoJSON";
  const url = info[field];
  if (typeof url !== "string" || url === "") throw unreadable(`no ${field}`);
  if (!URL.canParse(url) || new URL(url).protocol !== "https:") throw unreadable(`${field} is not an https URL`);
  for (const name of ["boundarySource", "boundaryLicense"]) {
    if (typeof info[name] !== "string" || info[name] === "") throw unreadable(`no ${name}`);
  }

  const download = await get(fetch, url);
  if (download.status !== 200) throw unreachable(`HTTP ${download.status} for ${url}`);
  const geojson = parse(download.body, "the file");
  if (geojson?.type !== "FeatureCollection" || !Array.isArray(geojson.features)) throw unreadable("the file is not a FeatureCollection");

  const factor = 10 ** precision;
  const features = geojson.features.map((feature) => roundFeature(feature, factor)).filter(Boolean);
  const lost = geojson.features.length - features.length;
  const regions = features.length;
  const points = features.reduce((sum, feature) => sum + pointsOf(feature), 0);

  const file = out === undefined ? resolve(deck, "data", `${country.toLowerCase()}-adm${adm}.geojson`) : resolve(out);
  const sourceFile = `${file.replace(/\.geojson$/i, "")}.source.json`;
  // A field the API omits stays in the source file, as null: the licence is never silently absent.
  const source = { ...Object.fromEntries(SOURCE_FIELDS.map((name) => [name, info[name] ?? null])), url };
  const replaced = [];
  for (const path of [file, sourceFile]) if (await exists(path)) replaced.push(path);
  await mkdir(dirname(file), { recursive: true });
  // The source file is moved into place first: a GeoJSON never lands without its licence beside it.
  await replaceAll([[sourceFile, `${JSON.stringify(source, null, 2)}\n`], [file, `${JSON.stringify({ ...geojson, features })}\n`]]);

  const shown = displayPath(file);
  const over = (n, limit, what) => `${shown}: ${count(n)} ${what} is over the map's limit of ${count(limit)}; simplify it, for example: mapshaper ${shown} -simplify 10% -o ${shown}`;
  const warnings = [];
  if (lost) warnings.push(`${plural(lost, "region")} vanished at ${precision} decimals and ${lost === 1 ? "was" : "were"} left out; raise --precision`);
  if (regions > MAX_REGIONS) warnings.push(over(regions, MAX_REGIONS, "regions"));
  if (points > MAX_POINTS) warnings.push(over(points, MAX_POINTS, "points"));

  const license = info.boundaryLicense;
  return { file, sourceFile, regions, points, license, sourceLine: `Boundaries: geoBoundaries, ${info.boundarySource} (${license}).`, warnings, replaced };
}
