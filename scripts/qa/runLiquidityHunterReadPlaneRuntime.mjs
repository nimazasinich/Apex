#!/usr/bin/env node
import { loadTypeScript } from './lib/loadTypeScript.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = loadTypeScript();

const root = process.cwd();
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'apex-lh-readplane-'));
fs.symlinkSync(path.join(root, 'node_modules'), path.join(temp, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (entry.isFile() && full.endsWith('.ts') && !full.endsWith('.test.ts')) files.push(full);
  }
  return files;
}
for (const absolute of walk(path.join(root, 'src'))) {
  const file = path.relative(root, absolute);
  const output = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), {
    fileName: file,
    reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, moduleResolution: ts.ModuleResolutionKind.Node10, esModuleInterop: true },
  });
  const errors = (output.diagnostics ?? []).filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
  if (errors.length) throw new Error(`transpile_failed:${file}`);
  const target = path.join(temp, file.replace(/\.ts$/, '.js'));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, output.outputText);
}

const fromTemp = (file) => require(path.join(temp, file));
const { initializeLiquidityHunterFoundation, shutdownLiquidityHunterFoundation } = fromTemp('src/services/liquidityHunter/foundationRuntime.js');
const { attachLiquidityHunterWebSocketGateway } = fromTemp('src/services/readPlane/liquidityHunterWebSocketGateway.js');

const checks = [];
const check = (label, condition) => { const passed = Boolean(condition); checks.push({ label, passed }); console.log(`${passed ? 'PASS' : 'FAIL'} ${label}`); };

async function rawHandshake(port, { version = '13', origin = null } = {}) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    let data = '';
    const timeout = setTimeout(() => { socket.destroy(); reject(new Error('raw_handshake_timeout')); }, 3000);
    socket.on('connect', () => {
      socket.write(
        `GET /ws/liquidity-hunter?symbol=BTC-USDT HTTP/1.1\r\n`
        + `Host: 127.0.0.1:${port}\r\n`
        + `Upgrade: websocket\r\n`
        + `Connection: Upgrade\r\n`
        + `Sec-WebSocket-Version: ${version}\r\n`
        + `Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n`
        + (origin ? `Origin: ${origin}\r\n` : '')
        + `\r\n`,
      );
    });
    socket.on('error', (error) => { clearTimeout(timeout); reject(error); });
    socket.on('data', (chunk) => {
      data += chunk.toString('utf8');
      if (!data.includes('\r\n\r\n')) return;
      clearTimeout(timeout);
      socket.destroy();
      resolve(data);
    });
  });
}

function decodeServerFrame(buffer) {
  if (buffer.length < 2) return null;
  const opcode = buffer[0] & 0x0f;
  let length = buffer[1] & 0x7f;
  let offset = 2;
  if (length === 126) {
    if (buffer.length < 4) return null;
    length = buffer.readUInt16BE(2); offset = 4;
  } else if (length === 127) {
    if (buffer.length < 10) return null;
    length = Number(buffer.readBigUInt64BE(2)); offset = 10;
  }
  if (buffer.length < offset + length) return null;
  return { opcode, payload: buffer.subarray(offset, offset + length), consumed: offset + length };
}

let server;
let gateway;
try {
  initializeLiquidityHunterFoundation({
    APEX_LIQUIDITY_HUNTER_ENABLED: 'true',
    APEX_LIQUIDITY_HUNTER_WS_ENABLED: 'true',
  });
  server = http.createServer((_req, res) => { res.statusCode = 404; res.end(); });
  gateway = attachLiquidityHunterWebSocketGateway(server);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('unexpected_server_address');

  const received = await new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: '127.0.0.1', port: address.port });
    let data = Buffer.alloc(0);
    const timeout = setTimeout(() => { socket.destroy(); reject(new Error('websocket_test_timeout')); }, 3000);
    socket.on('connect', () => {
      socket.write(
        `GET /ws/liquidity-hunter?symbol=BTC-USDT HTTP/1.1\r\n`
        + `Host: 127.0.0.1:${address.port}\r\n`
        + `Upgrade: websocket\r\n`
        + `Connection: Upgrade\r\n`
        + `Sec-WebSocket-Version: 13\r\n`
        + `Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n`,
      );
    });
    socket.on('error', (error) => { clearTimeout(timeout); reject(error); });
    socket.on('data', (chunk) => {
      data = Buffer.concat([data, chunk]);
      const headerEnd = data.indexOf('\r\n\r\n');
      if (headerEnd < 0) return;
      const header = data.subarray(0, headerEnd + 4).toString('utf8');
      const frame = decodeServerFrame(data.subarray(headerEnd + 4));
      if (!frame) return;
      clearTimeout(timeout);
      socket.destroy();
      resolve({ header, frame });
    });
  });

  check('read-plane websocket performs a standards-based upgrade', received.header.includes('101 Switching Protocols') && received.header.includes('Sec-WebSocket-Accept:'));
  check('read-plane first message is an unmasked server text frame', received.frame.opcode === 0x1);
  const payload = JSON.parse(received.frame.payload.toString('utf8'));
  check('initial websocket payload is a sequenced snapshot', payload.type === 'SNAPSHOT' && payload.channel === 'liquidity-hunter' && payload.sequence >= 1 && payload.symbol === 'BTC-USDT');
  check('websocket payload cannot authorize execution', payload.safety?.shadowOnly === true && payload.safety?.authoritative === false && payload.safety?.executionAuthorized === false && payload.safety?.autonomousLiveExecutionEnabled === false);
  check('gateway reports bounded read-plane clients', gateway.snapshot().clients >= 0 && gateway.snapshot().intervalMs >= 100);
  const badVersion = await rawHandshake(address.port, { version: '12' });
  check('read-plane rejects unsupported WebSocket protocol versions', badVersion.includes('400 Invalid WebSocket handshake'));
  const foreignOrigin = await rawHandshake(address.port, { origin: 'https://example.invalid' });
  check('read-plane rejects foreign browser origins', foreignOrigin.includes('403 Origin not allowed'));

  const failures = checks.filter((row) => !row.passed);
  console.log(`\nLiquidity Hunter read-plane runtime: ${checks.length - failures.length}/${checks.length} PASS`);
  process.exitCode = failures.length ? 1 : 0;
} finally {
  await gateway?.close().catch(() => undefined);
  if (server?.listening) await new Promise((resolve) => server.close(resolve));
  await shutdownLiquidityHunterFoundation().catch(() => undefined);
  fs.rmSync(temp, { recursive: true, force: true });
}
