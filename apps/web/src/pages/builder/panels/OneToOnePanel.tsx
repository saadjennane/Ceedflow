/**
 * Régler un One to One : qui on rencontre, comment on fixe le rendez-vous,
 * et ce que le compte rendu demande.
 *
 * The meetings themselves are planned in the edition's One to One tab — this
 * is what is the same for all of them.
 */
import {
  ONE_TO_ONE_PERSON_VARIABLES,
  ONE_TO_ONE_STARTUP_VARIABLES,
  RSVP_MODES,
  daySlots,
  type Block,
  type OneToOneConfig,
  type OneToOneDay,
  type PersonRef,
} from '@ceed/shared';
import { useState } from 'react';
import { api } from '../../../lib/api';
import { formatDate } from '../../../lib/format';
import { useAsync } from '../../../lib/useAsync';
import { ConfirmDialog, useToast } from '../../../ui/Overlays';
import { AccessTemplate, Template } from './Template';
import { PeoplePicker } from '../../directory/PeoplePicker';
import { NumberField, TextField } from '../../../ui/Field';
import { Icon } from '../../../ui/Icon';
import { QuestionsEditor } from '../../../ui/QuestionsEditor';

export const ONE_TO_ONE_TABS = ['Overview', 'Interlocutors', 'Days', 'Report', 'Messages'] as const;
export type OneToOneTab = (typeof ONE_TO_ONE_TABS)[number];

/** The three ways a meeting is set, in the words of the person setting it. */
export const INVITE_WORDS: Record<(typeof RSVP_MODES)[number], { title: string; line: string }> = {
  slots: {
    title: 'The startup books',
    line: 'You set the days; you invite the startups and each picks a free slot — like Calendly.',
  },
  confirm: {
    title: 'You propose, they confirm',
    line: 'You give a time, the startup confirms or declines it.',
  },
  none: {
    title: 'You fix it',
    line: 'You give a time and nobody is asked: it is in the diary.',
  },
};

