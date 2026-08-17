import type { Candle } from '../../../types';
import { causalCandleWindow, clampUnit, findConfirmedPivots, pivotsAlternate, type ConfirmedPivot } from './confirmedPivots';

export type HarmonicPatternType = 'GARTLEY' | 'BUTTERFLY' | 'BAT' | 'CRAB' | 'DEEP_CRAB' | 'CYPHER' | 'ABCD';

export interface HarmonicRatios {
  AB_XA: number;
  BC_AB: number;
  CD_BC: number;
  XD_XA: number;
}

export interface HarmonicPatternAnalysis {
  type: HarmonicPatternType;
  direction: 'LONG' | 'SHORT';
  reliability: number;
  confidence: number;
  ratios: HarmonicRatios;
  pivotIndexes: number[];
  confirmedAtIndex: number;
  reasons: string[];
}

export interface HarmonicAnalysis {
  available: boolean;
  patterns: HarmonicPatternAnalysis[];
  reasons: string[];
}

type RatioBand = readonly [number, number];
type RatioSpec = Record<keyof HarmonicRatios, RatioBand>;
const SPECS: Record<Exclude<HarmonicPatternType, 'ABCD'>, RatioSpec> = {
  GARTLEY: { AB_XA: [0.58, 0.66], BC_AB: [0.382, 0.886], CD_BC: [1.13, 1.7], XD_XA: [0.75, 0.82] },
  BUTTERFLY: { AB_XA: [0.75, 0.82], BC_AB: [0.382, 0.886], CD_BC: [1.55, 2.7], XD_XA: [1.2, 1.7] },
  BAT: { AB_XA: [0.35, 0.52], BC_AB: [0.382, 0.886], CD_BC: [1.55, 2.7], XD_XA: [0.84, 0.92] },
  CRAB: { AB_XA: [0.35, 0.66], BC_AB: [0.382, 0.886], CD_BC: [2.45, 3.8], XD_XA: [1.55, 1.7] },
  DEEP_CRAB: { AB_XA: [0.84, 0.92], BC_AB: [0.382, 0.886], CD_BC: [2, 3.8], XD_XA: [1.55, 1.7] },
  CYPHER: { AB_XA: [0.382, 0.618], BC_AB: [1.2, 1.5], CD_BC: [0.7, 0.9], XD_XA: [0.74, 0.82] },
};

export function matchesHarmonicRatios(type: Exclude<HarmonicPatternType, 'ABCD'>, ratios: HarmonicRatios): boolean {
  return (Object.keys(SPECS[type]) as Array<keyof HarmonicRatios>)
    .every((key) => Number.isFinite(ratios[key]) && ratios[key] >= SPECS[type][key][0] && ratios[key] <= SPECS[type][key][1]);
}

function ratioError(value: number, band: RatioBand): number {
  const midpoint = (band[0] + band[1]) / 2;
  const halfWidth = Math.max((band[1] - band[0]) / 2, 1e-12);
  return Math.abs(value - midpoint) / halfWidth;
}

function ratiosFor(pivots: readonly ConfirmedPivot[]): HarmonicRatios | null {
  const [x, a, b, c, d] = pivots;
  const xa = Math.abs(a.price - x.price);
  const ab = Math.abs(b.price - a.price);
  const bc = Math.abs(c.price - b.price);
  const cd = Math.abs(d.price - c.price);
  const xd = Math.abs(d.price - x.price);
  if (Math.min(xa, ab, bc, cd) <= 0) return null;
  const ratios = { AB_XA: ab / xa, BC_AB: bc / ab, CD_BC: cd / bc, XD_XA: xd / xa };
  return Object.values(ratios).every(Number.isFinite) ? ratios : null;
}

