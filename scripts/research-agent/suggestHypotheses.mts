/**
 * APEX Research Agent — hypothesis suggestions.
 *
 * Prints candidate strategy directions not yet represented in
 * study-queue.json / promotion-ledger.json, drawn from a small fixed
 * library of well-known futures/perp signal *categories* below. These are
 * deliberately NOT presented as verified findings or citations. Every
 * suggestion here is a conceptual research direction, explicitly flagged as
 * "needs its own literature check", not a claim that it works.
 *
 * This script never writes to promotion-ledger.json, never runs anything,
 * and never opens the holdout. With --scaffold <n> it will call the same
 * scaffolding logic as scaffoldStudy.mts for suggestion #n — which itself
 * only ever produces a "draft" queue entry, never "queued".
 *
 * Run with:
 *   npx tsx scripts/research-agent/suggestHypotheses.mts
 *   npx tsx scripts/research-agent/suggestHypotheses.mts --count 8
 *   npx tsx scripts/research-agent/suggestHypotheses.mts --scaffold 2
 */
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { renderStudyTemplate } from './lib/studyTemplate.mts';

const root = path.resolve(import.meta.dirname, '../..');
const agentDir = path.join(root, 'scripts/research-agent');
const queuePath = path.join(agentDir, 'study-queue.json');
const ledgerPath = path.join(agentDir, 'promotion-ledger.json');
const researchDir = path.join(root, 'scripts/research');

interface Suggestion {
  slugFamily: string; // used for duplicate-detection matching against existing ids/hypotheses
  studyName: string; // PascalCase, for the scaffold filename
  title: string;
  rationale: string;
  dataNeeded: string;
  controlArmNote: string;
}

// Fixed library of signal *categories*, not verified strategies. Order is
// roughly "further from what's already been tried" first, but that's a
// weak heuristic, not a ranking of quality.
const LIBRARY: Suggestion[] = [
  {
    slugFamily: 'funding-carry',
    studyName: 'FundingCarry',
    title: 'Cross-sectional funding-rate carry (go short richest funding, long cheapest)',
    rationale: 'Carry effects are a well-studied category across many futures markets generally; whether perpetual funding carry survives realistic costs and crypto-specific funding-reset mechanics on APEX\'s instrument set is exactly what a literature check + walk-forward would need to establish — do not treat this as pre-validated.',
    dataNeeded: 'Funding rate history across APEX\'s tradable perpetuals, realistic taker/maker fee + funding-payment accounting',
    controlArmNote: 'Control arm: equal-weight basket with no funding-based ranking, to isolate whether the *ranking* by funding adds anything beyond generic exposure',
  },
  {
    slugFamily: 'basis-momentum',
    studyName: 'BasisMomentum',
    title: 'Perpetual-vs-spot (or perp-vs-index) basis momentum, not just level',
    rationale: 'Tests the *rate of change* of basis rather than its level. It is an unverified signal shape and needs a literature check plus its own walk-forward evidence before any trust is warranted.',
    dataNeeded: 'Timestamp-aligned perpetual-vs-spot or perpetual-vs-index basis history; do not synthesize a basis series when the historical leg is unavailable',
    controlArmNote: 'Control arm: same signal computed on randomly-shuffled basis series, to check the edge isn\'t an artifact of basis being autocorrelated with price itself',
  },
  {
    slugFamily: 'liquidation-cascade-reversal',
    studyName: 'LiquidationCascadeReversal',
    title: 'Post-cascade mean reversion after large liquidation events',
    rationale: 'Tests whether large liquidation cascades are followed by measurable overshoot-and-reversion rather than assuming a breakout continuation. Treat it as a separate hypothesis with its own controls.',
    dataNeeded: 'Historical liquidation events aligned to OHLCV; OI may be used only where genuine timestamp-aligned history exists',
    controlArmNote: 'Control arm: mean-reversion entries at random (non-cascade) points, to isolate whether the cascade *timing* itself is informative or reversion just happens generically',
  },
  {
    slugFamily: 'session-seasonality',
    studyName: 'SessionSeasonality',
    title: 'Intraday/session-of-day and day-of-week return or volatility seasonality',
    rationale: 'Purely mechanical/data-driven direction — no signal-processing sophistication required, just conditioning existing strategies (or a standalone filter) on session/day patterns measured directly from APEX\'s own OHLCV history. Lowest-effort direction to falsify quickly.',
    dataNeeded: 'Existing OHLCV history only — no new data source',
    controlArmNote: 'Control arm: same test on a shuffled-calendar version of the same data, to rule out that any measured seasonality is a multiple-testing artifact from scanning many hour/day buckets',
  },
  {
    slugFamily: 'orderbook-imbalance-persistence',
    studyName: 'OrderbookImbalancePersistence',
    title: 'Short-horizon order-book imbalance persistence as an isolated measurement',
    rationale: 'APEX contains order-book-imbalance concepts, but this suggestion makes no claim that a dedicated historical edge has already been established. Isolate the signal and test it directly instead of inheriting assumptions from runtime scoring.',
    dataNeeded: 'Timestamp-aligned L1/L2 snapshots with verified historical coverage. If only live snapshots exist, this candidate is blocked rather than backfilled or fabricated',
    controlArmNote: 'Control arm: same entry logic with the imbalance signal replaced by a random sign, to isolate whether imbalance direction itself carries information',
  },
  {
    slugFamily: 'volatility-risk-premium',
    studyName: 'VolatilityRiskPremium',
    title: 'Realized-vs-implied (or realized-vs-recent-realized) volatility risk premium proxy',
    rationale: 'A generically well-known category in derivatives markets broadly; APEX is futures-only with no options data, so this would have to be proxied via realized-vol regimes rather than true implied vol — a meaningfully different (and weaker-evidence) version of the idea than the options-market literature it borrows the name from. Flag this proxy gap explicitly in any writeup.',
    dataNeeded: 'OHLCV only, no new data source, but the proxy nature should be treated as a real limitation, not a footnote',
    controlArmNote: 'Control arm: fixed-vol-target sizing with no regime conditioning, to isolate whether the regime signal adds anything beyond generic vol-targeting',
  },
];

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ');
}

