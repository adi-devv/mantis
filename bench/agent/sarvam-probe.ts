/** Live, low-token capability probe. It writes no files and never prints provider payloads. */
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { encodePng } from './png.js';
import { SarvamClient, estimateSarvamCost, loadSarvamEnv, resolveSarvamModel, SARVAM_PRICING_DATE } from './sarvam.js';
import type { SarvamCompletion, SarvamRequest } from './sarvam.js';

export const SARVAM_CANDIDATES = ['sarvam-105b', 'gemma-4-31b', 'deepseek-v4.1-flash', 'glm-5.3'];
export interface ProbeRow {
  model: string;
  listed: 'yes' | 'no' | '?';
  responds: boolean;
  promptJson: string;
  formatJson: string;
  image: boolean;
  tools: boolean;
  medianMs: number | null;
  promptTokens: number;
  completionTokens: number;
  unknownUsage: boolean;
  estimatedInr: number;
  errors: number;
  budgetLimited: number;
}

/** Red center on blue background: the instruction does not disclose the expected answer. */
function imageDataUrl(): string {
  const width = 64, data = new Uint8Array(width * width * 4);
  for (let y = 0; y < width; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4, center = x >= 16 && x < 48 && y >= 16 && y < 48;
    data.set(center ? [255, 0, 0, 255] : [0, 0, 255, 255], i);
  }
  return `data:image/png;base64,${encodePng({ width, height: width, data }).toString('base64')}`;
}
function validJson(content: string | null): boolean {
  try {
    const value: unknown = JSON.parse(content ?? '');
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      && (value as Record<string, unknown>).value === 7 && Object.keys(value).length === 1;
  } catch { return false; }
}

export async function probeSarvam(client: Pick<SarvamClient, 'listModels' | 'complete'>, samples = 3): Promise<ProbeRow[]> {
  if (!Number.isInteger(samples) || samples < 3 || samples > 20) throw new Error('SARVAM_PROBE_SAMPLES must be an integer from 3 to 20');
  let listed: string[] | null;
  try { listed = await client.listModels(); } catch { listed = null; }
  const rows: ProbeRow[] = [];
  // Sequential deliberately: a probe should reveal per-request latency without rate-limit contention.
  for (const model of SARVAM_CANDIDATES) {
    const row: ProbeRow = {
      model, listed: listed === null ? '?' : listed.map(resolveSarvamModel).includes(resolveSarvamModel(model)) ? 'yes' : 'no',
      responds: false, promptJson: '', formatJson: '', image: false, tools: false,
      medianMs: null, promptTokens: 0, completionTokens: 0, unknownUsage: false, estimatedInr: 0, errors: 0, budgetLimited: 0,
    };
    const latencies: number[] = [];
    const request = async (body: Omit<SarvamRequest, 'model'>): Promise<SarvamCompletion | null> => {
      try {
        const resolved = resolveSarvamModel(model);
        const reasoning = ['deepseekv4.1-flash', 'glm5.3'].includes(resolved);
        const response = await client.complete({ model, temperature: 0, max_tokens: 2048,
          ...(resolved === 'sarvam-105b' ? { reasoning_effort: null } : reasoning ? { reasoning_effort: 'low' } : {}), ...body });
        latencies.push(response.latencyMs);
        if (response.finishReason === 'length') row.budgetLimited++;
        row.promptTokens += response.usage.promptTokens ?? 0;
        row.completionTokens += response.usage.completionTokens ?? 0;
        const cost = estimateSarvamCost(model, response.usage);
        if (cost === null) row.unknownUsage = true;
        else row.estimatedInr += cost;
        return response;
      } catch { row.errors++; row.unknownUsage = true; return null; }
    };
    const smoke = await request({ messages: [{ role: 'user', content: 'Reply with OK.' }] });
    row.responds = Boolean(smoke?.content?.trim());
    let promptPass = 0, formatPass = 0;
    for (let i = 0; i < samples; i++) {
      const response = await request({ messages: [{ role: 'user', content: 'Return only the JSON object {"value":7}, without markdown or explanation.' }] });
      if (validJson(response?.content ?? null)) promptPass++;
    }
    for (let i = 0; i < samples; i++) {
      // Gemma warns against duplicating JSON instructions when response_format is set.
      const response = await request({ response_format: { type: 'json_object' }, messages: [{ role: 'user', content: 'Provide an object with the single property value set to the number 7.' }] });
      if (validJson(response?.content ?? null)) formatPass++;
    }
    row.promptJson = `${promptPass}/${samples}`;
    row.formatJson = `${formatPass}/${samples}`;
    const vision = await request({ messages: [{ role: 'user', content: [
      { type: 'text', text: 'What color is the square at the center? Reply with only the color name.' },
      { type: 'image_url', image_url: { url: imageDataUrl() } },
    ] }] });
    row.image = /^red[.!]?$/i.test(vision?.content?.trim() ?? '');
    const tool = await request({
      messages: [{ role: 'user', content: 'Call record_value once with value set to the integer 7. Do not answer with text.' }],
      tools: [{ type: 'function', function: { name: 'record_value', description: 'Record the requested integer.', parameters: { type: 'object', properties: { value: { type: 'integer' } }, required: ['value'], additionalProperties: false } } }],
      tool_choice: { type: 'function', function: { name: 'record_value' } },
    });
    row.tools = tool?.toolCalls?.length === 1 && tool.toolCalls[0]!.type === 'function'
      && tool.toolCalls[0]!.function.name === 'record_value' && validJson(tool.toolCalls[0]!.function.arguments);
    latencies.sort((a, b) => a - b);
    if (latencies.length) {
      const mid = Math.floor(latencies.length / 2);
      row.medianMs = Math.round(latencies.length % 2 ? latencies[mid]! : (latencies[mid - 1]! + latencies[mid]!) / 2);
    }
    rows.push(row);
  }
  return rows;
}

export async function sarvamProbeMain(): Promise<void> {
  loadSarvamEnv();
  const rows = await probeSarvam(new SarvamClient(), Number(process.env.SARVAM_PROBE_SAMPLES ?? 3));
  console.table(rows.map(row => ({
    model: row.model, listed: row.listed, responds: row.responds ? 'yes' : 'no',
    'JSON prompt': row.promptJson, 'JSON format': row.formatJson,
    image: row.image ? 'yes' : 'no', tools: row.tools ? 'yes' : 'no',
    'median ms': row.medianMs ?? '?', 'in/out tokens': `${row.promptTokens}/${row.completionTokens}${row.unknownUsage ? '+?' : ''}`,
    'est INR': `${row.estimatedInr.toFixed(6)}${row.unknownUsage ? '+?' : ''}`, errors: row.errors, limited: row.budgetLimited,
  })));
  console.log(`Observed successful responses only; INR estimates use ${SARVAM_PRICING_DATE} published rates, not billing data. ? means unavailable; limited counts truncated responses (inconclusive). Capability failures do not stop other tests. No tools are executed.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  sarvamProbeMain().catch(() => {
    // Never print a caught provider exception or environment value.
    console.error('Sarvam probe failed. Check SARVAM_API_KEY, SARVAM_BASE_URL, and SARVAM_PROBE_SAMPLES.');
    process.exitCode = 1;
  });
}
