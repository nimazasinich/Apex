/**
 * One-off diagnostic: confirm the hf-inference text-classification response
 * shape for batched inputs. Run with: npx tsx scripts/probeIntelHosts.mts
 */

import 'dotenv/config';
import { normalizeProxyUrl } from '../../src/services/proxyFetch';
import { ProxyAgent } from 'undici';

const dispatcher = new ProxyAgent(
  normalizeProxyUrl(process.env.PROXY_POOL_URLS?.split(',')[0] || '127.0.0.1:10808'),
);
const HF = process.env.HUGGING_FACE_TOKEN || '';
const MODEL = 'ProsusAI/finbert';

const cases: Array<{ name: string; body: unknown }> = [
  { name: '3 inputs, top_k=1', body: { inputs: ['Bitcoin rallies hard', 'Exchange hacked, funds stolen', 'Devs publish notes'], parameters: { top_k: 1 } } },
  { name: '1 input, top_k=1', body: { inputs: ['Bitcoin rallies hard'], parameters: { top_k: 1 } } },
  { name: '2 inputs, no top_k', body: { inputs: ['Bitcoin rallies hard', 'Exchange hacked, funds stolen'] } },
];

(async () => {
  for (const c of cases) {
    try {
      const res = await fetch(`https://router.huggingface.co/hf-inference/models/${MODEL}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${HF}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(c.body),
        signal: AbortSignal.timeout(20_000),
        // @ts-ignore undici dispatcher
        dispatcher,
      });
      const text = await res.text();
      console.log(`\n${c.name}\n  status=${res.status}\n  ${text.slice(0, 600)}`);
    } catch (e: any) {
      console.log(`\n${c.name}\n  FAILED ${e?.message}`);
    }
  }
})();
