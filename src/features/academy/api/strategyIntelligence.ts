import type {
  AcademyConsumer,
  AcademyConsumerIntelligence,
  AcademyIntelligenceResolution,
  AcademyRegime,
  AcademyStrategyRecord,
} from '../types.ts';

export function buildAcademyConsumerIntelligence(
  record: AcademyStrategyRecord,
  consumer: AcademyConsumer,
  regime: AcademyRegime | null = null,
  now = Date.now(),
): AcademyConsumerIntelligence {
  const compatibility = regime ? record.regimeCompatibility.find((entry) => entry.regime === regime) ?? null : null;
  const state = record.lifecycle === 'RETIRED'
    ? 'BLOCKED'
    : record.lifecycle === 'SHADOW' || record.lifecycle === 'LIVE_ELIGIBLE'
      ? 'VALIDATED_SHADOW'
      : record.latestEvaluation.overall === 'NOT_EVALUATED'
        ? 'NOT_EVALUATED'
        : 'INSUFFICIENT_DATA';
  return {
    strategyId: record.strategyId,
    strategyVersion: record.version,
    recordId: `${record.strategyId}@${record.version}`,
    consumer,
    lifecycle: record.lifecycle,
    state,
    regime,
    regimeCompatibility: compatibility?.state ?? null,
    confidenceScore: record.latestEvaluation.confidenceScore,
    evidenceIds: record.evidenceHistory.map((item) => item.evidenceId),
    blockers: [...record.latestEvaluation.blockers],
    generatedAt: now,
    authority: 'ADVISORY_AND_SAFETY_GATE_ONLY',
    executionAuthorized: false,
  };
}

export function academyScannerGate(intelligence?: AcademyConsumerIntelligence | null): { allowed: boolean; code?: 'ACADEMY_INTELLIGENCE_BLOCKED'; detail?: string } {
  if (!intelligence) return { allowed: true };
  if (intelligence.state !== 'VALIDATED_SHADOW') {
    return { allowed: false, code: 'ACADEMY_INTELLIGENCE_BLOCKED', detail: `Academy ${intelligence.strategyId}@${intelligence.strategyVersion} state is ${intelligence.state}; validated shadow evidence is required when Academy intelligence is supplied.` };
  }
  if (intelligence.regimeCompatibility === 'WEAK' || intelligence.regimeCompatibility === 'INSUFFICIENT_DATA') {
    return { allowed: false, code: 'ACADEMY_INTELLIGENCE_BLOCKED', detail: `Academy regime compatibility is ${intelligence.regimeCompatibility}.` };
  }
  return { allowed: true };
}

export function academyResolutionScannerGate(
  resolution: AcademyIntelligenceResolution | null | undefined,
  isStrategySpecific = false,
): { allowed: boolean; code?: 'ACADEMY_INTELLIGENCE_BLOCKED'; detail?: string } {
  if (!resolution) {
    if (isStrategySpecific) {
      return { allowed: false, code: 'ACADEMY_INTELLIGENCE_BLOCKED', detail: 'Strategy-specific scanner evaluation requires exact Academy intelligence resolution; none supplied.' };
    }
    return { allowed: true };
  }

  if (resolution.status === 'NOT_APPLICABLE') {
    return { allowed: true };
  }

  if (resolution.status === 'VERSION_MISMATCH' || resolution.status === 'STRATEGY_NOT_FOUND' || resolution.status === 'STORE_UNAVAILABLE') {
    return { allowed: false, code: 'ACADEMY_INTELLIGENCE_BLOCKED', detail: `Academy scanner gate failed closed: ${resolution.detail}` };
  }

  if (resolution.status === 'ACADEMY_DISABLED') {
    if (isStrategySpecific) {
      return { allowed: false, code: 'ACADEMY_INTELLIGENCE_BLOCKED', detail: `Academy is disabled; strategy-specific automated scanning cannot proceed without advisory intelligence.` };
    }
    return { allowed: true };
  }

  return academyScannerGate(resolution.intelligence);
}

export function academyTradePlanErrors(
  intelligenceOrResolution?: AcademyConsumerIntelligence | AcademyIntelligenceResolution | null,
  options?: { isStrategySpecific?: boolean; isAutomated?: boolean },
): string[] {
  if (!intelligenceOrResolution) {
    if (options?.isStrategySpecific && options?.isAutomated) {
      return ['Academy exact strategy intelligence is required for automated strategy execution but was absent.'];
    }
    return [];
  }

  // Check if it is an AcademyIntelligenceResolution envelope
  if ('status' in intelligenceOrResolution && 'recordId' in intelligenceOrResolution && !('consumer' in intelligenceOrResolution)) {
    const resolution = intelligenceOrResolution as AcademyIntelligenceResolution;
    if (resolution.status === 'NOT_APPLICABLE') return [];
    if (resolution.status === 'VERSION_MISMATCH' || resolution.status === 'STRATEGY_NOT_FOUND' || resolution.status === 'STORE_UNAVAILABLE') {
      return [`Academy trade plan validation failed: ${resolution.detail}`];
    }
    if (resolution.status === 'ACADEMY_DISABLED') {
      if (options?.isAutomated) {
        return ['Academy is disabled; automated strategy trade plans fail closed without active advisory intelligence.'];
      }
      return [];
    }
    const gate = academyScannerGate(resolution.intelligence);
    return gate.allowed ? [] : [gate.detail ?? 'Academy strategy intelligence did not pass.'];
  }

  const gate = academyScannerGate(intelligenceOrResolution as AcademyConsumerIntelligence);
  return gate.allowed ? [] : [gate.detail ?? 'Academy strategy intelligence did not pass.'];
}

