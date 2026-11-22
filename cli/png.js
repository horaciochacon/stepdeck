// A small PNG reader and writer for the raster maps: 8-bit greyscale (color type 0) and greyscale with alpha
// (color type 4), the only formats the raster contract allows. No image library; only `node:zlib`.
//
// pngInfo(bytes)    -> { width, height, bitDepth, colorType, chunks }   the header and the chunk types in file order;
//                      `validate` reads this without inflating anything. Throws `not a PNG` on a bad signature.
// pngPixels(bytes)  -> { width, height, channels, data }                the decoded samples, `channels` per pixel,
//                      row by row. Undoes filter types 0 to 4, joins several IDAT chunks, and refuses what the
//                      raster contract does not allow (another bit depth or color type, interlacing).
// encodePng({ width, height, channels, data }) -> Buffer                `channels` 1 is grey, 2 is grey + alpha;
//                      every row uses filter 0.
//
// Compare PNGs through `pngPixels`, never by bytes: zlib's output can differ between Node versions.
import { deflateSync, inflateSync } from "node:zlib";

const SIGNATURE = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10);
const CHANNELS = { 0: 1, 4: 2 };

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

/** CRC-32 of `bytes` (Node 20 has no `zlib.crc32`). */
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const b of bytes) crc = CRC_TABLE[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** The chunks of a PNG as { type, body }, in file order, up to and including IEND. */
function readChunks(bytes) {
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (buf.length < 8 || !SIGNATURE.every((b, i) => buf[i] === b)) throw new Error("not a PNG");
  const chunks = [];
  let at = 8;
  while (at + 12 <= buf.length) {
    const length = buf.readUInt32BE(at);
    const end = at + 12 + length;
    if (end > buf.length) throw new Error("truncated PNG");
    chunks.push({ type: buf.toString("latin1", at + 4, at + 8), body: buf.subarray(at + 8, at + 8 + length) });
    if (chunks.at(-1).type === "IEND") return chunks;
    at = end;
  }
  throw new Error("truncated PNG");
}

function headerOf(chunks) {
  const head = chunks[0];
  if (head?.type !== "IHDR" || head.body.length !== 13) throw new Error("not a PNG");
  const { body } = head;
  return {
    width: body.readUInt32BE(0),
    height: body.readUInt32BE(4),
    bitDepth: body[8],
    colorType: body[9],
    interlace: body[12],
  };
}

/**
 * The header of a PNG and the types of its chunks, in file order.
 * @param {Uint8Array} bytes
 * @returns {{ width: number, height: number, bitDepth: number, colorType: number, chunks: string[] }}
 */
export function pngInfo(bytes) {
  const chunks = readChunks(bytes);
  const { width, height, bitDepth, colorType } = headerOf(chunks);
  return { width, height, bitDepth, colorType, chunks: chunks.map((c) => c.type) };
}

const paeth = (a, b, c) => {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

/**
 * The samples of an 8-bit greyscale PNG (color type 0), or greyscale with alpha (type 4).
 * @param {Uint8Array} bytes
 * @returns {{ width: number, height: number, channels: 1 | 2, data: Uint8Array }}
 */
export function pngPixels(bytes) {
  const chunks = readChunks(bytes);
  const { width, height, bitDepth, colorType, interlace } = headerOf(chunks);
  const channels = CHANNELS[colorType];
  if (bitDepth !== 8) throw new Error(`bit depth ${bitDepth} is not 8`);
  if (channels === undefined) throw new Error(`color type ${colorType} is not 0 (grey) or 4 (grey with alpha)`);
  if (interlace !== 0) throw new Error("interlaced PNGs are not supported");
  const raw = inflateSync(Buffer.concat(chunks.filter((c) => c.type === "IDAT").map((c) => c.body)));
  const stride = width * channels;
  if (raw.length !== (stride + 1) * height) throw new Error(`PNG data is ${raw.length} bytes, expected ${(stride + 1) * height}`);
  const data = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const at = y * stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? data[at + i - channels] : 0;
      const b = y > 0 ? data[at - stride + i] : 0;
      const c = y > 0 && i >= channels ? data[at - stride + i - channels] : 0;
      let predicted;
      if (filter === 0) predicted = 0;
      else if (filter === 1) predicted = a;
      else if (filter === 2) predicted = b;
      else if (filter === 3) predicted = (a + b) >> 1;
      else if (filter === 4) predicted = paeth(a, b, c);
      else throw new Error(`PNG filter type ${filter} is not 0 to 4`);
      data[at + i] = (line[i] + predicted) & 0xff;
    }
  }
  return { width, height, channels, data };
}

function chunk(type, body) {
  const out = Buffer.alloc(12 + body.length);
  out.writeUInt32BE(body.length, 0);
  out.write(type, 4, "latin1");
  Buffer.from(body).copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + body.length)), 8 + body.length);
  return out;
}

/**
 * An 8-bit greyscale (`channels` 1) or greyscale + alpha (`channels` 2) PNG; `data` holds the samples row by row.
 * @param {{ width: number, height: number, channels: 1 | 2, data: Uint8Array }} image
 * @returns {Buffer}
 */
export function encodePng({ width, height, channels, data }) {
  if (channels !== 1 && channels !== 2) throw new Error("channels must be 1 (grey) or 2 (grey + alpha)");
  const stride = width * channels;
  if (data.length !== stride * height) throw new Error(`${width}×${height}×${channels} needs ${stride * height} bytes, got ${data.length}`);
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) Buffer.from(data.buffer, data.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = channels === 1 ? 0 : 4;
  return Buffer.concat([Buffer.from(SIGNATURE), chunk("IHDR", header), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
