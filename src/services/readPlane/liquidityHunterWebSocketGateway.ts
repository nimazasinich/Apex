import crypto from 'node:crypto';
import type { IncomingMessage, Server } from 'node:http';
import type { Socket } from 'node:net';
import {
  getLiquidityHunterOperationsSnapshot,
  getLiquidityHunterRuntime,
} from '../liquidityHunter/foundationRuntime';

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const DEFAULT_PATH = '/ws/liquidity-hunter';
const DEFAULT_INTERVAL_MS = 100;
const MAX_CLIENTS = 64;
const MAX_SOCKET_BUFFER = 1024 * 1024;
const MAX_INBOUND_BYTES = 64 * 1024;

export interface LiquidityHunterWebSocketGatewaySnapshot {
  clients: number;
  sequence: number;
  enabled: boolean;
  intervalMs: number;
}

export interface LiquidityHunterWebSocketGateway {
  snapshot(): LiquidityHunterWebSocketGatewaySnapshot;
  close(): Promise<void>;
}

interface ClientState {
  socket: Socket;
  symbol: string;
  lastFingerprint: string;
  lastHeartbeatAt: number;
  sequence: number;
}

function validSymbol(value: string | null): string | null {
  const symbol = String(value || '').trim().toUpperCase();
  return /^[A-Z0-9][A-Z0-9_-]{1,31}$/.test(symbol) ? symbol : null;
}

function isSameOrigin(req: IncomingMessage): boolean {
  const origin = String(req.headers.origin || '').trim();
  if (!origin) return true; // CLI/non-browser clients still receive read-only data.
  const host = String(req.headers.host || '').trim().toLowerCase();
  try {
    const parsed = new URL(origin);
    return parsed.host.toLowerCase() === host;
  } catch {
    return false;
  }
}

function validWebSocketKey(value: string | string[] | undefined): string | null {
  if (typeof value !== 'string') return null;
  try {
    const bytes = Buffer.from(value, 'base64');
    return bytes.length === 16 ? value : null;
  } catch {
    return null;
  }
}

