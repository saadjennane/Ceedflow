import { windowMinutes, type CommitteeConfig, type CommitteeSession, type TimeWindow } from '@ceed/shared';
import { useState } from 'react';
import { api } from '../../../lib/api';
import { PeoplePicker } from '../../directory/PeoplePicker';
import { DateField, NumberField, TextField } from '../../../ui/Field';
import { Icon } from '../../../ui/Icon';
import { ConfirmDialog, Modal, useToast } from '../../../ui/Overlays';

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
        This block says <strong>who reviews</strong>, <strong>which startups</strong>, and — when it is an event —{' '}
        <strong>when</strong>. It does not score: an <strong>Evaluation</strong> in the same phase supplies the grid.
      </div>

      <h3 className="section-title">How the reviewing happens</h3>
      <div className="field">
        <div className="pick-list">
          <button
            type="button"
            className={config.format === 'event' ? 'pick on' : 'pick'}
            onClick={() => patch({ format: 'event' })}
          >
            <Icon name={config.format === 'event' ? 'check' : 'square'} />
            <div>
              <strong>An event</strong>
              <span>
                A date, hours, and a slot per startup. The panel sits together and the startups are invited.
              </span>
            </div>
          </button>
          <button
            type="button"
            className={config.format === 'async' ? 'pick on' : 'pick'}
            onClick={() => patch({ format: 'async', rsvpMode: 'none' })}
          >
            <Icon name={config.format === 'async' ? 'check' : 'square'} />
            <div>
              <strong>Spread over days</strong>
              <span>
                People read, call and qualify from their desk. No date, no timetable, nobody to invite — just who
                reviews and what they take.
              </span>
            </div>
          </button>
        </div>
      </div>

      <h3 className="section-title">Which startups each panel takes</h3>
      <div className="field">
        <div className="pick-list">
          <button type="button" className={!config.assign ? 'pick on' : 'pick'} onClick={() => patch({ assign: false })}>
            <Icon name={!config.assign ? 'check' : 'square'} />
            <div>
              <strong>All of them</strong>
              <span>Every panel reviews the whole intake. The plain case: colleagues reading everything.</span>
            </div>
          </button>
          <button type="button" className={config.assign ? 'pick on' : 'pick'} onClick={() => patch({ assign: true })}>
            <Icon name={config.assign ? 'check' : 'square'} />
            <div>
              <strong>Split between panels</strong>
              <span>You hand each panel its own startups — one per pitch slot, or a share of the calls to make.</span>
            </div>
          </button>
        </div>
      </div>

      {config.format === 'async' ? null : (
      <>
      <div className="public-sep" />

      <h3 className="section-title">How each startup gets its time</h3>
      <div className="field">
        <div className="pick-list">
          <button
            type="button"
            className={config.rsvpMode === 'slots' ? 'pick on' : 'pick'}
            onClick={() => patch({ rsvpMode: 'slots' })}
          >
            <Icon name={config.rsvpMode === 'slots' ? 'check' : 'square'} />
            <div>
              <strong>The startup picks its own time</strong>
              <span>
                Its link shows the free slots of the sitting and it takes one, Calendly-style. Seating a startup
                leaves it unplaced until it chooses, and two cannot hold the same slot.
              </span>
            </div>
          </button>
          <button
            type="button"
            className={config.rsvpMode === 'confirm' ? 'pick on' : 'pick'}
            onClick={() => patch({ rsvpMode: 'confirm' })}
          >
            <Icon name={config.rsvpMode === 'confirm' ? 'check' : 'square'} />
            <div>
              <strong>You give it a time, it confirms</strong>
              <span>
                You build the timetable; its link shows the time you set and asks it to confirm or decline. Declining
                frees the slot and leaves the startup in <em>Not placed</em>.
              </span>
            </div>
          </button>
          <button
            type="button"
            className={config.rsvpMode === 'none' ? 'pick on' : 'pick'}
            onClick={() => patch({ rsvpMode: 'none' })}
          >
            <Icon name={config.rsvpMode === 'none' ? 'check' : 'square'} />
            <div>
              <strong>No invitation</strong>
              <span>The team places everyone and tells them however it likes. The links stop working.</span>
            </div>
          </button>
        </div>
      </div>
      {config.rsvpMode !== 'none' && (
        <DateField
          label="Answer by"
          value={config.rsvpDeadline}
          onChange={(v) => patch({ rsvpDeadline: v })}
          help="After this date the link stops accepting answers."
        />
      )}
      </>
      )}
    </>
  );
}

export function SessionModal({
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

        <PeoplePicker
          label="Jury"
          value={draft.jury}
          onChange={(v) => set({ jury: v })}
          help="From the directory. Naming somebody here gives them the Jury role."
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
