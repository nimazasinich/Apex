import { afterEach, describe, expect, it, vi } from 'vitest';

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.resetModules();
});

describe('supplemental orchestrator environment wiring', () => {
  it('prefers BSCSCAN_KEY over ETHERSCAN_KEY for the BscScan provider', async () => {
    process.env.BSCSCAN_KEY = 'test-bsc-key-000';
    process.env.ETHERSCAN_KEY = 'test-eth-key-111';
    vi.resetModules();

    const { getSupplementalOrchestrator } = await import('../services/supplementalOrchestrator');
    const orchestrator = getSupplementalOrchestrator() as unknown as {
      onchainProviders: Array<{ name: string; apiKey?: string }>;
    };

    const bsc = orchestrator.onchainProviders.find((provider) => provider.name === 'BscScan');
    expect(bsc).toBeDefined();
    expect(bsc?.apiKey).toBe('test-bsc-key-000');
    expect(bsc?.apiKey).not.toBe('test-eth-key-111');
  });

  it('deliberately falls back to ETHERSCAN_KEY when BSCSCAN_KEY is absent', async () => {
    delete process.env.BSCSCAN_KEY;
    process.env.ETHERSCAN_KEY = 'test-eth-fallback-222';
    vi.resetModules();

    const { getSupplementalOrchestrator } = await import('../services/supplementalOrchestrator');
    const orchestrator = getSupplementalOrchestrator() as unknown as {
      onchainProviders: Array<{ name: string; apiKey?: string }>;
    };

    const bsc = orchestrator.onchainProviders.find((provider) => provider.name === 'BscScan');
    expect(bsc).toBeDefined();
    expect(bsc?.apiKey).toBe('test-eth-fallback-222');
  });
});
