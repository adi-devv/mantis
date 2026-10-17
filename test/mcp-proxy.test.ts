import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { createMcpProxy } from '../bench/agent/mcp-proxy.js';

describe('MCP proxy cancellation', () => {
  it('removes the shared abort listener after every completed harness request', async () => {
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    let buffered = '';
    stdin.setEncoding('utf8');
    stdin.on('data', (chunk: string) => {
      buffered += chunk;
      for (let newline = buffered.indexOf('\n'); newline >= 0; newline = buffered.indexOf('\n')) {
        const line = buffered.slice(0, newline);
        buffered = buffered.slice(newline + 1);
        const request = JSON.parse(line) as { id: string; method: string; params?: { name?: string } };
        if (request.params?.name === 'wait-forever') continue;
        stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { method: request.method } }) + '\n');
      }
    });
    const proxy = createMcpProxy({ stdin, stdout });
    const controller = new AbortController();
    const add = vi.spyOn(controller.signal, 'addEventListener');
    const remove = vi.spyOn(controller.signal, 'removeEventListener');

    for (let index = 0; index < 11; index++) {
      await expect(proxy.call('tools/call', { name: `tool-${index}` }, 1_000, controller.signal)).resolves.toMatchObject({ method: 'tools/call' });
    }

    // One listener for initialize, then one per completed tool call. A finished
    // request must not retain a listener on the long-lived run-level signal.
    expect(add).toHaveBeenCalledTimes(12);
    expect(remove).toHaveBeenCalledTimes(12);

    const abortingController = new AbortController();
    const abortAdd = vi.spyOn(abortingController.signal, 'addEventListener');
    const abortRemove = vi.spyOn(abortingController.signal, 'removeEventListener');
    const waiting = proxy.call('tools/call', { name: 'wait-forever' }, 1_000, abortingController.signal);
    await Promise.resolve(); // let the async proxy register the request before cancellation
    abortingController.abort(new Error('cancel test'));
    await expect(waiting).rejects.toThrow('cancel test');
    expect(abortAdd).toHaveBeenCalledTimes(1);
    expect(abortRemove).toHaveBeenCalledTimes(1);
    proxy.close('test complete');
  });
});
