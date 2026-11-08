/** Les petites pièces de la Knowledge Base : un statut, une action dite en mots, deux versions comparées. */
import { KB_STATUS_LABEL, lineDiff, type KbStatus } from '@ceed/shared';

const TONE: Record<KbStatus, string> = {
  draft: 'badge',
  analysis_pending: 'badge info',
  analysis_failed: 'badge stop',
  to_review: 'badge warn',
  changes_requested: 'badge warn',
  to_validate: 'badge info',
  published: 'badge ok',
  rejected: 'badge stop',
  archived: 'badge',
};

export function StatusBadge({ status }: { status: KbStatus }) {
  return <span className={TONE[status]}>{KB_STATUS_LABEL[status]}</span>;
}

export const ACTION_WORD: Record<string, string> = {
  created: 'Created',
  update_proposed: 'New version proposed',
  edited: 'Text changed — analysed and reviewed again',
  details_changed: 'Details changed',
  analysis_done: 'AI analysis completed',
  analysis_failed: 'AI analysis failed',
  reviewed: 'Reviewed — submitted for validation',
  review_changes: 'Changes requested at review',
  resubmitted: 'Sent back to review',
  approved: 'Approved by the president',
  published: 'Published',
  validation_changes: 'Changes requested by the president',
  rejected: 'Rejected',
  comment: 'Comment',
  flagged: 'Flagged by a member',
  finding_decided: 'Decision on a finding',
};

/** Deux textes, ligne à ligne : ce qui part en rouge, ce qui arrive en vert. */
export function LineDiff({ before, after }: { before: string; after: string }) {
  const lines = lineDiff(before, after);
  if (!lines.some((l) => l.op !== 'same')) return <div className="faint">The two texts are identical.</div>;
  return (
    <div className="kb-diff">
      {lines.map((l, i) => (
        <div key={i} className={l.op}>
          {l.op === 'add' ? '+ ' : l.op === 'del' ? '− ' : '  '}
          {l.text || ' '}
        </div>
      ))}
    </div>
  );
}
