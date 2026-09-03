import type { AcademyStrategyRecord } from '../types.ts';

export function rankAcademyStrategies(records: AcademyStrategyRecord[]): Map<string, number | null> {
  const measured = records
    .filter((record) => record.latestEvaluation.confidenceScore.state === 'EVALUATED' && record.latestEvaluation.confidenceScore.value != null)
    .sort((left, right) => {
      const confidenceDelta = Number(right.latestEvaluation.confidenceScore.value) - Number(left.latestEvaluation.confidenceScore.value);
      if (confidenceDelta !== 0) return confidenceDelta;
      const leftRank = left.latestEvaluation.rankScore.value;
      const rightRank = right.latestEvaluation.rankScore.value;
      if (leftRank != null && rightRank != null && leftRank !== rightRank) return rightRank - leftRank;
      if (leftRank != null && rightRank == null) return -1;
      if (leftRank == null && rightRank != null) return 1;
      return left.recordId.localeCompare(right.recordId);
    });
  const ranks = new Map<string, number | null>(records.map((record) => [record.recordId, null]));
  measured.forEach((record, index) => ranks.set(record.recordId, index + 1));
  return ranks;
}
