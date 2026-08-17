import { ML_FEATURE_NAMES, ML_FEATURE_VERSION, extractFeatures, type MlFeatureName } from './mlFeatureExtractor';
import { predictLogisticProbability, type LogisticRegressionModel } from './mlLogisticRegression';
import type { SignalDecisionLog } from '../types';

export const SHADOW_ML_MODEL_SCHEMA_VERSION = 1;

export interface ShadowMlModelFile {
  schemaVersion: number;
  modelId: string;
  featureVersion: typeof ML_FEATURE_VERSION;
  featureNames: readonly MlFeatureName[];
  createdAt: string;
  threshold: number;
  coefficients: number[];
  intercept: number;
  standardization: {
    means: number[];
    standardDeviations: number[];
  };
  training: {
    rows: number;
    winRows: number;
    lossRows: number;
    epochs: number;
    learningRate: number;
    l2: number;
    sourcePath: string | null;
  };
  checksum: string;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stable(entry)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** Browser-safe FNV-1a checksum. It is an integrity fingerprint, not a signature. */
export function shadowModelChecksum(value: Omit<ShadowMlModelFile, 'checksum'>): string {
  const input = stable(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `fnv1a32:${hash.toString(16).padStart(8, '0')}`;
}

export function createShadowMlModelFile(input: {
  modelId: string;
  createdAt: string;
  threshold?: number;
  model: LogisticRegressionModel;
  training: ShadowMlModelFile['training'];
}): ShadowMlModelFile {
  const base: Omit<ShadowMlModelFile, 'checksum'> = {
    schemaVersion: SHADOW_ML_MODEL_SCHEMA_VERSION,
    modelId: input.modelId,
    featureVersion: ML_FEATURE_VERSION,
    featureNames: ML_FEATURE_NAMES,
    createdAt: input.createdAt,
    threshold: input.threshold ?? 0.5,
    coefficients: [...input.model.coefficients],
    intercept: input.model.intercept,
    standardization: {
      means: [...input.model.standardization.means],
      standardDeviations: [...input.model.standardization.standardDeviations],
    },
    training: { ...input.training },
  };
  return { ...base, checksum: shadowModelChecksum(base) };
}

export function validateShadowMlModelFile(value: unknown): string[] {
  const errors: string[] = [];
  if (!value || typeof value !== 'object') return ['Shadow model is not an object.'];
  const model = value as Partial<ShadowMlModelFile>;
  if (model.schemaVersion !== SHADOW_ML_MODEL_SCHEMA_VERSION) errors.push('Unsupported shadow model schemaVersion.');
  if (typeof model.modelId !== 'string' || !model.modelId) errors.push('modelId is missing.');
  if (model.featureVersion !== ML_FEATURE_VERSION) errors.push('featureVersion does not match ml_features_v1.');
  if (!Array.isArray(model.featureNames) || model.featureNames.join('|') !== ML_FEATURE_NAMES.join('|')) errors.push('featureNames do not match the frozen 100-feature contract.');
  if (!Array.isArray(model.coefficients) || model.coefficients.length !== ML_FEATURE_NAMES.length || model.coefficients.some((v) => typeof v !== 'number' || !Number.isFinite(v))) errors.push('coefficients are invalid.');
  if (typeof model.intercept !== 'number' || !Number.isFinite(model.intercept)) errors.push('intercept is invalid.');
  if (typeof model.threshold !== 'number' || model.threshold <= 0 || model.threshold >= 1) errors.push('threshold must be between 0 and 1.');
  const means = model.standardization?.means;
  const sds = model.standardization?.standardDeviations;
  if (!Array.isArray(means) || means.length !== ML_FEATURE_NAMES.length || means.some((v) => typeof v !== 'number' || !Number.isFinite(v))) errors.push('standardization.means are invalid.');
  if (!Array.isArray(sds) || sds.length !== ML_FEATURE_NAMES.length || sds.some((v) => typeof v !== 'number' || !Number.isFinite(v) || v <= 0)) errors.push('standardization.standardDeviations are invalid.');
  if (typeof model.createdAt !== 'string' || Number.isNaN(Date.parse(model.createdAt))) errors.push('createdAt is invalid.');
  const training = model.training;
  if (!training || typeof training !== 'object') {
    errors.push('training metadata is missing.');
  } else {
    const integerFields: Array<keyof ShadowMlModelFile['training']> = ['rows', 'winRows', 'lossRows', 'epochs'];
    for (const field of integerFields) {
      const value = training[field];
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) errors.push(`training.${field} is invalid.`);
    }
    if (typeof training.learningRate !== 'number' || !Number.isFinite(training.learningRate) || training.learningRate <= 0) errors.push('training.learningRate is invalid.');
    if (typeof training.l2 !== 'number' || !Number.isFinite(training.l2) || training.l2 < 0) errors.push('training.l2 is invalid.');
    if (Number.isInteger(training.rows) && Number.isInteger(training.winRows) && Number.isInteger(training.lossRows) && training.winRows + training.lossRows !== training.rows) {
      errors.push('training class counts do not equal training.rows.');
    }
    if (training.sourcePath !== null && typeof training.sourcePath !== 'string') errors.push('training.sourcePath is invalid.');
  }
  if (typeof model.checksum !== 'string' || !/^fnv1a32:[0-9a-f]{8}$/.test(model.checksum)) errors.push('checksum is missing or malformed.');
  if (!errors.length) {
    const { checksum: _checksum, ...base } = model as ShadowMlModelFile;
    if (shadowModelChecksum(base) !== model.checksum) errors.push('checksum mismatch.');
  }
  return errors;
}

export function parseShadowMlModelFile(value: unknown): ShadowMlModelFile | null {
  return validateShadowMlModelFile(value).length ? null : value as ShadowMlModelFile;
}

export function scoreShadowMlValues(model: ShadowMlModelFile, values: number[]): number {
  const validationErrors = validateShadowMlModelFile(model);
  if (validationErrors.length) throw new Error(`Invalid shadow ML model: ${validationErrors.join(' ')}`);
  if (values.length !== ML_FEATURE_NAMES.length || values.some((value) => !Number.isFinite(value))) {
    throw new Error(`Shadow ML scoring requires ${ML_FEATURE_NAMES.length} finite feature values.`);
  }
  const logistic: LogisticRegressionModel = {
    coefficients: model.coefficients,
    intercept: model.intercept,
    standardization: model.standardization,
    epochs: model.training.epochs,
    learningRate: model.training.learningRate,
    l2: model.training.l2,
  };
  return predictLogisticProbability(logistic, values);
}

export function scoreShadowMlLog(model: ShadowMlModelFile, log: SignalDecisionLog): number | null {
  const vector = extractFeatures(log);
  return vector ? scoreShadowMlValues(model, vector.values) : null;
}
