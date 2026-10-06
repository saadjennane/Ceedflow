/**
 * Ce qu'on emporte de cet écran, et pour qui.
 *
 * Export used to mean one thing and did it without asking. There are two now,
 * and they are not variants of each other: a spreadsheet is the whole panel in
 * one grid, read on a screen; an evaluation sheet is one juror's paper about
 * one startup, filed with the rest of that startup's file. So the button asks
 * first.
 *
 * Jurors and startups are picked side by side rather than one after the other.
 * The number that matters is how many sheets come out — fourteen jurors by
 * twenty-four startups is three hundred and thirty-six pages — and that figure
 * cannot exist until both halves are chosen.
 */
import { type EvaluationCriterion, type EvaluationScale, type PersonRef, type SheetSubject } from '@ceed/shared';
import { useState } from 'react';
import { downloadSheets } from '../../lib/evalSheet';
import { Icon } from '../../ui/Icon';
import { Modal } from '../../ui/Overlays';

/** One startup, and what each juror put on it. */
export interface Markable {
  id: string;
  orgName: string;
  scores: {
    evaluatorId: string;
    evaluatorName: string;
    marks: Record<string, number>;
    /** Null until they file it — an unfinished sheet has nothing to print. */
    submittedAt: string | null;
    normalised: number | null;
    withdrawnAt: string | null;
  }[];
}

/** A list where everything can be picked at once, because most of the time it is. */
function PickList({
  title,
  rows,
  picked,
  onPicked,
}: {
  title: string;
  rows: { id: string; label: string; hint?: string }[];
  picked: Set<string>;
  onPicked: (next: Set<string>) => void;
}) {
  const all = rows.length > 0 && rows.every((r) => picked.has(r.id));
  const some = rows.some((r) => picked.has(r.id));

  const toggle = (id: string) => {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onPicked(next);
  };

  return (
    <div className="stack" style={{ gap: 6, flex: 1, minWidth: 0 }}>
      <label className="row" style={{ gap: 8, fontSize: 12.5, fontWeight: 600 }}>
        <input
          type="checkbox"
          checked={all}
          /* Partly picked is its own state: a box that reads empty while six
             of fourteen are ticked says something untrue. */
          ref={(el) => el && (el.indeterminate = some && !all)}
          onChange={() => onPicked(all ? new Set() : new Set(rows.map((r) => r.id)))}
        />
        {title}
        <span className="faint" style={{ fontWeight: 400 }}>
          {picked.size} of {rows.length}
        </span>
      </label>

      <div className="rows" style={{ maxHeight: 280, overflowY: 'auto' }}>
        {rows.map((row) => (
          <label className="rowcard row" key={row.id} style={{ padding: '7px 10px', gap: 9, cursor: 'pointer' }}>
            <input type="checkbox" checked={picked.has(row.id)} onChange={() => toggle(row.id)} />
            <span style={{ flex: 1, fontSize: 12.5 }}>{row.label}</span>
            {row.hint && (
              <span className="faint" style={{ fontSize: 11.5 }}>
                {row.hint}
              </span>
            )}
          </label>
        ))}
      </div>
    </div>
  );
}

export function ExportDialog({
  blockName,
  criteria,
  scale,
  markedOutOf,
  evaluators,
  rows,
  onSpreadsheet,
  onClose,
}: {
  blockName: string;
  criteria: EvaluationCriterion[];
  scale: EvaluationScale;
  markedOutOf: number;
  evaluators: PersonRef[];
  rows: Markable[];
  /** The export this screen already had, run as it always was. */
  onSpreadsheet: () => void;
  onClose: () => void;
}) {
  const [what, setWhat] = useState<'' | 'sheets'>('');
  const [jurors, setJurors] = useState<Set<string>>(new Set(evaluators.map((e) => e.id)));
  const [startups, setStartups] = useState<Set<string>>(new Set(rows.map((r) => r.id)));

  /* Only the pairs that exist: a juror who never scored a startup has no sheet
     to print, and a blank page in a file of three hundred is a page somebody
     has to work out the meaning of. */
  const subjects: SheetSubject[] = rows
    .filter((row) => startups.has(row.id))
    .flatMap((row) =>
      row.scores
        .filter((s) => jurors.has(s.evaluatorId) && s.submittedAt && !s.withdrawnAt)
        .map((s) => ({
          juror: s.evaluatorName || evaluators.find((e) => e.id === s.evaluatorId)?.name || '',
          startup: row.orgName,
          on: s.submittedAt ?? '',
          marks: s.marks,
          overall: s.normalised,
        })),
    );

  const possible = startups.size * jurors.size;

  const run = () => {
    downloadSheets({ name: blockName, criteria, scale, markedOutOf }, subjects);
    onClose();
  };

  if (!what) {
    return (
      <Modal title="Export" subtitle="Two things, and they are not the same thing." onClose={onClose}>
        <div className="rows">
          <button
            className="rowcard row"
            style={{ padding: '12px 14px', gap: 12, width: '100%', textAlign: 'left' }}
            onClick={() => {
              onSpreadsheet();
              onClose();
            }}
          >
            <Icon name="grid" size={16} />
            <span style={{ flex: 1 }}>
              <strong style={{ fontSize: 13 }}>The spreadsheet</strong>
              <div className="faint" style={{ fontSize: 12 }}>
                Every juror's marks in one grid, and a sheet per startup behind it.
              </div>
            </span>
          </button>

          <button
            className="rowcard row"
            style={{ padding: '12px 14px', gap: 12, width: '100%', textAlign: 'left' }}
            onClick={() => setWhat('sheets')}
          >
            <Icon name="file" size={16} />
            <span style={{ flex: 1 }}>
              <strong style={{ fontSize: 13 }}>Evaluation sheets</strong>
              <div className="faint" style={{ fontSize: 12 }}>
                One page per startup and juror, as the grid they filled in. A PDF, to file or to print.
              </div>
            </span>
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      title="Evaluation sheets"
      subtitle="One page per startup and juror. Only the pairs that were actually marked come out."
      wide
      onBack={() => setWhat('')}
      onClose={onClose}
      footer={
        <>
          <span className="faint" style={{ fontSize: 12.5, flex: 1 }}>
            {subjects.length} page{subjects.length === 1 ? '' : 's'}
            {possible > subjects.length && ` · ${possible - subjects.length} never marked`}
          </span>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={!subjects.length} onClick={run}>
            <Icon name="file" size={14} /> Export {subjects.length}
          </button>
        </>
      }
    >
      <div className="row" style={{ gap: 16, alignItems: 'flex-start' }}>
        <PickList
          title="Jury"
          rows={evaluators.map((e) => ({ id: e.id, label: e.name }))}
          picked={jurors}
          onPicked={setJurors}
        />
        <PickList
          title="Startups"
          rows={rows.map((r) => ({
            id: r.id,
            label: r.orgName,
            hint: `${r.scores.filter((s) => s.submittedAt && !s.withdrawnAt).length} marked`,
          }))}
          picked={startups}
          onPicked={setStartups}
        />
      </div>
    </Modal>
  );
}
