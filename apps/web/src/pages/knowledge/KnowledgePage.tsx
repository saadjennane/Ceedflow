/**
 * La Knowledge Base : le référentiel interne de CEED.
 *
 * Quatre questions, dans l'ordre où on se les pose : qu'est-ce qui est
 * officiel, qu'est-ce qui attend une relecture, qu'est-ce qui attend le
 * président, et que s'est-il passé.
 */
import { KB_STATUS_LABEL, type KbEvent, type KbListItem, type KbOverview, type KbStatus } from '@ceed/shared';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { Icon } from '../../ui/Icon';
import { Tiles } from '../directory/DirectoryViews';
import { KnowledgeEditor } from './KnowledgeEditor';
import { ACTION_WORD, StatusBadge } from './KnowledgeBits';
import './knowledge.css';
import '../../ui/directory.css';

type Tab = 'knowledge' | 'review' | 'validate' | 'history';
const TABS: { key: Tab; label: string }[] = [
  { key: 'knowledge', label: 'Knowledge' },
  { key: 'review', label: 'To Review' },
  { key: 'validate', label: 'To Validate' },
  { key: 'history', label: 'History' },
];

const REVIEW_STATES: readonly KbStatus[] = ['analysis_pending', 'analysis_failed', 'to_review', 'changes_requested'];

