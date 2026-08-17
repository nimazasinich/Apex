import React, { useEffect, useState } from 'react';
import { NotebookPen, Save, Trash2 } from 'lucide-react';
import type { BacktestNote } from './backtestPersistence';

const MAX_NOTE_LENGTH = 4000;

/**
 * Per-run evidence notes editor. Notes are browser-local and keyed by the
 * canonical server runId, so a note only ever attaches to one concrete,
 * completed replay. Nothing here is sent to the server or fabricated.
 */
export function BacktestNotesPanel({
  runId,
  savedNote,
  runLabel,
  onSave,
  onClear,
}: {
  runId: string | null;
  savedNote: BacktestNote | undefined;
  runLabel: string;
  onSave: (text: string) => void;
  onClear: () => void;
}) {
  const [draft, setDraft] = useState(savedNote?.text ?? '');

  // Re-seed the editor whenever the active run (or its persisted note) changes.
  useEffect(() => {
    setDraft(savedNote?.text ?? '');
  }, [runId, savedNote?.text]);

  if (!runId) {
    return (
      <section className="apex-bt-evidence-block notes">
        <header><span><NotebookPen size={14} />Evidence Notes</span><small>This browser</small></header>
        <p className="apex-bt-notes-empty">Notes attach to a completed run. Run a backtest to record evidence notes for it.</p>
      </section>
    );
  }

  const persisted = savedNote?.text ?? '';
  const dirty = draft !== persisted;
  const hasPersisted = persisted.trim().length > 0;

  return (
    <section className="apex-bt-evidence-block notes">
      <header>
        <span><NotebookPen size={14} />Evidence Notes</span>
        <small>{savedNote ? `Saved ${new Date(savedNote.updatedAt).toLocaleString()}` : 'This browser · not yet saved'}</small>
      </header>
      <div className="apex-bt-notes-body">
        <label className="apex-bt-notes-run" htmlFor="apex-bt-note-input">
          <span>Attached to run</span>
          <code>{runLabel}</code>
        </label>
        <textarea
          id="apex-bt-note-input"
          className="apex-bt-notes-input"
          value={draft}
          maxLength={MAX_NOTE_LENGTH}
          placeholder="Record observations about this run — data caveats, decisions, follow-ups. Stored locally in this browser only."
          onChange={(event) => setDraft(event.target.value.slice(0, MAX_NOTE_LENGTH))}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && dirty) {
              event.preventDefault();
              onSave(draft);
            }
          }}
        />
        <div className="apex-bt-notes-actions">
          <small>{draft.length}/{MAX_NOTE_LENGTH}{dirty ? ' · unsaved' : hasPersisted ? ' · saved' : ''}</small>
          <div>
            <button type="button" className="apex-bt-notes-clear" disabled={!hasPersisted} onClick={() => { setDraft(''); onClear(); }}>
              <Trash2 size={13} />Clear
            </button>
            <button type="button" className="apex-bt-notes-save" disabled={!dirty} onClick={() => onSave(draft)}>
              <Save size={13} />Save note
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
