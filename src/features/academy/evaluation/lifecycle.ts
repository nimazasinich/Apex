import type {
  AcademyEvaluationResult,
  AcademyLifecycleEvent,
  AcademyLifecycleState,
  DiscoveredAcademyStrategy,
} from '../types.ts';

const NEXT_STATE: Partial<Record<AcademyLifecycleState, AcademyLifecycleState>> = {
  DISCOVERED: 'BACKTESTED',
  BACKTESTED: 'VALIDATED',
  VALIDATED: 'SHADOW',
  SHADOW: 'LIVE_ELIGIBLE',
};

export function canTransitionAcademyLifecycle(
  from: AcademyLifecycleState,
  to: AcademyLifecycleState,
  authority: AcademyLifecycleEvent['authority'],
): boolean {
  if (to === 'RETIRED') return from !== 'RETIRED';
  if (from === 'RETIRED') return false;
  if (NEXT_STATE[from] !== to) return false;
  if (to === 'LIVE_ELIGIBLE') return authority === 'SERVER_GOVERNANCE';
  return authority === 'ACADEMY_PIPELINE' || authority === 'OPERATOR';
}

function strictValidationPassed(strategy: DiscoveredAcademyStrategy): boolean {
  const snapshot = strategy.performanceEvidenceTrusted ? strategy.latestSnapshot : null;
  if (!snapshot?.gates) return false;
  return snapshot.passedAllGates === true
    && Object.values(snapshot.gates).every((passed) => passed === true)
    && snapshot.validationScope === 'FULL_STRATEGY'
    && snapshot.fullStrategyValidated === true
    && snapshot.dataState === 'live'
    && Boolean(snapshot.datasetFingerprint)
    && Boolean(snapshot.runId)
    && snapshot.holdoutProtocolStatus === 'PASSED';
}

export function targetLifecycleForEvaluation(
  strategy: DiscoveredAcademyStrategy,
  _evaluation: AcademyEvaluationResult,
): AcademyLifecycleState {
  const snapshot = strategy.performanceEvidenceTrusted ? strategy.latestSnapshot : null;
  if (strategy.registryStatus === 'blocked' || strategy.registryStatus === 'deprecated' || snapshot?.holdoutProtocolStatus === 'FAILED_RETIRED') {
    return 'RETIRED';
  }
  if (!snapshot) return 'DISCOVERED';
  return strictValidationPassed(strategy) ? 'SHADOW' : 'BACKTESTED';
}

export function advanceAcademyLifecycle(args: {
  current: AcademyLifecycleState | null;
  target: AcademyLifecycleState;
  now: number;
  reason: string;
  evidenceIds: string[];
}): { lifecycle: AcademyLifecycleState; events: AcademyLifecycleEvent[] } {
  const current = args.current ?? 'DISCOVERED';
  const events: AcademyLifecycleEvent[] = args.current == null
    ? [{ from: null, to: 'DISCOVERED', at: args.now, reason: 'Strategy entered the Academy knowledge base with evidence metadata.', evidenceIds: args.evidenceIds, authority: 'ACADEMY_PIPELINE' }]
    : [];
  if (current === 'RETIRED' || current === 'LIVE_ELIGIBLE') return { lifecycle: current, events };
  if (args.target === 'RETIRED') {
    events.push({ from: current, to: 'RETIRED', at: args.now, reason: args.reason, evidenceIds: args.evidenceIds, authority: 'ACADEMY_PIPELINE' });
    return { lifecycle: 'RETIRED', events };
  }

  const order: AcademyLifecycleState[] = ['DISCOVERED', 'BACKTESTED', 'VALIDATED', 'SHADOW'];
  const currentIndex = order.indexOf(current);
  const targetIndex = order.indexOf(args.target);
  if (currentIndex < 0 || targetIndex <= currentIndex) return { lifecycle: current, events };

  let state: AcademyLifecycleState = current;
  for (let index = currentIndex + 1; index <= targetIndex; index += 1) {
    const next = order[index];
    if (!canTransitionAcademyLifecycle(state, next, 'ACADEMY_PIPELINE')) throw new Error(`academy_lifecycle_transition_invalid:${state}:${next}`);
    events.push({ from: state, to: next, at: args.now, reason: args.reason, evidenceIds: args.evidenceIds, authority: 'ACADEMY_PIPELINE' });
    state = next;
  }
  return { lifecycle: state, events };
}
