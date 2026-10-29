/**
 * Ce qu'une startup doit faire, et où.
 *
 * A founder signs in to answer one question: is something expected of me. The
 * page therefore opens on the answer — the documents still owed, the morning
 * they pitch — and not on a list of programmes they would have to walk into to
 * find out.
 *
 * Underneath, the programmes themselves, because that is where the work is
 * done once you know there is some.
 */
import {
  itemComplete,
  longDate,
  type ActionStatus,
  type DeliverableItem,
  type MemberAction,
  type MemberActivity,
  type Task,
  type TaskItem,
} from '@ceed/shared';
import { useState } from 'react';
import { useLang } from '../../lib/lang';
import { Icon } from '../../ui/Icon';
import { type AgendaEntry } from './Agenda';
import { type MyProgram } from './MemberPage';
import { type Owed } from './OwedItems';

export interface CandidacyState {
  candidateId: string;
  orgName: string;
  programme: MyProgram;
  owed: Owed[];
  agenda: AgendaEntry[];
}

/** What is still theirs to send, in the words the strip uses. */
export function owedLine(owed: Owed[]): { left: number; of: number; closesAt: string | null; back: boolean } | null {
  let left = 0;
  let of = 0;
  let back = false;
  let closesAt: string | null = null;

  for (const ask of owed) {
    if (!ask.open) continue;
    const need = ask.config.items.filter((i: DeliverableItem) => i.required);
    const mine = (id: string) => ask.returns.find((r) => r.itemId === id);
    const sent = need.filter((i) => itemComplete(i, mine(i.id)?.value)).length;
    of += need.length;
    left += need.length - sent;
    if (ask.returns.some((r) => r.state === 'rejected')) back = true;
    if (ask.config.closesAt && (!closesAt || ask.config.closesAt < closesAt)) closesAt = ask.config.closesAt;
  }
  return of === 0 ? null : { left, of, closesAt, back };
}

