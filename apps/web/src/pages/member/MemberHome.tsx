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
  type DeliverableItem,
  type MemberAction,
  type MemberDone,
  type MemberHomeData,
  type Task,
  type TaskItem,
  requiredShown,
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
    const mine = (id: string) => ask.returns.find((r) => r.itemId === id);
    const need = requiredShown(ask.config.items as DeliverableItem[], (id) => mine(id)?.value);
    const sent = need.filter((i) => itemComplete(i, mine(i.id)?.value)).length;
    of += need.length;
    left += need.length - sent;
    if (ask.returns.some((r) => r.state === 'rejected')) back = true;
    if (ask.config.closesAt && (!closesAt || ask.config.closesAt < closesAt)) closesAt = ask.config.closesAt;
  }
  return of === 0 ? null : { left, of, closesAt, back };
}

type Tone = 'late' | 'today' | 'soon' | 'later';

/** Une ligne de « À venir » : une chose à faire ou un rendez-vous, dite pareil. */
interface NextLine {
  id: string;
  /** Pour trier : la date, ou rien. */
  on: string | null;
  top: string;
  sub: string;
  tone: Tone;
  title: string;
  detail: string;
  cta: string | null;
  href: string | null;
  editionId: string | null;
  task?: Task;
  role?: string;
  /** Un rendez-vous : celui qui vient en premier est mis en avant. */
  meeting?: boolean;
}

