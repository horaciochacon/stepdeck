// cli/png.js: the small PNG reader and writer the map rules and generators use (greyscale, 8-bit, no image library).
import { test } from "node:test";
import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";
import { encodePng, pngInfo, pngPixels } from "../../cli/png.js";

/** A PNG chunk with a valid CRC, built here from scratch so the tests do not lean on the writer under test. */
function chunk(type, body) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const bytes = Buffer.concat([Buffer.from(type, "latin1"), body]);
  let crc = 0xffffffff;
  for (const b of bytes) crc = crcTable[(crc ^ b) & 0xff] ^ (crc >>> 8);
  const out = Buffer.alloc(12 + body.length);
  out.writeUInt32BE(body.length, 0);
  bytes.copy(out, 4);
  out.writeUInt32BE((crc ^ 0xffffffff) >>> 0, 8 + body.length);
  return out;
}
const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
function header(width, height, colorType) {
  const body = Buffer.alloc(13);
  body.writeUInt32BE(width, 0);
  body.writeUInt32BE(height, 4);
  body[8] = 8;
  body[9] = colorType;
  return chunk("IHDR", body);
}

test("png: encode then read back", () => {
  const grey = { width: 3, height: 2, channels: 1, data: Uint8Array.from([0, 10, 20, 255, 128, 1]) };
  const bytes = encodePng(grey);
  assert.deepEqual(pngInfo(bytes), { width: 3, height: 2, bitDepth: 8, colorType: 0, chunks: ["IHDR", "IDAT", "IEND"] });
  assert.deepEqual(pngPixels(bytes), { ...grey, data: grey.data });

  const alpha = { width: 2, height: 2, channels: 2, data: Uint8Array.from([5, 255, 6, 0, 7, 255, 8, 255]) };
  const bytes2 = encodePng(alpha);
  assert.equal(pngInfo(bytes2).colorType, 4);
  assert.deepEqual(pngPixels(bytes2), alpha);
});

test("png: encodePng rejects data of the wrong length", () => {
  assert.throws(() => encodePng({ width: 2, height: 2, channels: 1, data: new Uint8Array(3) }), /4 bytes/);
});

test("png: pngPixels undoes every filter type", () => {
  // Grey + alpha (2 bytes per pixel), 3 pixels wide, 5 rows: one row per filter type 0 to 4.
  const width = 3;
  const bpp = 2;
  const rows = [
    [10, 255, 20, 255, 30, 0],
    [12, 255, 25, 255, 31, 255],
    [15, 255, 22, 0, 40, 255],
    [11, 255, 90, 255, 33, 255],
    [13, 0, 91, 255, 50, 255],
  ];
  const paeth = (a, b, c) => {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  const filtered = rows.map((row, y) => {
    const type = y; // 0 None, 1 Sub, 2 Up, 3 Average, 4 Paeth
    const out = [type];
    row.forEach((x, i) => {
      const a = i >= bpp ? row[i - bpp] : 0;
      const b = y > 0 ? rows[y - 1][i] : 0;
      const c = y > 0 && i >= bpp ? rows[y - 1][i - bpp] : 0;
      const predicted = [0, a, b, (a + b) >> 1, paeth(a, b, c)][type];
      out.push((x - predicted) & 0xff);
    });
    return Buffer.from(out);
  });
  const png = Buffer.concat([SIGNATURE, header(width, rows.length, 4), chunk("IDAT", deflateSync(Buffer.concat(filtered))), chunk("IEND", Buffer.alloc(0))]);
  assert.deepEqual([...pngPixels(png).data], rows.flat());
});

test("png: pngPixels joins several IDAT chunks", () => {
  const raw = deflateSync(Buffer.from([0, 1, 2, 3, 0, 4, 5, 6]));
  const png = Buffer.concat([
    SIGNATURE,
    header(3, 2, 0),
    chunk("IDAT", raw.subarray(0, 5)),
    chunk("IDAT", raw.subarray(5)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  assert.deepEqual([...pngPixels(png).data], [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(pngInfo(png).chunks, ["IHDR", "IDAT", "IDAT", "IEND"]);
});

test("png: color chunks are reported", () => {
  const bytes = encodePng({ width: 1, height: 1, channels: 1, data: Uint8Array.of(7) });
  const afterHeader = 8 + 25; // signature + the 25-byte IHDR chunk
  const withGamma = Buffer.concat([bytes.subarray(0, afterHeader), chunk("gAMA", Buffer.from([0, 1, 134, 160])), bytes.subarray(afterHeader)]);
  assert.deepEqual(pngInfo(withGamma).chunks, ["IHDR", "gAMA", "IDAT", "IEND"]);
  assert.deepEqual([...pngPixels(withGamma).data], [7]);
});

test("png: not a PNG", () => {
  assert.throws(() => pngInfo(Buffer.from("GIF89a, not a png at all")), /not a PNG/);
  assert.throws(() => pngPixels(Buffer.alloc(4)), /not a PNG/);
});

test("png: pngPixels refuses what the raster format does not allow", () => {
  const rgb = Buffer.concat([SIGNATURE, header(1, 1, 2), chunk("IDAT", deflateSync(Buffer.from([0, 1, 2, 3]))), chunk("IEND", Buffer.alloc(0))]);
  assert.throws(() => pngPixels(rgb), /color type 2/);
});
