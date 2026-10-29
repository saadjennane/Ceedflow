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
  mentorsOf,
  type Block,
  type Candidate,
  type OneToOneConfig,
  type OneToOneDay,
  type PersonRef,
  inviteLetterGap,
  pairingOf,
  firstSessionOn,
  recurringDates,
  FREQUENCIES,
  FREQUENCY_LABEL,
  WEEKDAY_LABEL,
  type Recurrence,
} from '@ceed/shared';
import { useState } from 'react';
import { api } from '../../../lib/api';
import { formatDate } from '../../../lib/format';
import { useAsync } from '../../../lib/useAsync';
import { ConfirmDialog, useToast } from '../../../ui/Overlays';
import { AccessTemplate, Template } from './Template';
import { PeoplePicker } from '../../directory/PeoplePicker';
import { DateField, NumberField, TextField } from '../../../ui/Field';
import { Icon } from '../../../ui/Icon';
import { QuestionsEditor } from '../../../ui/QuestionsEditor';

export const ONE_TO_ONE_TABS = ['Overview', 'Invitations', 'Interlocutors', 'Sessions', 'Preparation', 'Report', 'Messages'] as const;
export type OneToOneTab = (typeof ONE_TO_ONE_TABS)[number];

/**
 * The three ways a meeting is set — titled exactly as the Selection
 * Committee titles its own, so the same choice reads the same in both bricks.
 */
