/**
 * Line-framed proxy between the agent's MCP connections (TCP sockets, via bridge.mjs) and an MCP server child
 * speaking newline-delimited JSON-RPC on stdio. Besides forwarding, it gives the eval harness its own channel to
 * the same server: `call()` writes requests with `__bench_<n>` ids and consumes their responses, so the agent never
 * sees them, and `onToolResult()` reports each agent tool call once its response has been forwarded. Whole lines
 * only, so a harness line never lands in the middle of an agent line. The agent's `initialize` is never repeated;
 * the harness initializes the server itself only if the agent never did.
 */
import type { Readable, Writable } from 'node:stream';
import type net from 'node:net';

const HARNESS_PREFIX = '__bench_';

export interface McpProxy {
  /** Route one agent connection through the proxy. */
  attach(socket: net.Socket): void;
  /** Harness-only JSON-RPC request; resolves with `result`, rejects on an error response or timeout. */
  call(method: string, params: object, timeoutMs?: number): Promise<any>;
  /** Called after an agent tools/call response has been forwarded, with the number of agent tool calls completed. */
  onToolResult(callback: (count: number) => void): void;
  /** Reject the harness requests still waiting (the server is going away). */
  close(reason: string): void;
}

function lineSplitter(onLine: (line: string) => void): (chunk: string) => void {
  let buffer = '';
  return (chunk) => {
    buffer += chunk;
    for (let end = buffer.indexOf('\n'); end >= 0; end = buffer.indexOf('\n')) {
      const line = buffer.slice(0, end);
      buffer = buffer.slice(end + 1);
      onLine(line);
    }
  };
}

function parseLine(line: string): Record<string, any> | null {
  if (!line.trimStart().startsWith('{')) return null;
  try { const value: unknown = JSON.parse(line); return value && typeof value === 'object' ? value as Record<string, any> : null; } catch { return null; }
}

export function createMcpProxy(child: { stdin: Writable; stdout: Readable }): McpProxy {
  const sockets = new Set<net.Socket>();
  /** Ids of the agent's tools/call requests still unanswered, per connection. */
  const agentCalls = new Map<net.Socket, Set<string>>();
  const pending = new Map<string, { resolve: (value: any) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  const listeners: ((count: number) => void)[] = [];
  let agentInitialized = false;
  let harnessReady: Promise<void> | null = null;
  let completed = 0;
  let nextId = 0;

  const send = (message: object): void => { child.stdin.write(JSON.stringify(message) + '\n'); };
  const request = (method: string, params: object, timeoutMs: number): Promise<any> => new Promise((resolve, reject) => {
    const id = `${HARNESS_PREFIX}${++nextId}`;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out after ${timeoutMs} ms`)); }, timeoutMs);
    pending.set(id, { resolve, reject, timer });
    try { send({ jsonrpc: '2.0', id, method, params }); } catch (error) { clearTimeout(timer); pending.delete(id); reject(error as Error); }
  });

  child.stdout.setEncoding('utf8');
  child.stdout.on('data', lineSplitter((line) => {
    const message = parseLine(line);
    if (message && typeof message.id === 'string' && message.id.startsWith(HARNESS_PREFIX) && message.method === undefined) {
      const waiting = pending.get(message.id);
      if (!waiting) return; // a late answer to a request that timed out
      pending.delete(message.id);
      clearTimeout(waiting.timer);
      if (message.error) waiting.reject(new Error(message.error.message ?? 'MCP error'));
      else waiting.resolve(message.result);
      return;
    }
    for (const socket of sockets) socket.write(line + '\n');
    if (message && message.method === undefined && message.id !== undefined && ('result' in message || 'error' in message)) {
      const key = JSON.stringify(message.id);
      for (const calls of agentCalls.values()) {
        if (!calls.delete(key)) continue;
        completed++;
        for (const listener of listeners) { try { listener(completed); } catch { /* a harness hook must not break forwarding */ } }
        break;
      }
    }
  }));

  return {
    attach(socket) {
      sockets.add(socket);
      agentCalls.set(socket, new Set());
      socket.setEncoding('utf8');
      socket.on('error', () => { /* MCP clients can disconnect while the child remains healthy */ });
      socket.on('close', () => { sockets.delete(socket); agentCalls.delete(socket); });
      socket.on('data', lineSplitter((line) => {
        const message = parseLine(line);
        if (message?.method === 'initialize') agentInitialized = true;
        if (message?.method === 'tools/call' && message.id !== undefined) agentCalls.get(socket)?.add(JSON.stringify(message.id));
        child.stdin.write(line + '\n');
      }));
    },
    async call(method, params, timeoutMs = 15_000) {
      if (!agentInitialized) {
        harnessReady ??= request('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'bench-capture', version: '1.0' } }, timeoutMs)
          .then(() => send({ jsonrpc: '2.0', method: 'notifications/initialized' }))
          .catch((error) => { harnessReady = null; throw error; });
        await harnessReady;
      }
      return request(method, params, timeoutMs);
    },
    onToolResult(callback) { listeners.push(callback); },
    close(reason) {
      for (const [id, waiting] of pending) { clearTimeout(waiting.timer); waiting.reject(new Error(reason)); pending.delete(id); }
    },
  };
}