function frame(opcode: number, payload: Buffer): Buffer {
  const length = payload.length;
  let header: Buffer;
  if (length < 126) {
    header = Buffer.allocUnsafe(2);
    header[0] = 0x80 | opcode;
    header[1] = length;
  } else if (length <= 0xffff) {
    header = Buffer.allocUnsafe(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(length, 2);
  } else {
    header = Buffer.allocUnsafe(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(length), 2);
  }
  return Buffer.concat([header, payload]);
}

function textFrame(value: unknown): Buffer {
  return frame(0x1, Buffer.from(JSON.stringify(value), 'utf8'));
}

function closeFrame(code = 1000, reason = ''): Buffer {
  const reasonBuffer = Buffer.from(reason.slice(0, 120), 'utf8');
  const payload = Buffer.allocUnsafe(2 + reasonBuffer.length);
  payload.writeUInt16BE(code, 0);
  reasonBuffer.copy(payload, 2);
  return frame(0x8, payload);
}

function pongFrame(payload: Buffer): Buffer {
  return frame(0xA, payload);
}

function rejectUpgrade(socket: Socket, status: number, reason: string): void {
  const body = `${reason}\n`;
  socket.end(
    `HTTP/1.1 ${status} ${reason}\r\n`
    + 'Connection: close\r\n'
    + 'Content-Type: text/plain; charset=utf-8\r\n'
    + `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`,
  );
}

function readClientFrames(socket: Socket, onClose: () => void): void {
  let buffered = Buffer.alloc(0);
  socket.on('data', (chunk: Buffer) => {
    buffered = Buffer.concat([buffered, chunk]);
    if (buffered.length > MAX_INBOUND_BYTES) {
      socket.end(closeFrame(1009, 'inbound_frame_too_large'));
      return;
    }
    while (buffered.length >= 2) {
      const first = buffered[0];
      const second = buffered[1];
      const fin = Boolean(first & 0x80);
      const rsv = first & 0x70;
      const opcode = first & 0x0f;
      const masked = Boolean(second & 0x80);
      if (rsv !== 0) {
        socket.end(closeFrame(1002, 'reserved_bits_not_supported'));
        return;
      }
      let length = second & 0x7f;
      let offset = 2;
      if (length === 126) {
        if (buffered.length < 4) return;
        length = buffered.readUInt16BE(2);
        offset = 4;
      } else if (length === 127) {
        if (buffered.length < 10) return;
        const big = buffered.readBigUInt64BE(2);
        if (big > BigInt(MAX_INBOUND_BYTES)) {
          socket.end(closeFrame(1009, 'inbound_frame_too_large'));
          return;
        }
        length = Number(big);
        offset = 10;
      }
      if (!masked) {
        socket.end(closeFrame(1002, 'client_frames_must_be_masked'));
        return;
      }
      if ((opcode === 0x8 || opcode === 0x9 || opcode === 0xA) && (!fin || length > 125)) {
        socket.end(closeFrame(1002, 'invalid_control_frame'));
        return;
      }
      if (buffered.length < offset + 4 + length) return;
      const mask = buffered.subarray(offset, offset + 4);
      offset += 4;
      const payload = Buffer.from(buffered.subarray(offset, offset + length));
      for (let index = 0; index < payload.length; index += 1) payload[index] ^= mask[index % 4];
      buffered = buffered.subarray(offset + length);

      if (opcode === 0x8) {
        try { socket.end(closeFrame()); } catch { socket.destroy(); }
        onClose();
        return;
      }
      if (opcode === 0x9) {
        if (socket.writable) socket.write(pongFrame(payload));
        continue;
      }
      if (opcode === 0xA) continue;
      // The channel is intentionally read-only; application messages are not accepted.
      socket.end(closeFrame(1008, 'read_only_channel'));
      onClose();
      return;
    }
  });
}

export function attachLiquidityHunterWebSocketGateway(
  server: Server,
  options: { path?: string; intervalMs?: number } = {},
): LiquidityHunterWebSocketGateway {
  const path = options.path ?? DEFAULT_PATH;
  const intervalMs = Math.max(100, Math.min(1_000, Math.floor(options.intervalMs ?? DEFAULT_INTERVAL_MS)));
  const clients = new Set<ClientState>();
  let sequence = 0;
  let closed = false;

  const removeClient = (client: ClientState) => {
    clients.delete(client);
    try { client.socket.destroy(); } catch { /* best effort */ }
  };

  const onUpgrade = (req: IncomingMessage, socket: Socket) => {
    const runtime = getLiquidityHunterRuntime();
    const flags = runtime?.flags;
    let parsed: URL;
    try { parsed = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`); }
    catch { rejectUpgrade(socket, 400, 'Bad Request'); return; }
    if (parsed.pathname !== path) return;
    if (!runtime || !flags?.liquidityHunterEnabled || !flags.websocketEnabled) {
      rejectUpgrade(socket, 403, 'Liquidity Hunter WebSocket disabled');
      return;
    }
    if (!isSameOrigin(req)) {
      rejectUpgrade(socket, 403, 'Origin not allowed');
      return;
    }
    if (clients.size >= MAX_CLIENTS) {
      rejectUpgrade(socket, 503, 'Client limit reached');
      return;
    }
    const symbol = validSymbol(parsed.searchParams.get('symbol'));
    if (!symbol) {
      rejectUpgrade(socket, 400, 'Valid symbol required');
      return;
    }
    const key = validWebSocketKey(req.headers['sec-websocket-key']);
    const connectionTokens = String(req.headers.connection || '')
      .toLowerCase()
      .split(',')
      .map((token) => token.trim());
    const version = String(req.headers['sec-websocket-version'] || '');
    if (req.method !== 'GET'
      || !key
      || version !== '13'
      || String(req.headers.upgrade || '').toLowerCase() !== 'websocket'
      || !connectionTokens.includes('upgrade')) {
      rejectUpgrade(socket, 400, 'Invalid WebSocket handshake');
      return;
    }
    const accept = crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n'
      + 'Upgrade: websocket\r\n'
      + 'Connection: Upgrade\r\n'
      + `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
    );
    socket.setNoDelay(true);
    const client: ClientState = { socket, symbol, lastFingerprint: '', lastHeartbeatAt: Date.now(), sequence: 0 };
    clients.add(client);
    const cleanup = () => clients.delete(client);
    socket.on('error', cleanup);
    socket.on('close', cleanup);
    readClientFrames(socket, cleanup);

    const initial = {
      type: 'SNAPSHOT',
      channel: 'liquidity-hunter',
      sequence: ++client.sequence,
      generatedAt: Date.now(),
      symbol,
      evaluation: runtime.engine.latestEvaluation(symbol),
      operations: getLiquidityHunterOperationsSnapshot(),
      safety: { shadowOnly: true, authoritative: false, executionAuthorized: false, autonomousLiveExecutionEnabled: false },
    };
    client.lastFingerprint = JSON.stringify({ evaluation: initial.evaluation, operations: initial.operations });
    sequence += 1;
    socket.write(textFrame(initial));
  };

  server.on('upgrade', onUpgrade);

  const timer = setInterval(() => {
    if (closed) return;
    const runtime = getLiquidityHunterRuntime();
    if (!runtime) return;
    const operations = getLiquidityHunterOperationsSnapshot();
    const now = Date.now();
    for (const client of [...clients]) {
      if (!client.socket.writable || client.socket.destroyed) {
        removeClient(client);
        continue;
      }
      if (client.socket.writableLength > MAX_SOCKET_BUFFER) {
        client.socket.write(textFrame({
          type: 'RESYNC_REQUIRED', channel: 'liquidity-hunter', sequence: ++client.sequence,
          generatedAt: now, symbol: client.symbol, reason: 'client_backpressure_snapshot_required',
        }));
        sequence += 1;
        client.socket.end(closeFrame(1013, 'resync_required'));
        removeClient(client);
        continue;
      }
      const evaluation = runtime.engine.latestEvaluation(client.symbol);
      const fingerprint = JSON.stringify({ evaluation, operations });
      if (fingerprint !== client.lastFingerprint) {
        client.lastFingerprint = fingerprint;
        client.socket.write(textFrame({
          type: 'PATCH',
          channel: 'liquidity-hunter',
          sequence: ++client.sequence,
          generatedAt: now,
          symbol: client.symbol,
          evaluation,
          operations,
          safety: { shadowOnly: true, authoritative: false, executionAuthorized: false, autonomousLiveExecutionEnabled: false },
        }));
        sequence += 1;
      } else if (now - client.lastHeartbeatAt >= 10_000) {
        client.lastHeartbeatAt = now;
        client.socket.write(textFrame({
          type: 'HEARTBEAT',
          channel: 'liquidity-hunter',
          sequence: ++client.sequence,
          generatedAt: now,
          symbol: client.symbol,
        }));
        sequence += 1;
      }
    }
  }, intervalMs);
  timer.unref?.();

  return {
    snapshot: () => ({ clients: clients.size, sequence, enabled: !closed, intervalMs }),
    close: async () => {
      if (closed) return;
      closed = true;
      clearInterval(timer);
      server.off('upgrade', onUpgrade);
      for (const client of [...clients]) {
        try { client.socket.end(closeFrame(1001, 'server_shutdown')); } catch { client.socket.destroy(); }
      }
      clients.clear();
    },
  };
}
