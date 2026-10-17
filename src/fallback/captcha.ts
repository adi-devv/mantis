import type { Page } from 'playwright';

export const CAPTCHA_WARNING = '⚠ CAPTCHA detected — call ask_human("captcha")';

const FRAME_URL = /google\.com\/recaptcha|hcaptcha\.com|challenges\.cloudflare\.com/i;
const CAPTCHA_CANDIDATES = '.g-recaptcha, .h-captcha, .cf-turnstile, iframe[src*="google.com/recaptcha" i], iframe[src*="hcaptcha.com" i], iframe[src*="challenges.cloudflare.com" i]';

/** A widget only counts when a person could see a substantial part of it on the page. */
function renderedElement(element: Element): boolean {
  if (!element.isConnected || element.closest('template')) return false;
  const check = (element as Element & {
    checkVisibility?: (options?: { checkOpacity?: boolean; checkVisibilityCSS?: boolean }) => boolean;
  }).checkVisibility;
  if (typeof check === 'function') {
    if (!check.call(element, { checkOpacity: true, checkVisibilityCSS: true })) return false;
  } else {
    for (let node: Element | null = element; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility !== 'visible' || parseFloat(style.opacity) === 0) return false;
    }
  }
  const style = getComputedStyle(element);
  if (style.display === 'none' || style.visibility !== 'visible' || parseFloat(style.opacity) === 0) return false;
  const rect = element.getBoundingClientRect();
  if (rect.width < 10 || rect.height < 10) return false;
  const root = document.documentElement;
  const left = rect.left + scrollX;
  const top = rect.top + scrollY;
  return left + rect.width > 0 && top + rect.height > 0 && left < root.scrollWidth && top < root.scrollHeight;
}

/**
 * Warning line for read() if a known CAPTCHA widget is on the page, else null.
 * Invisible reCAPTCHA (v3 badge, `size=invisible`) needs no human, so it is ignored.
 */
export async function detectCaptcha(page: Page): Promise<string | null> {
  try {
    const candidates = await page.$$(CAPTCHA_CANDIDATES);
    for (const element of candidates) {
      try {
        const candidate = await element.evaluate((node) => ({
          widget: node.matches('.g-recaptcha, .h-captcha, .cf-turnstile'),
          invisible: node.getAttribute('data-size') === 'invisible',
          src: node.getAttribute('src') ?? '',
        }));
        const known = candidate.widget || FRAME_URL.test(candidate.src);
        if (known && !candidate.invisible && !/size=invisible/i.test(candidate.src) &&
            await element.evaluate(renderedElement)) return CAPTCHA_WARNING;
      } catch {
        // A candidate can detach while the page is settling; inspect the rest.
      } finally {
        await element.dispose();
      }
    }
    // Frames injected by a script that never reached the DOM query above (e.g. in shadow roots).
    for (const frame of page.frames()) {
      if (frame === page.mainFrame() || !FRAME_URL.test(frame.url()) || /size=invisible/i.test(frame.url())) continue;
      const element = await frame.frameElement().catch(() => null);
      if (!element) continue;
      try {
        if (await element.evaluate(renderedElement)) return CAPTCHA_WARNING;
      } finally {
        await element.dispose();
      }
    }
    return null;
  } catch {
    return null;
  }
}
