import crypto from 'node:crypto';
import { buildTabdealCapabilities, deriveConnectionStatus } from './tabdealCapabilities';
import { TabdealFapiClient } from './tabdealFapiClient';
import { TabdealPositionAdapter } from './tabdealPositionAdapter';

export const TABDEAL_SESSION_COOKIE = 'apex_tabdeal_session';
const DEFAULT_TTL_MS = 30 * 60 * 1000;

export interface TabdealReadOnlySession {
  id: string;
  apiKeyHint: string;
  createdAt: number;
  expiresAt: number;
  client: TabdealFapiClient;
  positions: TabdealPositionAdapter;
  lastPublicPingOk: boolean | null;
  lastAccountReadOk: boolean | null;
}

export interface PublicTabdealSessionState {
  connected: boolean;
  apiKeyHint: string | null;
  createdAt: number | null;
  expiresAt: number | null;
  executionStage: 'READ_ONLY';
  status: ReturnType<typeof deriveConnectionStatus>;
  signal: {
    credentialsPresent: boolean;
    lastPublicPingOk: boolean | null;
    lastAccountReadOk: boolean | null;
  };
  safety: {
    readOnly: true;
    automaticVenueFailoverEnabled: false;
    autonomousLiveExecutionEnabled: false;
  };
}

function keyHint(apiKey: string): string {
  if (apiKey.length <= 8) return `${apiKey.slice(0, 2)}…${apiKey.slice(-2)}`;
  return `${apiKey.slice(0, 4)}…${apiKey.slice(-4)}`;
}

function validateCredentials(input: unknown): { apiKey: string; apiSecret: string } {
  const row = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  const apiKey = String(row.apiKey || '').trim();
  const apiSecret = String(row.apiSecret || '').trim();
  if (apiKey.length < 8) throw new Error('invalid_tabdeal_api_key');
  if (apiSecret.length < 8) throw new Error('invalid_tabdeal_api_secret');
  return { apiKey, apiSecret };
}

export class TabdealSessionManager {
  private readonly sessions = new Map<string, TabdealReadOnlySession>();

  constructor(private readonly ttlMs = DEFAULT_TTL_MS) {}

  private prune(now = Date.now()): void {
    for (const [id, session] of this.sessions.entries()) {
      if (session.expiresAt <= now) this.sessions.delete(id);
    }
  }

  async connect(input: unknown): Promise<{ session: TabdealReadOnlySession; snapshot: Awaited<ReturnType<TabdealPositionAdapter['getAccountSnapshot']>> }> {
    this.prune();
    const credentials = validateCredentials(input);
    const capabilities = buildTabdealCapabilities('READ_ONLY');
    const client = new TabdealFapiClient({ credentials, capabilities });
    const positions = new TabdealPositionAdapter(client);

    let lastPublicPingOk = false;
    try {
      await client.ping();
      lastPublicPingOk = true;
    } catch {
      lastPublicPingOk = false;
    }

    // A successful signed account read is the actual credential verification.
    await client.account();
    const snapshot = await positions.getAccountSnapshot();
    const now = Date.now();
    const session: TabdealReadOnlySession = {
      id: crypto.randomUUID(),
      apiKeyHint: keyHint(credentials.apiKey),
      createdAt: now,
      expiresAt: now + this.ttlMs,
      client,
      positions,
      lastPublicPingOk,
      lastAccountReadOk: true,
    };
    this.sessions.set(session.id, session);
    return { session, snapshot };
  }

  get(id: string | null | undefined): TabdealReadOnlySession | null {
    this.prune();
    if (!id) return null;
    return this.sessions.get(id) || null;
  }

  disconnect(id: string | null | undefined): void {
    if (id) this.sessions.delete(id);
  }

  async refresh(session: TabdealReadOnlySession): Promise<void> {
    try {
      await session.client.ping();
      session.lastPublicPingOk = true;
    } catch {
      session.lastPublicPingOk = false;
    }
    try {
      await session.client.account();
      session.lastAccountReadOk = true;
    } catch {
      session.lastAccountReadOk = false;
    }
  }

  publicState(session: TabdealReadOnlySession | null): PublicTabdealSessionState {
    const capabilities = buildTabdealCapabilities('READ_ONLY');
    const signal = {
      credentialsPresent: Boolean(session),
      lastPublicPingOk: session?.lastPublicPingOk ?? null,
      lastAccountReadOk: session?.lastAccountReadOk ?? null,
    };
    return {
      connected: Boolean(session),
      apiKeyHint: session?.apiKeyHint ?? null,
      createdAt: session?.createdAt ?? null,
      expiresAt: session?.expiresAt ?? null,
      executionStage: 'READ_ONLY',
      status: deriveConnectionStatus(capabilities, signal),
      signal,
      safety: {
        readOnly: true,
        automaticVenueFailoverEnabled: false,
        autonomousLiveExecutionEnabled: false,
      },
    };
  }
}
