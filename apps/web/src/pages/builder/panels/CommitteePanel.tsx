import {
  blockMissing,
  blockStatus,
  windowMinutes,
  type Block,
  type Candidate,
  type CommitteeConfig,
  type CommitteeSession,
  type PersonRef,
  type TimeWindow,
} from '@ceed/shared';
import { useState } from 'react';
import { api } from '../../../lib/api';
import { formatDate } from '../../../lib/format';
import { useAsync } from '../../../lib/useAsync';
import { PeoplePicker } from '../../directory/PeoplePicker';
import { DateField, NumberField, TextField } from '../../../ui/Field';
import { Icon } from '../../../ui/Icon';
import { SearchBox } from '../../../ui/SearchBox';
import { ConfirmDialog, Modal, useToast } from '../../../ui/Overlays';
import { VisibilityControl } from './shared';

/* ------------------------------------------------------------------ */
/* Tabs                                                                */
/* ------------------------------------------------------------------ */

export const COMMITTEE_TABS = ['Overview', 'Panels', 'Invitations'] as const;
export type CommitteeTab = (typeof COMMITTEE_TABS)[number];

/** Work spread over days invites nobody, so it has no invitations to set. */
export function committeeTabs(config: CommitteeConfig): CommitteeTab[] {
  return config.format === 'event' ? [...COMMITTEE_TABS] : ['Overview', 'Panels'];
}

/** A sitting of the jury on a day; a reading panel when the work is spread out. */
const noun = (config: CommitteeConfig) => (config.format === 'event' ? 'sitting' : 'panel');

/* ------------------------------------------------------------------ */
/* What the committee endpoint gives back                              */
/* ------------------------------------------------------------------ */

interface AssignmentRow {
  /** Its order on the sitting comes along: a copy inherits it. */
  assignment: { id: string; position: number };
  candidate: Candidate;
}

interface PanelView {
  session: CommitteeSession;
  jury: PersonRef[];
  assignments: AssignmentRow[];
  capacity: number;
}

interface CommitteeView {
  config: CommitteeConfig;
  sessions: PanelView[];
  /** Startups that reached this block and are on no panel yet. */
  pool: { candidate: Candidate }[];
}

/* ------------------------------------------------------------------ */
/* Setup                                                               */
/* ------------------------------------------------------------------ */

export function CommitteeSetup({
  block,
  config,
  patch,
  tab = 'Overview',
}: {
  block: Block;
  config: CommitteeConfig;
  patch: (partial: Partial<CommitteeConfig>) => void;
  tab?: CommitteeTab;
}) {
  if (tab === 'Panels') return <PanelsTab block={block} config={config} />;
  if (tab === 'Invitations') return <InvitationsTab block={block} config={config} patch={patch} />;
  return <OverviewTab config={config} patch={patch} />;
}

/* ---- Overview: what kind of committee this is ---- */

function OverviewTab({
  config,
  patch,
}: {
  config: CommitteeConfig;
  patch: (partial: Partial<CommitteeConfig>) => void;
}) {
  return (
    <>
      {/* When the jurors see their list — not when the jury meets. Left empty,
          the first sitting answers for it. */}
      <h3 className="section-title">When jurors see their list</h3>
      <div className="grid-2">
        <DateField label="Opens on" value={config.opensAt} onChange={(v) => patch({ opensAt: v })} />
        <DateField label="Closes on" value={config.closesAt} onChange={(v) => patch({ closesAt: v })} />
      </div>
      <p className="faint" style={{ margin: 0, fontSize: 12 }}>
        Empty opens it on the first sitting, which is rarely early enough to prepare — set a date to give the panel
        its reading time.
      </p>

      <div className="callout">
        <Icon name="gavel" size={15} />
        <div>
          This block says <strong>who reviews</strong>, <strong>which startups</strong>, and — when it is an event —{' '}
          <strong>when</strong>. It does not score: an <strong>Evaluation</strong> in the same phase supplies the grid.
        </div>
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

      <h3 className="section-title">Which startups each {noun(config)} takes</h3>
      <div className="field">
        <div className="pick-list">
          <button type="button" className={!config.assign ? 'pick on' : 'pick'} onClick={() => patch({ assign: false })}>
            <Icon name={!config.assign ? 'check' : 'square'} />
            <div>
              <strong>All of them</strong>
              <span>Every {noun(config)} reviews the whole intake. The plain case: colleagues reading everything.</span>
            </div>
          </button>
          <button type="button" className={config.assign ? 'pick on' : 'pick'} onClick={() => patch({ assign: true })}>
            <Icon name={config.assign ? 'check' : 'square'} />
            <div>
              <strong>Split between {noun(config)}s</strong>
              <span>You hand each one its own startups — one per pitch slot, or a share of the calls to make.</span>
            </div>
          </button>
        </div>
      </div>
    </>
  );
}

