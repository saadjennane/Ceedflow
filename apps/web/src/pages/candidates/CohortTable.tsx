import {
  COHORT_STATUSES,
  COHORT_TONE,
  type Candidate,
  type CohortStatus,
  type EditionDetail,
  type FormField,
} from '@ceed/shared';
import { useState } from 'react';
import { api } from '../../lib/api';
import { Icon } from '../../ui/Icon';
import { ConfirmDialog, Modal, useToast } from '../../ui/Overlays';
import { TagField } from '../../ui/Field';

/** The columns that belong to the program rather than to the application form. */
const PROGRAM_COLUMNS = [
  { id: 'track', label: 'Track' },
  { id: 'mentor', label: 'Mentor' },
  { id: 'progress', label: 'Progress' },
  { id: 'status', label: 'Status' },
];

/**
 * The cohort is the edition's promotion, not a track's: it spans every track,
 * and each startup stays in the one it was selected on.
 */
export function CohortTable({
  edition,
  members,
  fields,
  onChanged,
}: {
  edition: EditionDetail;
  members: Candidate[];
  fields: FormField[];
  onChanged: () => void;
}) {
  const [trackFilter, setTrackFilter] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [shown, setShown] = useState<string[] | null>(null);
  const [withdrawing, setWithdrawing] = useState<Candidate | null>(null);
  const [editingBench, setEditingBench] = useState(false);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const trackName = (id: string) => edition.tracks.find((t) => t.id === id)?.name ?? '—';
  const rows = trackFilter ? members.filter((m) => m.trackId === trackFilter) : members;
  const usedTracks = edition.tracks.filter((t) => members.some((m) => m.trackId === t.id));

  // Program facts first, then whichever application answers the team flagged —
  // the same rule the candidates table uses, so there is one rule to remember.
  const columns = shown ?? [...PROGRAM_COLUMNS.map((c) => c.id), ...fields.filter((f) => f.showInTable).map((f) => f.id)];
  const on = (id: string) => columns.includes(id);

  const patch = async (candidate: Candidate, body: Record<string, unknown>, said: string) => {
    setBusy(true);
    try {
      await api.patch(`/api/candidates/${candidate.id}`, body);
      onChanged();
      toast(said);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="row wrap">
        <span className="faint" style={{ fontSize: 12.5 }}>
          <span className="num">{members.length}</span> startup{members.length === 1 ? '' : 's'} selected across{' '}
          <span className="num">{usedTracks.length}</span> track{usedTracks.length === 1 ? '' : 's'}
          {edition.seats > 0 && (
            <>
              {' '}
              · <span className="num">{edition.seats}</span> seats
            </>
          )}
        </span>
        <div className="spacer" />
        <button className="btn sm" onClick={() => setPicking(true)}>
          <Icon name="grid" size={13} /> Columns
        </button>
        <button className="btn sm" onClick={() => setEditingBench(true)}>
          <Icon name="users" size={13} /> Mentors
          <span className="num">{edition.mentors.length}</span>
        </button>
      </div>

      {usedTracks.length > 1 && (
        <div className="work-pick">
          <button className={!trackFilter ? 'track on' : 'track'} onClick={() => setTrackFilter(null)}>
            All tracks <span className="num">{members.length}</span>
          </button>
          {usedTracks.map((t) => (
            <button
              key={t.id}
              className={trackFilter === t.id ? 'track on' : 'track'}
              onClick={() => setTrackFilter(t.id)}
            >
              {t.name} <span className="num">{members.filter((m) => m.trackId === t.id).length}</span>
            </button>
          ))}
        </div>
      )}

      <div className="callout">
        <Icon name="compass" size={15} />
        <div>
          <strong>The cohort follows the tracks.</strong> Each startup stays in the track it was selected on, and is
          mentored by that track's team. Moving one here moves it in the workflow too.
        </div>
      </div>

      {!members.length ? (
        <div className="empty">
          <h3>No cohort yet</h3>
          <p>A Selection whose output is the cohort forms it. Publish that selection and its startups land here.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Startup</th>
                {fields.filter((f) => on(f.id)).map((f) => (
                  <th key={f.id}>{f.label}</th>
                ))}
                {on('track') && <th>Track</th>}
                {on('mentor') && <th>Mentor</th>}
                {on('progress') && <th>Progress</th>}
                {on('status') && <th>Status</th>}
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((member) => (
                <tr key={member.id}>
                  <td className="name">
                    {member.orgName}
                    {member.contactName && (
                      <div className="faint" style={{ fontWeight: 400, fontSize: 12 }}>
                        {member.contactName}
                      </div>
                    )}
                  </td>

                  {fields.filter((f) => on(f.id)).map((f) => (
                    <td key={f.id} className="muted">
                      {String(member.answers[f.id] ?? '—')}
                    </td>
                  ))}

                  {on('track') && (
                  <td>
                    <select
                      className="status-select"
                      value={member.trackId}
                      disabled={busy || edition.tracks.length < 2}
                      onChange={(e) =>
                        patch(member, { trackId: e.target.value }, `${member.orgName} moved to ${trackName(e.target.value)}.`)
                      }
                    >
                      {edition.tracks.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  )}

                  {on('mentor') && (
                  <td>
                    <select
                      className="status-select"
                      value={member.mentor}
                      disabled={busy}
                      onChange={(e) =>
                        patch(
                          member,
                          { mentor: e.target.value },
                          e.target.value ? `${e.target.value} mentors ${member.orgName}.` : 'Mentor cleared.',
                        )
                      }
                    >
                      <option value="">Unassigned</option>
                      {[...new Set([...edition.mentors, member.mentor].filter(Boolean))].map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </td>
                  )}

                  {on('progress') && (
                  <td style={{ minWidth: 140 }}>
                    <div className="row" style={{ gap: 8 }}>
                      <div className="bar" style={{ flex: 1 }}>
                        <i style={{ width: '0%' }} />
                      </div>
                      <span className="faint num" style={{ fontSize: 12 }} title="Comes from deliverables and sessions, which are not built yet">
                        —
                      </span>
                    </div>
                  </td>
                  )}

                  {on('status') && (
                  <td>
                    <select
                      className="status-select"
                      value={member.cohortStatus}
                      disabled={busy}
                      onChange={(e) =>
                        patch(member, { cohortStatus: e.target.value }, `${member.orgName} is ${e.target.value.toLowerCase()}.`)
                      }
                      style={{
                        color: `var(--${COHORT_TONE[member.cohortStatus as CohortStatus] === 'ok' ? 'ok' : COHORT_TONE[member.cohortStatus as CohortStatus] === 'warn' ? 'warn' : 'blue'})`,
                      }}
                    >
                      {COHORT_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </td>
                  )}

                  <td style={{ textAlign: 'right' }}>
                    <button className="btn ghost sm" disabled={busy} onClick={() => setWithdrawing(member)}>
                      Withdraw
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {members.length > 0 && on('progress') && (
        <p className="faint" style={{ margin: 0, fontSize: 12 }}>
          Progress is left blank on purpose: it will be computed from deliverables and sessions once those blocks
          exist, not typed in by hand. Hide the column from <strong>Columns</strong> until then if it bothers you.
        </p>
      )}

      {picking && (
        <Modal
          title="Columns"
          subtitle="What the cohort table shows. Program facts are editable in place; the rest come from the application form."
          onClose={() => setPicking(false)}
          footer={
            <>
              <button
                className="btn ghost"
                onClick={() =>
                  setShown([
                    ...PROGRAM_COLUMNS.map((c) => c.id),
                    ...fields.filter((f) => f.showInTable).map((f) => f.id),
                  ])
                }
              >
                Reset
              </button>
              <div className="spacer" />
              <button className="btn primary" onClick={() => setPicking(false)}>
                Done
              </button>
            </>
          }
        >
          <div className="eyebrow">The program</div>
          <div className="rows">
            {PROGRAM_COLUMNS.map((c) => (
              <label className="check rowcard" style={{ padding: '9px 11px' }} key={c.id}>
                <input
                  type="checkbox"
                  checked={on(c.id)}
                  onChange={(e) => setShown(e.target.checked ? [...columns, c.id] : columns.filter((x) => x !== c.id))}
                />
                <span style={{ flex: 1, fontSize: 13 }}>{c.label}</span>
                {c.id === 'progress' && <span className="badge warn">Not tracked yet</span>}
              </label>
            ))}
          </div>

          {fields.length > 0 && (
            <>
              <div className="eyebrow">From the application</div>
              <div className="rows">
                {fields.map((f) => (
                  <label className="check rowcard" style={{ padding: '9px 11px' }} key={f.id}>
                    <input
                      type="checkbox"
                      checked={on(f.id)}
                      onChange={(e) =>
                        setShown(e.target.checked ? [...columns, f.id] : columns.filter((x) => x !== f.id))
                      }
                    />
                    <span style={{ fontSize: 13 }}>{f.label}</span>
                  </label>
                ))}
              </div>
            </>
          )}
        </Modal>
      )}

      {withdrawing && (
        <ConfirmDialog
          title={`Withdraw ${withdrawing.orgName}?`}
          body="It leaves the cohort and is marked withdrawn. The selection that chose it keeps its decision, so you can put it back by setting its status again."
          confirmLabel="Withdraw"
          destructive
          onClose={() => setWithdrawing(null)}
          onConfirm={() => patch(withdrawing, { status: 'Withdrawn' }, `${withdrawing.orgName} withdrawn.`)}
        />
      )}

      {editingBench && (
        <MentorBench edition={edition} onClose={() => setEditingBench(false)} onSaved={onChanged} />
      )}
    </>
  );
}

function MentorBench({
  edition,
  onClose,
  onSaved,
}: {
  edition: EditionDetail;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [mentors, setMentors] = useState(edition.mentors);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  return (
    <Modal
      title="Mentors"
      subtitle="Who this edition can put in front of its startups. Names for now — they become directory profiles once Community is built."
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              await api.patch(`/api/editions/${edition.id}`, { mentors });
              setSaving(false);
              onSaved();
              onClose();
              toast('Mentors updated.');
            }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <TagField label="Mentor bench" values={mentors} onChange={setMentors} placeholder="Add a mentor" />
    </Modal>
  );
}
