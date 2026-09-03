import type {
  AcademyEvidenceMetadata,
  AcademyRegime,
  AcademyRegimeCompatibility,
  DiscoveredAcademyStrategy,
} from '../types.ts';

const REGIMES: AcademyRegime[] = ['TRENDING', 'RANGE', 'HIGH_VOLATILITY', 'LOW_VOLATILITY', 'LIQUIDITY_EVENT', 'NEWS_DRIVEN'];

function normalizeRegime(value: string): AcademyRegime | null {
  const normalized = value.trim().toLowerCase().replace(/[-\s]+/g, '_');
  if (normalized.includes('trend')) return 'TRENDING';
  if (normalized.includes('range') || normalized.includes('chop') || normalized.includes('sideway')) return 'RANGE';
  if (normalized.includes('high_vol') || normalized.includes('volatile') || normalized.includes('expansion')) return 'HIGH_VOLATILITY';
  if (normalized.includes('low_vol') || normalized.includes('compression') || normalized.includes('quiet')) return 'LOW_VOLATILITY';
  if (normalized.includes('liquidity') || normalized.includes('liquidation')) return 'LIQUIDITY_EVENT';
  if (normalized.includes('news') || normalized.includes('event')) return 'NEWS_DRIVEN';
  return null;
}

export function buildRegimeCompatibility(
  strategy: DiscoveredAcademyStrategy,
  performanceEvidence: AcademyEvidenceMetadata[],
): AcademyRegimeCompatibility[] {
  const snapshot = strategy.performanceEvidenceTrusted ? strategy.latestSnapshot : null;
  const measured = new Set((snapshot?.regimesMeasured ?? []).map(normalizeRegime).filter((value): value is AcademyRegime => value != null));
  const profitable = new Set((snapshot?.regimesProfitable ?? []).map(normalizeRegime).filter((value): value is AcademyRegime => value != null));
  const evidenceIds = performanceEvidence.map((item) => item.evidenceId);

  return REGIMES.map((regime) => {
    if (!measured.has(regime)) {
      return {
        regime,
        state: 'INSUFFICIENT_DATA',
        evidenceIds,
        detail: `No recorded validation slice maps to ${regime}; Academy does not infer compatibility from strategy prose.`,
      };
    }
    if (profitable.has(regime)) {
      return { regime, state: 'SUPPORTED', evidenceIds, detail: `${regime} was measured and profitable in the bound validation evidence.` };
    }
    return { regime, state: 'WEAK', evidenceIds, detail: `${regime} was measured but was not recorded as profitable.` };
  });
}
