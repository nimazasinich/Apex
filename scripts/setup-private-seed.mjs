#!/usr/bin/env node
/**
 * Setup Private API Seed helper script.
 *
 * Reads an optional uncommitted key file (e.g. api-config.txt, .env, or keys.json)
 * or interactive prompts/environment variables and generates:
 *   .apex-private-seed/api-provider-seed.json
 *
 * Does not embed or expose secrets in version control.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const SEED_DIR = path.resolve(process.cwd(), '.apex-private-seed');
const SEED_FILE = path.join(SEED_DIR, 'api-provider-seed.json');

function extractKey(content, ...patterns) {
  for (const pattern of patterns) {
    const regex = new RegExp(`(?:${pattern})\\s*[:=]\\s*["']?([a-zA-Z0-9_-]+)["']?`, 'i');
    const match = content.match(regex);
    if (match && match[1]) return match[1].trim();
  }
  return '';
}

function parsePotentialKeyFile(filePath) {
  if (!existsSync(filePath)) return null;
  const content = readFileSync(filePath, 'utf8');
  try {
    const parsed = JSON.parse(content);
    if (parsed && typeof parsed === 'object') {
      return {
        newsApiKey: parsed.newsApiKey || parsed.NEWS_API_KEY || parsed.newsdataKey || '',
        coinMarketCapKey: parsed.coinMarketCapKey || parsed.CMC_API_KEY || parsed.coinmarketcapKey || '',
        huggingFaceToken: parsed.huggingFaceToken || parsed.HUGGING_FACE_TOKEN || parsed.hfToken || '',
        etherscanKey: parsed.etherscanKey || parsed.ETHERSCAN_API_KEY || '',
        tronScanKey: parsed.tronScanKey || parsed.TRONSCAN_API_KEY || '',
        bscScanKey: parsed.bscScanKey || parsed.BSCSCAN_API_KEY || parsed.etherscanKey || '',
      };
    }
  } catch {
    // Treat as key-value text lines
  }

  const newsApiKey = extractKey(content, 'NEWS_API_KEY', 'NEWSDATA_KEY', 'newsApiKey', 'Newsdata');
  const coinMarketCapKey = extractKey(content, 'CMC_API_KEY', 'COINMARKETCAP_KEY', 'coinMarketCapKey', 'CoinMarketCap');
  const huggingFaceToken = extractKey(content, 'HUGGING_FACE_TOKEN', 'HF_TOKEN', 'huggingFaceToken', 'HuggingFace');
  const etherscanKey = extractKey(content, 'ETHERSCAN_API_KEY', 'ETHERSCAN_KEY', 'etherscanKey', 'Etherscan');
  const tronScanKey = extractKey(content, 'TRONSCAN_API_KEY', 'TRONSCAN_KEY', 'tronScanKey', 'TronScan');
  const bscScanKey = extractKey(content, 'BSCSCAN_API_KEY', 'BSCSCAN_KEY', 'bscScanKey', 'BscScan') || etherscanKey;

  return {
    newsApiKey,
    coinMarketCapKey,
    huggingFaceToken,
    etherscanKey,
    tronScanKey,
    bscScanKey,
  };
}

function run() {
  console.log('[APEX Seed Setup] Initializing private API seed configuration...');

  // Search candidate key file paths
  const candidateFiles = [
    'api-config-complete.txt',
    'api-config.txt',
    '.env',
    '.env.local',
    '.env.txt',
    'keys.json',
  ];

  let extracted = null;
  for (const candidate of candidateFiles) {
    const resolved = path.resolve(process.cwd(), candidate);
    if (existsSync(resolved)) {
      console.log(`[APEX Seed Setup] Reading credentials from: ${candidate}`);
      extracted = parsePotentialKeyFile(resolved);
      if (extracted) break;
    }
  }

  const newsApiKey = extracted?.newsApiKey || process.env.NEWS_API_KEY || '';
  const coinMarketCapKey = extracted?.coinMarketCapKey || process.env.COINMARKETCAP_KEY || process.env.CMC_API_KEY || '';
  const huggingFaceToken = extracted?.huggingFaceToken || process.env.HUGGING_FACE_TOKEN || '';
  const etherscanKey = extracted?.etherscanKey || process.env.ETHERSCAN_API_KEY || '';
  const tronScanKey = extracted?.tronScanKey || process.env.TRONSCAN_API_KEY || '';
  const bscScanKey = extracted?.bscScanKey || process.env.BSCSCAN_API_KEY || etherscanKey || '';

  const seedPayload = {
    schemaVersion: 1,
    source: 'manual-seed',
    supplemental: {
      newsApiKeys: newsApiKey ? [newsApiKey] : [],
      coinMarketCapKeys: coinMarketCapKey ? [coinMarketCapKey] : [],
      huggingFaceTokens: huggingFaceToken ? [huggingFaceToken] : [],
      etherscanKeys: etherscanKey ? [etherscanKey] : [],
      tronScanKeys: tronScanKey ? [tronScanKey] : [],
      bscScanKeys: bscScanKey ? [bscScanKey] : etherscanKey ? [etherscanKey] : [],
    },
    additionalSecrets: {
      cryptoCompareKeys: [],
    },
    publicProviders: {},
    corsProxyReferences: [],
  };

  if (!existsSync(SEED_DIR)) {
    mkdirSync(SEED_DIR, { recursive: true });
  }

  writeFileSync(SEED_FILE, JSON.stringify(seedPayload, null, 2) + '\n', 'utf8');
  console.log(`[APEX Seed Setup] Successfully wrote private seed to: ${SEED_FILE}`);
  console.log(`[APEX Seed Setup] Configured keys:`, {
    newsApiKeys: seedPayload.supplemental.newsApiKeys.length,
    coinMarketCapKeys: seedPayload.supplemental.coinMarketCapKeys.length,
    huggingFaceTokens: seedPayload.supplemental.huggingFaceTokens.length,
    etherscanKeys: seedPayload.supplemental.etherscanKeys.length,
    tronScanKeys: seedPayload.supplemental.tronScanKeys.length,
    bscScanKeys: seedPayload.supplemental.bscScanKeys.length,
  });
}

run();
