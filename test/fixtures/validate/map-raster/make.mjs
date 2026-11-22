// Writes the data files of this fixture: a bad sidecar and the PNGs a raster must not be. `node make.mjs` rebuilds them in data/, and
// `node make.mjs --out DIR` writes them under DIR/data/ instead (a test compares the two). All values are synthetic.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { encodePng } from "../../../../cli/png.js";
import { deflateSync } from "node:zlib";
const here = dirname(fileURLToPath(import.meta.url));
const out = process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : here;
const write = (name, content) => {
  mkdirSync(dirname(join(out, "data", name)), { recursive: true });
  writeFileSync(join(out, "data", name), content);
};
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

// One square region, counter-clockwise, and a 4×3 greyscale image over it.
write(
  "regions.geojson",
  `{"type":"FeatureCollection","features":[\n{"type":"Feature","properties":{"code":"Q1","name":"Square"},"geometry":{"type":"Polygon","coordinates":[[[-14,-28],[-12,-28],[-12,-26],[-14,-26],[-14,-28]]]}}\n]}\n`,
);
const grey = (width, height) => encodePng({ width, height, channels: 1, data: Uint8Array.from({ length: width * height }, (_, i) => (i * 21) % 256) });
const BOUNDS = [-14, -28, -12, -26];
const VALUE = { scale: "linear", min: 0, max: 100 };
write("cell.png", grey(4, 3));
const frames = (labels, numbers = (i) => ({ people: (i + 1) * 10 }), src = "cell.png") => labels.map((label, i) => ({ src, label, numbers: numbers(i) }));

// A PNG made from its parts, so its header can say what the files below need: `type` is the colour type (2 is RGB),
// `interlace` the header's interlace byte, `extra` chunks that follow the header. Only the header and chunk list of
// the interlaced one matter: validate reads no pixels.
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const chunk = (type, body) => {
  const bytes = Buffer.concat([Buffer.from(type, "latin1"), body]);
  let crc = 0xffffffff;
  for (const b of bytes) crc = crcTable[(crc ^ b) & 0xff] ^ (crc >>> 8);
  const head = Buffer.alloc(4);
  head.writeUInt32BE(body.length);
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([head, bytes, tail]);
};
function png({ width, height, type, interlace = 0, extra = [] }) {
  const channels = { 0: 1, 2: 3 }[type];
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = type;
  header[12] = interlace;
  const rows = Buffer.alloc((width * channels + 1) * height); // every row: filter 0, then zeros
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    ...extra,
    chunk("IDAT", deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

write("colour.png", png({ width: 4, height: 3, type: 2, extra: [chunk("gAMA", Buffer.from([0, 1, 134, 160]))] }));
write("interlaced.png", png({ width: 4, height: 3, type: 0, interlace: 1 }));
write("tall.png", grey(4, 4));
write("junk.png", "this is not an image\n");
write("parse.json", '{ "bounds": [-14, -28,\n');

const one = (src) => ({ bounds: BOUNDS, value: VALUE, src });
write("bad.json", json({ ...one("cell.png"), bounds: [-14, -28, -12] }));
write("colour.json", json(one("colour.png")));
write("interlaced.json", json(one("interlaced.png")));
write("junk.json", json(one("junk.png")));
write("case.json", json(one("Cell.png")));
write("outside.json", json(one("../cell.png")));
write("gone.json", json({ bounds: BOUNDS, value: VALUE, frames: frames(["2001", "2002"]).map((f, i) => (i === 1 ? { ...f, src: "missing.png" } : f)) }));
write("size.json", json({ bounds: BOUNDS, value: VALUE, frames: [{ src: "cell.png", label: "2001" }, { src: "tall.png", label: "2002" }] }));
