import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

export const fixture = (name: string): string =>
  pathToFileURL(resolve(import.meta.dirname, 'fixtures', name)).href;

/** Number shown in the text view for the first element whose line contains `needle`. */
export function idOf(view: string, needle: string): number {
  for (const line of view.split('\n')) {
    const m = line.match(/#(\d+) \w+ /);
    if (m && line.includes(needle)) return Number(m[1]);
  }
  throw new Error(`"${needle}" not found in view:\n${view}`);
}
