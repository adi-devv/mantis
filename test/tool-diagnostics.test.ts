import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { diagnoseTrace, diagnosticsReportName, traceFiles } from '../bench/agent/tool-diagnostics.js';

const event = (item: Record<string, unknown>): string => JSON.stringify({ type: 'item.completed', item });

describe('saved-trace tool diagnostics', () => {
  it('keeps a recovered retry out of unresolved failures', () => {
    const trace = [
      event({ id: 'one', type: 'mcp_tool_call', tool: 'click', arguments: { ref: 'save' }, status: 'failed', result: { content: [{ type: 'text', text: 'error: temporary timeout; retry click' }] } }),
      event({ id: 'two', type: 'mcp_tool_call', tool: 'click', arguments: { ref: 'save' }, status: 'completed', result: { content: [{ type: 'text', text: 'Saved.' }] } }),
    ].join('\n');
    const result = diagnoseTrace(trace, 'task--mantis--1.jsonl');
    expect(result.toolErrors.timeout).toEqual({ events: 1, recovered: 1, unresolved: 0 });
    expect(result.stepsAfterLastUsefulObservation).toBe(0);
  });

  it('detects an unrecovered covered-click loop', () => {
    const trace = [
      event({ id: 'one', type: 'mcp_tool_call', tool: 'click', arguments: { x: 10, y: 20 }, status: 'failed', result: { content: [{ type: 'text', text: 'error: click blocked because target is covered' }] } }),
      event({ id: 'two', type: 'mcp_tool_call', tool: 'click', arguments: { x: 10, y: 20 }, status: 'failed', result: { content: [{ type: 'text', text: 'error: click blocked because target is covered' }] } }),
    ].join('\n');
    const result = diagnoseTrace(trace, 'task--screenshot--1.jsonl');
    expect(result.coveredOrBlockedClickLoops).toBe(1);
    expect(result.repeatedIdenticalActions).toBe(1);
    expect(result.toolErrors.covered_or_blocked.unresolved).toBe(2);
  });

  it('uses persisted Sarvam targets and result text, without crediting another click', () => {
    const trace = [
      JSON.stringify({ type: 'sarvam.tool_result', name: 'click', arguments: { ref: '18' }, error: true, resultText: 'error: target is covered', chars: 28 }),
      JSON.stringify({ type: 'sarvam.tool_result', name: 'click', arguments: { ref: '180' }, error: false, resultText: 'opened' }),
      JSON.stringify({ type: 'sarvam.tool_result', name: 'click', arguments: { ref: '18' }, error: false, resultText: 'opened' }),
    ].join('\n');
    expect(diagnoseTrace(trace).toolErrors.covered_or_blocked).toEqual({ events: 1, recovered: 1, unresolved: 0 });
    const unknown = JSON.stringify({ type: 'sarvam.tool_result', name: 'click', error: true, resultText: 'error: target is covered' }) + '\n' + JSON.stringify({ type: 'sarvam.tool_result', name: 'click', arguments: { ref: '18' }, error: false, resultText: 'opened' });
    expect(diagnoseTrace(unknown).toolErrors.covered_or_blocked).toEqual({ events: 1, recovered: 0, unresolved: 1 });
  });

  it('finds traces for saved run names containing a model-version dot', () => {
    const results = mkdtempSync(path.join(os.tmpdir(), 'mantis-traces-'));
    try {
      const run = 'reviewfix-deepseek-v4.1-flash';
      const directory = path.join(results, 'agent-logs', run);
      mkdirSync(directory, { recursive: true });
      const trace = path.join(directory, 'form-subscribe--screenshot--1.jsonl');
      writeFileSync(trace, '{}\n');
      expect(traceFiles(run, results)).toEqual([trace]);
    } finally { rmSync(results, { recursive: true, force: true }); }
  });

  it('keeps dotted run-name suffixes when naming reports', () => {
    expect(diagnosticsReportName('reviewfix-deepseek-v4.1-flash')).toBe('reviewfix-deepseek-v4.1-flash');
    expect(diagnosticsReportName('reviewfix-deepseek-v4.2-flash')).toBe('reviewfix-deepseek-v4.2-flash');
    expect(diagnosticsReportName('reviewfix-deepseek-v4.1-flash.jsonl')).toBe('reviewfix-deepseek-v4.1-flash');
  });
});
