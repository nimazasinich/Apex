import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  AUTOPILOT_SCHEDULER_DEFAULT_INTERVAL_MS,
  AUTOPILOT_SCHEDULER_MAX_INTERVAL_MS,
  AUTOPILOT_SCHEDULER_MIN_INTERVAL_MS,
  AUTOPILOT_SCHEDULER_VERSION,
  resolveAutopilotSchedulerConfig,
} from '../services/autopilotScheduler';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

describe('Autopilot scheduler — default OFF', () => {
  it('is disabled when no environment flag is present', () => {
    const config = resolveAutopilotSchedulerConfig({});
    expect(config.enabled).toBe(false);
    expect(config.version).toBe(AUTOPILOT_SCHEDULER_VERSION);
    expect(config.disabledReason).toContain('not set');
  });

  it('stays disabled for empty, whitespace, and falsy flag values', () => {
    for (const raw of ['', '   ', '0', 'false', 'no', 'off']) {
      expect(resolveAutopilotSchedulerConfig({ APEX_AUTOPILOT_SCHEDULER: raw }).enabled).toBe(false);
    }
  });

  it('stays disabled for malformed or unrecognized values rather than guessing', () => {
    for (const raw of ['maybe', 'enabled', 'TRUE_ISH', '2', 'null', 'undefined']) {
      const config = resolveAutopilotSchedulerConfig({ APEX_AUTOPILOT_SCHEDULER: raw });
      expect(config.enabled).toBe(false);
      expect(config.disabledReason).toContain('not an opt-in value');
    }
  });

  it('enables only on an explicit recognized opt-in value', () => {
    for (const raw of ['1', 'true', 'TRUE', 'yes', 'on', ' true ']) {
      const config = resolveAutopilotSchedulerConfig({ APEX_AUTOPILOT_SCHEDULER: raw });
      expect(config.enabled).toBe(true);
      expect(config.disabledReason).toBeNull();
    }
  });
});

describe('Autopilot scheduler — bounded controls', () => {
  it('defaults to the same five-minute cadence the client uses', () => {
    expect(resolveAutopilotSchedulerConfig({}).intervalMs).toBe(AUTOPILOT_SCHEDULER_DEFAULT_INTERVAL_MS);
  });

  it('clamps a too-fast interval up to the minimum so a typo cannot hot-loop', () => {
    const config = resolveAutopilotSchedulerConfig({
      APEX_AUTOPILOT_SCHEDULER: 'true',
      APEX_AUTOPILOT_SCHEDULER_INTERVAL_MS: '5',
    });
    expect(config.intervalMs).toBe(AUTOPILOT_SCHEDULER_MIN_INTERVAL_MS);
  });

  it('clamps an excessive interval down to the maximum', () => {
    const config = resolveAutopilotSchedulerConfig({
      APEX_AUTOPILOT_SCHEDULER: 'true',
      APEX_AUTOPILOT_SCHEDULER_INTERVAL_MS: String(90 * 24 * 60 * 60_000),
    });
    expect(config.intervalMs).toBe(AUTOPILOT_SCHEDULER_MAX_INTERVAL_MS);
  });

  it('falls back to the default interval for non-numeric or non-positive input', () => {
    for (const raw of ['abc', '-1', '0', 'NaN', '']) {
      const config = resolveAutopilotSchedulerConfig({
        APEX_AUTOPILOT_SCHEDULER: 'true',
        APEX_AUTOPILOT_SCHEDULER_INTERVAL_MS: raw,
      });
      expect(config.intervalMs).toBe(AUTOPILOT_SCHEDULER_DEFAULT_INTERVAL_MS);
    }
  });

  it('clamps maxContexts into the same 1..8 band the cycle route enforces', () => {
    const high = resolveAutopilotSchedulerConfig({ APEX_AUTOPILOT_SCHEDULER_MAX_CONTEXTS: '99' });
    const low = resolveAutopilotSchedulerConfig({ APEX_AUTOPILOT_SCHEDULER_MAX_CONTEXTS: '-4' });
    expect(high.maxContexts).toBe(8);
    expect(low.maxContexts).toBe(6);
  });

  it('parses, dedupes, and caps the symbol list', () => {
    const config = resolveAutopilotSchedulerConfig({
      APEX_AUTOPILOT_SCHEDULER_SYMBOLS: 'btc-usdt, ETH-USDT ,btc-usdt,SOL-USDT,XRP-USDT,ADA-USDT,DOT-USDT,LINK-USDT',
    });
    expect(config.symbols).toContain('BTC-USDT');
    expect(config.symbols).toContain('ETH-USDT');
    expect(new Set(config.symbols).size).toBe(config.symbols.length);
    expect(config.symbols.length).toBeLessThanOrEqual(6);
  });

  it('defaults to a single BTC-USDT context when no symbols are configured', () => {
    expect(resolveAutopilotSchedulerConfig({}).symbols).toEqual(['BTC-USDT']);
  });
});

