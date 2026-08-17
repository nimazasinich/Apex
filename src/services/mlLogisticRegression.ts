/** Pure deterministic binary logistic regression for shadow-only analysis. */
export interface StandardizationStats {
  means: number[];
  standardDeviations: number[];
}

export interface LogisticRegressionModel {
  coefficients: number[];
  intercept: number;
  standardization: StandardizationStats;
  epochs: number;
  learningRate: number;
  l2: number;
}

export interface BinaryMetrics {
  sampleCount: number;
  truePositive: number;
  trueNegative: number;
  falsePositive: number;
  falseNegative: number;
  accuracy: number | null;
  precision: number | null;
  recall: number | null;
  f1: number | null;
  brierScore: number | null;
}

function sigmoid(value: number): number {
  if (value >= 0) {
    const z = Math.exp(-value);
    return 1 / (1 + z);
  }
  const z = Math.exp(value);
  return z / (1 + z);
}

export function computeStandardization(rows: number[][]): StandardizationStats {
  const width = rows[0]?.length ?? 0;
  const means = new Array<number>(width).fill(0);
  for (const row of rows) {
    for (let column = 0; column < width; column += 1) means[column] += row[column];
  }
  const divisor = Math.max(1, rows.length);
  for (let column = 0; column < width; column += 1) means[column] /= divisor;

  const variances = new Array<number>(width).fill(0);
  for (const row of rows) {
    for (let column = 0; column < width; column += 1) {
      const delta = row[column] - means[column];
      variances[column] += delta * delta;
    }
  }
  const standardDeviations = variances.map((variance) => {
    const sd = Math.sqrt(variance / divisor);
    return Number.isFinite(sd) && sd > 1e-12 ? sd : 1;
  });
  return { means, standardDeviations };
}

export function standardize(values: number[], stats: StandardizationStats): number[] {
  const normalized = new Array<number>(values.length);
  for (let index = 0; index < values.length; index += 1) {
    normalized[index] = (values[index] - (stats.means[index] ?? 0)) / (stats.standardDeviations[index] ?? 1);
  }
  return normalized;
}

export function predictLogisticProbability(model: LogisticRegressionModel, values: number[]): number {
  if (values.length !== model.coefficients.length || values.some((value) => !Number.isFinite(value))) {
    throw new Error('Prediction values must be a finite vector matching the coefficient count.');
  }
  let score = model.intercept;
  for (let index = 0; index < values.length; index += 1) {
    const normalized = (values[index] - (model.standardization.means[index] ?? 0))
      / (model.standardization.standardDeviations[index] ?? 1);
    score += normalized * (model.coefficients[index] ?? 0);
  }
  return sigmoid(Math.max(-35, Math.min(35, score)));
}

export function trainLogisticRegression(
  rows: Array<{ values: number[]; label: 0 | 1 }>,
  options: { epochs?: number; learningRate?: number; l2?: number } = {},
): LogisticRegressionModel {
  if (!rows.length) throw new Error('Cannot train logistic regression with zero rows.');
  const width = rows[0].values.length;
  if (!width || rows.some((row) => row.values.length !== width || row.values.some((v) => !Number.isFinite(v)))) {
    throw new Error('Training rows must contain equally sized finite feature vectors.');
  }
  if (rows.some((row) => row.label !== 0 && row.label !== 1)) {
    throw new Error('Training labels must be binary 0 or 1 values.');
  }
  const requestedEpochs = options.epochs ?? 700;
  const requestedLearningRate = options.learningRate ?? 0.05;
  const requestedL2 = options.l2 ?? 0.001;
  if (!Number.isFinite(requestedEpochs) || requestedEpochs < 1) throw new Error('epochs must be a finite positive number.');
  if (!Number.isFinite(requestedLearningRate) || requestedLearningRate <= 0) throw new Error('learningRate must be a finite positive number.');
  if (!Number.isFinite(requestedL2) || requestedL2 < 0) throw new Error('l2 must be a finite non-negative number.');
  const epochs = Math.floor(requestedEpochs);
  const learningRate = requestedLearningRate;
  const l2 = requestedL2;
  const valueRows = rows.map((row) => row.values);
  const standardization = computeStandardization(valueRows);
  const rowCount = rows.length;
  const normalized = new Float64Array(rowCount * width);
  const labels = new Uint8Array(rowCount);
  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    const row = rows[rowIndex];
    labels[rowIndex] = row.label;
    const offset = rowIndex * width;
    for (let column = 0; column < width; column += 1) {
      normalized[offset + column] = (row.values[column] - standardization.means[column])
        / standardization.standardDeviations[column];
    }
  }

  const coefficients = new Float64Array(width);
  const gradient = new Float64Array(width);
  let intercept = 0;
  const scale = 1 / rowCount;

  for (let epoch = 0; epoch < epochs; epoch += 1) {
    gradient.fill(0);
    let interceptGrad = 0;
    for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
      const offset = rowIndex * width;
      let score = intercept;
      for (let column = 0; column < width; column += 1) score += normalized[offset + column] * coefficients[column];
      const error = sigmoid(Math.max(-35, Math.min(35, score))) - labels[rowIndex];
      interceptGrad += error;
      for (let column = 0; column < width; column += 1) gradient[column] += error * normalized[offset + column];
    }
    intercept -= learningRate * interceptGrad * scale;
    for (let column = 0; column < width; column += 1) {
      coefficients[column] -= learningRate * (gradient[column] * scale + l2 * coefficients[column]);
    }
  }

  return { coefficients: Array.from(coefficients), intercept, standardization, epochs, learningRate, l2 };
}

export function binaryClassificationMetrics(
  labels: Array<0 | 1>,
  probabilities: number[],
  threshold = 0.5,
): BinaryMetrics {
  if (labels.length !== probabilities.length) throw new Error('Labels and probabilities must have equal length.');
  let truePositive = 0, trueNegative = 0, falsePositive = 0, falseNegative = 0;
  let brier = 0;
  for (let index = 0; index < labels.length; index += 1) {
    const label = labels[index];
    const probability = Math.max(0, Math.min(1, probabilities[index]));
    const predicted = probability >= threshold ? 1 : 0;
    brier += (probability - label) ** 2;
    if (predicted === 1 && label === 1) truePositive += 1;
    else if (predicted === 0 && label === 0) trueNegative += 1;
    else if (predicted === 1) falsePositive += 1;
    else falseNegative += 1;
  }
  const total = labels.length;
  const precisionDenominator = truePositive + falsePositive;
  const recallDenominator = truePositive + falseNegative;
  const precision = precisionDenominator ? truePositive / precisionDenominator : null;
  const recall = recallDenominator ? truePositive / recallDenominator : null;
  return {
    sampleCount: total,
    truePositive,
    trueNegative,
    falsePositive,
    falseNegative,
    accuracy: total ? (truePositive + trueNegative) / total : null,
    precision,
    recall,
    f1: precision !== null && recall !== null && precision + recall > 0 ? 2 * precision * recall / (precision + recall) : null,
    brierScore: total ? brier / total : null,
  };
}
