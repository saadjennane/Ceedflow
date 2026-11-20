/**
 * L'accueil de l'équipe : ma journée, l'équipe en ce moment, les programmes en
 * cours — dans le centre où l'on travaille. Tout mène là où l'on agit.
 */
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { formatDate } from '../lib/format';
import { useAsync } from '../lib/useAsync';
import { Icon } from '../ui/Icon';
import { colourOf, initialsOf } from '../ui/Showcase';
import '../ui/builder.css';
import '../ui/home.css';

interface HomeData {
  firstName: string;
  centerName: string;
  today: string;
  todo: { kind: string; title: string; about: string; when: string; late: boolean; href: string }[];
  todoTotal: number;
  agenda: { date: string; time: string | null; kind: string; title: string; sub: string; colour: string; href: string }[];
  sent: { id: string; kind: string; title: string; body: string; href: string; createdAt: string; program: string | null; colour: string | null }[];
  team: { recordId: string; name: string; state: 'event' | 'task' | 'idle' | 'away'; now: string; href: string }[];
  programs: { editionId: string; name: string; edition: string; colour: string; candidates: number; phase: string; funnel: { name: string; count: number }[]; blockers: string[] }[];
  figures: { organisations: number; individuals: number; startups: number; joinedThisWeek: number };
}

const TODO_ICON: Record<string, string> = {
  task_late: 'alert', task_soon: 'check', unblock: 'alert', validate: 'check', report: 'edit',
  jury: 'gavel', kb_review: 'book', kb_validate: 'book', offers: 'send',
};
const STATE: Record<HomeData['team'][number]['state'], { label: string; tone: string }> = {
  event: { label: 'Event', tone: 'event' },
  task: { label: 'Task', tone: 'task' },
  idle: { label: 'Free', tone: 'idle' },
  away: { label: 'Away', tone: 'away' },
};

const longToday = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`));
const dayHead = (iso: string, today: string) => {
  if (iso === today) return 'Today';
  return new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`));
};
const ago = (iso: string) => {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 60) return `${Math.max(1, minutes)} min ago`;
  if (minutes < 24 * 60) return `${Math.round(minutes / 60)} h ago`;
  return formatDate(iso.slice(0, 10));
};

