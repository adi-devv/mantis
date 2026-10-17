/**
 * Minimal PNG codec and image helpers for the eval harness (no dependencies beyond node:zlib): decode and
 * encode 8-bit PNGs, box-filter downscale, and tiny grayscale thumbnails for near-duplicate detection.
 */
import { deflateSync, inflateSync } from 'node:zlib';

export interface RgbaImage { width: number; height: number; data: Uint8Array /* RGBA, row-major */ }

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Samples per pixel by color type: 0 gray, 2 RGB, 4 gray+alpha, 6 RGBA. */
const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 4: 2, 6: 4 };

export function decodePng(buf: Buffer): RgbaImage {
  if (buf.length < 8 || !buf.subarray(0, 8).equals(SIGNATURE)) throw new Error('not a PNG');
  let width = 0, height = 0, colorType = -1;
  const idat: Buffer[] = [];
  let sawHeader = false;
  for (let pos = 8; pos + 12 <= buf.length;) {
    const length = buf.readUInt32BE(pos);
    const type = buf.toString('latin1', pos + 4, pos + 8);
    const body = buf.subarray(pos + 8, pos + 8 + length);
    if (body.length < length) throw new Error('truncated PNG chunk');
    pos += 12 + length;
    if (type === 'IHDR') {
      width = body.readUInt32BE(0); height = body.readUInt32BE(4);
      const [depth, color, , , interlace] = [body[8], body[9], body[10], body[11], body[12]];
      if (depth !== 8) throw new Error(`unsupported PNG bit depth ${depth}`);
      if (CHANNELS[color!] === undefined) throw new Error(`unsupported PNG color type ${color}`);
      if (interlace !== 0) throw new Error('interlaced PNG is not supported');
      colorType = color!;
      sawHeader = true;
    } else if (type === 'IDAT') idat.push(body);
    else if (type === 'IEND') break;
  }
  if (!sawHeader || !width || !height) throw new Error('PNG has no valid header');
  const channels = CHANNELS[colorType]!;
  const stride = width * channels;
  const raw = inflateSync(Buffer.concat(idat));
  if (raw.length < (stride + 1) * height) throw new Error('PNG data is too short');
  const pixels = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!;
    const src = y * (stride + 1) + 1;
    const row = y * stride;
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? pixels[row + x - channels]! : 0;
      const up = y > 0 ? pixels[row - stride + x]! : 0;
      const upLeft = y > 0 && x >= channels ? pixels[row - stride + x - channels]! : 0;
      let predictor: number;
      switch (filter) {
        case 0: predictor = 0; break;
        case 1: predictor = left; break;
        case 2: predictor = up; break;
        case 3: predictor = (left + up) >> 1; break;
        case 4: {
          const p = left + up - upLeft;
          const pa = Math.abs(p - left), pb = Math.abs(p - up), pc = Math.abs(p - upLeft);
          predictor = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
          break;
        }
        default: throw new Error(`unsupported PNG filter ${filter}`);
      }
      pixels[row + x] = (raw[src + x]! + predictor) & 0xff;
    }
  }
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const s = i * channels;
    const d = i * 4;
    if (channels === 1 || channels === 2) {
      data[d] = data[d + 1] = data[d + 2] = pixels[s]!;
      data[d + 3] = channels === 2 ? pixels[s + 1]! : 255;
    } else {
      data[d] = pixels[s]!; data[d + 1] = pixels[s + 1]!; data[d + 2] = pixels[s + 2]!;
      data[d + 3] = channels === 4 ? pixels[s + 3]! : 255;
    }
  }
  return { width, height, data };
}

function chunk(type: string, body: Buffer): Buffer {
  const out = Buffer.alloc(12 + body.length);
  out.writeUInt32BE(body.length, 0);
  out.write(type, 4, 'latin1');
  body.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + body.length)), 8 + body.length);
  return out;
}

/** 8-bit RGBA, filter 0 on every row. */
export function encodePng(img: RgbaImage): Buffer {
  const { width, height, data } = img;
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; header[9] = 6; // 8-bit RGBA, deflate, adaptive filtering, no interlace
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) Buffer.from(data.buffer, data.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  return Buffer.concat([SIGNATURE, chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

/** Area-average (box) resize; exact for downscaling, nearest-ish for upscaling. */
export function resizeImage(img: RgbaImage, width: number, height: number): RgbaImage {
  width = Math.max(1, Math.round(width)); height = Math.max(1, Math.round(height));
  if (width === img.width && height === img.height) return img;
  const out = new Uint8Array(width * height * 4);
  const sx = img.width / width, sy = img.height / height;
  for (let y = 0; y < height; y++) {
    const y0 = y * sy, y1 = Math.min(img.height, (y + 1) * sy);
    for (let x = 0; x < width; x++) {
      const x0 = x * sx, x1 = Math.min(img.width, (x + 1) * sx);
      let r = 0, g = 0, b = 0, a = 0, weight = 0;
      for (let yy = Math.floor(y0); yy < Math.ceil(y1); yy++) {
        const wy = Math.min(yy + 1, y1) - Math.max(yy, y0);
        for (let xx = Math.floor(x0); xx < Math.ceil(x1); xx++) {
          const w = wy * (Math.min(xx + 1, x1) - Math.max(xx, x0));
          const i = (yy * img.width + xx) * 4;
          r += img.data[i]! * w; g += img.data[i + 1]! * w; b += img.data[i + 2]! * w; a += img.data[i + 3]! * w;
          weight += w;
        }
      }
      const o = (y * width + x) * 4;
      if (weight > 0) { out[o] = Math.round(r / weight); out[o + 1] = Math.round(g / weight); out[o + 2] = Math.round(b / weight); out[o + 3] = Math.round(a / weight); }
    }
  }
  return { width, height, data: out };
}

/** Shrink to fit inside maxW x maxH, keeping the aspect ratio; never enlarges. */
export function fitWithin(img: RgbaImage, maxW: number, maxH: number): RgbaImage {
  const scale = Math.min(1, maxW / img.width, maxH / img.height);
  return scale >= 1 ? img : resizeImage(img, Math.floor(img.width * scale), Math.floor(img.height * scale));
}

/** Grayscale thumbnail (w x h luma bytes), alpha composited over white. */
export function grayThumb(img: RgbaImage, w = 32, h = 20): Uint8Array {
  const small = resizeImage(img, w, h);
  const out = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const a = small.data[i * 4 + 3]! / 255;
    const luma = 0.299 * small.data[i * 4]! + 0.587 * small.data[i * 4 + 1]! + 0.114 * small.data[i * 4 + 2]!;
    out[i] = Math.round(luma * a + 255 * (1 - a));
  }
  return out;
}

/** Mean absolute difference of two thumbnails, 0..255; thumbnails of different sizes are maximally different. */
export function thumbDiff(a: Uint8Array, b: Uint8Array): number {
  if (a.length !== b.length || a.length === 0) return 255;
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i]! - b[i]!);
  return sum / a.length;
}