export function MemberHome({
  home,
  error,
  programs,
  onTick,
  onTickItem,
  onOpen,
  onGo,
  withProgrammes = true,
  withDone = withProgrammes,
  split = false,
  firstName,
  documents = [],
}: {
  /** What the server read for them: null while it loads. */
  home: MemberHomeData | null;
  error?: string | null;
  /** Their programmes, for the cards at the bottom. */
  programs: MyProgram[];
  onTick: (task: Task) => void;
  /** Cocher une ligne de sa checklist, sans clore la tâche. */
  onTickItem: (task: Task, item: TaskItem) => void;
  onOpen: (editionId: string) => void;
  /** Where an action is done — a page of this app. */
  onGo: (href: string) => void;
  /** The programmes block — not on a programme's own page, which is one of them. */
  withProgrammes?: boolean;
  /** Ce qui est fait — la page d'un programme a déjà son historique. */
  withDone?: boolean;
  /** La page d'un programme : « À faire » et « À venir » séparés, plutôt qu'une seule liste. */
  split?: boolean;
  /** Pour dire bonjour ; sans, pas d'en-tête. */
  firstName?: string;
  /**
   * Leurs listes de pièces, même quand tout est envoyé : c'est là qu'on revient
   * remplacer un document. Sans cette entrée, une liste complète disparaissait
   * de l'accueil avec la dernière chose à faire.
   */
  documents?: { editionId: string; programName: string; lists: { name: string; sent: number; of: number; accepted: number; back: number }[] }[];
}) {
  const { t, lang } = useLang();
  const fr = lang === 'fr';
  const [allDone, setAllDone] = useState(false);
  const now = isoToday();

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
      case 'kpi':
        return `${t('act.kpi')} — ${a.label}`;
      case 'answer_meeting':
        if (!a.label) return t('act.bookMeetingAny');
        return `${a.answer === 'book' ? t('act.bookMeeting') : t('act.confirmMeeting')} ${a.label}`;
    }
  };
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
                : a.kind === 'kpi'
                  ? t('cta.kpi')
                  : a.answer === 'book'
                    ? t('cta.book')
                    : t('cta.confirm');

  /* La date en deux lignes : le jour, puis l'heure ou ce qu'elle signifie. */
  const day = (on: string) =>
    on === now
      ? fr ? 'AUJ.' : 'TODAY'
      : new Date(`${on}T12:00:00`).toLocaleDateString(fr ? 'fr-FR' : 'en-GB', { day: 'numeric', month: 'short' }).replace('.', '').toUpperCase();
  const toneOf = (on: string | null, late: boolean): Tone =>
    late || (on && on < now) ? 'late' : on === now ? 'today' : on && on <= plusDays(now, 7) ? 'soon' : 'later';

  const lines: NextLine[] = [];
  for (const a of home?.actions ?? []) {
    const late = a.status === 'late';
    lines.push({
      id: a.id,
      on: a.dueOn?.slice(0, 10) ?? null,
      top: a.dueOn ? day(a.dueOn.slice(0, 10)) : fr ? 'À FAIRE' : 'TO DO',
      sub: late ? (fr ? 'en retard' : 'late') : a.dueOn ? (fr ? 'avant' : 'due') : a.status === 'in_progress' ? (fr ? 'commencé' : 'started') : '',
      tone: toneOf(a.dueOn?.slice(0, 10) ?? null, late),
      title: titleOf(a),
      detail: [
        a.programName,
        a.kind === 'profile' && a.left ? `${a.left} ${t('act.missing')}` : null,
        a.kind !== 'profile' && a.of ? `${a.left} ${t('act.left')} ${a.of}` : null,
      ].filter(Boolean).join(' · '),
      cta: ctaOf(a),
      href: a.href || null,
      editionId: a.editionId,
      task: a.task,
      role: a.role !== 'member' && a.role !== 'startup' ? a.role : undefined,
    });
  }
  for (const u of home?.upcoming ?? []) {
    lines.push({
      id: u.id,
      on: u.on,
      top: u.on ? day(u.on) : '—',
      sub: u.startsAt ?? '',
      tone: toneOf(u.on, false),
      title:
        u.kind === 'committee'
          ? `${t('up.committee')} — ${u.label}`
          : u.kind === 'jury_sitting'
            ? `${t('up.sitting')} — ${u.label}`
            : `${t('up.meeting')} ${u.label}`,
      detail: [u.programName, u.location].filter(Boolean).join(' · '),
      cta: u.href ? (fr ? 'Ouvrir' : 'Open') : null,
      href: u.href,
      editionId: u.editionId,
      role: u.role !== 'startup' ? u.role : undefined,
      meeting: true,
    });
  }
  /* Une liste de pièces toute envoyée reste à portée : on y revient remplacer. */
  for (const d of documents) {
    for (const l of d.lists) {
      if (lines.some((x) => x.editionId === d.editionId && x.title.endsWith(`— ${l.name}`))) continue;
      lines.push({
        id: `docs:${d.editionId}:${l.name}`,
        on: null,
        top: fr ? 'PIÈCES' : 'ITEMS',
        sub: l.back ? (fr ? 'à renvoyer' : 'to resend') : '',
        tone: l.back ? 'late' : 'later',
        title: `${l.name} — ${l.of && l.sent >= l.of ? t('docs.allSent') : `${l.sent}/${l.of} ${t('docs.sent')}`}`,
        detail: [d.programName, l.accepted ? `${l.accepted} ${t('docs.accepted')}` : null].filter(Boolean).join(' · '),
        cta: t('docs.view'),
        href: `/me?tab=Programs&prog=${d.editionId}`,
        editionId: d.editionId,
      });
    }
  }
  const rank = (x: NextLine) => (x.tone === 'late' ? 0 : 1);
  lines.sort((a, b) => rank(a) - rank(b) || (a.on ?? '9999').localeCompare(b.on ?? '9999'));
  /* Le prochain rendez-vous, s'il est dans la semaine, passe devant. */
  const featured = lines.find((x) => x.meeting && x.on && x.on >= now && x.on <= plusDays(now, 7)) ?? null;
  const rest = lines.filter((x) => x !== featured);
  const toDo = (home?.actions ?? []).length;
  const todoLines = lines.filter((x) => !x.meeting);
  const calLines = lines.filter((x) => x.meeting);

  const go = (line: NextLine) => {
    if (line.href) onGo(line.href);
    else if (line.editionId) onOpen(line.editionId);
  };

  const done = home?.done ?? [];
  const shownDone = allDone ? done : done.slice(0, 5);
  const verbOf = (k: MemberDone['kind']) =>
    k === 'preparation'
      ? fr ? 'Voir ou modifier' : 'View or edit'
      : k === 'deliverable'
        ? t('docs.view')
        : k === 'application'
          ? fr ? 'Relire' : 'Read'
          : fr ? 'Voir' : 'View';
  const doneIcon: Record<MemberDone['kind'], string> = {
    application: 'form', selection: 'check', committee: 'gavel', deliverable: 'file', one_to_one: 'users', preparation: 'edit', kpi: 'board',
  };

  const active = programs.filter((p) => p.mine.length > 0);

  const Row = ({ line }: { line: NextLine }) => (
    <div className="mh-row">
      {line.task && (
        <input type="checkbox" aria-label={line.title} checked={false} onChange={() => onTick(line.task!)} style={{ marginLeft: 12 }} />
      )}
      <button type="button" className="mh-hit" onClick={() => go(line)} disabled={!line.href && !line.editionId}>
        <span className={`mh-when ${line.tone}`}>
          <b>{line.top}</b>
          {line.sub && <small>{line.sub}</small>}
        </span>
        <span className="mh-what">
          <strong>{line.title}</strong>
          {line.detail && <small>{line.detail}</small>}
        </span>
        {line.role && <span className="badge info">{t(`role.${line.role}` as 'role.mentor')}</span>}
        {line.cta && <span className="mh-cta">{line.cta}</span>}
        {(line.href || line.editionId) && <Icon name="chevronRight" size={15} />}
      </button>
      {line.task && line.task.items.length > 0 && (
        <div className="stack" style={{ gap: 2, padding: '0 14px 10px 44px', width: '100%' }}>
          {line.task.detail && <span className="faint" style={{ fontSize: 12.5 }}>{line.task.detail}</span>}
          {line.task.items.map((item) => (
            <label key={item.id} className="check" style={{ fontSize: 13 }}>
              <input type="checkbox" checked={item.done} onChange={() => onTickItem(line.task!, item)} />
              <span style={{ textDecoration: item.done ? 'line-through' : undefined }}>{item.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="stack" style={{ gap: 26 }}>
      {firstName && (
        <header className="stack" style={{ gap: 4 }}>
          <span className="faint" style={{ fontSize: 13 }}>{longDate(now)}</span>
          <h1 style={{ margin: 0, fontSize: 28 }}>{fr ? `Bonjour ${firstName}` : `Hello ${firstName}`}</h1>
          {home && (
            <span className="muted" style={{ fontSize: 14.5 }}>
              {toDo
                ? fr ? `${toDo} chose${toDo > 1 ? 's' : ''} à faire.` : `${toDo} thing${toDo > 1 ? 's' : ''} to do.`
                : fr ? 'Rien à faire : vous êtes à jour.' : 'Nothing to do: you are up to date.'}
              {featured?.tone === 'today' ? (fr ? ' Un rendez-vous aujourd’hui.' : ' A meeting today.') : ''}
            </span>
          )}
        </header>
      )}

      {/* ---- La page d'un programme : à faire d'un côté, le calendrier de l'autre ---- */}
      {split && (
        <>
          <section className="stack" style={{ gap: 10 }} aria-labelledby="mh-cal">
            <div className="mh-head">
              <h2 id="mh-cal">{t('home.upcoming')}</h2>
              {calLines.length > 0 && <span className="faint num">{calLines.length}</span>}
            </div>
            {home && !calLines.length && <p className="faint" style={{ margin: 0, fontSize: 12.5 }}>{t('home.noUpcoming')}</p>}
            {calLines.length > 0 && (
              <div className="card mh-list">
                {calLines.map((line) => <Row key={line.id} line={line} />)}
              </div>
            )}
          </section>
          <section className="stack" style={{ gap: 10 }} aria-labelledby="mh-todo">
            <div className="mh-head">
              <h2 id="mh-todo">{t('home.todo')}</h2>
              {todoLines.length > 0 && <span className="faint num">{todoLines.length}</span>}
            </div>
            {error ? (
              <div className="callout warn">
                <Icon name="alert" size={15} /> {t('home.error')}
              </div>
            ) : !home ? (
              <p className="faint" style={{ margin: 0, fontSize: 12.5 }}>{t('home.loading')}</p>
            ) : todoLines.length ? (
              <div className="card mh-list">
                {todoLines.map((line) => <Row key={line.id} line={line} />)}
              </div>
            ) : (
              <div className="card card-pad row" style={{ gap: 12 }}>
                <span className="mh-ok"><Icon name="check" size={16} /></span>
                <span className="stack" style={{ gap: 2 }}>
                  <strong style={{ fontSize: 14 }}>{t('home.nothing')}</strong>
                  <span className="faint" style={{ fontSize: 12.5 }}>{t('home.nothingMore')}</span>
                </span>
              </div>
            )}
          </section>
        </>
      )}

      {!split && (
      <>
      {/* ---- À venir : ce qu'il y a à faire et ce qui est prévu, dans l'ordre ---- */}
      <section className="stack" style={{ gap: 10 }} aria-labelledby="mh-next">
        <div className="mh-head">
          <h2 id="mh-next">{t('home.upcoming')}</h2>
          {lines.length > 0 && <span className="faint num">{lines.length}</span>}
        </div>
        {error ? (
          <div className="callout warn">
            <Icon name="alert" size={15} /> {t('home.error')}
          </div>
        ) : !home ? (
          <p className="faint" style={{ margin: 0, fontSize: 12.5 }}>{t('home.loading')}</p>
        ) : (
          <>
            {featured && (
              <button type="button" className="mh-feature" onClick={() => go(featured)} disabled={!featured.href}>
                <span className="mh-feature-date">
                  <b className={featured.tone === 'today' ? 'today' : ''}>{featured.top}</b>
                  <span className="num">{featured.sub || '—'}</span>
                </span>
                <span className="mh-what">
                  <strong style={{ fontSize: 17 }}>{featured.title}</strong>
                  {featured.detail && <small>{featured.detail}</small>}
                </span>
                {featured.href && (
                  <span className="btn primary">
                    {fr ? 'Ouvrir' : 'Open'} <Icon name="chevronRight" size={14} />
                  </span>
                )}
              </button>
            )}
            {rest.length > 0 ? (
              <div className="card mh-list">
                {rest.map((line) => <Row key={line.id} line={line} />)}
              </div>
            ) : (
              !featured && (
                <div className="card card-pad row" style={{ gap: 12 }}>
                  <span className="mh-ok"><Icon name="check" size={16} /></span>
                  <span className="stack" style={{ gap: 2 }}>
                    <strong style={{ fontSize: 14 }}>{t('home.nothing')}</strong>
                    <span className="faint" style={{ fontSize: 12.5 }}>{t('home.nothingMore')}</span>
                  </span>
                </div>
              )
            )}
          </>
        )}
      </section>

      </>
      )}

      {/* ---- Réalisé : ce qui est fait, à relire ou à reprendre ---- */}
      {withDone && done.length > 0 && (
        <section className="stack" style={{ gap: 10 }} aria-labelledby="mh-done">
          <div className="mh-head">
            <h2 id="mh-done">{fr ? 'Réalisé' : 'Done'}</h2>
            <span className="faint">{fr ? 'récemment' : 'lately'}</span>
            <span style={{ flex: 1 }} />
            {done.length > 5 && (
              <button type="button" className="linkish" onClick={() => setAllDone((v) => !v)}>
                {allDone ? (fr ? 'Voir moins' : 'Show less') : `${fr ? 'Voir tout' : 'See all'} (${done.length})`}
              </button>
            )}
          </div>
          <div className="card mh-list">
            {shownDone.map((d) => (
              <div className="mh-row" key={d.id}>
                <button type="button" className="mh-hit" onClick={() => onGo(d.href)}>
                  <span className={`mh-dot ${d.kind}`}><Icon name={doneIcon[d.kind]} size={13} /></span>
                  <span className="mh-what">
                    <strong>{d.label}</strong>
                    <small>{[longDate(d.at.slice(0, 10)), d.programName].filter(Boolean).join(' · ')}</small>
                  </span>
                  <span className="mh-cta">{verbOf(d.kind)}</span>
                  <Icon name="chevronRight" size={15} />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ---- Ses programmes, chacun avec ce qui l'attend ---- */}
      {withProgrammes && (
        <section className="stack" style={{ gap: 10 }} aria-labelledby="mh-prog">
          <div className="mh-head">
            <h2 id="mh-prog">{fr ? 'Programmes' : 'Programmes'}</h2>
            {active.length > 0 && <span className="faint num">{active.length}</span>}
          </div>
          {active.length === 0 && <p className="faint" style={{ margin: 0, fontSize: 12.5 }}>{t('prog.noneMore')}</p>}
          <div className="mh-progs">
            {active.map((p) => {
              const steps = home?.steps?.[p.editionId] ?? [];
              const next = lines.filter((x) => x.editionId === p.editionId).slice(0, 3);
              const status = p.mine[0]?.status;
              return (
                <article key={p.editionId} className="card mh-prog">
                  <button type="button" className="mh-hit stack" style={{ alignItems: 'stretch', gap: 12 }} onClick={() => onOpen(p.editionId)}>
                    <span className="row" style={{ gap: 12 }}>
                      <span className="mh-mark" style={{ background: p.colour ?? 'var(--blue)' }} aria-hidden="true">
                        {p.programName.slice(0, 1).toUpperCase()}
                      </span>
                      <span className="mh-what">
                        <strong>{p.programName}</strong>
                        <small>{[p.editionName, p.mine[0]?.phase].filter(Boolean).join(' · ')}</small>
                      </span>
                      {status && <span className={status === 'Selected' ? 'badge ok' : 'badge'}>{status}</span>}
                      <Icon name="chevronRight" size={15} />
                    </span>
                    {steps.length > 0 && (
                      <span className="mh-steps" title={steps.map((s) => s.name).join(' → ')}>
                        {steps.map((s, i) => (
                          <span key={i} className={s.state} style={s.state !== 'upcoming' ? { background: p.colour ?? 'var(--blue)' } : undefined} />
                        ))}
                      </span>
                    )}
                  </button>
                  {next.map((line) => (
                    <button type="button" key={line.id} className="mh-mini" onClick={() => go(line)}>
                      <span className={`mh-when-mini ${line.tone}`}>{line.top}</span>
                      <span style={{ flex: 1, minWidth: 0 }}>{line.title}</span>
                      <Icon name="chevronRight" size={13} />
                    </button>
                  ))}
                  {!next.length && (
                    <span className="faint" style={{ fontSize: 12.5, padding: '6px 14px 12px' }}>
                      {fr ? 'Rien de prévu pour l’instant.' : 'Nothing planned for now.'}
                    </span>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

const isoToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const plusDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
