// Writes the data files of this fixture: three time-lapse files over one image. `node make.mjs` rebuilds them in data/, and
// `node make.mjs --out DIR` writes them under DIR/data/ instead (a test compares the two). All values are synthetic.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { encodePng } from "../../../../cli/png.js";
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

write("lapse.json", json({ bounds: BOUNDS, value: VALUE, frames: frames(["2001", "2002", "2003"]) }));
write("twin.json", json({ bounds: BOUNDS, value: VALUE, frames: frames(["2001", "2002", "2003"]) })); // the same labels and numbers key
write("other.json", json({ bounds: BOUNDS, value: VALUE, frames: frames(["2001", "2002", "2004"], (i) => ({ households: i })) })); // other labels
