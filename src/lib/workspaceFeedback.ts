export const WORKSPACE_FEEDBACK_EVENT = 'apex:workspace-feedback';

export type WorkspaceFeedbackTone = 'success' | 'error' | 'warning' | 'info';

export interface WorkspaceFeedbackInput {
  title: string;
  detail?: string;
  tone?: WorkspaceFeedbackTone;
  durationMs?: number;
  actionLabel?: string;
  onAction?: () => void;
}

export interface WorkspaceFeedbackItem extends WorkspaceFeedbackInput {
  id: string;
  createdAt: number;
}

function feedbackId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `feedback_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function notifyWorkspace(input: WorkspaceFeedbackInput | string): WorkspaceFeedbackItem | null {
  if (typeof window === 'undefined') return null;
  const normalized: WorkspaceFeedbackInput = typeof input === 'string' ? { title: input } : input;
  const item: WorkspaceFeedbackItem = {
    id: feedbackId(),
    createdAt: Date.now(),
    tone: 'info',
    durationMs: 4600,
    ...normalized,
  };
  window.dispatchEvent(new CustomEvent<WorkspaceFeedbackItem>(WORKSPACE_FEEDBACK_EVENT, { detail: item }));
  return item;
}
