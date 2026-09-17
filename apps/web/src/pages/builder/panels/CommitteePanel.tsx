import {
  windowMinutes,
  type Block,
  type BlockOutcome,
  type Candidate,
  type CommitteeAssignment,
  type CommitteeConfig,
  type CommitteeSession,
  type CommitteeSlot,
  type TimeWindow,
} from '@ceed/shared';
import { useRef, useState } from 'react';
import { api } from '../../../lib/api';
import { formatDate } from '../../../lib/format';
import { useAsync } from '../../../lib/useAsync';
import { DateField, NumberField, SelectField, TagField, TextField } from '../../../ui/Field';
import { Icon } from '../../../ui/Icon';
import { ConfirmDialog, Modal, useToast } from '../../../ui/Overlays';
import { OutcomeBadge } from './shared';

/* ------------------------------------------------------------------ */
/* Setup                                                               */
/* ------------------------------------------------------------------ */

export function CommitteeSetup({
  config,
  patch,
}: {
  config: CommitteeConfig;
  patch: (partial: Partial<CommitteeConfig>) => void;
}) {
  return (
    <>
      <div className="callout">
        <Icon name="gavel" size={15} />
        The committee organises the sittings: who is seen, when, and how the startups answer. It does not score — an{' '}
        <strong>Evaluation</strong> block dropped into this same phase does that, sitting by sitting.
      </div>

      <h3 className="section-title">Who is seen</h3>
      <p className="faint" style={{ margin: 0, fontSize: 12.5 }}>
        Whoever the selection before this phase sent through. They wait in the pool until you seat them on a sitting.
      </p>

      <div className="public-sep" />

      <h3 className="section-title">How startups answer</h3>
      <SelectField
        label="Invitation"
        value={config.rsvpMode}
        onChange={(v) => patch({ rsvpMode: v as CommitteeConfig['rsvpMode'] })}
        options={[
          { value: 'slots', label: 'They pick a time from the sitting' },
          { value: 'confirm', label: 'They confirm or decline' },
          { value: 'none', label: 'No invitation — the team places them' },
        ]}
        help="Each seated startup gets a personal link. With times, the slots come from the sitting's own hours."
      />
      {config.rsvpMode !== 'none' && (
        <DateField
          label="Answer by"
          value={config.rsvpDeadline}
          onChange={(v) => patch({ rsvpDeadline: v })}
          help="After this date the link stops accepting answers."
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Sittings — the action                                               */
/* ------------------------------------------------------------------ */

interface AssignmentView {
  assignment: CommitteeAssignment;
  candidate: Candidate;
  slot: CommitteeSlot | null;
  score: number | null;
  submitted: number;
  outcomeId: string | null;
}

interface SessionView {
  session: CommitteeSession;
  slots: CommitteeSlot[];
  assignments: AssignmentView[];
  capacity: number;
}

interface CommitteeView {
  config: CommitteeConfig;
  sessions: SessionView[];
  pool: { candidate: Candidate }[];
  intakeFrom: string | null;
  evaluation: { blockId: string; name: string; criteria: number; outcomes: BlockOutcome[] } | null;
}

const RSVP_TONE: Record<string, string> = {
  pending: 'badge warn',
  confirmed: 'badge ok',
  declined: 'badge stop',
};

export function CommitteeSittings({
  block,
  dirty,
  onChanged,
  onOpenBlock,
}: {
  block: Block;
  dirty: boolean;
  onChanged: () => void;
  onOpenBlock: (id: string) => void;
}) {
  const view = useAsync(() => api.get<CommitteeView>(`/api/blocks/${block.id}/committee`), block.id);
  const [editing, setEditing] = useState<CommitteeSession | 'new' | null>(null);
  const [picking, setPicking] = useState<SessionView | null>(null);
  const [busy, setBusy] = useState(false);
  const drag = useRef<AssignmentView | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const toast = useToast();

  if (view.error) return <div className="empty">{view.error}</div>;
  if (!view.data) return <div className="empty">Loading…</div>;

  const { sessions, pool, evaluation, intakeFrom, config } = view.data;
  const seated = sessions.reduce((n, s) => n + s.assignments.length, 0);
  const confirmed = sessions.reduce(
    (n, s) => n + s.assignments.filter((a) => a.assignment.rsvpState === 'confirmed').length,
    0,
  );

  const moveTo = async (assignmentId: string, slotIndex: number | null) => {
    setBusy(true);
    try {
      view.set(await api.post<CommitteeView>(`/api/assignments/${assignmentId}/slot`, { slotIndex }));
    } finally {
      setBusy(false);
      setOver(null);
      drag.current = null;
    }
  };

  const copyLink = (row: AssignmentView) => {
    navigator.clipboard?.writeText(`${window.location.origin}/book/${row.assignment.token}`);
    toast('Invitation link copied.');
  };

  const removeSeat = async (row: AssignmentView) => {
    await api.del(`/api/assignments/${row.assignment.id}`);
    view.reload();
  };

  return (
    <>
      {dirty && (
        <div className="callout warn">
          <Icon name="alert" size={15} />
          You have unsaved changes in Setup. What happens here is saved immediately and separately.
        </div>
      )}

      {evaluation ? (
        <div className="callout ok">
          <Icon name="star" size={15} />
          <div style={{ flex: 1 }}>
            Scored by <strong>{evaluation.name}</strong>, in this phase — {evaluation.criteria} criteria, each jury
            marking its own panel.
            <div style={{ marginTop: 7 }}>
              <button className="btn sm" onClick={() => onOpenBlock(evaluation.blockId)}>
                <Icon name="arrowRight" size={13} /> Open {evaluation.name}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="callout warn">
          <Icon name="alert" size={15} />
          <div>
            <strong>Nothing scores these sittings.</strong> Drop an <strong>Evaluation</strong> block into this phase
            and it picks the committee up on its own — that is where the jury's grid and marks live.
          </div>
        </div>
      )}

      <div className="row wrap">
        <span className="badge info num">{sessions.length} sittings</span>
        <span className="badge num">{seated} seated</span>
        {config.rsvpMode !== 'none' && <span className="badge num">{confirmed} confirmed</span>}
        <span className={pool.length ? 'badge warn num' : 'badge num'}>{pool.length} in the pool</span>
        <div className="spacer" />
        <button className="btn sm" onClick={() => setEditing('new')}>
          <Icon name="plus" size={13} /> Add committee
        </button>
      </div>

      {intakeFrom && (
        <p className="faint" style={{ margin: 0, fontSize: 12.5 }}>
          The pool is whoever <strong>{intakeFrom}</strong> sent through.
        </p>
      )}

      {!sessions.length ? (
        <div className="empty">
          <h3>No committee yet</h3>
          <p>Create a sitting, give it its hours and a time per startup, and its slots appear on their own.</p>
          <button className="btn primary" onClick={() => setEditing('new')}>
            <Icon name="plus" /> Add committee
          </button>
        </div>
      ) : (
        sessions.map((sv) => {
          const placed = new Map(
            sv.assignments
              .filter((a) => a.assignment.slotIndex !== null)
              .map((a) => [a.assignment.slotIndex as number, a]),
          );
          const unplaced = sv.assignments.filter((a) => a.assignment.slotIndex === null);
          const crowded = sv.assignments.length > sv.capacity;

          return (
            <section className="card" key={sv.session.id}>
              <div className="rowcard-head" style={{ padding: '12px 14px', borderBottom: '1px solid var(--line)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontFamily: 'var(--display)', fontSize: 14 }}>{sv.session.name}</div>
                  <div className="faint" style={{ fontSize: 12 }}>
                    {formatDate(sv.session.heldOn)} ·{' '}
                    {sv.session.windows.map((w) => `${w.startsAt}–${w.endsAt}`).join(' + ')} ·{' '}
                    <span className="num">{sv.session.minutesPerStartup}</span> min each
                    {sv.session.location && ` · ${sv.session.location}`}
                  </div>
                </div>
                <span className={crowded ? 'badge stop num' : 'badge num'} title="Seated of slots available">
                  {sv.assignments.length}/{sv.capacity}
                </span>
                {sv.session.jury.length > 0 && (
                  <span className="badge" title={sv.session.jury.join(', ')}>
                    <Icon name="users" size={12} /> {sv.session.jury.length}
                  </span>
                )}
                <button className="btn ghost icon sm" onClick={() => setEditing(sv.session)} aria-label="Edit committee">
                  <Icon name="settings" size={14} />
                </button>
              </div>

              <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div className="slot-rows">
                  {sv.slots.map((slot, i) => {
                    const breaking = i > 0 && slot.windowIndex !== sv.slots[i - 1].windowIndex;
                    const row = placed.get(slot.index);
                    const key = `${sv.session.id}:${slot.index}`;
                    return (
                      <div key={slot.index}>
                        {breaking && <div className="slot-break">break</div>}
                        <div
                          className={`slot-row${over === key ? ' over' : ''}${row ? '' : ' free'}`}
                          onDragOver={(e) => {
                            e.preventDefault();
                            setOver(key);
                          }}
                          onDragLeave={() => setOver((o) => (o === key ? null : o))}
                          onDrop={(e) => {
                            e.preventDefault();
                            if (drag.current) moveTo(drag.current.assignment.id, slot.index);
                          }}
                        >
                          <span className="slot-time num">{slot.startsAt}</span>
                          {row ? (
                            <SeatedStartup
                              row={row}
                              outcomes={evaluation?.outcomes ?? []}
                              rsvp={config.rsvpMode !== 'none'}
                              busy={busy}
                              onDragStart={() => {
                                drag.current = row;
                              }}
                              onCopyLink={() => copyLink(row)}
                              onRemove={() => removeSeat(row)}
                            />
                          ) : (
                            <span className="faint" style={{ fontSize: 12.5 }}>
                              free
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div
                  className={`unplaced${over === `${sv.session.id}:none` ? ' over' : ''}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setOver(`${sv.session.id}:none`);
                  }}
                  onDragLeave={() => setOver((o) => (o === `${sv.session.id}:none` ? null : o))}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (drag.current) moveTo(drag.current.assignment.id, null);
                  }}
                >
                  <span className="eyebrow">Not placed</span>
                  {unplaced.length ? (
                    unplaced.map((row) => (
                      <SeatedStartup
                        key={row.assignment.id}
                        row={row}
                        outcomes={evaluation?.outcomes ?? []}
                        rsvp={config.rsvpMode !== 'none'}
                        busy={busy}
                        onDragStart={() => {
                          drag.current = row;
                        }}
                        onCopyLink={() => copyLink(row)}
                        onRemove={() => removeSeat(row)}
                      />
                    ))
                  ) : (
                    <span className="faint" style={{ fontSize: 12.5 }}>
                      Drag a startup here to take it off the timetable without removing it.
                    </span>
                  )}
                </div>

                <div className="row">
                  <button className="btn sm" onClick={() => setPicking(sv)} disabled={!pool.length}>
                    <Icon name="plus" size={13} /> Seat from the pool
                  </button>
                  <span className="faint" style={{ fontSize: 12 }}>
                    Drag a startup onto another time to swap them over.
                  </span>
                </div>
              </div>
            </section>
          );
        })
      )}

      {pool.length > 0 && (
        <p className="faint" style={{ margin: 0, fontSize: 12.5 }}>
          Waiting in the pool: {pool.map((p) => p.candidate.orgName).join(', ')}.
        </p>
      )}

      {editing && (
        <SessionModal
          blockId={block.id}
          session={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            view.reload();
            onChanged();
          }}
        />
      )}

      {picking && (
        <PoolModal
          pool={pool}
          sessionName={picking.session.name}
          free={picking.capacity - picking.assignments.length}
          onClose={() => setPicking(null)}
          onPick={async (candidateIds) => {
            await api.post(`/api/sessions/${picking.session.id}/assign`, { candidateIds });
            view.reload();
            toast(`${candidateIds.length} seated on ${picking.session.name}.`);
          }}
        />
      )}
    </>
  );
}

function SeatedStartup({
  row,
  outcomes,
  rsvp,
  busy,
  onDragStart,
  onCopyLink,
  onRemove,
}: {
  row: AssignmentView;
  outcomes: BlockOutcome[];
  rsvp: boolean;
  busy: boolean;
  onDragStart: () => void;
  onCopyLink: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="seated" draggable={!busy} onDragStart={onDragStart}>
      <span className="grip">
        <Icon name="drag" size={13} />
      </span>
      <span className="seated-name">{row.candidate.orgName}</span>
      {rsvp && <span className={RSVP_TONE[row.assignment.rsvpState]}>{row.assignment.rsvpState}</span>}
      {row.score !== null && <span className="num faint">{row.score}</span>}
      <OutcomeBadge outcomes={outcomes} id={row.outcomeId} />
      <div className="spacer" />
      {rsvp && (
        <button
          className="btn ghost icon sm"
          onClick={onCopyLink}
          title="Copy the invitation link"
          aria-label="Copy invitation link"
        >
          <Icon name="link" size={13} />
        </button>
      )}
      <button className="btn ghost icon sm" onClick={onRemove} title="Take off this committee" aria-label="Remove">
        <Icon name="x" size={13} />
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function SessionModal({
  blockId,
  session,
  onClose,
  onSaved,
}: {
  blockId: string;
  session: CommitteeSession | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState({
    name: session?.name ?? '',
    heldOn: session?.heldOn ?? null,
    windows: session?.windows ?? [{ startsAt: '09:00', endsAt: '12:30' }],
    minutesPerStartup: session?.minutesPerStartup ?? 25,
    location: session?.location ?? '',
    jury: session?.jury ?? [],
  });
  const [confirm, setConfirm] = useState(false);
  const toast = useToast();
  const set = (patch: Partial<typeof draft>) => setDraft((d) => ({ ...d, ...patch }));

  const setWindow = (index: number, partial: Partial<TimeWindow>) =>
    set({ windows: draft.windows.map((w, i) => (i === index ? { ...w, ...partial } : w)) });

  const minutes = windowMinutes(draft.windows);
  const slots = Math.floor(minutes / Math.max(5, draft.minutesPerStartup));

  return (
    <>
      <Modal
        title={session ? 'Committee' : 'New committee'}
        subtitle="A sitting of the jury. Its slots come from the hours it runs and the time each startup gets."
        onClose={onClose}
        footer={
          <>
            {session && (
              <button className="btn danger sm" onClick={() => setConfirm(true)}>
                <Icon name="trash" size={13} /> Delete
              </button>
            )}
            <div className="spacer" />
            <button className="btn ghost" onClick={onClose}>
              Cancel
            </button>
            <button
              className="btn primary"
              onClick={async () => {
                if (session) await api.patch(`/api/sessions/${session.id}`, draft);
                else await api.post(`/api/blocks/${blockId}/sessions`, draft);
                onSaved();
                onClose();
                toast(session ? 'Committee updated.' : 'Committee added.');
              }}
            >
              {session ? 'Save' : 'Add committee'}
            </button>
          </>
        }
      >
        <TextField
          label="Name"
          value={draft.name}
          onChange={(v) => set({ name: v })}
          placeholder="Jury day"
          hint="optional"
        />
        <div className="grid-2">
          <DateField label="Held on" value={draft.heldOn} onChange={(v) => set({ heldOn: v })} />
          <TextField
            label="Where"
            value={draft.location}
            onChange={(v) => set({ location: v })}
            placeholder="CEED Morocco, Casablanca"
          />
        </div>

        <div className="field">
          <label>Hours</label>
          <div className="help">
            A committee can run all day. Add a stretch for each block of pitches and leave the breaks out.
          </div>
          <div className="rows">
            {draft.windows.map((window, index) => (
              <div className="row" key={index}>
                <input
                  className="input"
                  type="time"
                  value={window.startsAt}
                  aria-label="From"
                  onChange={(e) => setWindow(index, { startsAt: e.target.value })}
                />
                <span className="faint">→</span>
                <input
                  className="input"
                  type="time"
                  value={window.endsAt}
                  aria-label="To"
                  onChange={(e) => setWindow(index, { endsAt: e.target.value })}
                />
                <button
                  className="btn ghost icon sm"
                  disabled={draft.windows.length === 1}
                  aria-label="Remove this stretch"
                  onClick={() => set({ windows: draft.windows.filter((_, i) => i !== index) })}
                >
                  <Icon name="trash" size={13} />
                </button>
              </div>
            ))}
          </div>
          <button
            className="btn sm"
            style={{ alignSelf: 'flex-start', marginTop: 6 }}
            onClick={() => set({ windows: [...draft.windows, { startsAt: '14:00', endsAt: '17:00' }] })}
          >
            <Icon name="plus" size={13} /> Add a stretch
          </button>
        </div>

        <NumberField
          label="Minutes per startup"
          value={draft.minutesPerStartup}
          onChange={(v) => set({ minutesPerStartup: v })}
          min={5}
          help={
            slots
              ? `${minutes} minutes on offer — that makes ${slots} slot${slots === 1 ? '' : 's'}.`
              : 'Not enough time for a single slot.'
          }
        />

        <TagField
          label="Jury"
          values={draft.jury}
          onChange={(v) => set({ jury: v })}
          help="Who sits on this panel. They are the names that can score it."
          placeholder="Add a jury member"
        />
      </Modal>

      {confirm && session && (
        <ConfirmDialog
          title={`Delete ${session.name}?`}
          body="The startups seated on it go back to the pool. Scores already given stay on the evaluation."
          confirmLabel="Delete committee"
          destructive
          onClose={() => setConfirm(false)}
          onConfirm={async () => {
            await api.del(`/api/sessions/${session.id}`);
            onSaved();
            onClose();
            toast('Committee deleted.');
          }}
        />
      )}
    </>
  );
}

function PoolModal({
  pool,
  sessionName,
  free,
  onClose,
  onPick,
}: {
  pool: { candidate: Candidate }[];
  sessionName: string;
  free: number;
  onClose: () => void;
  onPick: (candidateIds: string[]) => Promise<void>;
}) {
  const [chosen, setChosen] = useState<string[]>([]);
  return (
    <Modal
      title={`Seat on ${sessionName}`}
      subtitle="Startups the previous selection sent through, not yet on a sitting. They take the first free slots."
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            disabled={!chosen.length}
            onClick={async () => {
              await onPick(chosen);
              onClose();
            }}
          >
            Seat {chosen.length || ''}
          </button>
        </>
      }
    >
      {chosen.length > free && (
        <div className="callout warn">
          <Icon name="alert" size={15} />
          Only {free} slot{free === 1 ? '' : 's'} left on this sitting. The rest are seated but left unplaced.
        </div>
      )}
      <div className="rows">
        {pool.map(({ candidate }) => (
          <label className="check rowcard" style={{ padding: '9px 11px' }} key={candidate.id}>
            <input
              type="checkbox"
              checked={chosen.includes(candidate.id)}
              onChange={(e) =>
                setChosen((c) => (e.target.checked ? [...c, candidate.id] : c.filter((id) => id !== candidate.id)))
              }
            />
            <span style={{ flex: 1 }}>
              <strong style={{ fontSize: 13 }}>{candidate.orgName}</strong>
              <div className="faint" style={{ fontSize: 12 }}>
                {candidate.contactName}
              </div>
            </span>
          </label>
        ))}
      </div>
    </Modal>
  );
}