interface ExistingContext {
  ids: string[];
  hypotheses: string[];
}

function loadExistingContext(): ExistingContext {
  const ids: string[] = [];
  const hypotheses: string[] = [];
  for (const p of [queuePath, ledgerPath]) {
    if (!existsSync(p)) continue;
    try {
      const raw = JSON.parse(readFileSync(p, 'utf8'));
      const list = raw.studies ?? raw.candidates ?? [];
      for (const entry of list) {
        if (typeof entry.id === 'string') ids.push(entry.id);
        if (typeof entry.hypothesis === 'string') hypotheses.push(entry.hypothesis);
        if (typeof entry.reason === 'string') hypotheses.push(entry.reason);
      }
    } catch {
      // Ignore unreadable files — worst case we suggest something already tried, human will notice.
    }
  }
  return { ids, hypotheses };
}

function alreadyCovered(s: Suggestion, ctx: ExistingContext): boolean {
  const haystack = normalize([...ctx.ids, ...ctx.hypotheses].join(' '));
  const needle = normalize(s.slugFamily).replace(/ /g, '');
  // Loose substring check on the de-spaced family slug — good enough to
  // avoid re-suggesting an exact family that's already an id or clearly
  // named in a hypothesis, without claiming any stronger precision than that.
  return haystack.replace(/ /g, '').includes(needle);
}

function parseArgs(): { count: number; scaffoldIndex: number | null } {
  const args = process.argv.slice(2);
  let count = 5;
  let scaffoldIndex: number | null = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--count') count = Number(args[++i]) || 5;
    if (args[i] === '--scaffold') scaffoldIndex = Number(args[++i]);
  }
  return { count, scaffoldIndex };
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function main(): void {
  const { count, scaffoldIndex } = parseArgs();
  const ctx = loadExistingContext();
  const fresh = LIBRARY.filter((s) => !alreadyCovered(s, ctx)).slice(0, count);

  if (fresh.length === 0) {
    console.log('[research-agent] Every direction in the current suggestion library already appears to be covered by an existing id/hypothesis. Nothing new to suggest — this library is intentionally small and fixed, not a generator.');
    return;
  }

  console.log(`APEX Research Agent — ${fresh.length} untried direction${fresh.length === 1 ? '' : 's'} (conceptual only — none of these are verified findings; run your own literature check before writing a study)\n`);
  fresh.forEach((s, i) => {
    console.log(`[${i}] ${s.title}`);
    console.log(`    rationale: ${s.rationale}`);
    console.log(`    data needed: ${s.dataNeeded}`);
    console.log(`    ${s.controlArmNote}`);
    console.log('');
  });
  console.log('To turn one of these into a draft study + queue entry:');
  console.log('  npx tsx scripts/research-agent/suggestHypotheses.mts --scaffold <index>');

  if (scaffoldIndex === null) return;
  const chosen = fresh[scaffoldIndex];
  if (!chosen) {
    console.error(`\n[BLOCKED] --scaffold ${scaffoldIndex} is out of range (0..${fresh.length - 1}).`);
    process.exit(1);
  }

  const id = `candidate-${slugify(chosen.title).split('-').slice(0, 4).join('-')}`;
  const scriptRelPath = `scripts/research/run${chosen.studyName}Study.mts`;
  const scriptAbsPath = path.join(root, scriptRelPath);

  if (existsSync(scriptAbsPath)) {
    console.error(`\n[BLOCKED] ${scriptRelPath} already exists — not overwriting. Use scaffoldStudy.mts directly with a different --name if you want another copy.`);
    process.exit(1);
  }

  mkdirSync(researchDir, { recursive: true });
  writeFileSync(scriptAbsPath, renderStudyTemplate({ id, hypothesis: chosen.title, studyName: chosen.studyName }), 'utf8');
  console.log(`\n[research-agent] Wrote scaffold: ${scriptRelPath}`);

  if (existsSync(queuePath)) {
    const queue = JSON.parse(readFileSync(queuePath, 'utf8'));
    if (Array.isArray(queue.studies) && !queue.studies.some((s: { id: string }) => s.id === id)) {
      queue.studies.push({ id, script: scriptRelPath, hypothesis: chosen.title, status: 'draft' });
      writeFileSync(queuePath, JSON.stringify(queue, null, 2) + '\n', 'utf8');
      console.log(`[research-agent] Added "draft" entry "${id}" to study-queue.json (status: draft, not queued — fill in runStudy() first).`);
    }
  }
}

main();
