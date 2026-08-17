import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { EdgeEvidence, EdgeId } from '../../contracts/realtime/edgeEvidence';
import type { MetaModelEvaluationPayload } from '../../contracts/realtime/marketPayloads';

export const LIQUIDITY_HUNTER_META_FEATURE_VERSION = 'lh-edge-evidence-v1';
export const LIQUIDITY_HUNTER_META_ARTIFACT_VERSION = 'lh-historical-similarity-v1';

const FEATURE_EDGES: readonly EdgeId[] = [
  'LIQUIDATION_TOPOLOGY',
  'WHALE_POSITIONING',
  'ICEBERG_ABSORPTION',
  'OPTIONS_GAMMA',
  'MULTI_EXCHANGE_CVD',
  'SESSION_LIQUIDITY',
  'FUNDING_OI',
  'SENTIMENT_VELOCITY',
  'CONTRARIAN_WALLETS',
];

export interface LiquidityHunterMetaTrainingExample {
  id: string;
  datasetRole: 'DEVELOPMENT';
  features: number[];
  direction: 'LONG' | 'SHORT' | 'NEUTRAL';
  outcomeR?: number | null;
}

export interface LiquidityHunterHistoricalSimilarityArtifact {
  artifactVersion: typeof LIQUIDITY_HUNTER_META_ARTIFACT_VERSION;
  featureVersion: typeof LIQUIDITY_HUNTER_META_FEATURE_VERSION;
  modelVersion: string;
  createdAt: number;
  trainingDatasetSha256: string;
  examples: LiquidityHunterMetaTrainingExample[];
  policy?: {
    neighbors?: number;
    minNeighbors?: number;
    maxMeanDistance?: number;
  };
}

export interface LiquidityHunterMetaModelEvaluator {
  evaluate(evidence: EdgeEvidence[], now: number): MetaModelEvaluationPayload | null;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function statusCode(row: EdgeEvidence | undefined): number {
  if (!row) return 0;
  if (row.status === 'PASS') return 1;
  if (row.status === 'FAIL') return 0.5;
  return 0;
}

function signedDirectionScore(row: EdgeEvidence | undefined): number {
  if (!row || row.status !== 'PASS' || row.score === null) return 0;
  if (row.direction === 'LONG') return clamp01(row.score);
  if (row.direction === 'SHORT') return -clamp01(row.score);
  return 0;
}

export function buildLiquidityHunterMetaFeatureVector(evidence: readonly EdgeEvidence[]): number[] {
  const byId = new Map(evidence.map((row) => [row.edgeId, row] as const));
  const output: number[] = [];
  for (const edgeId of FEATURE_EDGES) {
    const row = byId.get(edgeId);
    output.push(signedDirectionScore(row));
    output.push(row ? clamp01(Number(row.dataQuality) || 0) : 0);
    output.push(statusCode(row));
  }
  return output;
}

function isFiniteVector(value: unknown, expectedLength: number): value is number[] {
  return Array.isArray(value) && value.length === expectedLength && value.every((item) => Number.isFinite(item) && item >= -1 && item <= 1);
}

function artifactFingerprint(value: Omit<LiquidityHunterHistoricalSimilarityArtifact, 'trainingDatasetSha256'>): string {
  return createHash('sha256').update(JSON.stringify(value.examples)).digest('hex');
}

export function validateLiquidityHunterHistoricalSimilarityArtifact(value: unknown): LiquidityHunterHistoricalSimilarityArtifact {
  if (!value || typeof value !== 'object') throw new Error('meta_model_artifact_invalid');
  const row = value as LiquidityHunterHistoricalSimilarityArtifact;
  if (row.artifactVersion !== LIQUIDITY_HUNTER_META_ARTIFACT_VERSION) throw new Error('meta_model_artifact_version_unsupported');
  if (row.featureVersion !== LIQUIDITY_HUNTER_META_FEATURE_VERSION) throw new Error('meta_model_feature_version_mismatch');
  if (!row.modelVersion || !/^[A-Za-z0-9._:-]{1,120}$/.test(row.modelVersion)) throw new Error('meta_model_version_invalid');
  if (!Number.isFinite(row.createdAt) || row.createdAt <= 0) throw new Error('meta_model_created_at_invalid');
  if (!Array.isArray(row.examples) || row.examples.length < 20 || row.examples.length > 100_000) throw new Error('meta_model_training_sample_count_invalid');
  const expectedLength = FEATURE_EDGES.length * 3;
  for (const example of row.examples) {
    if (!example || typeof example !== 'object' || !example.id) throw new Error('meta_model_example_invalid');
    if (example.datasetRole !== 'DEVELOPMENT') throw new Error('meta_model_holdout_training_forbidden');
    if (!['LONG', 'SHORT', 'NEUTRAL'].includes(example.direction)) throw new Error('meta_model_example_direction_invalid');
    if (!isFiniteVector(example.features, expectedLength)) throw new Error('meta_model_example_features_invalid');
    if (example.outcomeR !== undefined && example.outcomeR !== null && !Number.isFinite(example.outcomeR)) throw new Error('meta_model_example_outcome_invalid');
  }
  const canonical = {
    artifactVersion: row.artifactVersion,
    featureVersion: row.featureVersion,
    modelVersion: row.modelVersion,
    createdAt: row.createdAt,
    examples: row.examples,
    policy: row.policy,
  } as Omit<LiquidityHunterHistoricalSimilarityArtifact, 'trainingDatasetSha256'>;
  const expectedFingerprint = artifactFingerprint(canonical);
  if (!/^[a-f0-9]{64}$/i.test(row.trainingDatasetSha256) || row.trainingDatasetSha256.toLowerCase() !== expectedFingerprint) {
    throw new Error('meta_model_training_dataset_fingerprint_mismatch');
  }
  return structuredClone(row);
}

export function createLiquidityHunterHistoricalSimilarityArtifact(input: {
  modelVersion: string;
  createdAt?: number;
  examples: LiquidityHunterMetaTrainingExample[];
  policy?: LiquidityHunterHistoricalSimilarityArtifact['policy'];
}): LiquidityHunterHistoricalSimilarityArtifact {
  const withoutFingerprint = {
    artifactVersion: LIQUIDITY_HUNTER_META_ARTIFACT_VERSION,
    featureVersion: LIQUIDITY_HUNTER_META_FEATURE_VERSION,
    modelVersion: input.modelVersion,
    createdAt: input.createdAt ?? Date.now(),
    examples: structuredClone(input.examples),
    policy: input.policy,
  } as const;
  const artifact: LiquidityHunterHistoricalSimilarityArtifact = {
    ...withoutFingerprint,
    trainingDatasetSha256: artifactFingerprint(withoutFingerprint),
  };
  return validateLiquidityHunterHistoricalSimilarityArtifact(artifact);
}

function distance(a: readonly number[], b: readonly number[]): number {
  let sum = 0;
  for (let index = 0; index < a.length; index += 1) {
    const delta = a[index] - b[index];
    sum += delta * delta;
  }
  return Math.sqrt(sum / Math.max(1, a.length));
}

export class HistoricalSimilarityMetaModel implements LiquidityHunterMetaModelEvaluator {
  private readonly artifact: LiquidityHunterHistoricalSimilarityArtifact;
  private readonly neighbors: number;
  private readonly minNeighbors: number;
  private readonly maxMeanDistance: number;

