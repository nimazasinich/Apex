#!/usr/bin/env node
import assert from 'node:assert/strict';
import { classifyMarketDataEnvironment } from './lib/classifyMarketDataEnvironment.mjs';

const base = { server: 'ok', health: { server: { status: 'READY' }, kucoinCore: { status: 'UNAVAILABLE' }, binanceSentiment: { status: 'UNAVAILABLE' } } };
assert.equal(classifyMarketDataEnvironment({ ...base, health: { ...base.health, kucoinCore: { status: 'READY' } }, exchangeConnectivity: {} }).disposition, 'RUN');
assert.equal(classifyMarketDataEnvironment({ ...base, exchangeConnectivity: { kucoin: { ticker: { ok: false, status: 403, reason: 'forbidden' } }, binance: { exchangeInfo: { ok: false, status: 0, message: 'fetch failed timeout' } } } }).disposition, 'SKIP_ELIGIBLE');
assert.equal(classifyMarketDataEnvironment({ ...base, exchangeConnectivity: { kucoin: { ticker: { ok: false, status: 422, reason: 'invalid_payload_shape' } }, binance: { exchangeInfo: { ok: false, status: 422, reason: 'semantic_contract_error' } } } }).disposition, 'ASSERT_LOGIC');
console.log('PASS Autopilot lifecycle environment classifier: RUN / SKIP_ELIGIBLE / ASSERT_LOGIC are distinct.');
