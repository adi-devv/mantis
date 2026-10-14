#!/usr/bin/env node
import { MantisBrowser } from './browser.js';
import { estimateTokens } from './translate.js';

async function main(): Promise<number> {
  const [cmd, url] = process.argv.slice(2);
  if (cmd !== 'read' || !url) {
    console.error('usage: mantis read <url>');
    return 2;
  }
  const browser = new MantisBrowser();
  try {
    const text = await browser.open(url);
    console.log(text);
    console.log(`~${estimateTokens(text)} tokens`);
    return text.startsWith('error:') ? 1 : 0;
  } finally {
    await browser.close();
  }
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  },
);
