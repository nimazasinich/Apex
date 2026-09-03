import type { EvidenceDependencyFamily, ObservationMetadataV1 } from './observationMetadata';

export const EVIDENCE_GRAPH_VERSION = 'evidence_graph_v1' as const;
export type AuthorityStage = 'RESEARCH' | 'SHADOW' | 'PAPER_FORWARD' | 'SIGNAL_ELIGIBLE' | 'LIVE_CONFIG_APPROVED';

export interface EvidenceGraphNodeV1 {
  id: string;
  kind: 'OBSERVATION' | 'FEATURE' | 'VOTE' | 'DECISION';
  dependencyFamily: EvidenceDependencyFamily;
  parentIds: string[];
  transformVersion: string;
  observation?: ObservationMetadataV1;
  authorityStage: AuthorityStage;
  allowedToInfluence: boolean;
}

export interface EvidenceGraphV1 {
  version: typeof EVIDENCE_GRAPH_VERSION;
  decisionId: string;
  authorityStage: AuthorityStage;
  nodes: EvidenceGraphNodeV1[];
}

export function effectiveIndependentSupport(nodes: Array<Pick<EvidenceGraphNodeV1, 'dependencyFamily' | 'allowedToInfluence'>>): number {
  return new Set(nodes.filter((node) => node.allowedToInfluence).map((node) => node.dependencyFamily)).size;
}

export function assertEvidenceGraph(graph: EvidenceGraphV1): void {
  const ids = new Set<string>();
  for (const node of graph.nodes) {
    if (!node.id || ids.has(node.id)) throw new Error('evidence_graph_duplicate_or_missing_id');
    ids.add(node.id);
  }
  for (const node of graph.nodes) {
    if (node.parentIds.some((parent) => !ids.has(parent))) throw new Error(`evidence_graph_missing_parent:${node.id}`);
  }
}