export function HomePage() {
  const home = useAsync(() => api.get<HomeData>('/api/home'), 'home');
  if (home.error) return <div className="page"><div className="empty">{home.error}</div></div>;
  if (!home.data) {
    return (
      <div className="page">
        <div className="dir-loading" aria-busy="true"><span /><span /><span /><span /></div>
      </div>
    );
  }
  const h = home.data;
  const late = h.todo.filter((t) => t.late).length;
  const byDay = [...new Set(h.agenda.map((e) => e.date))].map((d) => ({ date: d, items: h.agenda.filter((e) => e.date === d) }));

  return (
    <div className="page home">
      <header className="home-head">
        <div className="stack" style={{ gap: 4 }}>
          <span className="home-date">{longToday(h.today)} · {h.centerName}</span>
          <h1>Hello {h.firstName}</h1>
          <span className="home-summary">
            {h.todoTotal ? (
              <>
                <b>{h.todoTotal} thing{h.todoTotal > 1 ? 's' : ''}</b> waiting for you
                {late > 0 && (
                  <>
                    , <b className="late">{late} late</b>
                  </>
                )}
                .
              </>
            ) : (
              'Nothing waiting for you. A good day to move something forward.'
            )}
          </span>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <Link className="btn" to="/tasks">All my tasks</Link>
          <Link className="btn primary" to="/tasks?new=1">
            <Icon name="plus" size={14} /> New task
          </Link>
        </div>
      </header>

      <div className="home-grid">
        <section className="home-card" aria-labelledby="h-todo">
          <div className="home-card-head">
            <h2 id="h-todo">To do</h2>
            {h.todoTotal > h.todo.length && <Link to="/tasks">See all ({h.todoTotal})</Link>}
          </div>
          {h.todo.length ? (
            h.todo.map((t, i) => (
              <Link key={i} to={t.href} className="home-row">
                <span className={t.late ? 'home-icon late' : 'home-icon'}><Icon name={TODO_ICON[t.kind] ?? 'check'} size={14} /></span>
                <span className="home-row-main">
                  <b>{t.title}</b>
                  <span>{t.about}</span>
                </span>
                <span className={t.late ? 'home-when late' : 'home-when'}>{t.when}</span>
              </Link>
            ))
          ) : (
            <p className="home-empty">Nothing waiting for you.</p>
          )}
        </section>

        <section className="home-card" aria-labelledby="h-agenda">
          <div className="home-card-head">
            <h2 id="h-agenda">Agenda · 7 days</h2>
            <span className="faint">{h.agenda.length} event{h.agenda.length === 1 ? '' : 's'}</span>
          </div>
          {byDay.length ? (
            byDay.map((d) => (
              <div key={d.date}>
                <div className="home-day">{dayHead(d.date, h.today)}</div>
                {d.items.map((e, i) => (
                  <Link key={i} to={e.href} className="home-row home-event">
                    <span className="home-time num">{e.time ?? 'All day'}</span>
                    <span className="home-bar" style={{ background: e.colour }} />
                    <span className="home-row-main">
                      <b>{e.title}</b>
                      <span>{e.sub}</span>
                    </span>
                  </Link>
                ))}
              </div>
            ))
          ) : (
            <p className="home-empty">Nothing in the next seven days.</p>
          )}
        </section>
      </div>

      <div className="home-grid">
        <section className="home-card" aria-labelledby="h-sent">
          <div className="home-card-head">
            <h2 id="h-sent">From the startups</h2>
            {h.sent.length > 0 && <span className="badge info">{h.sent.length} new</span>}
          </div>
          {h.sent.length ? (
            h.sent.map((s) => (
              <Link key={s.id} to={s.href || '/notifications'} className="home-row">
                <span className="home-mark" style={{ background: s.colour ?? colourOf(s.title) }}>
                  {initialsOf(s.title.split(/ (?:sent|did|—)/)[0] ?? s.title)}
                </span>
                <span className="home-row-main">
                  <b>{s.title}</b>
                  <span className="home-meta">
                    {s.program && (
                      <span className="home-pill">
                        <i style={{ background: s.colour ?? 'var(--ink-3)' }} />
                        {s.program}
                      </span>
                    )}
                    {s.body && <span>{s.body}</span>}
                  </span>
                </span>
                <span className="home-ago">{ago(s.createdAt)}</span>
              </Link>
            ))
          ) : (
            <p className="home-empty">Nothing new from the startups.</p>
          )}
        </section>

        <section className="home-card" aria-labelledby="h-team">
          <div className="home-card-head">
            <h2 id="h-team">Team right now</h2>
            <span className="faint">{h.team.length} people</span>
          </div>
          {h.team.map((m) => (
            <Link key={m.recordId} to={m.href} className="home-row">
              <span className="home-avatar">
                <span style={{ background: colourOf(m.name) }}>{initialsOf(m.name)}</span>
                <i className={`dot ${STATE[m.state].tone}`} />
              </span>
              <span className="home-row-main">
                <b>{m.name}</b>
                <span>{m.now}</span>
              </span>
              <span className={`home-state ${STATE[m.state].tone}`}>{STATE[m.state].label}</span>
            </Link>
          ))}
        </section>
      </div>

      <section aria-labelledby="h-progs" className="stack" style={{ gap: 10 }}>
        <div className="home-section-head">
          <h2 id="h-progs">Live programmes</h2>
          <Link to="/programs">All programmes</Link>
        </div>
        {h.programs.length ? (
          <div className="home-progs">
            {h.programs.map((p) => (
              <Link key={p.editionId} to={`/editions/${p.editionId}`} className="home-prog">
                <span className="row" style={{ gap: 10 }}>
                  <span className="home-prog-dot" style={{ background: p.colour }} />
                  <b className="home-prog-name">{p.name}</b>
                  <span className="badge ok">Live</span>
                </span>
                <span className="faint" style={{ fontSize: 12.5 }}>
                  {p.edition} · {p.candidates} candidate{p.candidates === 1 ? '' : 's'} · at “{p.phase}”
                </span>
                <span className="home-funnel">
                  {p.funnel.map((f) => (
                    <span key={f.name}>
                      <i style={{ background: f.count ? p.colour : 'var(--wash)' }} />
                      <small>
                        {f.name} <b>{f.count}</b>
                      </small>
                    </span>
                  ))}
                </span>
                {p.blockers.length > 0 && (
                  <span className="row wrap" style={{ gap: 6 }}>
                    {p.blockers.map((b) => (
                      <span key={b} className="badge warn">{b}</span>
                    ))}
                  </span>
                )}
              </Link>
            ))}
          </div>
        ) : (
          <p className="home-empty card">No live edition in this centre.</p>
        )}
      </section>

      <section aria-label="The centre in figures" className="home-figures">
        <span><b>{h.figures.organisations.toLocaleString('fr-FR')}</b> organisations</span>
        <span><b>{h.figures.individuals.toLocaleString('fr-FR')}</b> individuals</span>
        <span><b>{h.figures.startups.toLocaleString('fr-FR')}</b> startups supported</span>
        <span><b className="up">+{h.figures.joinedThisWeek}</b> joined this week</span>
      </section>
    </div>
  );
}