/* ---- Invitations: how a startup gets its time ---- */

function InvitationsTab({
  block,
  config,
  patch,
}: {
  /** Needed for the sitting count: a committee with none has nothing to open. */
  block: Block;
  config: CommitteeConfig;
  patch: (partial: Partial<CommitteeConfig>) => void;
}) {
  return (
    <>
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
          value={config.rsvp.closesAt}
          onChange={(v) => patch({ rsvp: { ...config.rsvp, closesAt: v } })}
          help="After this date the link stops accepting answers."
        />
      )}

      {/* And this one is the slot picker the startups answer on. */}
      {config.rsvpMode !== 'none' && (
        <VisibilityControl
          config={config.rsvp}
          patch={(partial) => patch({ rsvp: { ...config.rsvp, ...partial } })}
          status={blockStatus({ type: 'committee', config, nextSittingOn: block.nextSittingOn }, 'rsvp', block.sittings ?? 0)}
          missing={blockMissing({ type: 'committee', config, nextSittingOn: block.nextSittingOn }, 'rsvp', block.sittings ?? 0)}
          what={{
            open: 'Startups can pick their slot',
            closed: 'The booking page is closed',
            notOpen: 'Booking has not opened yet',
            empty: 'Create a sitting before opening the booking page',
          }}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Panels: created, named and juried here                              */
/* ------------------------------------------------------------------ */

function PanelsTab({ block, config }: { block: Block; config: CommitteeConfig }) {
  const view = useAsync(() => api.get<CommitteeView>(`/api/blocks/${block.id}/committee`), block.id);
  /** The id being edited, or 'new' for one that does not exist yet. */
  const [editing, setEditing] = useState<string | null>(null);
  /** The sitting waiting on the one question a copy raises. */
  const [copying, setCopying] = useState<PanelView | null>(null);
  const word = noun(config);

  if (view.error) return <div className="empty">{view.error}</div>;
  if (!view.data) return <div className="empty">Loading…</div>;

  const data = view.data;
  const panels = data.sessions;
  /* Everything that reached this block, not only what is on no sitting: a
     startup may now sit on several, so the whole intake is on offer. */
  const reaching = [
    ...data.pool.map((p) => p.candidate),
    ...data.sessions.flatMap((sv) => sv.assignments.map((a) => a.candidate)),
  ].filter((c, i, all) => all.findIndex((x) => x.id === c.id) === i);
  /* Which sittings each already sits on. Putting one on a second sitting is
     allowed now, so the screen has to say when that is what you are doing. */
  const elsewhere = new Map<string, string[]>();
  for (const sv of data.sessions) {
    for (const row of sv.assignments) {
      elsewhere.set(row.candidate.id, [...(elsewhere.get(row.candidate.id) ?? []), sv.session.name || word]);
    }
  }
  const reload = async () => view.set(await api.get<CommitteeView>(`/api/blocks/${block.id}/committee`));

  /**
   * Copies a sitting: everything that describes it — name, date, hours, minutes
   * per startup, where, and who reviews — and, when asked, the startups too.
   * Nothing on the original moves; a startup can now sit on both.
   */
  const duplicate = async (panel: PanelView, withStartups: boolean) => {
    const { name, heldOn, windows, minutesPerStartup, location, jury } = panel.session;
    const created = await api.post<CommitteeView>(`/api/blocks/${block.id}/sessions`, {
      name: `${name || (config.format === 'event' ? 'Sitting' : 'Panel')} (copy)`,
      heldOn, windows, minutesPerStartup, location, jury,
    });
    const copyId = created.sessions[created.sessions.length - 1]?.session.id;
    if (copyId && withStartups && panel.assignments.length) {
      await api.post(`/api/sessions/${copyId}/assign`, {
        // In the order they were put on the original, which is the order the
        // copy inherits and the one Fill slots will follow.
        candidateIds: panel.assignments
          .slice()
          .sort((a, b) => a.assignment.position - b.assignment.position)
          .map((a) => a.candidate.id),
      });
    }
    await reload();
    setCopying(null);
    if (copyId) setEditing(copyId);
  };

  return (
    <>
      <div className="callout">
        <Icon name="users" size={15} />
        <div>
          A {word} is a group of people reviewing together. Name them here and say who sits on each.{' '}
          {config.assign
            ? `Each ${word} takes the startups you give it here. The timetable itself is laid out in Committees.`
            : `Every ${word} reviews the whole intake.`}
        </div>
      </div>

      {!panels.length && editing !== 'new' && (
        <div className="empty">
          <h3>No {word} yet</h3>
          <p>
            {config.format === 'event'
              ? 'Give one its date, its hours and a time per startup, and its slots appear on their own.'
              : 'Name it and pick who reads — that is all an asynchronous panel needs.'}
          </p>
        </div>
      )}

      <div className="rows">
        {panels.map((panel) =>
          editing === panel.session.id ? (
            <PanelEditor
              key={panel.session.id}
              blockId={block.id}
              config={config}
              session={panel.session}
              pool={reaching}
              elsewhere={elsewhere}
              mine={panel.assignments}
              onDone={async () => {
                await reload();
                setEditing(null);
              }}
              onCancel={() => setEditing(null)}
            />
          ) : (
            /* The row is no longer one big button: copying a sitting is an
               action on that sitting, so it belongs on its line, and a button
               cannot live inside another. */
            <div className="rowcard link-row" key={panel.session.id}>
              <button
                className="row-open"
                onClick={() => setEditing(panel.session.id)}
                aria-label={`Open ${panel.session.name || word}`}
              >
                <span style={{ fontWeight: 600, fontSize: 13 }}>{panel.session.name}</span>
                <span className="faint" style={{ display: 'block', fontSize: 12 }}>
                  {config.format === 'event'
                    ? [
                        formatDate(panel.session.heldOn) || 'No date',
                        panel.session.windows.map((w) => `${w.startsAt}–${w.endsAt}`).join(' + '),
                        `${panel.capacity} slot${panel.capacity === 1 ? '' : 's'}`,
                      ].join(' · ')
                    : `Reads ${config.assign ? 'what you give it' : 'the whole intake'}`}
                </span>
              </button>
              {config.assign && (
                <span
                  className={
                    config.format === 'event' && panel.assignments.length > panel.capacity
                      ? 'badge stop num'
                      : 'badge num'
                  }
                >
                  {panel.assignments.length} startup{panel.assignments.length === 1 ? '' : 's'}
                </span>
              )}
              {panel.jury.length ? (
                <span className="badge num">{panel.jury.length} on it</span>
              ) : (
                <span className="badge warn">No jury</span>
              )}
              <button
                className="btn ghost icon sm"
                title={`Copy this ${word}`}
                aria-label={`Copy ${panel.session.name || word}`}
                onClick={() => setCopying(panel)}
              >
                <Icon name="copy" size={13} />
              </button>
              <button
                className="btn ghost icon sm"
                aria-label={`Open ${panel.session.name || word}`}
                onClick={() => setEditing(panel.session.id)}
              >
                <Icon name="chevronRight" size={14} />
              </button>
            </div>
          ),
        )}

        {editing === 'new' && (
          <PanelEditor
            blockId={block.id}
            config={config}
            session={null}
            pool={reaching}
            elsewhere={elsewhere}
            mine={[]}
            onDone={async () => {
              await reload();
              setEditing(null);
            }}
            onCancel={() => setEditing(null)}
          />
        )}
      </div>

      {editing !== 'new' && (
        <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => setEditing('new')}>
          <Icon name="plus" size={13} /> Add {config.format === 'event' ? 'a sitting' : 'a panel'}
        </button>
      )}

      <p className="faint" style={{ margin: 0, fontSize: 12 }}>
        {word.charAt(0).toUpperCase() + word.slice(1)}s save on their own. The button below saves the block's settings.
      </p>

      {copying && (
        <Modal
          title={`Copy ${copying.session.name || word}?`}
          subtitle="Everything that describes it comes along — the date, the hours, the time per startup, where, and who reviews."
          onClose={() => setCopying(null)}
        >
          <div className="pick-list">
            <button type="button" className="pick" onClick={() => duplicate(copying, true)}>
              <Icon name="copy" />
              <div>
                <strong>With startups</strong>
                <span>
                  {copying.assignments.length
                    ? `The same ${copying.assignments.length} startup${copying.assignments.length === 1 ? '' : 's'}, in the same order. They stay on ${copying.session.name || `this ${word}`} too — a startup may sit on both.`
                    : `This ${word} holds no startup yet, so this is the same as the option below.`}
                </span>
              </div>
            </button>
            <button type="button" className="pick" onClick={() => duplicate(copying, false)}>
              <Icon name="plus" />
              <div>
                <strong>No startups</strong>
                <span>The same setup, with nobody on it. You pick who it takes afterwards.</span>
              </div>
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

/**
 * One panel, edited in place. It writes straight away rather than riding on the
 * block's draft: a panel is a thing of its own, with startups seated on it.
 */
function PanelEditor({
  blockId,
  config,
  session,
  pool,
  mine,
  elsewhere,
  onDone,
  onCancel,
}: {
  blockId: string;
  config: CommitteeConfig;
  session: CommitteeSession | null;
  /** Startups on no panel yet — the ones this panel may still take. */
  pool: Candidate[];
  /** What this panel already holds, with the ids needed to let go of them. */
  mine: AssignmentRow[];
  /** The other sittings each startup is already on, by candidate id. */
  elsewhere?: Map<string, string[]>;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState({
    name: session?.name ?? '',
    heldOn: session?.heldOn ?? null,
    windows: session?.windows ?? [{ startsAt: '09:00', endsAt: '12:30' }],
    minutesPerStartup: session?.minutesPerStartup ?? 25,
    location: session?.location ?? '',
    jury: session?.jury ?? [],
  });
  const [picked, setPicked] = useState<Set<string>>(new Set(mine.map((a) => a.candidate.id)));
  const [search, setSearch] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const word = noun(config);
  const set = (patch: Partial<typeof draft>) => setDraft((d) => ({ ...d, ...patch }));
  const setWindow = (index: number, partial: Partial<TimeWindow>) =>
    set({ windows: draft.windows.map((w, i) => (i === index ? { ...w, ...partial } : w)) });

  const minutes = windowMinutes(draft.windows);
  const slots = Math.floor(minutes / Math.max(5, draft.minutesPerStartup));

  // A startup this panel already holds, plus anything on no panel at all. One
  // startup sits on one panel, so the rest are not on offer here.
  // `pool` now carries everything that reached the block, this panel included.
  const choices = [...mine.map((a) => a.candidate), ...pool]
    .filter((c, i, all) => all.findIndex((x) => x.id === c.id) === i)
    .sort((a, b) => a.orgName.localeCompare(b.orgName));
  // Picked ones leave the list and come back up as chips, so what is left below
  // is exactly what is still to decide.
  /* In the order you put them on, not the alphabet: that is the order stored on
     the sitting and the order Fill slots follows, so showing anything else here
     would have you reading one order while the timetable used another.
     `picked` is seeded from the sitting in stored order and appended to, so its
     own order is the right one. */
  const seated = [...picked]
    .map((id) => choices.find((c) => c.id === id))
    .filter((c): c is Candidate => Boolean(c));
  const needle = search.trim().toLowerCase();
  const shown = choices
    .filter((c) => !picked.has(c.id))
    .filter((c) => !needle || `${c.orgName} ${c.contactName}`.toLowerCase().includes(needle));
  const toggle = (id: string) => {
    // Seating one clears what you typed to find it: the search that led you
    // here matches nothing now that the startup has left the list. Taking one
    // off leaves it alone — you are looking at something else by then.
    if (!picked.has(id)) setSearch('');
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      let sessionId = session?.id ?? '';
      if (session) {
        await api.patch(`/api/sessions/${session.id}`, draft);
      } else {
        // Creating answers with the whole committee; a new panel goes to the end.
        const created = await api.post<CommitteeView>(`/api/blocks/${blockId}/sessions`, draft);
        sessionId = created.sessions[created.sessions.length - 1]?.session.id ?? '';
      }

      if (config.assign && sessionId) {
        const add = [...picked].filter((id) => !mine.some((a) => a.candidate.id === id));
        const drop = mine.filter((a) => !picked.has(a.candidate.id));
        if (add.length) await api.post(`/api/sessions/${sessionId}/assign`, { candidateIds: add });
        for (const row of drop) await api.del(`/api/assignments/${row.assignment.id}`);
      }

      toast(session ? `${word.charAt(0).toUpperCase() + word.slice(1)} saved.` : `${word} added.`);
      onDone();
    } catch (err) {
      toast((err as Error).message, true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <section className="card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <TextField
          label="Name"
          value={draft.name}
          onChange={(v) => set({ name: v })}
          placeholder={config.format === 'event' ? 'Jury day' : 'The team'}
          hint="optional"
        />

        {config.format === 'event' && (
          <>
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
                A sitting can run all day. Add a stretch for each block of pitches and leave the breaks out.
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
          </>
        )}

        <PeoplePicker
          label="Who reviews"
          value={draft.jury}
          onChange={(v) => set({ jury: v })}
          help="From the directory. Naming somebody here gives them the Jury role and the startups in their own space."
        />

        {config.assign && (
          <div className="field">
            <label>Which startups</label>
            <div className="help">
              {config.format === 'event'
                ? `Who this ${word} sees. You give each one a time in the Committees tab. A startup may sit on more than one.`
                : `Who this ${word} reads. A startup may sit on more than one — a second round reviews the same names.`}
            </div>

            {!choices.length ? (
              <div className="empty" style={{ padding: 14 }}>
                Nothing has reached this block yet, or every startup is already on another {word}.
              </div>
            ) : (
              <>
                {seated.length > 0 && (
                  <div className="row wrap" style={{ gap: 6, marginBottom: 7 }}>
                    {seated.map((candidate, rank) => (
                      <span className="juror" key={candidate.id} title={`${rank + 1}${config.format === 'event' ? ' — it takes the slot of that rank when you fill them' : ''}`}>
                        <span className="juror-mark">{rank + 1}</span>
                        {candidate.orgName}
                        <button
                          type="button"
                          className="chip-x"
                          aria-label={`Take ${candidate.orgName} off this ${word}`}
                          onClick={() => toggle(candidate.id)}
                        >
                          <Icon name="x" size={11} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                {choices.length > 8 && (
                  <SearchBox value={search} onChange={setSearch} placeholder="Search the startups…" />
                )}

                {shown.length > 0 ? (
                  <div className="rows" style={{ maxHeight: 268, overflowY: 'auto', marginTop: 6 }}>
                    {shown.map((candidate) => (
                      <button type="button" key={candidate.id} className="pick" onClick={() => toggle(candidate.id)}>
                        <Icon name="plus" />
                        <div>
                          <strong>{candidate.orgName}</strong>
                          <span>
                            {candidate.contactName}
                            {/* Seating it here as well is allowed — the screen
                                just has to say that is what happens. */}
                            {(elsewhere?.get(candidate.id)?.filter((n) => n !== session?.name) ?? []).length > 0 && (
                              <> · already on {elsewhere!.get(candidate.id)!.filter((n) => n !== session?.name).join(', ')}</>
                            )}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="hint">
                    {needle ? 'No startup matches that.' : `Every startup on offer is on this ${word}.`}
                  </div>
                )}

                <div className="row" style={{ marginTop: 6, fontSize: 12 }}>
                  <span className="faint">
                    <span className="num">{picked.size}</span> picked
                    {config.format === 'event' && ` · ${slots} slot${slots === 1 ? '' : 's'}`}
                  </span>
                  {/* A note, not a rule: a day that runs over is your call, and
                      often the plan — you add a stretch afterwards. */}
                  {config.format === 'event' && picked.size > slots && (
                    <span className="faint">
                      {picked.size - slots} more than the hours hold. Add a stretch or shorten the slots.
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        <div className="row" style={{ gap: 8 }}>
          {session && (
            <button className="btn danger sm" onClick={() => setConfirm(true)}>
              <Icon name="trash" size={13} /> Delete
            </button>
          )}
          <div className="spacer" />
          <button className="btn ghost sm" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn primary sm" disabled={saving} onClick={save}>
            {saving ? 'Saving…' : session ? 'Save' : `Add ${word}`}
          </button>
        </div>
      </section>

      {confirm && session && (
        <ConfirmDialog
          title={`Delete ${session.name}?`}
          body="The startups seated on it go back to the pool. Scores already given stay on the evaluation."
          confirmLabel={`Delete ${word}`}
          destructive
          onClose={() => setConfirm(false)}
          onConfirm={async () => {
            await api.del(`/api/sessions/${session.id}`);
            toast(`${word.charAt(0).toUpperCase() + word.slice(1)} deleted.`);
            onDone();
          }}
        />
      )}
    </>
  );
}
