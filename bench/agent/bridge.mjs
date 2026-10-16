// stdio <-> TCP bridge: Claude Code launches this as the "MCP server"; it connects to a server
// the eval harness already started and warmed up, so connecting is instant for every tool.
import net from 'node:net';

if (process.argv[2] === '--mantis-server') {
  const { createServer } = await import('../../dist/server.js');
  const { MantisBrowser } = await import('../../dist/browser.js');
  const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');
  const browser = new MantisBrowser();
  const server = createServer(browser);
  server.registerTool('bench_capture', { description: 'Harness-only final viewport capture.', inputSchema: {} }, async () => {
    const page = browser.page;
    if (!page || page.isClosed()) return { content: [{ type: 'text', text: 'No live page to capture.' }], isError: true };
    const png = await page.screenshot({ type: 'png', fullPage: false, scale: 'css' });
    return { content: [{ type: 'image', data: png.toString('base64'), mimeType: 'image/png' }] };
  });
  const close = () => { void browser.close().finally(() => process.exit(0)); };
  process.on('SIGTERM', close);
  process.stdin.on('close', close);
  await server.connect(new StdioServerTransport());
} else {

const socket = net.connect(Number(process.argv[2]), '127.0.0.1');
process.stdin.pipe(socket);
socket.pipe(process.stdout);
socket.on('close', () => process.exit(0));
socket.on('error', () => process.exit(1));
}
