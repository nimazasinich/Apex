import { buildEdgeEvidence, clamp01, type LiquidityHunterEdgeContext } from '../edgeRuntime';

export function evaluateMetaModelEdge(context: LiquidityHunterEdgeContext) {
  const model = context.metaModelEvaluation;
  if (!model) {
    return buildEdgeEvidence({
      edgeId: 'META_MODEL',
      status: 'NOT_CONFIGURED',
      dataQuality: 0,
      observedAt: context.now,
      expiresAt: context.now,
      conflictingReasons: ['meta_model_evaluation_not_available'],
    }, context.now);
  }
  if (!Number.isFinite(model.score) || model.score < 0 || model.score > 1 || !model.modelVersion || !model.featureVersion) {
    return buildEdgeEvidence({
      edgeId: 'META_MODEL',
      status: 'UNKNOWN',
      dataQuality: 0,
      observedAt: context.now,
      expiresAt: context.now,
      conflictingReasons: ['invalid_meta_model_payload'],
      metadata: { modelVersion: model.modelVersion || null, featureVersion: model.featureVersion || null },
    }, context.now);
  }
  if (model.expiresAt <= context.now || model.generatedAt > context.now + 5_000) {
    return buildEdgeEvidence({
      edgeId: 'META_MODEL',
      status: 'STALE',
      dataQuality: 0,
      observedAt: model.generatedAt,
      expiresAt: model.expiresAt,
      conflictingReasons: ['meta_model_result_stale_or_future_dated'],
      metadata: { modelVersion: model.modelVersion, featureVersion: model.featureVersion },
    }, context.now);
  }
  const direction = model.direction;
  const status = direction !== 'NEUTRAL' && model.score >= 0.55 ? 'PASS' : 'FAIL';
  return buildEdgeEvidence({
    edgeId: 'META_MODEL',
    status,
    direction,
    score: clamp01(model.score),
    dataQuality: 0.8,
    observedAt: model.generatedAt,
    expiresAt: model.expiresAt,
    supportingReasons: [`model_score:${model.score.toFixed(3)}`, `model_version:${model.modelVersion}`],
    conflictingReasons: status === 'FAIL' ? ['meta_model_confidence_or_direction_below_threshold'] : [],
    metadata: { modelVersion: model.modelVersion, featureVersion: model.featureVersion, shadowOnly: true },
  }, context.now);
}
