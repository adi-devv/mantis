// stdio <-> TCP bridge: Claude Code launches this as the "MCP server"; it connects to a server
// the eval harness already started and warmed up, so connecting is instant for every tool.
import net from 'node:net';

const socket = net.connect(Number(process.argv[2]), '127.0.0.1');
process.stdin.pipe(socket);
socket.pipe(process.stdout);
socket.on('close', () => process.exit(0));
socket.on('error', () => process.exit(1));