export function KnowledgePage() {
  const [params, setParams] = useSearchParams();
  const tab = (TABS.some((t) => t.key === params.get('tab')) ? params.get('tab') : 'knowledge') as Tab;
  const setTab = (t: Tab) => setParams(t === 'knowledge' ? {} : { tab: t });
  const data = useAsync(() => api.get<KbOverview>('/api/kb'), 'kb');
  const history = useAsync(() => (tab === 'history' ? api.get<KbEvent[]>('/api/kb/history') : Promise.resolve(null)), `kb-history:${tab}`);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [author, setAuthor] = useState('');
  const [status, setStatus] = useState('');
  const [since, setSince] = useState('');
  const found = useAsync(
    () => (query.trim().length > 1 ? api.get<{ entryIds: string[] }>(`/api/kb/search?q=${encodeURIComponent(query.trim())}`) : Promise.resolve(null)),
    `kb-search:${query.trim()}`,
  );
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();

  const items = data.data?.items ?? [];
  const authors = useMemo(() => {
    const m = new Map<string, string>();
    for (const i of items) for (const p of [i.official?.author, i.open?.author]) if (p) m.set(p.id, p.name);
    return [...m].sort((a, b) => a[1].localeCompare(b[1], 'fr'));
  }, [items]);

  const inTab = (i: KbListItem) =>
    tab === 'knowledge' ? Boolean(i.official) : tab === 'review' ? Boolean(i.open && REVIEW_STATES.includes(i.open.status)) : tab === 'validate' ? i.open?.status === 'to_validate' : true;
  const hits = found.data ? new Set(found.data.entryIds) : null;
  const shown = items.filter(
    (i) =>
      inTab(i) &&
      (!hits || hits.has(i.entryId)) &&
      (!category || i.category?.id === category) &&
      (!author || i.official?.author?.id === author || i.open?.author?.id === author) &&
      (!status || i.open?.status === status || (status === 'published' && i.official)) &&
      (!since || (i.open?.updatedAt ?? i.official?.publishedAt ?? '').slice(0, 10) >= since),
  );

  if (data.error) return <div className="page"><div className="callout warn">{data.error}</div></div>;
  const counts = data.data?.counts;
  const me = data.data?.me;

  return (
    <>
      <header className="topbar">
        <div>
          <h1>Knowledge Base</h1>
          <span className="faint" style={{ fontSize: 12.5 }}>Référentiel interne de connaissances CEED</span>
        </div>
        <div className="spacer" />
        {me?.canWrite && (
          <button className="btn primary" onClick={() => setCreating(true)}>
            <Icon name="plus" size={14} /> New Knowledge
          </button>
        )}
      </header>

      <div className="page stack" style={{ gap: 14 }}>
        <div className="row wrap" style={{ gap: 8 }}>
          <input
            className="input"
            style={{ flex: '1 1 260px' }}
            placeholder="Search titles, contents and categories"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search the Knowledge Base"
          />
        </div>

        {counts && (
          <Tiles
            on={tab === 'knowledge' ? 'published' : tab === 'review' ? 'toReview' : tab === 'validate' ? 'toValidate' : ''}
            onPick={(k) => setTab(k === 'published' ? 'knowledge' : k === 'toReview' ? 'review' : k === 'toValidate' ? 'validate' : 'review')}
            tiles={[
              { key: 'published', label: 'Published', value: String(counts.published), note: 'official references' },
              { key: 'toReview', label: 'To Review', value: String(counts.toReview), note: 'waiting for a colleague' },
              { key: 'toValidate', label: 'To Validate', value: String(counts.toValidate), note: me?.presidentName ? `waiting for ${me.presidentName}` : 'no president designated yet' },
              { key: 'conflicts', label: 'Conflicts', value: String(counts.conflicts), note: 'blocking a publication' },
            ]}
          />
        )}

        <nav className="tabbar" role="tablist" aria-label="Knowledge Base">
          {TABS.map((t) => (
            <button key={t.key} role="tab" aria-selected={tab === t.key} className={tab === t.key ? 'tab on' : 'tab'} onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
        </nav>

        {tab !== 'history' && (
          <div className="row wrap" style={{ gap: 8 }}>
            <select className="select" style={{ width: 'auto' }} value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
              <option value="">All categories</option>
              {(data.data?.categories ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {tab === 'review' && (
              <select className="select" style={{ width: 'auto' }} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
                <option value="">Every status</option>
                {REVIEW_STATES.map((s) => <option key={s} value={s}>{KB_STATUS_LABEL[s]}</option>)}
              </select>
            )}
            <select className="select" style={{ width: 'auto' }} value={author} onChange={(e) => setAuthor(e.target.value)} aria-label="Author">
              <option value="">Every author</option>
              {authors.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
            <label className="row faint" style={{ gap: 6, fontSize: 12.5 }}>
              Since <input type="date" className="input" style={{ width: 'auto' }} value={since} onChange={(e) => setSince(e.target.value)} />
            </label>
          </div>
        )}

        {tab === 'history' ? (
          <History events={history.data ?? null} loading={history.loading} />
        ) : !data.data ? (
          <div className="faint">Loading…</div>
        ) : !shown.length ? (
          <div className="empty">
            {tab === 'knowledge' ? 'Nothing published yet.' : tab === 'review' ? 'Nothing waiting for a review.' : 'Nothing waiting for validation.'}
          </div>
        ) : (
          <div className="rows">
            {shown.map((i) => (
              <Link key={i.entryId} to={`/knowledge/${i.entryId}`} className="rowcard card-pad kb-row" style={{ textDecoration: 'none', color: 'inherit' }}>
                <Icon name={i.format === 'checklist' ? 'check' : 'file'} size={16} />
                <div className="kb-row-main">
                  <strong>{tab === 'knowledge' ? i.official?.title : i.open?.title ?? i.latest.title}</strong>
                  <p className="faint">{i.excerpt}</p>
                  <div className="row wrap faint" style={{ gap: 8, fontSize: 12, marginTop: 4 }}>
                    {i.format === 'checklist' && <span className="badge info">Checklist</span>}
                    {i.category && <span>{i.category.name}</span>}
                    {tab === 'knowledge' && i.official && (
                      <span>v{i.official.number} · published {formatDate(i.official.publishedAt)}</span>
                    )}
                    {tab !== 'knowledge' && i.open && (
                      <span>v{i.open.number} · by {i.open.author?.name ?? '—'} · {formatDate(i.open.createdAt)}</span>
                    )}
                  </div>
                </div>
                <div className="stack" style={{ gap: 4, alignItems: 'flex-end' }}>
                  {tab === 'knowledge' ? <StatusBadge status="published" /> : i.open && <StatusBadge status={i.open.status} />}
                  {tab === 'knowledge' && i.open && <span className="badge info">v{i.open.number} on its way</span>}
                  {i.blocking > 0 && <span className="badge stop">{i.blocking} to decide</span>}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {creating && data.data && (
        <KnowledgeEditor
          mode={{ kind: 'create' }}
          categories={data.data.categories}
          onClose={() => setCreating(false)}
          onSaved={({ entryId }) => {
            setCreating(false);
            if (entryId) navigate(`/knowledge/${entryId}`);
          }}
        />
      )}
    </>
  );
}

function History({ events, loading }: { events: KbEvent[] | null; loading: boolean }) {
  if (loading || !events) return <div className="faint">Loading…</div>;
  if (!events.length) return <div className="empty">Nothing has happened yet.</div>;
  return (
    <div className="card card-pad">
      <ul className="kb-timeline">
        {events.map((e) => (
          <li key={e.id}>
            <time>{formatDate(e.createdAt)}</time>
            <span style={{ flex: 1, minWidth: 0 }}>
              <Link to={`/knowledge/${e.entryId}`}>{e.entryTitle || 'Untitled'}</Link>
              {e.versionNumber ? <span className="faint"> · v{e.versionNumber}</span> : null} — {ACTION_WORD[e.action] ?? e.action}
              {e.actor && <span className="faint"> by {e.actor.name}</span>}
              {e.note && <div className="faint" style={{ fontSize: 12, marginTop: 2, overflowWrap: 'anywhere' }}>{e.note}</div>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
