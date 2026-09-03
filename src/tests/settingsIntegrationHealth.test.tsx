import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { IntegrationHealthHistory } from '../services/integrationHealthHistory';
import { proxyProbeRouteKinds } from '../services/proxyFetch';
import { ProxySettingsPanel } from '../components/ProxySettingsPanel';
import { TelegramSettingsPanel } from '../components/TelegramSettingsPanel';
import { persistTelegramConfigUpdate } from '../services/telegramConfigPersistence';

describe('Settings integration health contracts', () => {
  it('keeps a bounded, newest-first, secret-free health history', () => {
    const history = new IntegrationHealthHistory(2);
    history.record({ checkedAt: 1, state: 'DISCONNECTED', latencyMs: 20, route: 'proxy', summary: 'first failure' });
    history.record({ checkedAt: 2, state: 'DEGRADED', latencyMs: 15, route: 'mixed', summary: 'partial recovery' });
    history.record({ checkedAt: 3, state: 'CONNECTED', latencyMs: 10, route: 'direct', summary: 'healthy' });
    expect(history.list().map((row) => row.checkedAt)).toEqual([3, 2]);
    expect(history.latest()).toMatchObject({ state: 'CONNECTED', summary: 'healthy' });
  });

  it('preserves proxy routing safety while testing an unsaved draft', () => {
    expect(proxyProbeRouteKinds({ mode: 'off', type: 'socks5', address: '' })).toEqual(['direct']);
    expect(proxyProbeRouteKinds({ mode: 'manual', type: 'socks5', address: '127.0.0.1:10808' })).toEqual(['proxy']);
    expect(proxyProbeRouteKinds({ mode: 'auto', type: 'socks5', address: '' })[0]).toBe('direct');
    expect(() => proxyProbeRouteKinds({ mode: 'manual', type: 'socks5', address: '' })).toThrow(/requires a proxy address/i);
    expect(() => proxyProbeRouteKinds({ mode: 'manual', type: 'http', address: 'http://user:pass@127.0.0.1:8080' })).toThrow(/without credentials/i);
  });

  it('renders explicit loading affordances instead of optimistic connected state', () => {
    const proxy = renderToStaticMarkup(<ProxySettingsPanel />);
    const telegram = renderToStaticMarkup(<TelegramSettingsPanel />);
    expect(proxy).toContain('Loading proxy status');
    expect(proxy).toContain('UNTESTED');
    expect(proxy).not.toContain('CONNECTED');
    expect(telegram).toContain('Loading Telegram status');
    expect(telegram).toContain('CHECKING');
    expect(telegram).not.toContain('CONNECTED');
  });

  it('does not activate a Telegram draft when durable persistence fails', () => {
    const current = { botToken: 'old-token', chatId: 'old-chat', enabled: false };
    expect(() => persistTelegramConfigUpdate(current, { botToken: 'new-token', enabled: true }, () => {
      throw new Error('disk unavailable');
    })).toThrow('disk unavailable');
    expect(current).toEqual({ botToken: 'old-token', chatId: 'old-chat', enabled: false });

    const next = persistTelegramConfigUpdate(current, { botToken: 'new-token', enabled: true }, () => undefined);
    expect(next).toEqual({ botToken: 'new-token', chatId: 'old-chat', enabled: true });
  });
});
