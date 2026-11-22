// Generates the raster files of the map-kit fixture: small images whose pixels the raster code is tested against.
// Deterministic: run `node test/fixtures/decks/map-kit/data/make-data.mjs` to rebuild every file it writes, or pass
// `--out DIR` to write them under DIR/map-kit instead (the tests compare the two). regions.geojson and
// square-cw.geojson in this folder are written by hand.
//
//   levels.json + levels.png      4×1 px, grey + alpha: levels 0, 1, 254, 255, the second pixel transparent
//   lapse.json + lapse/           13 frames of 4×1 px, grey: frame i is level 20 × i, so no two frames look alike
//   mismatch.json + mismatch/     two frames of 8×6 and 9×6 px
//   wide.json + wide.png          2001×2000 px at one level: over the pixel limit (an area limit)
//   covered.json + covered.png    20×20 px over the square region (-14 to -12, -28 to -26): data on every pixel
//   patched.json + patched/       two frames over the square: the second has a 4×4 px hole in its middle
//   half.json + half.png          10×20 px over the west half of the square: the east half is outside its bounds
//
// Rasters follow the raster format: rows run north to south, columns west to east.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { encodePng } from "../../../../../cli/png.js";
import { jsonText } from "../../../../../site/gallery/data/map/fictional.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const out = process.argv.includes("--out") ? join(process.argv[process.argv.indexOf("--out") + 1], "map-kit") : here;
const write = (name, content) => {
  mkdirSync(dirname(join(out, name)), { recursive: true });
  writeFileSync(join(out, name), content);
};

const BOUNDS = [-16, -28, -10, -26];
const SQUARE = [-14, -28, -12, -26];
const linear = (max) => ({ scale: "linear", min: 0, max });

/** An 8-bit grey image of one level; `hole` (col, row) leaves a pixel without data (grey + alpha then). */
const flat = (width, height, level, hole) => {
  if (!hole) return encodePng({ width, height, channels: 1, data: new Uint8Array(width * height).fill(level) });
  const data = new Uint8Array(width * height * 2);
  for (let i = 0; i < width * height; i++) {
    const valid = !hole(i % width, Math.floor(i / width));
    data[i * 2] = valid ? level : 0;
    data[i * 2 + 1] = valid ? 255 : 0;
  }
  return encodePng({ width, height, channels: 2, data });
};

// the four levels the decoding must get exactly right, the second pixel with no data
write("levels.png", encodePng({ width: 4, height: 1, channels: 2, data: Uint8Array.of(0, 255, 1, 0, 254, 255, 255, 255) }));
write("levels.json", jsonText({ bounds: BOUNDS, value: linear(255), src: "levels.png" }));

const labels = Array.from({ length: 13 }, (_, i) => `f${i}`);
labels.forEach((label, i) => write(`lapse/${label}.png`, flat(4, 1, 20 * i)));
write("lapse.json", jsonText({ bounds: BOUNDS, value: linear(255), frames: labels.map((label) => ({ src: `lapse/${label}.png`, label })) }));

write("mismatch/2000.png", flat(8, 6, 100));
write("mismatch/2001.png", flat(9, 6, 140));
write("mismatch.json", jsonText({
  bounds: BOUNDS,
  value: linear(100),
  frames: [{ src: "mismatch/2000.png", label: "2000" }, { src: "mismatch/2001.png", label: "2001" }],
}));

// over the pixel limit, and small: one level everywhere compresses to a few KB
write("wide.png", flat(2001, 2000, 128));
write("wide.json", jsonText({ bounds: BOUNDS, value: linear(100), src: "wide.png" }));

write("covered.png", flat(20, 20, 128, null));
write("covered.json", jsonText({ bounds: SQUARE, value: linear(255), src: "covered.png" }));

write("patched/a.png", flat(20, 20, 128, null));
write("patched/b.png", flat(20, 20, 128, (col, row) => col >= 8 && col < 12 && row >= 8 && row < 12));
write("patched.json", jsonText({
  bounds: SQUARE,
  value: linear(255),
  frames: [{ src: "patched/a.png", label: "a" }, { src: "patched/b.png", label: "b" }],
}));

write("half.png", flat(10, 20, 128, null));
write("half.json", jsonText({ bounds: [-14, -28, -13, -26], value: linear(255), src: "half.png" }));
