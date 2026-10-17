/**
 * Offline diagnostics for saved agent JSONL traces.  This intentionally reads
 * only files already written by the benchmark: it never opens a browser or
 * contacts a provider.
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface ToolAction {
  step: number;
  name: string;
  arguments: unknown;
  argumentsKnown: boolean;
  error: boolean;
  errorText: string;
  observationChars: number;
  observationImages: number;
}

export interface ErrorCount { events: number; recovered: number; unresolved: number }
export interface TraceDiagnostics {
  run: string;
  approach: string;
  stepsToFinish: number;
  stepsAfterLastUsefulObservation: number;
  repeatedIdenticalActions: number;
  coveredOrBlockedClickLoops: number;
  toolErrors: Record<string, ErrorCount>;
  suspectedMisleadingHints: { step: number; tool: string; suggested: string; laterSucceededWith: string | null }[];
}

type Json = Record<string, unknown>;
const record = (value: unknown): Json => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Json : {};
const textOf = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(textOf).filter(Boolean).join('\n');
  if (value === null || typeof value !== 'object') return '';
  const item = record(value);
  if (item.type === 'text' && typeof item.text === 'string') return item.text;
  return textOf(item.content);
};
const contentStats = (value: unknown): { chars: number; images: number } => {
  if (typeof value === 'string') return { chars: value.length, images: 0 };
  if (Array.isArray(value)) return value.reduce((total, item) => {
    const next = contentStats(item); return { chars: total.chars + next.chars, images: total.images + next.images };
  }, { chars: 0, images: 0 });
  if (value === null || typeof value !== 'object') return { chars: 0, images: 0 };
  const item = record(value);
  if (item.type === 'text' && typeof item.text === 'string') return { chars: item.text.length, images: 0 };
  if (item.type === 'image') return { chars: 0, images: 1 };
  return contentStats(item.content);
};
const stable = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  const item = value as Json;
  return `{${Object.keys(item).sort().map((key) => `${JSON.stringify(key)}:${stable(item[key])}`).join(',')}}`;
};

/** Normalizes the Codex item stream and the smaller Sarvam trace format. */
export function parseTrace(text: string): ToolAction[] {
  const actions: ToolAction[] = [];
  const pending = new Map<string, { name: string; arguments: unknown; argumentsKnown: boolean }>();
  let fallback = 0;
  for (const line of text.split(/\r?\n/)) {
    let event: Json;
    try { event = record(JSON.parse(line)); } catch { continue; }
    const type = typeof event.type === 'string' ? event.type : '';
    if (type === 'item.started' || type === 'item.completed') {
      const item = record(event.item);
      if (item.type !== 'mcp_tool_call') continue;
      const id = typeof item.id === 'string' ? item.id : `item-${fallback++}`;
      const started = pending.get(id);
      const name = typeof item.tool === 'string' ? item.tool : started?.name ?? 'unknown';
      const argumentsKnown = Object.hasOwn(item, 'arguments') || started?.argumentsKnown === true;
      const args = Object.hasOwn(item, 'arguments') ? item.arguments : started?.arguments;
      if (type === 'item.started') { pending.set(id, { name, arguments: args, argumentsKnown }); continue; }
      const result = record(item.result);
      const stats = contentStats(result.content ?? item.content);
      const rendered = textOf(result.content ?? item.content);
      const error = item.status === 'failed' || item.status === 'error' || item.error === true ||
        (item.error !== null && item.error !== undefined && item.error !== false) || result.isError === true || /^\s*(?:tool )?error\s*:/i.test(rendered);
      actions.push({ step: actions.length + 1, name, arguments: args, argumentsKnown, error,
        errorText: textOf(item.error) || rendered, observationChars: stats.chars, observationImages: stats.images });
      pending.delete(id);
      continue;
    }
    if (type === 'sarvam.tool_result' || type === 'sarvam.tool_error') {
      const name = typeof event.name === 'string' ? event.name : 'unknown';
      const error = type === 'sarvam.tool_error' || event.error === true;
      const argumentsKnown = Object.hasOwn(event, 'arguments');
      const resultText = typeof event.resultText === 'string' ? event.resultText : '';
      actions.push({ step: actions.length + 1, name, arguments: event.arguments, argumentsKnown, error,
        errorText: typeof event.error === 'string' ? event.error : resultText, observationChars: typeof event.chars === 'number' ? event.chars : resultText.length,
        observationImages: typeof event.images === 'number' ? event.images : 0 });
    }
  }
  return actions;
}

