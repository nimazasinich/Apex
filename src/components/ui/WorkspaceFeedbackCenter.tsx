import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, ShieldAlert, X } from 'lucide-react';
import {
  WORKSPACE_FEEDBACK_EVENT,
  type WorkspaceFeedbackItem,
  type WorkspaceFeedbackTone,
} from '../../lib/workspaceFeedback';
import './WorkspaceFeedbackCenter.css';

const ICONS: Record<WorkspaceFeedbackTone, React.ComponentType<{ size?: number }>> = {
  success: CheckCircle2,
  error: ShieldAlert,
  warning: AlertTriangle,
  info: Info,
};

function FeedbackToast({ item, onDismiss }: { item: WorkspaceFeedbackItem; onDismiss: (id: string) => void }) {
  useEffect(() => {
    const timer = window.setTimeout(() => onDismiss(item.id), Math.max(1800, item.durationMs || 4600));
    return () => window.clearTimeout(timer);
  }, [item.durationMs, item.id, onDismiss]);

  const tone = item.tone || 'info';
  const Icon = ICONS[tone];
  return (
    <article className={`apex-feedback-toast tone-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <span className="apex-feedback-icon" aria-hidden="true"><Icon size={18} /></span>
      <span className="apex-feedback-copy">
        <strong>{item.title}</strong>
        {item.detail && <small>{item.detail}</small>}
        {item.actionLabel && item.onAction && (
          <button type="button" onClick={() => { item.onAction?.(); onDismiss(item.id); }}>{item.actionLabel}</button>
        )}
      </span>
      <button type="button" className="apex-feedback-dismiss" onClick={() => onDismiss(item.id)} aria-label="Dismiss notification"><X size={14} /></button>
      <i className="apex-feedback-progress" style={{ animationDuration: `${Math.max(1800, item.durationMs || 4600)}ms` }} />
    </article>
  );
}

export function WorkspaceFeedbackCenter() {
  const [items, setItems] = useState<WorkspaceFeedbackItem[]>([]);

  useEffect(() => {
    const onFeedback = (event: Event) => {
      const custom = event as CustomEvent<WorkspaceFeedbackItem>;
      if (!custom.detail?.title) return;
      setItems((current) => {
        const deduped = current.filter((item) => !(item.title === custom.detail.title && item.detail === custom.detail.detail));
        return [...deduped, custom.detail].slice(-4);
      });
    };
    window.addEventListener(WORKSPACE_FEEDBACK_EVENT, onFeedback);
    return () => window.removeEventListener(WORKSPACE_FEEDBACK_EVENT, onFeedback);
  }, []);

  const dismiss = React.useCallback((id: string) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  return (
    <div className="apex-feedback-center" aria-live="polite" aria-relevant="additions removals">
      {items.map((item) => <FeedbackToast key={item.id} item={item} onDismiss={dismiss} />)}
    </div>
  );
}
