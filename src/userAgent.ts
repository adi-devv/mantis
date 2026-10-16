import { chromium } from 'playwright';
import type { Browser } from 'playwright';

/** Headless Chromium says "HeadlessChrome"; some sites (Google Maps) then serve a degraded page. */
export function stripHeadless(ua: string): string {
  return ua.replace(/HeadlessChrome/g, 'Chrome');
}

/**
 * The user agent every approach should present: MANTIS_USER_AGENT verbatim if set, else the browser's
 * real UA (so the version stays true) with "HeadlessChrome" replaced by "Chrome". Reads the default UA
 * from a throwaway context of the given browser.
 */
export async function userAgentFor(browser: Browser): Promise<string> {
  const override = process.env.MANTIS_USER_AGENT;
  if (override) return override;
  const ctx = await browser.newContext();
  try {
    const page = await ctx.newPage();
    return stripHeadless(await page.evaluate(() => navigator.userAgent));
  } finally {
    await ctx.close().catch(() => undefined);
  }
}

/** Launch option pointing Playwright at the Chromium binary in MANTIS_CHROMIUM, when set. */
export function chromiumExecutable(): { executablePath?: string } {
  return process.env.MANTIS_CHROMIUM ? { executablePath: process.env.MANTIS_CHROMIUM } : {};
}

let cached: Promise<string> | undefined;

/** Same string as userAgentFor, for callers with no browser yet (bench runner, MCP server flags). Launches headless Chromium once. */
export function benchUserAgent(): Promise<string> {
  return (cached ??= (async () => {
    if (process.env.MANTIS_USER_AGENT) return process.env.MANTIS_USER_AGENT;
    const browser = await chromium.launch({ headless: true, ...chromiumExecutable() });
    try { return await userAgentFor(browser); } finally { await browser.close().catch(() => undefined); }
  })());
}