export function OneToOneSetup({
  block,
  config,
  patch,
  tab = 'Overview',
}: {
  block: Block;
  config: OneToOneConfig;
  patch: (partial: Partial<OneToOneConfig>) => void;
  tab?: OneToOneTab;
}) {
  if (tab === 'Days') return <DaysTab block={block} />;

  if (tab === 'Interlocutors') {
    return (
      <>
        <div className="callout">
          <Icon name="users" size={15} />
          <div>
            The people startups meet here — mentors, experts, investors, colleagues. They see their own meetings in
            their space, and write the report there.
          </div>
        </div>
        <PeoplePicker
          label="Interlocutors"
          value={config.interlocutors}
          onChange={(ids) => patch({ interlocutors: ids })}
          help="Anybody in the directory. A startup’s mentor is suggested first when you plan its meetings."
        />
      </>
    );
  }

  if (tab === 'Messages') {
    const messages = config.messages;
    return (
      <>
        <div className="callout">
          <Icon name="send" size={15} />
          <div>
            Sent when you plan a meeting with “Tell them by email” ticked, or from a meeting with “Write to…”. A
            series is announced once, by its first session, with its rhythm.
          </div>
        </div>
        <Template
          label="To the startup"
          help="When, with whom, where — and, when they are asked something, the link to book or to confirm."
          value={messages.startup}
          onChange={(v) => patch({ messages: { ...messages, startup: v } })}
          subject={messages.subjects.startup}
          onSubject={(v) => patch({ messages: { ...messages, subjects: { ...messages.subjects, startup: v } } })}
          variables={ONE_TO_ONE_STARTUP_VARIABLES}
        />
        <Template
          label="To the interlocutor"
          help="Who they meet and when, and where to open the meeting and write the report."
          value={messages.person}
          onChange={(v) => patch({ messages: { ...messages, person: v } })}
          subject={messages.subjects.person}
          onSubject={(v) => patch({ messages: { ...messages, subjects: { ...messages.subjects, person: v } } })}
          variables={ONE_TO_ONE_PERSON_VARIABLES}
        />
        <AccessTemplate value={messages.access} onChange={(v) => patch({ messages: { ...messages, access: v } })} />
      </>
    );
  }

  if (tab === 'Report') {
    return (
      <>
        <div className="callout">
          <Icon name="form" size={15} />
          <div>
            What the interlocutor writes after each meeting, in front of the startup or just after. It stays between
            them and CEED — the startup does not read it. The answers add up in the One to One tab, question by
            question.
          </div>
        </div>
        <QuestionsEditor
          value={config.report}
          onChange={(partial) => patch({ report: { ...config.report, ...partial } })}
          emptyText="No question yet. A topic discussed, the next steps, how the startup is doing — add what you want to follow."
          firstPageName="The meeting"
        />
      </>
    );
  }

  return (
    <>
      <div className="field">
        <label>How a new meeting is set</label>
        <div className="help">The default for this brick — each meeting can still be set another way.</div>
        <div className="pick-list">
          {(['confirm', 'none', 'slots'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              className={config.invite === mode ? 'pick on' : 'pick'}
              onClick={() => patch({ invite: mode })}
            >
              <Icon name={config.invite === mode ? 'check' : 'square'} />
              <div>
                <strong>{INVITE_WORDS[mode].title}</strong>
                <span>{INVITE_WORDS[mode].line}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="grid-2">
        <NumberField
          label="Length of a meeting, in minutes"
          value={config.durationMinutes}
          min={5}
          max={480}
          onChange={(v) => patch({ durationMinutes: v || 45 })}
        />
        <TextField
          label="Where"
          value={config.location}
          onChange={(v) => patch({ location: v })}
          placeholder="CEED, Casablanca — or a video link"
        />
      </div>

      <p className="faint" style={{ margin: 0, fontSize: 12.5 }}>
        The switch at the top opens the meetings to the interlocutors: they see them, and write their reports, while it
        is open.
      </p>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Days                                                                */
/* ------------------------------------------------------------------ */

interface DaysView {
  days: OneToOneDay[];
  interlocutors: PersonRef[];
}

/**
 * Les journées de One to One — comme les séances d'un comité : une date, des
 * plages, la durée d'un rendez-vous, un lieu, et qui reçoit ce jour-là.
 * Les créneaux s'en déduisent, et l'onglet One to One les remplit.
 */
function DaysTab({ block }: { block: Block }) {
  const view = useAsync(() => api.get<DaysView>(`/api/blocks/${block.id}/one-to-one`), `days:${block.id}`);
  const [editing, setEditing] = useState<string | null>(null);
  const [removing, setRemoving] = useState<OneToOneDay | null>(null);
  const toast = useToast();

  if (view.error) return <div className="empty">{view.error}</div>;
  if (!view.data) return <div className="empty">Loading…</div>;
  const { days, interlocutors } = view.data;
  const name = (id: string) => interlocutors.find((p) => p.id === id)?.name ?? '—';

  const copy = async (d: OneToOneDay) => {
    const { name: n, heldOn, windows, minutesPerMeeting, location, interlocutors: who } = d;
    const made = await api.post<OneToOneDay>(`/api/blocks/${block.id}/days`, {
      name: `${n || 'Day'} (copy)`, heldOn, windows, minutesPerMeeting, location, interlocutors: who,
    });
    view.reload();
    setEditing(made.id);
  };

  return (
    <>
      <div className="callout">
        <Icon name="calendar" size={15} />
        <div>
          The days the meetings happen on. Each interlocutor of a day receives on every slot of it — startups are placed
          in the One to One tab, or book a free slot themselves.
        </div>
      </div>

      {!interlocutors.length && (
        <div className="callout warn">
          <Icon name="alert" size={15} />
          <div>Name the interlocutors first, in the Interlocutors tab — and save.</div>
        </div>
      )}

      <div className="stack" style={{ gap: 10 }}>
        {days.map((d) =>
          editing === d.id ? (
            <DayEditor
              key={d.id}
              blockId={block.id}
              day={d}
              interlocutors={interlocutors}
              onDone={() => {
                setEditing(null);
                view.reload();
              }}
              onCancel={() => setEditing(null)}
            />
          ) : (
            <div className="rowcard card-pad stack" key={d.id} style={{ gap: 6 }}>
              <div className="row" style={{ gap: 8 }}>
                <strong style={{ flex: 1, fontSize: 13.5 }}>
                  {d.name || 'Day'} · {formatDate(d.heldOn)}
                </strong>
                <span className="badge num">
                  {daySlots(d).length * d.interlocutors.length} slots
                </span>
                <button className="btn ghost sm" onClick={() => setEditing(d.id)}>
                  <Icon name="edit" size={12} /> Edit
                </button>
                <button className="btn ghost icon sm" title="Copy this day" aria-label="Copy this day" onClick={() => copy(d)}>
                  <Icon name="copy" size={12} />
                </button>
                <button className="btn ghost icon sm" aria-label="Remove this day" onClick={() => setRemoving(d)}>
                  <Icon name="trash" size={12} />
                </button>
              </div>
              <div className="faint" style={{ fontSize: 12.5 }}>
                {d.windows.map((w) => `${w.startsAt}–${w.endsAt}`).join(' + ')} · {d.minutesPerMeeting} min each
                {d.location ? ` · ${d.location}` : ''}
              </div>
              <div className="row wrap" style={{ gap: 5 }}>
                {d.interlocutors.length ? (
                  d.interlocutors.map((id) => (
                    <span className="juror" key={id}>
                      {name(id)}
                    </span>
                  ))
                ) : (
                  <span className="badge warn">Nobody receives on this day</span>
                )}
              </div>
            </div>
          ),
        )}

        {editing === 'new' ? (
          <DayEditor
            blockId={block.id}
            day={null}
            interlocutors={interlocutors}
            onDone={() => {
              setEditing(null);
              view.reload();
            }}
            onCancel={() => setEditing(null)}
          />
        ) : (
          <button className="btn" style={{ alignSelf: 'flex-start' }} disabled={!interlocutors.length} onClick={() => setEditing('new')}>
            <Icon name="plus" size={13} /> Add a day
          </button>
        )}
      </div>

      {removing && (
        <ConfirmDialog
          title={`Remove ${removing.name || 'this day'}?`}
          body="Its meetings are not deleted — they keep their date and time, outside any day."
          confirmLabel="Remove"
          destructive
          onClose={() => setRemoving(null)}
          onConfirm={async () => {
            try {
              await api.del(`/api/one-to-one-days/${removing.id}`);
              view.reload();
            } catch (err) {
              toast((err as Error).message, true);
            }
          }}
        />
      )}
    </>
  );
}

function DayEditor({
  blockId,
  day,
  interlocutors,
  onDone,
  onCancel,
}: {
  blockId: string;
  day: OneToOneDay | null;
  interlocutors: PersonRef[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState({
    name: day?.name ?? '',
    heldOn: day?.heldOn ?? '',
    windows: day?.windows ?? [{ startsAt: '09:00', endsAt: '12:30' }],
    minutesPerMeeting: day?.minutesPerMeeting ?? 45,
    location: day?.location ?? '',
    interlocutors: day?.interlocutors ?? interlocutors.map((p) => p.id),
  });
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const set = (partial: Partial<typeof draft>) => setDraft((d) => ({ ...d, ...partial }));
  const slots = daySlots(draft).length;

  const save = async () => {
    setSaving(true);
    try {
      const body = { ...draft, heldOn: draft.heldOn || null };
      if (day) await api.patch(`/api/one-to-one-days/${day.id}`, body);
      else await api.post(`/api/blocks/${blockId}/days`, body);
      onDone();
    } catch (err) {
      toast((err as Error).message, true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rowcard card-pad stack" style={{ gap: 12 }}>
      <div className="grid-2">
        <TextField label="Name" value={draft.name} onChange={(v) => set({ name: v })} placeholder="Mentoring day 1" />
        <div className="field">
          <label>Date</label>
          <input className="input" type="date" value={draft.heldOn} onChange={(e) => set({ heldOn: e.target.value })} />
        </div>
      </div>

      <div className="field">
        <label>Hours</label>
        <div className="stack" style={{ gap: 6 }}>
          {draft.windows.map((w, i) => (
            <div className="row" key={i} style={{ gap: 6 }}>
              <input
                className="input"
                type="time"
                style={{ width: 120 }}
                value={w.startsAt}
                onChange={(e) => set({ windows: draft.windows.map((x, j) => (j === i ? { ...x, startsAt: e.target.value } : x)) })}
              />
              <span className="faint">to</span>
              <input
                className="input"
                type="time"
                style={{ width: 120 }}
                value={w.endsAt}
                onChange={(e) => set({ windows: draft.windows.map((x, j) => (j === i ? { ...x, endsAt: e.target.value } : x)) })}
              />
              {draft.windows.length > 1 && (
                <button className="btn ghost icon sm" aria-label="Remove this stretch" onClick={() => set({ windows: draft.windows.filter((_, j) => j !== i) })}>
                  <Icon name="x" size={12} />
                </button>
              )}
            </div>
          ))}
        </div>
        <button
          className="btn sm"
          style={{ alignSelf: 'flex-start', marginTop: 6 }}
          onClick={() => set({ windows: [...draft.windows, { startsAt: '14:00', endsAt: '17:00' }] })}
        >
          <Icon name="plus" size={12} /> Add a stretch
        </button>
      </div>

      <div className="grid-2">
        <NumberField
          label="Minutes per meeting"
          value={draft.minutesPerMeeting}
          min={5}
          max={480}
          onChange={(v) => set({ minutesPerMeeting: v || 45 })}
        />
        <TextField label="Where" value={draft.location} onChange={(v) => set({ location: v })} placeholder="CEED, Casablanca" />
      </div>

      <div className="field">
        <label>Who receives on this day</label>
        <div className="work-pick">
          {interlocutors.map((p) => {
            const on = draft.interlocutors.includes(p.id);
            return (
              <button
                key={p.id}
                type="button"
                className={on ? 'track on' : 'track'}
                onClick={() => set({ interlocutors: on ? draft.interlocutors.filter((x) => x !== p.id) : [...draft.interlocutors, p.id] })}
              >
                {p.name}
              </button>
            );
          })}
        </div>
      </div>

      <div className="row" style={{ gap: 8 }}>
        <span className="faint" style={{ flex: 1, fontSize: 12.5 }}>
          {slots} slot{slots === 1 ? '' : 's'} × {draft.interlocutors.length} interlocutor
          {draft.interlocutors.length === 1 ? '' : 's'} = {slots * draft.interlocutors.length} meetings at most
        </span>
        <button className="btn ghost" onClick={onCancel}>Cancel</button>
        <button className="btn primary" disabled={saving || !draft.heldOn} onClick={save}>
          {saving ? 'Saving…' : day ? 'Save the day' : 'Add the day'}
        </button>
      </div>
    </div>
  );
}