function errorType(action: ToolAction): string {
  const text = action.errorText.toLowerCase();
  if (/covered|blocked|intercept|obscur|not clickable|pointer events/.test(text)) return 'covered_or_blocked';
  if (/timeout|timed out/.test(text)) return 'timeout';
  if (/malformed|invalid (?:json|argument|parameter)|arguments? must/.test(text)) return 'invalid_arguments';
  if (/not found|no such|unknown (?:element|target)/.test(text)) return 'not_found';
  if (/navigat|page.*closed|context.*closed|browser.*closed/.test(text)) return 'navigation_or_session';
  if (/mcp.*fail|tool failed/.test(text)) return 'mcp_failure';
  return 'tool_error';
}
function suggestedTools(action: ToolAction): string[] {
  const text = action.errorText.toLowerCase();
  const found = new Set<string>();
  const re = /\b(?:try|use|call|then)\s+(?:the\s+)?`?([a-z][a-z0-9_-]*)`?/g;
  for (const match of text.matchAll(re)) {
    const word = match[1]!;
    if (word === 'again' || word === 'another' || word === 'a' || word === 'the') continue;
    found.add(word === 'retry' ? action.name.toLowerCase() : word);
  }
  return [...found].sort();
}
function actionSignature(action: ToolAction): string | null {
  return action.argumentsKnown ? `${action.name}:${stable(action.arguments)}` : null;
}
function approachOf(run: string): string {
  const base = path.basename(run, '.jsonl');
  const match = /--([^-/]+)--\d+(?:--attempt-\d+)?(?:-|$)/.exec(base);
  return match?.[1] ?? 'unknown';
}

export function diagnoseTrace(text: string, run = 'trace.jsonl'): TraceDiagnostics {
  const actions = parseTrace(text);
  const errors: Record<string, ErrorCount> = {};
  const isRecovered = (index: number): boolean => {
    const action = actions[index]!;
    const signature = actionSignature(action);
    // Clicks mutate a specific target. A success elsewhere (or an unknown target)
    // cannot repair the failed click, even if it shares a tool name.
    if (/click|tap|press/.test(action.name)) return signature !== null && actions.slice(index + 1).some((later) => !later.error && actionSignature(later) === signature);
    return actions.slice(index + 1).some((later) => !later.error && (signature ? actionSignature(later) === signature : later.name === action.name));
  };
  for (let index = 0; index < actions.length; index++) {
    const action = actions[index]!;
    if (!action.error) continue;
    const kind = errorType(action);
    const count = errors[kind] ??= { events: 0, recovered: 0, unresolved: 0 };
    count.events++;
    if (isRecovered(index)) count.recovered++; else count.unresolved++;
  }
  let repeated = 0;
  for (let index = 1; index < actions.length; index++) {
    const signature = actionSignature(actions[index]!);
    if (signature && signature === actionSignature(actions[index - 1]!)) repeated++;
  }
  let loops = 0;
  for (let index = 1; index < actions.length; index++) {
    const current = actions[index]!; const previous = actions[index - 1]!;
    if (!current.error || !previous.error || errorType(current) !== 'covered_or_blocked' || errorType(previous) !== 'covered_or_blocked') continue;
    if (/click|tap|press/.test(current.name) && current.name === previous.name) loops++;
  }
  const lastUseful = actions.reduce((last, action, index) => !action.error && (action.observationChars > 0 || action.observationImages > 0) ? index : last, -1);
  const hints: TraceDiagnostics['suspectedMisleadingHints'] = [];
  for (let index = 0; index < actions.length; index++) {
    const action = actions[index]!;
    if (!action.error) continue;
    const later = actions.slice(index + 1).filter((candidate) => !candidate.error);
    for (const suggested of suggestedTools(action)) {
      if (later.length && !later.some((candidate) => candidate.name.toLowerCase() === suggested)) {
        hints.push({ step: action.step, tool: action.name, suggested, laterSucceededWith: later[0]!.name });
      }
    }
  }
  return { run, approach: approachOf(run), stepsToFinish: actions.length,
    stepsAfterLastUsefulObservation: lastUseful < 0 ? actions.length : actions.length - lastUseful - 1,
    repeatedIdenticalActions: repeated, coveredOrBlockedClickLoops: loops, toolErrors: errors, suspectedMisleadingHints: hints };
}

