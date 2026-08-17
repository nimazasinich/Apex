import type { PreparedMlDataset, PreparedMlRow } from './mlDatasetPreparation';
import { binaryClassificationMetrics, predictLogisticProbability, trainLogisticRegression, type BinaryMetrics } from './mlLogisticRegression';
import { createShadowMlModelFile, type ShadowMlModelFile } from './shadowMlModel';

export const SHADOW_ML_TRAINING_VERSION = 1;

export interface ShadowMlSplitMetric {
  split: 'train' | 'validation' | 'test';
  rowCount: number;
  metrics: BinaryMetrics;
}

export interface WalkForwardMetric {
  fold: number;
  trainRows: number;
  validationRows: number;
  trainStartTimestamp: number | null;
  trainEndTimestamp: number | null;
  validationStartTimestamp: number | null;
  validationEndTimestamp: number | null;
  metrics: BinaryMetrics;
}

export interface ShadowMlTrainingResult {
  version: number;
  generatedAt: string;
  sourcePath: string | null;
  gate: {
    status: 'TRAINED' | 'INSUFFICIENT_DATA';
    datasetGateStatus: PreparedMlDataset['gate']['status'];
    minLabeledRows: number;
    minMinorityClass: number;
    completeRows: number;
    minorityClassRows: number;
    trainRows: number;
    trainMinorityClassRows: number;
    reason: string | null;
  };
  model: ShadowMlModelFile | null;
  splitMetrics: ShadowMlSplitMetric[];
  walkForwardMetrics: WalkForwardMetric[];
  ruleBaseline: {
    sampleCount: number;
    winRate: number | null;
    alwaysAcceptAccuracy: number | null;
  };
  limitations: string[];
}

function metricsFor(model: ReturnType<typeof trainLogisticRegression>, rows: PreparedMlRow[]): BinaryMetrics {
  return binaryClassificationMetrics(
    rows.map((row) => row.label),
    rows.map((row) => predictLogisticProbability(model, row.values)),
  );
}

function walkForward(rows: PreparedMlRow[]): WalkForwardMetric[] {
  const sorted = [...rows].sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id));
  if (sorted.length < 120) return [];
  const results: WalkForwardMetric[] = [];
  const validationSize = Math.max(20, Math.floor(sorted.length * 0.1));
  const initialTrain = Math.max(60, Math.floor(sorted.length * 0.5));
  let fold = 1;
  for (let end = initialTrain; end + validationSize <= sorted.length && fold <= 5; end += validationSize, fold += 1) {
    const trainRows = sorted.slice(0, end);
    const validationRows = sorted.slice(end, end + validationSize);
    const minority = Math.min(trainRows.filter((row) => row.label === 1).length, trainRows.filter((row) => row.label === 0).length);
    if (minority < 5) continue;
    const model = trainLogisticRegression(trainRows, { epochs: 450, learningRate: 0.04, l2: 0.002 });
    results.push({
      fold,
      trainRows: trainRows.length,
      validationRows: validationRows.length,
      trainStartTimestamp: trainRows[0]?.timestamp ?? null,
      trainEndTimestamp: trainRows.at(-1)?.timestamp ?? null,
      validationStartTimestamp: validationRows[0]?.timestamp ?? null,
      validationEndTimestamp: validationRows.at(-1)?.timestamp ?? null,
      metrics: metricsFor(model, validationRows),
    });
  }
  return results;
}

export function trainShadowMlModel(
  dataset: PreparedMlDataset,
  ctx: { generatedAt: string },
): ShadowMlTrainingResult {
  const winRows = dataset.rows.filter((row) => row.label === 1).length;
  const lossRows = dataset.rows.length - winRows;
  const trainRows = dataset.rows.filter((row) => row.split === 'train');
  const validationRows = dataset.rows.filter((row) => row.split === 'validation');
  const testRows = dataset.rows.filter((row) => row.split === 'test');
  const trainWinRows = trainRows.filter((row) => row.label === 1).length;
  const trainLossRows = trainRows.length - trainWinRows;
  const trainMinorityClassRows = Math.min(trainWinRows, trainLossRows);
  const trainSplitUsable = trainRows.length > 0 && trainMinorityClassRows >= 5;
  const trainable = dataset.gate.status === 'PASSED' && trainSplitUsable;
  const ruleBaseline = {
    sampleCount: dataset.rows.length,
    winRate: dataset.rows.length ? winRows / dataset.rows.length : null,
    alwaysAcceptAccuracy: dataset.rows.length ? winRows / dataset.rows.length : null,
  };
  const base = {
    version: SHADOW_ML_TRAINING_VERSION,
    generatedAt: ctx.generatedAt,
    sourcePath: dataset.sourcePath,
    gate: {
      status: (trainable ? 'TRAINED' : 'INSUFFICIENT_DATA') as 'TRAINED' | 'INSUFFICIENT_DATA',
      datasetGateStatus: dataset.gate.status,
      minLabeledRows: dataset.gate.minLabeledRows,
      minMinorityClass: dataset.gate.minMinorityClass,
      completeRows: dataset.rows.length,
      minorityClassRows: Math.min(winRows, lossRows),
      trainRows: trainRows.length,
      trainMinorityClassRows,
      reason: dataset.gate.status !== 'PASSED'
        ? 'dataset_gate_failed'
        : !trainSplitUsable
          ? 'chronological_train_split_missing_class_support'
          : null,
    },
    ruleBaseline,
    limitations: [
      'Supervised ML v1 uses only accepted WIN/LOSS rows with feature-complete decision-time inputs.',
      'Rejected candidates, UNKNOWN, EXPIRED, and BREAKEVEN outcomes are never imputed.',
      'Chronological splits are deterministic; random splitting is not used.',
      'Shadow ML output must not become a live scanner or execution gate without separate approval.',
      'Shadow ML training never writes into scannerCore.ts, adaptiveThresholdEngine.ts, or live execution gates.',
      'Walk-forward metrics are descriptive until a separate safety review approves any behavior change.',
    ],
  };
  if (!trainable) {
    return { ...base, model: null, splitMetrics: [], walkForwardMetrics: [] };
  }

  const model = trainLogisticRegression(trainRows, { epochs: 900, learningRate: 0.04, l2: 0.002 });
  const modelFile = createShadowMlModelFile({
    modelId: `shadow-logreg-${ctx.generatedAt.replace(/[^0-9]/g, '').slice(0, 14)}`,
    createdAt: ctx.generatedAt,
    model,
    threshold: 0.5,
    training: {
      rows: trainRows.length,
      winRows: trainRows.filter((row) => row.label === 1).length,
      lossRows: trainRows.filter((row) => row.label === 0).length,
      epochs: model.epochs,
      learningRate: model.learningRate,
      l2: model.l2,
      sourcePath: dataset.sourcePath,
    },
  });
  const splitMetrics: ShadowMlSplitMetric[] = [
    { split: 'train', rowCount: trainRows.length, metrics: metricsFor(model, trainRows) },
    { split: 'validation', rowCount: validationRows.length, metrics: metricsFor(model, validationRows) },
    { split: 'test', rowCount: testRows.length, metrics: metricsFor(model, testRows) },
  ];
  return { ...base, model: modelFile, splitMetrics, walkForwardMetrics: walkForward(dataset.rows) };
}
