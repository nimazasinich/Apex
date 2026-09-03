import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export type PrivateApiSeedKeyName =
  | 'newsApiKey'
  | 'coinMarketCapKey'
  | 'huggingFaceToken'
  | 'etherscanKey'
  | 'tronScanKey'
  | 'bscScanKey';

export type PrivateApiSeed = {
  schemaVersion: 1;
  source?: string;
  supplemental: Record<
    'newsApiKeys' | 'coinMarketCapKeys' | 'huggingFaceTokens' | 'etherscanKeys' | 'tronScanKeys' | 'bscScanKeys',
    string[]
  >;
  additionalSecrets?: { cryptoCompareKeys?: string[] };
  publicProviders?: Record<string, string[]>;
  corsProxyReferences?: string[];
};

const EMPTY_SEED: PrivateApiSeed = {
  schemaVersion: 1,
  supplemental: {
    newsApiKeys: [],
    coinMarketCapKeys: [],
    huggingFaceTokens: [],
    etherscanKeys: [],
    tronScanKeys: [],
    bscScanKeys: [],
  },
};

function uniqueSecrets(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
}

export function loadBundledPrivateApiSeed(cwd = process.cwd()): PrivateApiSeed {
  const file = path.resolve(cwd, '.apex-private-seed', 'api-provider-seed.json');
  if (!existsSync(file)) return EMPTY_SEED;
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8')) as any;
    return {
      schemaVersion: 1,
      source: typeof raw?.source === 'string' ? raw.source : undefined,
      supplemental: {
        newsApiKeys: uniqueSecrets(raw?.supplemental?.newsApiKeys),
        coinMarketCapKeys: uniqueSecrets(raw?.supplemental?.coinMarketCapKeys),
        huggingFaceTokens: uniqueSecrets(raw?.supplemental?.huggingFaceTokens),
        etherscanKeys: uniqueSecrets(raw?.supplemental?.etherscanKeys),
        tronScanKeys: uniqueSecrets(raw?.supplemental?.tronScanKeys),
        bscScanKeys: uniqueSecrets(raw?.supplemental?.bscScanKeys),
      },
      additionalSecrets: {
        cryptoCompareKeys: uniqueSecrets(raw?.additionalSecrets?.cryptoCompareKeys),
      },
      publicProviders: raw?.publicProviders && typeof raw.publicProviders === 'object'
        ? Object.fromEntries(Object.entries(raw.publicProviders).map(([key, value]) => [key, uniqueSecrets(value)]))
        : undefined,
      corsProxyReferences: uniqueSecrets(raw?.corsProxyReferences),
    };
  } catch {
    return EMPTY_SEED;
  }
}

export function primarySeedKeys(seed: PrivateApiSeed): Record<PrivateApiSeedKeyName, string> {
  return {
    newsApiKey: seed.supplemental.newsApiKeys[0] || '',
    coinMarketCapKey: seed.supplemental.coinMarketCapKeys[0] || '',
    huggingFaceToken: seed.supplemental.huggingFaceTokens[0] || '',
    etherscanKey: seed.supplemental.etherscanKeys[0] || '',
    tronScanKey: seed.supplemental.tronScanKeys[0] || '',
    bscScanKey: seed.supplemental.bscScanKeys[0] || seed.supplemental.etherscanKeys[0] || '',
  };
}

export function reserveSeedKeys(seed: PrivateApiSeed): Record<PrivateApiSeedKeyName, string[]> {
  return {
    newsApiKey: seed.supplemental.newsApiKeys.slice(1),
    coinMarketCapKey: seed.supplemental.coinMarketCapKeys.slice(1),
    huggingFaceToken: seed.supplemental.huggingFaceTokens.slice(1),
    etherscanKey: seed.supplemental.etherscanKeys.slice(1),
    tronScanKey: seed.supplemental.tronScanKeys.slice(1),
    bscScanKey: seed.supplemental.bscScanKeys.length
      ? seed.supplemental.bscScanKeys.slice(1)
      : seed.supplemental.etherscanKeys.slice(1),
  };
}
