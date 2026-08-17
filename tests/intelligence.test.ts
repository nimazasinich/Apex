import { describe, it, expect } from 'vitest';
import { getSupplementalOrchestrator, initializeSupplementalOrchestrator } from '../src/services/supplementalOrchestrator';
import { NewsAPIProvider } from '../src/services/providers/newsProviders';

describe('supplemental orchestrator', () => {
  it('returns NOT_CONFIGURED at the keyed provider boundary when the API key is missing', async () => {
    const provider = new NewsAPIProvider();
    const news = await provider.fetch('BTCUSDT');
    expect(provider.isConfigured()).toBe(false);
    expect(news.source).toBe('not_configured');
    expect(news.status).toBe('NOT_CONFIGURED');
  });

  it('orchestrator health reports configured flags without exposing values', () => {
    initializeSupplementalOrchestrator({});
    const orchestrator = getSupplementalOrchestrator();
    const status = orchestrator.getProvidersStatus();
    
    expect(status).toHaveProperty('news');
    expect(status).toHaveProperty('sentiment');
    expect(status).toHaveProperty('onchain');
    // ensure health does not include secret values (skip when env token unset/empty)
    const statusStr = JSON.stringify(status);
    const hfToken = process.env.HUGGINGFACE_API_TOKEN?.trim();
    if (hfToken) {
      expect(statusStr).not.toContain(hfToken);
    }
  });
});
