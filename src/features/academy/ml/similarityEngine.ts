import { createHash } from 'node:crypto';
import type { AcademyStrategyRecord } from '../types.ts';

export function cosineSimilarity(left: number[], right: number[]): number | null {
  if (!left.length || left.length !== right.length) return null;
  const leftNorm = Math.sqrt(left.reduce((sum, value) => sum + value * value, 0));
  const rightNorm = Math.sqrt(right.reduce((sum, value) => sum + value * value, 0));
  if (leftNorm === 0 || rightNorm === 0) return null;
  const dot = left.reduce((sum, value, index) => sum + value * right[index], 0);
  return Number((dot / (leftNorm * rightNorm)).toFixed(6));
}

export function findSimilarStrategies(
  target: AcademyStrategyRecord,
  candidates: AcademyStrategyRecord[],
  limit = 5,
): Array<{ recordId: string; strategyId: string; similarity: number }> {
  return candidates
    .filter((candidate) => candidate.recordId !== target.recordId)
    .map((candidate) => ({ candidate, similarity: cosineSimilarity(target.embedding, candidate.embedding) }))
    .filter((entry): entry is { candidate: AcademyStrategyRecord; similarity: number } => entry.similarity != null)
    .sort((left, right) => right.similarity - left.similarity || left.candidate.recordId.localeCompare(right.candidate.recordId))
    .slice(0, Math.max(0, limit))
    .map(({ candidate, similarity }) => ({ recordId: candidate.recordId, strategyId: candidate.strategyId, similarity }));
}

export function assignSimilarityClusters(records: AcademyStrategyRecord[], threshold = 0.72): Map<string, string> {
  const assignments = new Map<string, string>();
  for (const record of [...records].sort((left, right) => left.recordId.localeCompare(right.recordId))) {
    if (assignments.has(record.recordId)) continue;
    const clusterMembers = [record.recordId];
    assignments.set(record.recordId, 'pending');
    for (const candidate of records) {
      if (assignments.has(candidate.recordId)) continue;
      const similarity = cosineSimilarity(record.embedding, candidate.embedding);
      if (similarity != null && similarity >= threshold) {
        assignments.set(candidate.recordId, 'pending');
        clusterMembers.push(candidate.recordId);
      }
    }
    const clusterId = `academy-cluster-${createHash('sha256').update(clusterMembers.sort().join('|')).digest('hex').slice(0, 12)}`;
    for (const recordId of clusterMembers) assignments.set(recordId, clusterId);
  }
  return assignments;
}
