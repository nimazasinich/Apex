/**
 * Canonical repo-relative path for the Decision Memory ML export. This is the
 * primary candidate checked by loadRawDecisionLogs() in
 * scripts/lib/decisionMemoryLoader.mts (DEFAULT_DECISION_MEMORY_INPUTS[0]),
 * written by scripts/utilities/syncDecisionMemoryExport.mts, and referenced
 * in operator-facing messages by exportDecisionDataset.mts. Kept as a single
 * constant so all three stay in sync if the path ever moves.
 */
export const DECISION_MEMORY_EXPORT_REL_PATH = 'Doc/automation/ml_dataset/decision_memory_export_v1.json';
