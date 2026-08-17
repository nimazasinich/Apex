import type { SignalDecisionLog } from '../types';
import { extractFeatures } from './mlFeatureExtractor';
import { scoreShadowMlValues, validateShadowMlModelFile, type ShadowMlModelFile } from './shadowMlModel';

export const SHADOW_ML_COMPARISON_VERSION = 1;

export interface ShadowMlDisagreement {
  id: string;
  timestamp: number;
  ticker: string;
  direction: SignalDecisionLog['direction'];
  ruleDecision: SignalDecisionLog['decision'];
  mlDecision: 'ACCEPTED' | 'REJECTED';
  probabilityWin: number;
  confidence: number | null;
  laterOutcome: SignalDecisionLog['laterOutcome'];
  reasonCode: SignalDecisionLog['reasonCode'];
}

export interface ShadowMlComparisonResult {
  version: number;
  generatedAt: string;
  sourcePath: string | null;
  modelId: string | null;
  gate: {
    status: 'COMPARED' | 'NO_MODEL' | 'INSUFFICIENT_DATA';
    completeLabeledRows: number;
    modelValidationErrors: string[];
  };
  summary: {
    rowsScored: number;
    rowsSkipped: number;
    agreementCount: number;
    disagreementCount: number;
    mlRejectRuleAcceptCount: number;
    mlAcceptRuleRejectCount: number;
    disagreementsWithLossOutcome: number;
    disagreementsWithWinOutcome: number;
    avgConfidenceOnDisagreements: number | null;
  };
  disagreements: ShadowMlDisagreement[];
  limitations: string[];
}

function baseResult(ctx: { sourcePath: string | null; generatedAt: string }, modelId: string | null) {
  return {
    version: SHADOW_ML_COMPARISON_VERSION,
    generatedAt: ctx.generatedAt,
    sourcePath: ctx.sourcePath,
    modelId,
    limitations: [
      'Shadow ML comparison is audit-only and does not change scanner gates, lifecycle, or execution.',
      'Rule baseline uses the recorded decision status; ML uses the frozen shadow model file.',
      'Rows with incomplete features are skipped rather than imputed.',
      'Outcome counts are descriptive and are only available for rows with resolved accepted outcomes.',
    ],
  };
}

export function compareShadowMlRows(
  rows: SignalDecisionLog[],
  model: ShadowMlModelFile | null,
  ctx: { sourcePath: string | null; generatedAt: string },
): ShadowMlComparisonResult {
  const validationErrors = model ? validateShadowMlModelFile(model) : ['No shadow ML model file was available.'];
  const completeLabeledRows = rows.filter((row) =>
    row.decision === 'ACCEPTED' && (row.laterOutcome === 'WIN' || row.laterOutcome === 'LOSS') && extractFeatures(row),
  ).length;
  if (!model || validationErrors.length) {
    return {
      ...baseResult(ctx, model?.modelId ?? null),
      gate: { status: 'NO_MODEL', completeLabeledRows, modelValidationErrors: validationErrors },
      summary: { rowsScored: 0, rowsSkipped: rows.length, agreementCount: 0, disagreementCount: 0, mlRejectRuleAcceptCount: 0, mlAcceptRuleRejectCount: 0, disagreementsWithLossOutcome: 0, disagreementsWithWinOutcome: 0, avgConfidenceOnDisagreements: null },
      disagreements: [],
    };
  }

  const disagreements: ShadowMlDisagreement[] = [];
  let rowsScored = 0;
  let rowsSkipped = 0;
  let agreementCount = 0;
  for (const row of rows) {
    const vector = extractFeatures(row);
    if (!vector) { rowsSkipped += 1; continue; }
    rowsScored += 1;
    const probabilityWin = scoreShadowMlValues(model, vector.values);
    const mlDecision = probabilityWin >= model.threshold ? 'ACCEPTED' : 'REJECTED';
    if (mlDecision === row.decision) { agreementCount += 1; continue; }
    disagreements.push({
      id: row.id,
      timestamp: row.timestamp,
      ticker: row.ticker,
      direction: row.direction,
      ruleDecision: row.decision,
      mlDecision,
      probabilityWin,
      confidence: typeof row.confidence === 'number' ? row.confidence : null,
      laterOutcome: row.laterOutcome,
      reasonCode: row.reasonCode,
    });
  }
  const confidences = disagreements.map((row) => row.confidence).filter((value): value is number => value !== null && Number.isFinite(value));
  return {
    ...baseResult(ctx, model.modelId),
    gate: {
      status: rowsScored ? 'COMPARED' : 'INSUFFICIENT_DATA',
      completeLabeledRows,
      modelValidationErrors: [],
    },
    summary: {
      rowsScored,
      rowsSkipped,
      agreementCount,
      disagreementCount: disagreements.length,
      mlRejectRuleAcceptCount: disagreements.filter((row) => row.mlDecision === 'REJECTED' && row.ruleDecision === 'ACCEPTED').length,
      mlAcceptRuleRejectCount: disagreements.filter((row) => row.mlDecision === 'ACCEPTED' && row.ruleDecision === 'REJECTED').length,
      disagreementsWithLossOutcome: disagreements.filter((row) => row.laterOutcome === 'LOSS').length,
      disagreementsWithWinOutcome: disagreements.filter((row) => row.laterOutcome === 'WIN').length,
      avgConfidenceOnDisagreements: confidences.length ? confidences.reduce((sum, value) => sum + value, 0) / confidences.length : null,
    },
    disagreements: disagreements.sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id)),
  };
}
