import type { Page } from 'playwright';

export const CAPTCHA_WARNING = '⚠ CAPTCHA detected — call ask_human("captcha")';

const FRAME_URL = /google\.com\/recaptcha|hcaptcha\.com|challenges\.cloudflare\.com/i;

/**
 * Warning line for read() if a known CAPTCHA widget is on the page, else null.
 * Invisible reCAPTCHA (v3 badge, `size=invisible`) needs no human, so it is ignored.
 */
export async function detectCaptcha(page: Page): Promise<string | null> {
  try {
    const inDom = await page.evaluate(() => {
      const visible = (e: Element): boolean => getComputedStyle(e).display !== 'none';
      for (const e of Array.from(document.querySelectorAll('.g-recaptcha, .h-captcha, .cf-turnstile'))) {
        if (e.getAttribute('data-size') === 'invisible') continue;
        if (visible(e)) return true;
      }
      for (const f of Array.from(document.querySelectorAll('iframe[src]'))) {
        const src = f.getAttribute('src') ?? '';
        if (!/google\.com\/recaptcha|hcaptcha\.com|challenges\.cloudflare\.com/i.test(src)) continue;
        if (/size=invisible/i.test(src)) continue;
        if (visible(f)) return true;
      }
      return false;
    });
    if (inDom) return CAPTCHA_WARNING;
    // Frames injected by a script that never reached the DOM query above (e.g. in shadow roots).
    const inFrames = page.frames().some((f) => f !== page.mainFrame() && FRAME_URL.test(f.url()) && !/size=invisible/i.test(f.url()));
    return inFrames ? CAPTCHA_WARNING : null;
  } catch {
    return null;
  }
}
