import type { Page } from 'playwright';

/** Longest side of the image `look()` returns, in pixels. */
export const LOOK_MAX_SIDE = 800;

/** Width and height from a PNG's IHDR chunk. */
export function pngSize(png: Buffer): { width: number; height: number } {
  if (png.length < 24 || png.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

/**
 * Downscale a PNG so its longest side is at most `max`. Done in a scratch page (a separate
 * browser context, so it never becomes the active page) using canvas; no image library needed.
 */
export async function downscale(png: Buffer, scratch: () => Promise<Page>, max = LOOK_MAX_SIDE): Promise<Buffer> {
  const { width, height } = pngSize(png);
  if (Math.max(width, height) <= max) return png;
  const page = await scratch();
  const b64 = await page.evaluate(
    async ({ data, max: m }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${data}`;
      await img.decode();
      const k = m / Math.max(img.naturalWidth, img.naturalHeight);
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.naturalWidth * k));
      c.height = Math.max(1, Math.round(img.naturalHeight * k));
      const ctx = c.getContext('2d')!;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, c.width, c.height);
      return c.toDataURL('image/png').split(',')[1] ?? '';
    },
    { data: png.toString('base64'), max },
  );
  return Buffer.from(b64, 'base64');
}