export const INVITE_WORDS: Record<(typeof RSVP_MODES)[number], { title: string; line: string }> = {
  slots: {
    title: 'The startup picks its own time',
    line: 'Its link shows the free slots of your sessions and it takes one, Calendly-style. Two startups cannot hold the same slot.',
  },
  confirm: {
    title: 'You give it a time, it confirms',
    line: 'You place each meeting; its link shows the time you set and asks it to confirm or decline — with a word if it declines.',
  },
  none: {
    title: 'No invitation',
    line: 'You place each meeting and the startup is simply told. Nothing to answer.',
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
  if (tab === 'Sessions') return <SessionsTab block={block} config={config} patch={patch} />;
  if (tab === 'Invitations') return <InvitationsTab config={config} patch={patch} />;

  if (tab === 'Interlocutors') {
    const pairing = pairingOf(config);
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
          help="Anybody in the directory."
        />

        <div className="field">
          <label>Who meets whom</label>
          <div className="pick-list">
            <button type="button" className={pairing === 'all' ? 'pick on' : 'pick'} onClick={() => patch({ pairing: 'all' })}>
              <Icon name={pairing === 'all' ? 'check' : 'square'} />
              <div>
                <strong>Every interlocutor meets every startup</strong>
                <span>Like an expert’s office hours: any startup may see any of them.</span>
              </div>
            </button>
            <button type="button" className={pairing === 'assigned' ? 'pick on' : 'pick'} onClick={() => patch({ pairing: 'assigned' })}>
              <Icon name={pairing === 'assigned' ? 'check' : 'square'} />
              <div>
                <strong>They share the startups</strong>
                <span>Each startup has its own interlocutors — one or several — and meets only them, once each.</span>
              </div>
            </button>
          </div>
        </div>

        {pairing === 'assigned' && <Pairs block={block} config={config} patch={patch} />}
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
        {inviteLetterGap(config.invite, messages.startup, ['action', 'lien']) && (
          <div className="callout warn">
            <Icon name="alert" size={15} />
            <div>{inviteLetterGap(config.invite, messages.startup, ['action', 'lien'])}</div>
          </div>
        )}
        <Template
          label="To the startup"
          help="When, with whom, where — and, when they are asked something, the link to book or to confirm. {{action}} follows each meeting’s mode: the link to pick a time, the link to confirm or decline (with a word), or nothing when the time is fixed."
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

        {/* Les rappels : partent seuls, le matin, une fois chacun. */}
        <h3 className="section-title" style={{ marginTop: 18 }}>Reminders</h3>
        <label className="check">
          <input
            type="checkbox"
            checked={config.reminders.eve}
            onChange={(e) => patch({ reminders: { ...config.reminders, eve: e.target.checked } })}
          />
          <span>The day before each session, remind the startup and the interlocutor</span>
        </label>
        {config.reminders.eve && (
          <>
            <Template
              label="Reminder to the startup"
              help="Sent the morning before the session — with the place, the video link and, when asked, where to prepare."
              value={config.reminders.eveStartup}
              onChange={(v) => patch({ reminders: { ...config.reminders, eveStartup: v } })}
              subject={config.reminders.subjects.eveStartup}
              onSubject={(v) => patch({ reminders: { ...config.reminders, subjects: { ...config.reminders.subjects, eveStartup: v } } })}
              variables={ONE_TO_ONE_STARTUP_VARIABLES}
            />
            <Template
              label="Reminder to the interlocutor"
              help="Sent the morning before — with where to read the startup’s preparation and write the report."
              value={config.reminders.evePerson}
              onChange={(v) => patch({ reminders: { ...config.reminders, evePerson: v } })}
              subject={config.reminders.subjects.evePerson}
              onSubject={(v) => patch({ reminders: { ...config.reminders, subjects: { ...config.reminders.subjects, evePerson: v } } })}
              variables={ONE_TO_ONE_PERSON_VARIABLES}
            />
          </>
        )}

        <label className="check" style={{ marginTop: 8 }}>
          <input
            type="checkbox"
            checked={config.reminders.late}
            onChange={(e) => patch({ reminders: { ...config.reminders, late: e.target.checked } })}
          />
          <span>Remind the interlocutor when the report is late</span>
        </label>
        {config.reminders.late && (
          <>
            <NumberField
              label="Days after the session"
              value={config.reminders.lateAfterDays}
              min={1}
              max={30}
              onChange={(v) => patch({ reminders: { ...config.reminders, lateAfterDays: Math.max(1, v || 2) } })}
              help="Once, while the brick is open and the report has not been sent."
            />
            <Template
              label="Report reminder"
              help="To the interlocutor whose report has not gone out."
              value={config.reminders.lateReport}
              onChange={(v) => patch({ reminders: { ...config.reminders, lateReport: v } })}
              subject={config.reminders.subjects.lateReport}
              onSubject={(v) => patch({ reminders: { ...config.reminders, subjects: { ...config.reminders.subjects, lateReport: v } } })}
              variables={ONE_TO_ONE_PERSON_VARIABLES}
            />
          </>
        )}
      </>
    );
  }

  if (tab === 'Preparation') {
    return (
      <>
        <div className="callout">
          <Icon name="form" size={15} />
          <div>
            What the startup prepares before each session — the topics to cover, its progress, what blocks it. It answers
            from its link and its Home; the interlocutor reads it, and can correct or complete it.
          </div>
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={config.prep.enabled}
            onChange={(e) => patch({ prep: { ...config.prep, enabled: e.target.checked } })}
          />
          <span>The startup prepares each session</span>
        </label>
        {config.prep.enabled && (
          <>
            <QuestionsEditor
              value={config.prep}
              onChange={(partial) => patch({ prep: { ...config.prep, ...partial } })}
              emptyText="No question yet. The topics to cover, progress since last time, what blocks them — add what you want them to prepare."
              firstPageName="Preparation"
            />
            <div className="grid-2">
              <NumberField
                label="Lock it automatically, hours before the session"
                value={config.prep.lockHoursBefore ?? 0}
                min={0}
                max={720}
                onChange={(v) => patch({ prep: { ...config.prep, lockHoursBefore: v ? Math.max(0, v) : null } })}
                help="Empty or 0: it stays open until the session starts."
              />
              <div className="field">
                <label>Lock now</label>
                <label className="check" style={{ marginTop: 6 }}>
                  <input
                    type="checkbox"
                    checked={config.prep.locked}
                    onChange={(e) => patch({ prep: { ...config.prep, locked: e.target.checked } })}
                  />
                  <span>Startups can no longer change their preparations</span>
                </label>
              </div>
            </div>
          </>
        )}
      </>
    );
  }

  if (tab === 'Report') {
    const prepared = config.prep.enabled && config.prep.fields.length > 0;
    const shared = prepared && config.report.shared;
    const known = new Set(config.report.fields.map((f) => f.id));
    const missing = config.prep.fields.filter((f) => !known.has(f.id));
    /* Dupliquer : les questions de la préparation, avec les mêmes identifiants
       — c'est ce qui laisse le compte rendu partir de ce que la startup a écrit. */
    const duplicate = () =>
      patch({
        report: {
          ...config.report,
          fields: [...missing.map((f) => ({ ...f, page: config.report.pages[0]?.id ?? '' })), ...config.report.fields],
        },
      });
    return (
      <>
        <div className="callout">
          <Icon name="form" size={15} />
          <div>
            What the interlocutor writes after each meeting. The answers add up in the One to One tab, question by question.
          </div>
        </div>

        {prepared ? (
          <div className="field">
            <label>The report and the startup’s preparation</label>
            <div className="pick-list">
              <button
                type="button"
                className={shared ? 'pick on' : 'pick'}
                onClick={() => patch({ report: { ...config.report, shared: true } })}
              >
                <Icon name={shared ? 'check' : 'square'} />
                <div>
                  <strong>One shared document</strong>
                  <span>
                    The report is the preparation itself: the startup fills it in, it is locked for the startup, and the
                    interlocutor completes it. One document, read by both.
                  </span>
                </div>
              </button>
              <button
                type="button"
                className={!shared ? 'pick on' : 'pick'}
                onClick={() => patch({ report: { ...config.report, shared: false } })}
              >
                <Icon name={!shared ? 'check' : 'square'} />
                <div>
                  <strong>A document of its own</strong>
                  <span>
                    Two versions: the startup’s preparation, and the interlocutor’s report — private. Duplicate the
                    preparation’s questions and add your own; the report then opens already filled with what the startup
                    wrote.
                  </span>
                </div>
              </button>
            </div>
          </div>
        ) : (
          <p className="faint" style={{ margin: 0, fontSize: 12.5 }}>
            Private: the startup does not read it. Turn on the Preparation tab to have the startup prepare each session.
          </p>
        )}

        {shared ? (
          <div className="callout">
            <Icon name="check" size={15} />
            <div>
              The report uses the preparation’s questions — edit them in the <strong>Preparation</strong> tab.
            </div>
          </div>
        ) : (
          <>
            {prepared && missing.length > 0 && (
              <div className="row">
                <span className="faint" style={{ flex: 1, fontSize: 12.5 }}>
                  {missing.length} question{missing.length > 1 ? 's' : ''} of the preparation {missing.length > 1 ? 'are' : 'is'} not in the report.
                </span>
                <button className="btn sm" onClick={duplicate}>
                  <Icon name="copy" size={12} /> Duplicate the preparation’s questions
                </button>
              </div>
            )}
            <QuestionsEditor
              value={config.report}
              onChange={(partial) => patch({ report: { ...config.report, ...partial } })}
              emptyText="No question yet. A topic discussed, the next steps, how the startup is doing — add what you want to follow."
              firstPageName="The meeting"
            />
          </>
        )}
      </>
    );
  }

  return (
    <>
      {/* Quand la brique vit : avant, personne ne voit rien ; après, les
          interlocuteurs relisent leurs comptes rendus sans les changer. */}
      <h3 className="section-title">When it runs</h3>
      <div className="grid-2">
        <DateField label="Opens on" value={config.opensAt} onChange={(v) => patch({ opensAt: v })} />
        <DateField label="Closes on" value={config.closesAt} onChange={(v) => patch({ closesAt: v })} />
      </div>
      <p className="faint" style={{ margin: 0, fontSize: 12 }}>
        While it is open, interlocutors see their meetings and write their reports, and startups answer their links.
        Once closed, reports can be read but no longer changed.
      </p>

      <IntakeChoice block={block} config={config} patch={patch} />

      <div className="field">
        <label>One-off or recurring</label>
        <div className="pick-list">
          <button type="button" className={config.cadence === 'single' ? 'pick on' : 'pick'} onClick={() => patch({ cadence: 'single' })}>
            <Icon name={config.cadence === 'single' ? 'check' : 'square'} />
            <div>
              <strong>One-off meetings</strong>
              <span>A meeting with a startup, once — set on the days you plan in Sessions.</span>
            </div>
          </button>
          <button type="button" className={config.cadence === 'recurring' ? 'pick on' : 'pick'} onClick={() => patch({ cadence: 'recurring' })}>
            <Icon name={config.cadence === 'recurring' ? 'check' : 'square'} />
            <div>
              <strong>A regular follow-up</strong>
              <span>The same startup and interlocutor every week, every two weeks or every month, until an end.</span>
            </div>
          </button>
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Invitations                                                         */
/* ------------------------------------------------------------------ */

/** How a meeting is set, for the whole brick — the Selection Committee's choice, in its words. */
function InvitationsTab({
  config,
  patch,
}: {
  config: OneToOneConfig;
  patch: (partial: Partial<OneToOneConfig>) => void;
}) {
  const pairing = pairingOf(config);
  return (
    <>
      <h3 className="section-title">How each startup gets its time</h3>
      <div className="field">
        <div className="pick-list">
          {(['slots', 'confirm', 'none'] as const).map((mode) => (
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
      {config.invite !== 'none' && (
        <DateField
          label="Answer by"
          value={config.answerBy}
          onChange={(v) => patch({ answerBy: v })}
          help="Optional. After this date the link stops accepting answers."
        />
      )}

      {config.cadence === 'single' &&
        (pairing === 'all' ? (
          <NumberField
            label="Meetings per startup"
            value={config.perStartup}
            min={1}
            max={20}
            onChange={(v) => patch({ perStartup: Math.max(1, v || 1) })}
            help="How many meetings a startup may have in this brick, all interlocutors together."
          />
        ) : (
          <p className="faint" style={{ margin: 0, fontSize: 12.5 }}>
            The startups are shared (Interlocutors tab): each meets each of its own interlocutors once.
          </p>
        ))}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Sessions                                                            */
/* ------------------------------------------------------------------ */

/**
 * Où et quand les rendez-vous se tiennent. Ponctuels : des journées, comme
 * les séances d'un comité. Récurrents : chaque série naît de son premier
 * rendez-vous, dans l'onglet One to One.
 */
function SessionsTab({
  block,
  config,
  patch,
}: {
  block: Block;
  config: OneToOneConfig;
  patch: (partial: Partial<OneToOneConfig>) => void;
}) {
  return (
    <>
      <div className="grid-2">
        <NumberField
          label="Length of a meeting, in minutes"
          value={config.durationMinutes}
          min={5}
          max={480}
          onChange={(v) => patch({ durationMinutes: v || 45 })}
        />
        <TextField
          label="Where, by default"
          value={config.location}
          onChange={(v) => patch({ location: v })}
          placeholder="CEED, Casablanca"
        />
      </div>
      <p className="faint" style={{ margin: 0, fontSize: 12 }}>
        Each meeting can say otherwise — its place and its video link are set on the meeting itself, in the One to One tab.
      </p>

      {config.cadence === 'recurring' ? (
        <RecurrenceEditor block={block} config={config} patch={patch} />
      ) : (
        <DaysTab block={block} />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* The calendar of a regular follow-up                                 */
/* ------------------------------------------------------------------ */

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;

/**
 * Le calendrier d'un suivi régulier, réglé une fois pour toute la brique : la
 * période, le rythme, les semaines sans séance, et quand chaque interlocuteur
 * reçoit dans la semaine. Chaque binôme en tire sa série ; une startup qui
 * choisit son heure prend un créneau de la semaine, libre à toutes les dates.
 */
function RecurrenceEditor({
  block,
  config,
  patch,
}: {
  block: Block;
  config: OneToOneConfig;
  patch: (partial: Partial<OneToOneConfig>) => void;
}) {
  const view = useAsync(() => api.get<BrickView>(`/api/blocks/${block.id}/one-to-one`), `recurrence:${block.id}`);
  const rec = config.recurrence;
  const set = (partial: Partial<Recurrence>) => patch({ recurrence: { ...rec, ...partial } });
  const people = (view.data?.interlocutors ?? []).filter((p) => config.interlocutors.includes(p.id));
  const name = (id: string) => people.find((p) => p.id === id)?.name ?? 'Interlocutor';

  /* Ce que donne le calendrier, dit en une ligne : combien de séances, du quand au quand. */
  const sample = rec.weekly[0]?.weekday ?? 1;
  const first = firstSessionOn(rec, sample);
  const dates = rec.endsOn || rec.count ? recurringDates(rec, first) : [];

  const setWeekly = (index: number, partial: Partial<Recurrence['weekly'][number]>) =>
    set({ weekly: rec.weekly.map((w, i) => (i === index ? { ...w, ...partial } : w)) });

  return (
    <div className="stack" style={{ gap: 14 }}>
      <h3 className="section-title">The follow-up calendar</h3>
      <div className="grid-2">
        <DateField label="From" value={rec.startsOn} onChange={(v) => set({ startsOn: v })} />
        <DateField label="Until" value={rec.endsOn} onChange={(v) => set({ endsOn: v })} />
      </div>
      <div className="grid-2">
        <div className="field">
          <label>Rhythm</label>
          <select className="select" value={rec.frequency} onChange={(e) => set({ frequency: e.target.value as Recurrence['frequency'] })}>
            {FREQUENCIES.map((f) => (
              <option key={f} value={f}>{FREQUENCY_LABEL[f]}</option>
            ))}
          </select>
        </div>
        {!rec.endsOn && (
          <NumberField
            label="Number of sessions"
            value={rec.count ?? 0}
            min={1}
            max={52}
            onChange={(v) => set({ count: v ? Math.min(52, Math.max(1, v)) : null })}
            help="When there is no end date."
          />
        )}
      </div>
      <p className={dates.length ? 'faint' : 'warnline'} style={{ margin: 0, fontSize: 12.5 }}>
        {dates.length
          ? `${dates.length} session${dates.length > 1 ? 's' : ''} per startup — on a ${WEEKDAY_LABEL[sample]}, from ${formatDate(dates[0]!)} to ${formatDate(dates[dates.length - 1]!)}.`
          : 'Give an end date or a number of sessions: a series has to end.'}
      </p>

      <div className="field">
        <label>Weeks without sessions</label>
        <div className="help">Holidays, Ramadan… A session that falls there is skipped, not moved.</div>
        <div className="stack" style={{ gap: 6, marginTop: 4 }}>
          {rec.excluded.map((x, i) => (
            <div className="row wrap" key={i} style={{ gap: 6 }}>
              <input className="input" style={{ width: 150 }} type="date" value={x.from} aria-label="From"
                onChange={(e) => set({ excluded: rec.excluded.map((y, j) => (j === i ? { ...y, from: e.target.value } : y)) })} />
              <span className="faint">to</span>
              <input className="input" style={{ width: 150 }} type="date" value={x.to} aria-label="To"
                onChange={(e) => set({ excluded: rec.excluded.map((y, j) => (j === i ? { ...y, to: e.target.value } : y)) })} />
              <input className="input" style={{ flex: 1, minWidth: 120 }} value={x.label} placeholder="Why — optional" aria-label="Why"
                onChange={(e) => set({ excluded: rec.excluded.map((y, j) => (j === i ? { ...y, label: e.target.value } : y)) })} />
              <button className="btn ghost icon sm" aria-label="Remove this period" onClick={() => set({ excluded: rec.excluded.filter((_, j) => j !== i) })}>
                <Icon name="x" size={12} />
              </button>
            </div>
          ))}
          <button className="btn sm" style={{ alignSelf: 'flex-start' }}
            onClick={() => set({ excluded: [...rec.excluded, { from: rec.startsOn ?? '', to: rec.startsOn ?? '', label: '' }] })}>
            <Icon name="plus" size={12} /> Add a period
          </button>
        </div>
      </div>

      <div className="field">
        <label>When each interlocutor receives, in the week</label>
        <div className="help">
          When the startups pick their own time, they choose among these weekly slots — one that is free on every date of
          the series. Otherwise it is a guide for you when you set each series.
        </div>
        {!people.length ? (
          <div className="callout warn" style={{ marginTop: 6 }}>
            <Icon name="alert" size={15} />
            <div>Name the interlocutors first, in the Interlocutors tab.</div>
          </div>
        ) : (
          <div className="stack" style={{ gap: 6, marginTop: 4 }}>
            {rec.weekly.map((w, i) => (
              <div className="row wrap" key={i} style={{ gap: 6 }}>
                <select className="select" style={{ width: 170 }} value={w.personId} aria-label="Who"
                  onChange={(e) => setWeekly(i, { personId: e.target.value })}>
                  {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <select className="select" style={{ width: 130 }} value={w.weekday} aria-label="Day"
                  onChange={(e) => setWeekly(i, { weekday: Number(e.target.value) })}>
                  {WEEKDAYS.map((d) => <option key={d} value={d}>{WEEKDAY_LABEL[d]}</option>)}
                </select>
                <input className="input" type="time" style={{ width: 110 }} value={w.windows[0]?.startsAt ?? '09:00'} aria-label="From"
                  onChange={(e) => setWeekly(i, { windows: [{ startsAt: e.target.value, endsAt: w.windows[0]?.endsAt ?? '12:00' }] })} />
                <span className="faint">to</span>
                <input className="input" type="time" style={{ width: 110 }} value={w.windows[0]?.endsAt ?? '12:00'} aria-label="To"
                  onChange={(e) => setWeekly(i, { windows: [{ startsAt: w.windows[0]?.startsAt ?? '09:00', endsAt: e.target.value }] })} />
                <span className="faint" style={{ fontSize: 12 }}>
                  {daySlots({ windows: w.windows, minutesPerMeeting: config.durationMinutes }).length} slot(s) · {name(w.personId)}
                </span>
                <button className="btn ghost icon sm" aria-label="Remove" onClick={() => set({ weekly: rec.weekly.filter((_, j) => j !== i) })}>
                  <Icon name="x" size={12} />
                </button>
              </div>
            ))}
            <button className="btn sm" style={{ alignSelf: 'flex-start' }}
              onClick={() => set({ weekly: [...rec.weekly, { personId: people[0]!.id, weekday: 1, windows: [{ startsAt: '09:00', endsAt: '12:00' }] }] })}>
              <Icon name="plus" size={12} /> Add a weekly slot
            </button>
          </div>
        )}
      </div>
    </div>
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
    const { name: n, heldOn, windows, minutesPerMeeting, location, meetingLink, interlocutors: who } = d;
    const made = await api.post<OneToOneDay>(`/api/blocks/${block.id}/days`, {
      name: `${n || 'Day'} (copy)`, heldOn, windows, minutesPerMeeting, location, meetingLink, interlocutors: who,
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
    meetingLink: day?.meetingLink ?? '',
    /* Une journée où personne ne reçoit ne sert à rien : vide, elle propose
       tous les interlocuteurs de la brique — on retire ceux qui ne viennent pas. */
    interlocutors: day?.interlocutors.length ? day.interlocutors : interlocutors.map((p) => p.id),
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
      <TextField
        label="Video link"
        value={draft.meetingLink}
        onChange={(v) => set({ meetingLink: v })}
        placeholder="https://meet.google.com/… — optional"
        help="Given to every meeting of the day; a meeting can still have its own."
      />

      <div className="field">
        <label>Who receives on this day</label>
        <div className="help">Click a name to add or remove them.</div>
        <div className="work-pick">
          {interlocutors.map((p) => {
            const on = draft.interlocutors.includes(p.id);
            return (
              <button
                key={p.id}
                type="button"
                className={on ? 'track on' : 'track'}
                aria-pressed={on}
                onClick={() => set({ interlocutors: on ? draft.interlocutors.filter((x) => x !== p.id) : [...draft.interlocutors, p.id] })}
              >
                {on ? '✓ ' : '+ '}
                {p.name}
              </button>
            );
          })}
        </div>
      </div>

      <div className="row" style={{ gap: 8 }}>
        {draft.interlocutors.length ? (
          <span className="faint" style={{ flex: 1, fontSize: 12.5 }}>
            {slots} slot{slots === 1 ? '' : 's'} × {draft.interlocutors.length} interlocutor
            {draft.interlocutors.length === 1 ? '' : 's'} = {slots * draft.interlocutors.length} meetings at most
          </span>
        ) : (
          <span className="warnline" style={{ flex: 1, fontSize: 12.5 }}>
            Nobody receives on this day yet — click a name above.
          </span>
        )}
        <button className="btn ghost" onClick={onCancel}>Cancel</button>
        <button className="btn primary" disabled={saving || !draft.heldOn} onClick={save}>
          {saving ? 'Saving…' : day ? 'Save the day' : 'Add the day'}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Which startups, and their mentors                                   */
/* ------------------------------------------------------------------ */

interface BrickView {
  pool: { candidate: Candidate }[];
  interlocutors: PersonRef[];
  reach: { upstream: number; track: number; from: string | null };
}

/**
 * Quelles startups la brique reçoit, avec les nombres : sans eux, un vivier
 * vide ne dit pas s'il l'est parce que personne n'a passé la sélection, ou
 * parce qu'elle n'a encore rien décidé.
 */
function IntakeChoice({
  block,
  config,
  patch,
}: {
  block: Block;
  config: OneToOneConfig;
  patch: (partial: Partial<OneToOneConfig>) => void;
}) {
  const view = useAsync(() => api.get<BrickView>(`/api/blocks/${block.id}/one-to-one`), `reach:${block.id}`);
  const reach = view.data?.reach;
  return (
    <div className="field">
      <label>Which startups</label>
      <div className="pick-list">
        <button type="button" className={config.intake === 'upstream' ? 'pick on' : 'pick'} onClick={() => patch({ intake: 'upstream' })}>
          <Icon name={config.intake === 'upstream' ? 'check' : 'square'} />
          <div>
            <strong>
              Those who passed {reach?.from ? `“${reach.from}”` : 'the selection before'}
              {reach && <span className="faint" style={{ fontWeight: 400 }}> · {reach.upstream}</span>}
            </strong>
            <span>
              {reach && !reach.from
                ? 'There is no selection before this brick: every startup of the track comes in.'
                : 'The rule of every brick: who moves on there comes here. Nobody yet means the selection has not let anybody through.'}
            </span>
          </div>
        </button>
        <button type="button" className={config.intake === 'track' ? 'pick on' : 'pick'} onClick={() => patch({ intake: 'track' })}>
          <Icon name={config.intake === 'track' ? 'check' : 'square'} />
          <div>
            <strong>
              Every startup in the track
              {reach && <span className="faint" style={{ fontWeight: 400 }}> · {reach.track}</span>}
            </strong>
            <span>For meetings that wait on no selection — office hours open to all, for instance.</span>
          </div>
        </button>
      </div>
    </div>
  );
}

/**
 * Les interlocuteurs de chaque startup, quand ils se les partagent : un ou
 * plusieurs. « Répartir » donne à chaque startup qui n'en a pas celui qui en
 * a le moins — on corrige ensuite à la main.
 */
function Pairs({
  block,
  config,
  patch,
}: {
  block: Block;
  config: OneToOneConfig;
  patch: (partial: Partial<OneToOneConfig>) => void;
}) {
  const view = useAsync(() => api.get<BrickView>(`/api/blocks/${block.id}/one-to-one`), `startups:${block.id}`);
  if (view.error) return <div className="empty">{view.error}</div>;
  if (!view.data) return <div className="empty">Loading…</div>;
  const { pool, interlocutors, reach } = view.data;
  const people = interlocutors.filter((p) => config.interlocutors.includes(p.id));

  const toggle = (candidate: Candidate, personId: string) => {
    const now = mentorsOf(config, candidate);
    const next = now.includes(personId) ? now.filter((id) => id !== personId) : [...now, personId];
    patch({ mentors: { ...config.mentors, [candidate.id]: next } });
  };

  /* Équilibré : chacune des startups sans interlocuteur va à celui qui en a le moins. */
  const distribute = () => {
    const load = new Map(people.map((p) => [p.id, 0]));
    for (const { candidate } of pool) for (const id of mentorsOf(config, candidate)) load.set(id, (load.get(id) ?? 0) + 1);
    const next = { ...config.mentors };
    for (const { candidate } of pool) {
      if (mentorsOf(config, candidate).length) continue;
      const [least] = [...load.entries()].sort((a, b) => a[1] - b[1]);
      if (!least) break;
      next[candidate.id] = [least[0]];
      load.set(least[0], least[1] + 1);
    }
    patch({ mentors: next });
  };
  const unpaired = pool.filter(({ candidate }) => !mentorsOf(config, candidate).length).length;

  return (
    <>
      {!pool.length ? (
        <div className="empty" style={{ padding: 22 }}>
          <p style={{ margin: 0 }}>
            No startup reaches this brick yet.{' '}
            {config.intake === 'upstream' && reach.from
              ? `It takes those who passed “${reach.from}” — nobody has, so far. Or choose every startup of the track, in Overview.`
              : ''}
          </p>
        </div>
      ) : !people.length ? (
        <div className="callout warn">
          <Icon name="alert" size={15} />
          <div>Name the interlocutors above first.</div>
        </div>
      ) : (
        <>
          <div className="row">
            <span className="faint" style={{ flex: 1, fontSize: 12.5 }}>
              {unpaired ? `${unpaired} startup${unpaired > 1 ? 's have' : ' has'} nobody yet.` : 'Every startup has its interlocutors.'}{' '}
              The mentor the cohort gave a startup is suggested until you change it.
            </span>
            <button className="btn sm" disabled={!unpaired} onClick={distribute}>
              <Icon name="users" size={12} /> Distribute automatically
            </button>
          </div>
          <div className="rows">
            {pool.map(({ candidate }) => {
              const mine = mentorsOf(config, candidate);
              const suggested = !config.mentors[candidate.id] && mine.length > 0;
              return (
                <div className="rowcard card-pad stack" key={candidate.id} style={{ gap: 6 }}>
                  <div className="row">
                    <strong style={{ flex: 1, fontSize: 13 }}>{candidate.orgName}</strong>
                    {suggested && <span className="faint" style={{ fontSize: 11.5 }}>the cohort’s mentor</span>}
                    {!mine.length && <span className="badge warn">Nobody yet</span>}
                  </div>
                  <div className="work-pick">
                    {people.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className={mine.includes(p.id) ? 'track on' : 'track'}
                        onClick={() => toggle(candidate, p.id)}
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
