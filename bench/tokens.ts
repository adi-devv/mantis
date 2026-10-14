import { getEncoding } from 'js-tiktoken';

/**
 * Token estimators. None of these is Claude's tokenizer; they are consistent
 * approximations so tools can be compared with the same ruler.
 *  - chars/4: the usual rule of thumb for English text (primary).
 *  - cl100k: OpenAI's cl100k_base BPE via js-tiktoken (secondary, different vocabulary).
 */
const enc = getEncoding('cl100k_base');

export const tokensChars4 = (text: string): number => Math.ceil(text.length / 4);
export const tokensCl100k = (text: string): number => (text ? enc.encode(text, 'all').length : 0);

/**
 * Anthropic's published image-token estimate: tokens ≈ width * height / 750, after
 * the image is downscaled so its longest side is <= 1568 px and it has <= ~1.15 MP.
 * https://docs.anthropic.com/en/docs/build-with-claude/vision (an estimate, not a bill).
 */
export function imageTokens(width: number, height: number): number {
  const MAX_SIDE = 1568;
  const MAX_PIXELS = 1_150_000;
  let scale = Math.min(1, MAX_SIDE / Math.max(width, height));
  scale = Math.min(scale, Math.sqrt(MAX_PIXELS / (width * height)));
  const w = Math.floor(width * scale);
  const h = Math.floor(height * scale);
  return Math.ceil((w * h) / 750);
}

/** Width and height from a PNG's IHDR chunk. */
export function pngSize(png: Buffer): { width: number; height: number } {
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

export interface Cost {
  chars: number;
  t4: number;
  tik: number;
}
export const zeroCost = (): Cost => ({ chars: 0, t4: 0, tik: 0 });
export const costOf = (text: string): Cost => ({ chars: text.length, t4: tokensChars4(text), tik: tokensCl100k(text) });
export const addCost = (a: Cost, b: Cost): Cost => ({ chars: a.chars + b.chars, t4: a.t4 + b.t4, tik: a.tik + b.tik });