function buildPattern(type: Exclude<HarmonicPatternType, 'ABCD'>, pivots: ConfirmedPivot[], ratios: HarmonicRatios): HarmonicPatternAnalysis {
  const errors = (Object.keys(SPECS[type]) as Array<keyof HarmonicRatios>).map((key) => ratioError(ratios[key], SPECS[type][key]));
  const reliability = clampUnit(1 - errors.reduce((sum, value) => sum + value, 0) / errors.length * 0.65);
  const direction = pivots[4].kind === 'LOW' ? 'LONG' : 'SHORT';
  return {
    type,
    direction,
    reliability,
    confidence: reliability,
    ratios,
    pivotIndexes: pivots.map((pivot) => pivot.index),
    confirmedAtIndex: pivots[4].confirmedAtIndex,
    reasons: [`${type.toLowerCase()}_all_ratio_bands_confirmed`, `d_pivot_confirmed_at:${pivots[4].confirmedAtIndex}`],
  };
}

function buildAbcd(pivots: ConfirmedPivot[], ratios: HarmonicRatios): HarmonicPatternAnalysis | null {
  const [x, a, b, c, d] = pivots;
  const ab = Math.abs(b.price - a.price);
  const bc = Math.abs(c.price - b.price);
  const cd = Math.abs(d.price - c.price);
  const symmetry = cd / Math.max(ab, 1e-12);
  if (ratios.BC_AB < 0.382 || ratios.BC_AB > 0.886 || ratios.CD_BC < 1.13 || ratios.CD_BC > 2.618 || symmetry < 0.8 || symmetry > 1.25) return null;
  const error = Math.abs(symmetry - 1) / 0.25;
  const reliability = clampUnit(1 - error * 0.5);
  return {
    type: 'ABCD',
    direction: d.kind === 'LOW' ? 'LONG' : 'SHORT',
    reliability,
    confidence: reliability,
    ratios,
    pivotIndexes: [x, a, b, c, d].map((pivot) => pivot.index),
    confirmedAtIndex: d.confirmedAtIndex,
    reasons: ['abcd_retracement_extension_and_symmetry_confirmed', `d_pivot_confirmed_at:${d.confirmedAtIndex}`],
  };
}

export function analyzeHarmonics(candles: readonly Candle[] | undefined, asOfIndex?: number, left = 3, right = 3): HarmonicAnalysis {
  const window = causalCandleWindow(candles, asOfIndex);
  if (!window.ok) return { available: false, patterns: [], reasons: [window.reason ?? 'invalid_candle_input'] };
  if (window.candles.length < 30) return { available: false, patterns: [], reasons: ['insufficient_confirmed_history'] };
  const pivots = findConfirmedPivots(window.candles, left, right);
  if (pivots.length < 5) return { available: false, patterns: [], reasons: ['too_few_confirmed_pivots'] };

  const patterns: HarmonicPatternAnalysis[] = [];
  for (let start = Math.max(0, pivots.length - 20); start <= pivots.length - 5; start += 1) {
    const sequence = pivots.slice(start, start + 5);
    if (!pivotsAlternate(sequence)) continue;
    const ratios = ratiosFor(sequence);
    if (!ratios) continue;
    const abcd = buildAbcd(sequence, ratios);
    if (abcd) patterns.push(abcd);
    for (const type of Object.keys(SPECS) as Array<Exclude<HarmonicPatternType, 'ABCD'>>) {
      if (matchesHarmonicRatios(type, ratios)) patterns.push(buildPattern(type, sequence, ratios));
    }
  }
  const deduplicated = new Map<string, HarmonicPatternAnalysis>();
  for (const pattern of patterns) {
    const key = `${pattern.type}:${pattern.direction}:${pattern.pivotIndexes.at(-1)}`;
    const prior = deduplicated.get(key);
    if (!prior || pattern.reliability > prior.reliability) deduplicated.set(key, pattern);
  }
  const ordered = [...deduplicated.values()]
    .sort((leftPattern, rightPattern) => rightPattern.reliability - leftPattern.reliability
      || rightPattern.confirmedAtIndex - leftPattern.confirmedAtIndex)
    .slice(0, 5);
  return ordered.length
    ? { available: true, patterns: ordered, reasons: [`confirmed_patterns:${ordered.length}`] }
    : { available: false, patterns: [], reasons: ['no_confirmed_pattern_satisfies_all_ratio_bands'] };
}