export function MemberHome({
  home,
  error,
  programs,
  onTick,
  onTickItem,
  onOpen,
  onGo,
}: {
  /** What the server read for them: null while it loads. */
  home: { actions: MemberAction[]; upcoming: MemberActivity[] } | null;
  error?: string | null;
  /** Their programmes, for the strip at the bottom. */
  programs: MyProgram[];
  onTick: (task: Task) => void;
  /** Cocher une ligne de sa checklist, sans clore la tâche. */
  onTickItem: (task: Task, item: TaskItem) => void;
  onOpen: (editionId: string) => void;
  /** Where an action is done — a page of this app. */
  onGo: (href: string) => void;
}) {
  const { t, lang } = useLang();
  const [filter, setFilter] = useState<'all' | ActionStatus>('all');

  /* Une ligne par chose à faire, tous programmes et rôles confondus, dans
     l'ordre du plus pressé : ce qui compte est le geste, le programme n'est
     que l'endroit où il se fait. */
  const titleOf = (a: MemberAction): string => {
    switch (a.kind) {
      case 'task':
        return a.label;
      case 'deliverable':
        return `${a.back ? t('act.deliverableBack') : t('act.deliverable')} — ${a.label}`;
      case 'profile':
        return `${t('act.profile')} ${a.label}`;
      case 'review':
        return `${t('act.review')} ${a.left} ${t('act.startups')} — ${a.label}`;
      case 'report':
        return `${t('act.report')} — ${a.label}`;
      case 'answer_committee':
        return `${a.answer === 'book' ? t('act.bookCommittee') : t('act.confirmCommittee')} — ${a.label}`;
      case 'prepare':
        return `${t('act.prepare')} ${a.label}`;
      case 'answer_meeting':
        if (!a.label) return t('act.bookMeetingAny');
        return `${a.answer === 'book' ? t('act.bookMeeting') : t('act.confirmMeeting')} ${a.label}`;
    }
  };
  const detailOf = (a: MemberAction): string =>
    [
      a.programName,
      a.orgName && a.kind !== 'profile' ? a.orgName : null,
      a.kind === 'profile' && a.left ? `${a.left} ${t('act.missing')}` : null,
      a.kind !== 'profile' && a.of ? `${a.left} ${t('act.left')} ${a.of}` : null,
      a.dueOn ? `${t('owed.before')} ${longDate(a.dueOn)}` : null,
    ]
      .filter(Boolean)
      .join(' · ');
  const ctaOf = (a: MemberAction): string | null =>
    a.kind === 'task'
      ? null
      : a.kind === 'deliverable'
        ? t('cta.deliverable')
        : a.kind === 'profile'
          ? t('cta.profile')
          : a.kind === 'review'
            ? t('cta.review')
            : a.kind === 'report'
              ? t('cta.report')
              : a.kind === 'prepare'
                ? t('cta.prepare')
              : a.answer === 'book'
                ? t('cta.book')
                : t('cta.confirm');

  const actions = home?.actions ?? [];
  const shown = filter === 'all' ? actions : actions.filter((a) => a.status === filter);
  const count = (s: ActionStatus) => actions.filter((a) => a.status === s).length;
  const pendingByEdition = new Map<string, number>();
  for (const a of actions) if (a.editionId) pendingByEdition.set(a.editionId, (pendingByEdition.get(a.editionId) ?? 0) + 1);
  const active = programs.filter((p) => p.mine.length > 0);

  return (
    <div className="stack" style={{ gap: 16 }}>
      {/* ---- À faire ---- */}
      <section className="card card-pad stack" style={{ gap: 10 }}>
        <div className="row wrap" style={{ gap: 6 }}>
          <div className="eyebrow" style={{ flex: 1 }}>{t('home.todo')}</div>
          {actions.length > 0 &&
            (['all', 'late', 'in_progress', 'pending'] as const).map((f) =>
              f !== 'all' && !count(f) ? null : (
                <button
                  key={f}
                  className={filter === f ? 'track on' : 'track'}
                  aria-pressed={filter === f}
                  onClick={() => setFilter(f)}
                >
                  {f === 'all' ? t('home.all') : t(`status.${f}` as const)}{' '}
                  <span className="num">{f === 'all' ? actions.length : count(f)}</span>
                </button>
              ),
            )}
        </div>

        {error ? (
          <div className="callout warn">
            <Icon name="alert" size={15} /> {t('home.error')}
          </div>
        ) : !home ? (
          <p className="faint" style={{ margin: 0, fontSize: 12.5 }}>{t('home.loading')}</p>
        ) : !shown.length ? (
          <div className="stack" style={{ gap: 2 }}>
            <p style={{ margin: 0, fontSize: 13.5 }}>{t('home.nothing')}</p>
            <p className="faint" style={{ margin: 0, fontSize: 12.5 }}>{t('home.nothingMore')}</p>
          </div>
        ) : (
          <div className="rows">
            {shown.map((a) => (
              <div key={a.id} className="rowcard stack" style={{ gap: 0, padding: 0 }}>
                <div className="row" style={{ padding: '11px 13px', gap: 11 }}>
                  {/* Une tâche se coche — et seulement par sa case : un clic sur
                      la ligne ne la déclare plus faite sans qu'on l'ait voulu. */}
                  {a.kind === 'task' && a.task ? (
                    <input type="checkbox" aria-label={a.label} checked={false} onChange={() => onTick(a.task!)} />
                  ) : null}
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="row wrap" style={{ gap: 6 }}>
                      <strong style={{ fontSize: 13.5, color: a.status === 'late' ? 'var(--stop)' : undefined }}>
                        {titleOf(a)}
                      </strong>
                      <span className={a.status === 'late' ? 'badge stop' : a.status === 'in_progress' ? 'badge warn' : 'badge'}>
                        {t(`status.${a.status}` as const)}
                      </span>
                      {a.role !== 'member' && a.role !== 'startup' && <span className="badge info">{t(`role.${a.role}` as const)}</span>}
                    </span>
                    {detailOf(a) && (
                      <span className="faint" style={{ display: 'block', fontSize: 12.5, marginTop: 2 }}>{detailOf(a)}</span>
                    )}
                  </span>
                  {ctaOf(a) && (
                    <button className="btn sm primary" onClick={() => onGo(a.href)}>
                      {ctaOf(a)} <Icon name="chevronRight" size={13} />
                    </button>
                  )}
                </div>
                {/* Les lignes de la checklist sous la tâche. */}
                {a.task && a.task.items.length > 0 && (
                  <div className="stack" style={{ gap: 2, padding: '0 13px 10px 37px' }}>
                    {a.task.detail && <span className="faint" style={{ fontSize: 12.5 }}>{a.task.detail}</span>}
                    {a.task.items.map((line) => (
                      <label key={line.id} className="check" style={{ fontSize: 13 }}>
                        <input type="checkbox" checked={line.done} onChange={() => onTickItem(a.task!, line)} />
                        <span style={{ textDecoration: line.done ? 'line-through' : undefined }}>{line.label}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ---- À venir : le calendrier, qui n'est pas une liste de tâches ---- */}
      <section className="card card-pad stack" style={{ gap: 10 }}>
        <div className="eyebrow">{t('home.upcoming')}</div>
        {!home ? null : !home.upcoming.length ? (
          <p className="faint" style={{ margin: 0, fontSize: 12.5 }}>{t('home.noUpcoming')}</p>
        ) : (
          <div className="rows">
            {home.upcoming.map((u) => (
              <button
                key={u.id}
                className="rowcard row"
                style={{ padding: '10px 13px', gap: 11, width: '100%', textAlign: 'left' }}
                disabled={!u.href}
                onClick={() => u.href && onGo(u.href)}
              >
                <span className="num" style={{ minWidth: 92, fontSize: 12.5 }}>
                  {u.on ? longDate(u.on) : ''}
                  {u.startsAt && <span className="faint" style={{ display: 'block' }}>{u.startsAt}</span>}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <strong style={{ fontSize: 13.5 }}>
                    {u.kind === 'committee'
                      ? `${t('up.committee')} — ${u.label}`
                      : u.kind === 'jury_sitting'
                        ? `${t('up.sitting')} — ${u.label}`
                        : `${t('up.meeting')} ${u.label}`}
                  </strong>
                  <span className="faint" style={{ display: 'block', fontSize: 12.5 }}>
                    {[u.programName, u.location].filter(Boolean).join(' · ')}
                  </span>
                </span>
                {u.role !== 'startup' && <span className="badge info">{t(`role.${u.role}` as const)}</span>}
                {u.href && <Icon name="chevronRight" size={15} />}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* ---- Ses programmes ---- */}
      <section className="card card-pad stack" style={{ gap: 10 }}>
        <div className="eyebrow">{t('home.programmes')}</div>
        <div className="rows">
          {active.length === 0 && (
            <p className="faint" style={{ margin: 0, fontSize: 12.5 }}>{t('prog.noneMore')}</p>
          )}
          {active.map((p) => (
            <button
              className="rowcard row"
              key={p.editionId}
              style={{ padding: '11px 13px', gap: 11, width: '100%', textAlign: 'left' }}
              onClick={() => onOpen(p.editionId)}
            >
              <span style={{ flex: 1, minWidth: 0 }}>
                <strong style={{ fontSize: 13.5 }}>{p.programName}</strong>
                <span className="faint" style={{ display: 'block', fontSize: 12.5 }}>
                  {[p.editionName, p.city, p.startsOn ? longDate(p.startsOn) : null].filter(Boolean).join(' · ')}
                </span>
              </span>
              {(pendingByEdition.get(p.editionId) ?? 0) > 0 && (
                <span className="badge warn num">{pendingByEdition.get(p.editionId)}</span>
              )}
              <span className="faint" style={{ fontSize: 12.5 }}>{lang === 'fr' ? 'Ouvrir' : 'Open'}</span>
              <Icon name="chevronRight" size={15} />
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