  constructor(artifact: LiquidityHunterHistoricalSimilarityArtifact) {
    this.artifact = validateLiquidityHunterHistoricalSimilarityArtifact(artifact);
    this.neighbors = Math.max(5, Math.min(50, Math.floor(this.artifact.policy?.neighbors ?? 15)));
    this.minNeighbors = Math.max(5, Math.min(this.neighbors, Math.floor(this.artifact.policy?.minNeighbors ?? 8)));
    this.maxMeanDistance = Math.max(0.05, Math.min(1.5, Number(this.artifact.policy?.maxMeanDistance ?? 0.65)));
  }

  evaluate(evidence: EdgeEvidence[], now: number): MetaModelEvaluationPayload | null {
    const features = buildLiquidityHunterMetaFeatureVector(evidence);
    const nearest = this.artifact.examples
      .map((example) => ({ example, distance: distance(features, example.features) }))
      .sort((a, b) => a.distance - b.distance || a.example.id.localeCompare(b.example.id))
      .slice(0, this.neighbors);
    if (nearest.length < this.minNeighbors) return null;
    const meanDistance = nearest.reduce((sum, row) => sum + row.distance, 0) / nearest.length;
    if (!Number.isFinite(meanDistance) || meanDistance > this.maxMeanDistance) return null;

    let longWeight = 0;
    let shortWeight = 0;
    let neutralWeight = 0;
    for (const row of nearest) {
      const distanceWeight = 1 / Math.max(0.025, row.distance + 0.025);
      const outcomeR = row.example.outcomeR;
      const outcomeWeight = outcomeR === undefined || outcomeR === null
        ? 1
        : Math.max(0.25, Math.min(2, Math.abs(outcomeR)));
      const weight = distanceWeight * outcomeWeight;
      // Historical similarity is a validator, not a reversal oracle. Only a
      // resolved positive outcome may reinforce its recorded trade direction.
      // Losing or unresolved examples are neutral evidence so they can reduce
      // confidence but can never strengthen the direction that failed.
      const effectiveDirection = outcomeR !== undefined && outcomeR !== null && outcomeR > 0
        ? row.example.direction
        : 'NEUTRAL';
      if (effectiveDirection === 'LONG') longWeight += weight;
      else if (effectiveDirection === 'SHORT') shortWeight += weight;
      else neutralWeight += weight;
    }
    const directionalTotal = longWeight + shortWeight;
    const total = directionalTotal + neutralWeight;
    if (!(total > 0) || !(directionalTotal > 0)) return null;
    const directionalImbalance = Math.abs(longWeight - shortWeight) / directionalTotal;
    const directionalShare = directionalTotal / total;
    const confidence = clamp01(directionalImbalance * directionalShare * (1 - Math.min(1, meanDistance / this.maxMeanDistance) * 0.35));
    const direction = confidence < 0.10 ? 'NEUTRAL' : longWeight > shortWeight ? 'LONG' : shortWeight > longWeight ? 'SHORT' : 'NEUTRAL';
    const score = direction === 'NEUTRAL' ? 0.5 : clamp01(0.5 + confidence * 0.5);
    return {
      direction,
      score,
      modelVersion: this.artifact.modelVersion,
      featureVersion: this.artifact.featureVersion,
      generatedAt: now,
      expiresAt: now + 30_000,
    };
  }
}

export function loadHistoricalSimilarityMetaModel(filePath: string): HistoricalSimilarityMetaModel {
  const parsed = JSON.parse(readFileSync(filePath, 'utf8')) as unknown;
  return new HistoricalSimilarityMetaModel(validateLiquidityHunterHistoricalSimilarityArtifact(parsed));
}
