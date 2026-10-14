import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Tests never touch the real ~/.cache/mantis, and site memory is off unless a test turns it on
// (many fixtures share chrome; with memory on, views would depend on test order).
process.env.MANTIS_MEMORY = '0';
process.env.MANTIS_MEMORY_DIR = mkdtempSync(join(tmpdir(), 'mantis-test-mem-'));
