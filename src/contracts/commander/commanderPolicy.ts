export const COMMANDER_POLICY_VERSION = 'commander_policy_v1' as const;

export const COMMANDER_SAFETY = {
  executionAuthorized: false,
  orderSubmissionAllowed: false,
  authoritativeLiveDecision: false,
  riskGovernorBypassAllowed: false,
} as const;

export type CommanderMaturity = 'SHADOW' | 'RESEARCH_ROUTING' | 'PAPER_ROUTING' | 'LIVE_SHADOW' | 'LIVE_ROUTING';

export interface CommanderPolicyV1 {
  version: typeof COMMANDER_POLICY_VERSION;
  maturity: CommanderMaturity;
  shadowOnly: boolean;
  maxSelectedStrategies: number;
  requiredEvidenceFamilies: string[];
  safety: typeof COMMANDER_SAFETY;
}

export interface CommanderPolicyValidation {
  ok: boolean;
  reasons: string[];
}

export function validateCommanderPolicy(policy: CommanderPolicyV1): CommanderPolicyValidation {
  const reasons: string[] = [];
  if (policy.version !== COMMANDER_POLICY_VERSION) reasons.push('invalid_version');
  if (!['SHADOW', 'RESEARCH_ROUTING', 'PAPER_ROUTING', 'LIVE_SHADOW', 'LIVE_ROUTING'].includes(policy.maturity)) reasons.push('invalid_maturity');
  if (typeof policy.shadowOnly !== 'boolean') reasons.push('invalid_shadow_only');
  if (!Number.isSafeInteger(policy.maxSelectedStrategies) || policy.maxSelectedStrategies < 0) reasons.push('invalid_max_selected_strategies');
  if (!Array.isArray(policy.requiredEvidenceFamilies) || policy.requiredEvidenceFamilies.some((family) => typeof family !== 'string' || !family.trim())) reasons.push('invalid_required_evidence_families');
  if (policy.safety.executionAuthorized !== false) reasons.push('execution_must_remain_denied');
  if (policy.safety.orderSubmissionAllowed !== false) reasons.push('order_submission_must_remain_denied');
  if (policy.safety.authoritativeLiveDecision !== false) reasons.push('authoritative_live_decision_must_remain_denied');
  if (policy.safety.riskGovernorBypassAllowed !== false) reasons.push('risk_governor_bypass_must_remain_denied');
  return { ok: reasons.length === 0, reasons };
}

export function assertValidCommanderPolicy(policy: CommanderPolicyV1): void {
  const validation = validateCommanderPolicy(policy);
  if (!validation.ok) throw new Error(`invalid_commander_policy:${validation.reasons.join(',')}`);
}