export function academyRiskGate(
  intelligenceOrResolution: AcademyConsumerIntelligence | AcademyIntelligenceResolution | null | undefined,
  reduceOnly: boolean,
  options?: { executionMode?: 'MANUAL' | 'AUTOMATED'; expectedStrategyId?: string | null; expectedStrategyVersion?: number | null },
): { status: 'PASS' | 'WARN' | 'FAIL'; detail: string } | null {
  if (!intelligenceOrResolution) {
    if (options?.expectedStrategyId && options?.executionMode === 'AUTOMATED') {
      if (reduceOnly) {
        return { status: 'WARN', detail: `Automated strategy '${options.expectedStrategyId}' missing Academy resolution, but order is reduce-only and permitted to close/reduce risk.` };
      }
      return { status: 'FAIL', detail: `Automated strategy order for '${options.expectedStrategyId}' requires exact Academy intelligence resolution; none supplied.` };
    }
    return null;
  }

  // Check resolution envelope
  if ('status' in intelligenceOrResolution && 'recordId' in intelligenceOrResolution && !('consumer' in intelligenceOrResolution)) {
    const res = intelligenceOrResolution as AcademyIntelligenceResolution;
    if (res.status === 'NOT_APPLICABLE') {
      return { status: 'PASS', detail: 'Non-strategy / manual order: Academy safety gate not applicable.' };
    }

    if (reduceOnly) {
      return { status: 'WARN', detail: `Academy resolution is ${res.status}, but the intent is reduce-only and may continue through the existing risk-reduction path.` };
    }

    if (options?.expectedStrategyId && (options.expectedStrategyId !== res.strategyId || (options.expectedStrategyVersion != null && options.expectedStrategyVersion !== res.strategyVersion))) {
      return {
        status: 'FAIL',
        detail: `TradePlan strategy identity (${options.expectedStrategyId}@${options.expectedStrategyVersion}) does not match Academy resolution identity (${res.strategyId}@${res.strategyVersion}).`,
      };
    }

    if (res.status === 'VERSION_MISMATCH' || res.status === 'STRATEGY_NOT_FOUND' || res.status === 'STORE_UNAVAILABLE') {
      return { status: 'FAIL', detail: `Academy safety gate blocked: ${res.detail}` };
    }

    if (res.status === 'ACADEMY_DISABLED') {
      if (options?.executionMode === 'AUTOMATED') {
        return { status: 'FAIL', detail: 'Academy is disabled; automated strategy orders fail closed.' };
      }
      return { status: 'WARN', detail: 'Academy is disabled; manual order proceeding without Academy safety advisory.' };
    }

    return academyRiskGate(res.intelligence, reduceOnly, options);
  }

  const intelligence = intelligenceOrResolution as AcademyConsumerIntelligence;
  if (options?.expectedStrategyId && (options.expectedStrategyId !== intelligence.strategyId || (options.expectedStrategyVersion != null && options.expectedStrategyVersion !== intelligence.strategyVersion))) {
    if (reduceOnly) {
      return { status: 'WARN', detail: `TradePlan strategy identity (${options.expectedStrategyId}@${options.expectedStrategyVersion}) differs from Academy (${intelligence.strategyId}@${intelligence.strategyVersion}), but order is reduce-only.` };
    }
    return {
      status: 'FAIL',
      detail: `TradePlan strategy identity (${options.expectedStrategyId}@${options.expectedStrategyVersion}) does not match Academy intelligence (${intelligence.strategyId}@${intelligence.strategyVersion}).`,
    };
  }

  const gate = academyScannerGate(intelligence);
  if (gate.allowed) {
    return { status: 'PASS', detail: `Academy strategy ${intelligence.strategyId}@${intelligence.strategyVersion} has validated shadow evidence; execution authority remains with Risk Governor.` };
  }
  if (reduceOnly) {
    return { status: 'WARN', detail: `Academy intelligence is ${intelligence.state}, but the intent is reduce-only and may continue through the existing risk-reduction path.` };
  }
  return { status: 'FAIL', detail: gate.detail ?? 'Academy strategy intelligence blocks this new entry.' };
}

