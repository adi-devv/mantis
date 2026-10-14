import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * OCR via tesseract.js (deterministic, no LLM). tesseract.js is imported lazily so Mantis
 * starts and works without loading it; the worker is created on first use and reused.
 * The first run downloads English language data (~10 MB, cached under ~/.cache/mantis).
 */

export interface OcrResult {
  text: string;
  /** Mean word confidence, 0-100. */
  confidence: number;
}

interface WorkerLike {
  recognize(image: Buffer): Promise<{ data: { text: string; confidence: number } }>;
  terminate(): Promise<unknown>;
}

let worker: Promise<WorkerLike> | null = null;

const NETWORK = /fetch|network|ENOTFOUND|ECONN|EAI_AGAIN|ETIMEDOUT|getaddrinfo|socket|certificate|offline|traineddata|Failed to load|download/i;

function friendly(e: unknown): Error {
  const msg = String(e instanceof Error ? e.message : e).split('\n')[0] ?? '';
  if (/Cannot find (package|module)/i.test(msg) && /tesseract/i.test(msg)) {
    return new Error('OCR is unavailable: the tesseract.js package is not installed (npm i tesseract.js)');
  }
  if (NETWORK.test(msg)) {
    return new Error(
      'OCR language data (eng.traineddata) could not be downloaded; the first ocr() run needs internet access. ' +
        'Connect once to cache it, or set MANTIS_TESSDATA to a folder that contains eng.traineddata. ' +
        `(${msg.slice(0, 120)})`,
    );
  }
  return new Error(`OCR failed: ${msg.slice(0, 200)}`);
}

async function getWorker(): Promise<WorkerLike> {
  if (!worker) {
    worker = (async () => {
      const { createWorker } = await import('tesseract.js');
      const local = process.env.MANTIS_TESSDATA;
      return (await createWorker('eng', 1, {
        cachePath: join(homedir(), '.cache', 'mantis', 'tessdata'),
        ...(local ? { langPath: local, gzip: false } : {}),
        errorHandler: () => undefined,
      })) as unknown as WorkerLike;
    })();
    worker.catch(() => {
      worker = null; // allow a retry after a failed first attempt (e.g. offline)
    });
  }
  return worker;
}

/** Recognise text in a PNG buffer. Throws an Error with a plain, agent-readable message. */
export async function recognize(png: Buffer): Promise<OcrResult> {
  try {
    const w = await getWorker();
    const { data } = await w.recognize(png);
    return { text: data.text.replace(/[ \t]+/g, ' ').replace(/\n{2,}/g, '\n').trim(), confidence: Math.round(data.confidence) };
  } catch (e) {
    throw friendly(e);
  }
}

/** Release the worker (called when the browser closes). */
export async function closeOcr(): Promise<void> {
  const w = worker;
  worker = null;
  if (w) await w.then((x) => x.terminate()).catch(() => undefined);
}
