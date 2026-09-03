import { describe, expect, it } from 'vitest';
import {
  computeCscvPbo,
  fingerprintSelectionHypothesis,
  selectDeterministicBlockLength,
  statisticalValidationPolicyFingerprint,
  validateReturnEvidence,
  type StatisticalValidationPolicy,
} from '../services/statisticalValidation';

const policy = (alpha = 0.05): StatisticalValidationPolicy => ({
  familyWiseAlpha: alpha,
  minimumRawSample: 30,
  minimumEffectiveSample: 20,
  bootstrapSamples: 500,
  blockLengthMethod: 'acf_decay_block_length_v1',
  multiplicityMethod: 'DISTINCT_SELECTION_HYPOTHESES',
});

describe('CP07 statistical integrity', () => {
  it('counts distinct selection hypotheses rather than repeated evaluations', () => {
    const result = validateReturnEvidence(Array.from({ length: 80 }, () => 0.2), {
      selectionHypothesisFingerprints: ['candidate:a', 'candidate:a', 'candidate:b'],
      bootstrapSamples: 500,
      seed: 7,
    });
    expect(result.triedVariants).toBe(2);
    expect(result.selectionHypothesisFingerprints).toEqual(['candidate:a', 'candidate:b']);
    expect(result.multiplicityMethod).toBe('DISTINCT_SELECTION_HYPOTHESES');
  });

  it('selects the block length deterministically from dependence rather than sqrt(N)', () => {
    const autocorrelated = Array.from({ length: 100 }, (_, index) => Math.sin(index / 8) + index * 0.0001);
    const first = selectDeterministicBlockLength(autocorrelated);
    const second = selectDeterministicBlockLength(autocorrelated);
    expect(first).toBe(second);
    expect(first).not.toBe(Math.ceil(Math.sqrt(autocorrelated.length)));
  });

  it('versions policy-sensitive thresholds through the policy fingerprint', () => {
    expect(statisticalValidationPolicyFingerprint(policy(0.05))).not.toBe(statisticalValidationPolicyFingerprint(policy(0.10)));
  });

  it('reports INSUFFICIENT_STRUCTURE rather than inventing a PBO number', () => {
    const result = computeCscvPbo({
      source: 'DEVELOPMENT_SELECTION_MATRIX',
      candidateFingerprints: ['a', 'b', 'c'],
      partitionLabels: ['p1', 'p2', 'p3', 'p4'],
      matrix: [[1, 2, 3, 4], [1, 2, 3, 4], [1, 2, 3, 4]],
    });
    expect(result.state).toBe('INSUFFICIENT_STRUCTURE');
    expect(result.pbo).toBeNull();
  });

  it('computes CSCV/PBO from a complete development candidate matrix', () => {
    const candidates = ['a', 'b', 'c', 'd'].map((id) => fingerprintSelectionHypothesis({ id }));
    const result = computeCscvPbo({
      source: 'DEVELOPMENT_SELECTION_MATRIX',
      candidateFingerprints: candidates,
      partitionLabels: ['p1', 'p2', 'p3', 'p4'],
      matrix: [[1, 1, 1, 1], [2, 2, -2, -2], [0, 0, 0, 0], [-1, -1, -1, -1]],
    });
    expect(result.state).toBe('OK');
    expect(result.combinationsEvaluated).toBe(6);
    expect(result.pbo).not.toBeNull();
  });
});