describe('Autopilot scheduler — arming behaviour on route registration', () => {
  /** Count timers actually armed while registering the real routes. */
  const countArmedTimers = async (env: Record<string, string | undefined>) => {
    const express = (await import('express')).default;
    const { registerApexNextMarketRoutes } = await import('../services/apexNextMarketRoutes');
    const realSetInterval = globalThis.setInterval;
    const previous = process.env.APEX_AUTOPILOT_SCHEDULER;
    const armed: number[] = [];
    const handles: ReturnType<typeof setInterval>[] = [];
    try {
      if (env.APEX_AUTOPILOT_SCHEDULER === undefined) delete process.env.APEX_AUTOPILOT_SCHEDULER;
      else process.env.APEX_AUTOPILOT_SCHEDULER = env.APEX_AUTOPILOT_SCHEDULER;

      (globalThis as { setInterval: unknown }).setInterval = ((fn: () => void, ms?: number) => {
        armed.push(Number(ms));
        const handle = realSetInterval(fn, 3_600_000);
        handles.push(handle);
        handle.unref?.();
        return handle;
      }) as typeof globalThis.setInterval;

      const handle = registerApexNextMarketRoutes(express());
      handle.stopSmartAutopilotScheduler();
      return armed;
    } finally {
      (globalThis as { setInterval: unknown }).setInterval = realSetInterval;
      for (const h of handles) clearInterval(h);
      if (previous === undefined) delete process.env.APEX_AUTOPILOT_SCHEDULER;
      else process.env.APEX_AUTOPILOT_SCHEDULER = previous;
    }
  };

  it('arms no background loop when the flag is absent', async () => {
    const armed = await countArmedTimers({ APEX_AUTOPILOT_SCHEDULER: undefined });
    expect(armed).toEqual([]);
  }, 15000);

  it('arms no background loop when the flag is explicitly falsy', async () => {
    expect(await countArmedTimers({ APEX_AUTOPILOT_SCHEDULER: 'false' })).toEqual([]);
    expect(await countArmedTimers({ APEX_AUTOPILOT_SCHEDULER: 'maybe' })).toEqual([]);
  });

  it('arms exactly one loop at the default cadence when opted in', async () => {
    const armed = await countArmedTimers({ APEX_AUTOPILOT_SCHEDULER: 'true' });
    expect(armed).toEqual([AUTOPILOT_SCHEDULER_DEFAULT_INTERVAL_MS]);
  });
});

describe('Autopilot scheduler — execution safety', () => {
  it('exposes no execution-authorization surface in its resolved config', () => {
    const config = resolveAutopilotSchedulerConfig({ APEX_AUTOPILOT_SCHEDULER: 'true' });
    const keys = Object.keys(config).join(',');
    expect(keys).not.toMatch(/execution|live|order|authoriz|governor|bypass/i);
  });

  it('drives the shared research-only cycle instead of a parallel code path', () => {
    const routes = read('src/services/apexNextMarketRoutes.ts');
    expect(routes).toContain('const runSmartAutopilotCycle = async (');
    // Both the client route and the scheduler call the same runner.
    expect(routes.match(/await runSmartAutopilotCycle\(controls\)/g)?.length).toBe(2);
    expect(routes).toContain("parseSmartAutopilotControls(req.body, 'CLIENT_REQUEST')");
    expect(routes).toContain("'SERVER_SCHEDULER'");
  });

  it('never arms itself at boot without the explicit opt-in flag', () => {
    const routes = read('src/services/apexNextMarketRoutes.ts');
    expect(routes).toContain('if (schedulerConfig.enabled) {');
    expect(routes).toContain("armSmartAutopilotScheduler('ENV')");
    expect(routes).toContain('resolveAutopilotSchedulerConfig(process.env)');
    // The controller itself starts OFF; only ENV or an operator arms it.
    expect(routes).toContain("createAutopilotControllerState(false, Date.now(), 'NONE')");
  });

  it('prevents overlapping cycles and can be torn down', () => {
    const routes = read('src/services/apexNextMarketRoutes.ts');
    // Single-flight is now owned by the controller phase machine, so the
    // scheduler and the status endpoint cannot disagree about "running".
    expect(routes).toContain('if (isCycleInFlight(autopilotController)) {');
    expect(routes).toContain("dispatchAutopilotEvent({ type: 'CYCLE_SKIPPED'");
    expect(routes).toContain('const stopSmartAutopilotScheduler = (): void => {');
    expect(routes).toContain('return { stopSmartAutopilotScheduler };');
  });

  it('arms at most one background loop even if START is repeated', () => {
    const routes = read('src/services/apexNextMarketRoutes.ts');
    // Idempotent arming is what stops the UI from creating a second timer.
    expect(routes).toContain('if (schedulerTimer) return;');
  });

  it('keeps the hardcoded research/paper-only safety block on every cycle', () => {
    const routes = read('src/services/apexNextMarketRoutes.ts');
    expect(routes).toContain('researchOnly: true');
    expect(routes).toContain('paperOnly: true');
    expect(routes).toContain('executionAuthorized: false');
    expect(routes).toContain('automaticOrderSubmission: false');
    expect(routes).toContain('autonomousLiveExecutionEnabled: false');
    expect(routes).toContain('riskGovernorBypassAllowed: false');
    expect(routes).toContain('manualConfirmationRequired: true');
  });
});