export function markdownReport(runs: readonly TraceDiagnostics[]): string {
  const describeErrors = (errors: Record<string, ErrorCount>): string => Object.entries(errors).sort(([a], [b]) => a.localeCompare(b))
    .map(([kind, count]) => `${kind} ${count.events}/${count.recovered}/${count.unresolved}`).join('; ') || 'none';
  const lines = ['# Tool diagnostics', '', 'Recovered errors are retained as observations but excluded from unresolved failures.', '',
    '## Runs', '', '| Run | Approach | Steps to finish | After last useful observation | Repeated identical actions | Covered/blocked click loops | Error type (events/recovered/unresolved) | Suspected hints |',
    '| --- | --- | ---: | ---: | ---: | ---: | --- | ---: |'];
  for (const run of runs) {
    lines.push(`| ${run.run.replaceAll('|', '\\|')} | ${run.approach} | ${run.stepsToFinish} | ${run.stepsAfterLastUsefulObservation} | ${run.repeatedIdenticalActions} | ${run.coveredOrBlockedClickLoops} | ${describeErrors(run.toolErrors)} | ${run.suspectedMisleadingHints.length} |`);
  }
  const approaches = [...new Set(runs.map((run) => run.approach))].sort();
  lines.push('', '## Approaches', '', '| Approach | Runs | Steps | Repeated actions | Click loops | Error type (events/recovered/unresolved) |', '| --- | ---: | ---: | ---: | ---: | --- |');
  for (const approach of approaches) {
    const selected = runs.filter((run) => run.approach === approach);
    const kinds: Record<string, ErrorCount> = {};
    for (const run of selected) for (const [kind, count] of Object.entries(run.toolErrors)) {
      const total = kinds[kind] ??= { events: 0, recovered: 0, unresolved: 0 };
      total.events += count.events; total.recovered += count.recovered; total.unresolved += count.unresolved;
    }
    const errorSummary = describeErrors(kinds);
    lines.push(`| ${approach} | ${selected.length} | ${selected.reduce((sum, run) => sum + run.stepsToFinish, 0)} | ${selected.reduce((sum, run) => sum + run.repeatedIdenticalActions, 0)} | ${selected.reduce((sum, run) => sum + run.coveredOrBlockedClickLoops, 0)} | ${errorSummary} |`);
  }
  const hints = runs.flatMap((run) => run.suspectedMisleadingHints.map((hint) => ({ run: run.run, ...hint })));
  if (hints.length) {
    lines.push('', '## Suspected misleading hints', '', '| Run | Step | Error tool | Suggested recovery | Later successful tool |', '| --- | ---: | --- | --- | --- |');
    for (const hint of hints) lines.push(`| ${hint.run.replaceAll('|', '\\|')} | ${hint.step} | ${hint.tool} | ${hint.suggested} | ${hint.laterSucceededWith ?? 'none'} |`);
  }
  return `${lines.join('\n')}\n`;
}

export function traceFiles(input: string, resultsRoot = path.resolve(import.meta.dirname, '..', 'results')): string[] {
  if (input.endsWith('.jsonl') && existsSync(input)) return [input];
  if (existsSync(input) && statSync(input).isDirectory()) return readdirSync(input, { recursive: true }).map(String).filter((file) => file.endsWith('.jsonl')).map((file) => path.join(input, file));
  const named = path.join(resultsRoot, 'agent-logs', input);
  if (existsSync(named)) return traceFiles(named);
  throw new Error(`No saved trace directory or .jsonl trace found for ${JSON.stringify(input)}.`);
}
/** Keeps version dots in saved run names; only a trace-file extension is removed. */
export const diagnosticsReportName = (input: string): string => path.basename(input).replace(/\.jsonl$/i, '');
function main(): void {
  const input = process.argv[2] ?? process.env.TOOL_DIAGNOSTICS_IN ?? process.env.AGENT_IN;
  if (!input) throw new Error('Pass a result name or trace path, or set TOOL_DIAGNOSTICS_IN.');
  const files = traceFiles(input);
  const runs = files.sort().map((file) => diagnoseTrace(readFileSync(file, 'utf8'), path.relative(path.resolve(import.meta.dirname, '..', 'results', 'agent-logs'), file)));
  const results = path.resolve(import.meta.dirname, '..', 'results');
  const name = diagnosticsReportName(input);
  const stem = process.env.TOOL_DIAGNOSTICS_OUT ?? `${name}-tool-diagnostics`;
  writeFileSync(path.join(results, `${stem}.json`), JSON.stringify({ runs }, null, 2) + '\n');
  writeFileSync(path.join(results, `${stem}.md`), markdownReport(runs));
  console.log(`[tool-diagnostics] wrote bench/results/${stem}.{json,md} for ${runs.length} trace(s)`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
