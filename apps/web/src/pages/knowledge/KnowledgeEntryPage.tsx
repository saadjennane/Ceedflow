/**
 * Une connaissance : ce qu'elle dit, ce que l'IA y a vu, qui l'a relue et
 * validée, et ce qui attend — dit en haut, avec qui doit agir ensuite.
 */
import {
  KB_FINDING_LABEL,
  KB_OPEN,
  kbFindingBlocks,
  kbText,
  type KbEntryDetail,
  type KbFinding,
  type KbFindingKind,
  type KbVersion,
} from '@ceed/shared';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { Icon } from '../../ui/Icon';
import { Markdown } from '../../ui/Markdown';
import { Modal, useToast } from '../../ui/Overlays';
import { KnowledgeEditor } from './KnowledgeEditor';
import { ACTION_WORD, LineDiff, StatusBadge } from './KnowledgeBits';
import './knowledge.css';

type Ask =
  | { kind: 'review-changes' }
  | { kind: 'validate'; action: 'approve' | 'changes' | 'reject' }
  | { kind: 'decide'; finding: KbFinding; state: 'not_a_conflict' | 'resolved' | 'acknowledged' }
  | { kind: 'flag' }
  | null;

export function KnowledgeEntryPage() {
  const { entryId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const data = useAsync(() => api.get<KbEntryDetail>(`/api/kb/entries/${entryId}`), `kb-entry:${entryId}`);
  const cats = useAsync(() => api.get<KbEntryDetail['category'][]>('/api/kb/categories'), 'kb-cats');
  const [editing, setEditing] = useState<'edit' | 'update' | null>(null);
  const [ask, setAsk] = useState<Ask>(null);
  const [comparing, setComparing] = useState<{ before: KbVersion; after: KbVersion } | null>(null);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const navigate = useNavigate();

  const d = data.data;
  const open = d?.versions.find((v) => KB_OPEN.includes(v.status)) ?? null;
  const official = d?.versions.find((v) => v.id === d.officialVersionId) ?? null;
  const shownId = params.get('v') ?? open?.id ?? official?.id ?? d?.versions[0]?.id ?? '';
  const v = d?.versions.find((x) => x.id === shownId) ?? null;
  const analysis = v ? d?.analyses[v.id] ?? null : null;
  const findings = v ? d?.findings[v.id] ?? [] : [];
  const comments = v ? d?.comments[v.id] ?? [] : [];
  const blocking = findings.filter(kbFindingBlocks);
  const me = d?.me;
  const isAuthor = Boolean(v && me && v.author?.id === me.recordId);

  /* Tant que l'analyse tourne, la page se remet à jour d'elle-même. */
  const pending = v?.status === 'analysis_pending';
  useEffect(() => {
    if (!pending) return;
    const t = setInterval(() => data.reload(), 3000);
    return () => clearInterval(t);
  }, [pending, data]);

  const act = async (fn: () => Promise<unknown>, said: string) => {
    setBusy(true);
    try {
      await fn();
      toast(said);
      setAsk(null);
      data.reload();
    } catch (err) {
      toast((err as Error).message, true);
    } finally {
      setBusy(false);
    }
  };

  if (data.error) return <div className="page"><div className="callout warn">{data.error}</div></div>;
  if (!d || !v || !me) return <div className="page faint">Loading…</div>;

  /* Ce qui attend, et qui doit agir : la première chose qu'on lit. */
  const next = (() => {
    switch (v.status) {
      case 'analysis_pending':
        return { tone: 'callout', text: 'The AI is analysing this version. Nothing can move until it has finished.' };
      case 'analysis_failed':
        return { tone: 'callout warn', text: 'The AI analysis failed. A failed analysis is never “no conflict”: run it again before the review.' };
      case 'to_review':
        return { tone: 'callout', text: isAuthor ? 'Waiting for a colleague to review it — somebody other than you.' : 'Waiting for a review — yours, if you can.' };
      case 'changes_requested':
        return { tone: 'callout warn', text: isAuthor ? 'Changes were asked of you. Correct it, or send it back to review as it is.' : `Back with ${v.author?.name ?? 'its author'} for corrections.` };
      case 'to_validate':
        return {
          tone: blocking.length ? 'callout warn' : 'callout',
          text: blocking.length
            ? `${blocking.length} conflict or duplicate still need${blocking.length > 1 ? '' : 's'} a decision before the president can publish.`
            : me.isPresident
              ? 'Reviewed — waiting for your decision.'
              : `Reviewed — waiting for ${me.presidentName || 'the president (not designated yet)'}.`,
        };
      case 'published':
        return { tone: 'callout ok', text: open ? `Official reference. Version ${open.number} is on its way and replaces it once published.` : 'Official reference.' };
      case 'archived':
        return { tone: 'callout', text: 'An earlier version, kept for the record. It is no longer the reference.' };
      case 'rejected':
        return { tone: 'callout warn', text: 'Rejected by the president.' };
      default:
        return null;
    }
  })();

  return (
    <>
      <header className="topbar">
        <Link className="btn ghost sm" to="/knowledge">
          <Icon name="chevronLeft" size={13} /> Knowledge Base
        </Link>
        <div className="spacer" />
        {open && v.id === open.id && me.canWrite && (isAuthor || me.isAdmin) && (
          <button className="btn" onClick={() => setEditing('edit')}>
            <Icon name="edit" size={13} /> Edit
          </button>
        )}
        {/* Une checklist publiée se lance : ses points arrivent dans le backlog, à assigner et lier. */}
        {official?.format === 'checklist' && me.canWrite && (
          <button
            className="btn primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const made = await api.post<{ added: number }>(`/api/meeting-assistant/backlog/checklist/${entryId}`, {});
                toast(`${made.added} task${made.added === 1 ? '' : 's'} added to the backlog — give each an owner and a link there.`);
                navigate('/tasks?tab=backlog');
              } catch (err) {
                toast((err as Error).message, true);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Icon name="check" size={13} /> Add to backlog
          </button>
        )}
        {!open && me.canWrite && (
          <button className={official?.format === 'checklist' ? 'btn' : 'btn primary'} onClick={() => setEditing('update')}>
            <Icon name="plus" size={13} /> Propose an update
          </button>
        )}
      </header>

      <div className="page stack" style={{ gap: 14, maxWidth: 920 }}>
        <section className="stack" style={{ gap: 6 }}>
          <div className="row wrap" style={{ gap: 8 }}>
            <StatusBadge status={v.status} />
            <span className="badge">v{v.number}</span>
            {v.format === 'checklist' && <span className="badge info">Checklist</span>}
            {d.category && <span className="badge">{d.category.name}</span>}
          </div>
          <h2 style={{ margin: 0, fontSize: 22 }}>{v.title}</h2>
          <span className="faint" style={{ fontSize: 12.5 }}>
            By {v.author?.name ?? '—'} · created {formatDate(v.createdAt)} · last changed {formatDate(v.updatedAt)}
            {v.publishedAt && ` · published ${formatDate(v.publishedAt)}`}
          </span>
          {v.changeSummary && <span style={{ fontSize: 13 }}><strong>What changes:</strong> {v.changeSummary}</span>}
        </section>

        {official && open && v.id === open.id && (
          <div className="callout">
            <Icon name="layers" size={15} />
            <div style={{ flex: 1 }}>Version {official.number} stays the official reference until this one is published.</div>
            <button className="btn sm" onClick={() => setParams({ v: official.id })}>Read v{official.number}</button>
          </div>
        )}
        {next && (
          <div className={next.tone}>
            <Icon name={next.tone.includes('warn') ? 'alert' : 'info'} size={15} /> <div>{next.text}</div>
          </div>
        )}

        <section className="card card-pad stack" style={{ gap: 12 }}>
          {v.body.trim() && <Markdown text={v.body} />}
          {v.format === 'checklist' && (
            <ol className="kb-checklist">
              {v.items.map((item, i) => (
                <li key={i}>
                  <Icon name="square" size={14} />
                  <div>
                    <strong>{item.title}</strong>
                    {item.note && <div className="faint" style={{ fontSize: 13 }}>{item.note}</div>}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>

        {/* ---- L'analyse ---- */}
        <section className="card card-pad stack" style={{ gap: 10 }}>
          <div className="row wrap" style={{ gap: 8 }}>
            <h3 className="section-title" style={{ margin: 0, flex: 1 }}>AI Analysis</h3>
            {analysis?.status === 'done' && <span className={findings.length ? 'badge warn' : 'badge ok'}>{findings.length ? `${findings.length} to look at` : 'No Conflict'}</span>}
            {(v.status === 'analysis_failed' || (v.status === 'analysis_pending' && analysis?.status !== 'pending')) && me.canWrite && (
              <button className="btn sm" disabled={busy} onClick={() => act(() => api.post(`/api/kb/versions/${v.id}/analyse`), 'Analysis started.')}>
                <Icon name="refresh" size={12} /> Run the analysis again
              </button>
            )}
            {KB_OPEN.includes(v.status) && me.canWrite && (
              <button className="btn ghost sm" onClick={() => setAsk({ kind: 'flag' })}>
                <Icon name="alert" size={12} /> Flag a conflict
              </button>
            )}
          </div>
          {!analysis ? (
            <span className="faint">Analysis Pending.</span>
          ) : analysis.status === 'pending' ? (
            <span className="faint">Analysing…</span>
          ) : analysis.status === 'failed' ? (
            <div className="callout warn"><Icon name="alert" size={15} /> <div>Analysis Failed — {analysis.error}</div></div>
          ) : (
            <>
              {analysis.summary && <p style={{ margin: 0, fontSize: 13.5 }}>{analysis.summary}</p>}
              <span className="faint" style={{ fontSize: 12 }}>
                {analysis.provider === 'openai' ? 'OpenAI' : analysis.provider === 'anthropic' ? 'Anthropic' : analysis.provider} · {analysis.model} · {formatDate(analysis.finishedAt)}. The AI recommends; it never changes anything.
              </span>
            </>
          )}
          {findings.map((f) => (
            <FindingCard
              key={f.id}
              f={f}
              canDecide={me.canWrite && KB_OPEN.includes(v.status)}
              onEdit={open?.id === v.id && (isAuthor || me.isAdmin) ? () => setEditing('edit') : undefined}
              onDecide={(state) => setAsk({ kind: 'decide', finding: f, state })}
            />
          ))}
        </section>

        {/* ---- Relecture et validation ---- */}
        <section className="card card-pad stack" style={{ gap: 10 }}>
          <h3 className="section-title" style={{ margin: 0 }}>Review &amp; Validation</h3>
          <div className="row wrap" style={{ gap: 24, fontSize: 13 }}>
            <div>
              <div className="eyebrow">Review</div>
              {v.reviewedBy ? <>{v.reviewedBy.name} · {formatDate(v.reviewedAt)}{v.reviewComment && <div className="faint">“{v.reviewComment}”</div>}</> : <span className="faint">Not reviewed yet</span>}
            </div>
            <div>
              <div className="eyebrow">Validation</div>
              {v.validatedBy ? (
                <>
                  {v.validatedBy.name} · {formatDate(v.validatedAt)} · {v.decision === 'approved' ? 'Approved' : v.decision === 'rejected' ? 'Rejected' : 'Changes requested'}
                  {v.decisionNote && <div className="faint">“{v.decisionNote}”</div>}
                </>
              ) : (
                <span className="faint">{me.presidentName ? `By ${me.presidentName}` : 'No president designated — Settings → Knowledge Base'}</span>
              )}
            </div>
          </div>
          <div className="row wrap" style={{ gap: 8 }}>
            {v.status === 'to_review' && me.canWrite && !isAuthor && (
              <>
                <button className="btn" disabled={busy} onClick={() => setAsk({ kind: 'review-changes' })}>Request Changes</button>
                <button
                  className="btn primary"
                  disabled={busy}
                  onClick={() => act(() => api.post(`/api/kb/versions/${v.id}/review`, { action: 'reviewed', contentHash: v.contentHash }), 'Reviewed — sent to the president.')}
                >
                  <Icon name="check" size={13} /> Mark as Reviewed
                </button>
              </>
            )}
            {v.status === 'to_review' && isAuthor && <span className="faint" style={{ fontSize: 12.5 }}>You wrote it: a colleague reviews it.</span>}
            {v.status === 'changes_requested' && (isAuthor || me.isAdmin) && (
              <button className="btn" disabled={busy} onClick={() => act(() => api.post(`/api/kb/versions/${v.id}/resubmit`), 'Sent back to review.')}>
                Send back to review as it is
              </button>
            )}
            {v.status === 'to_validate' && me.isPresident && (
              <>
                <button className="btn" disabled={busy} onClick={() => setAsk({ kind: 'validate', action: 'changes' })}>Request Changes</button>
                <button className="btn" disabled={busy} onClick={() => setAsk({ kind: 'validate', action: 'reject' })}>Reject</button>
                <button
                  className="btn primary"
                  disabled={busy || blocking.length > 0}
                  title={blocking.length ? 'Decide every conflict and duplicate first' : undefined}
                  onClick={() => setAsk({ kind: 'validate', action: 'approve' })}
                >
                  <Icon name="check" size={13} /> Approve &amp; Publish
                </button>
              </>
            )}
          </div>
        </section>

        {/* ---- Commentaires ---- */}
        <section className="card card-pad stack" style={{ gap: 8 }}>
          <h3 className="section-title" style={{ margin: 0 }}>Comments</h3>
          {!comments.length && <span className="faint" style={{ fontSize: 13 }}>No comment on this version.</span>}
          {comments.map((c) => (
            <div key={c.id} style={{ fontSize: 13 }}>
              <strong>{c.author?.name ?? '—'}</strong> <span className="faint">· {formatDate(c.createdAt)}</span>
              <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{c.body}</div>
            </div>
          ))}
          {me.canWrite && (
            <div className="row" style={{ gap: 8, alignItems: 'flex-end' }}>
              <textarea className="textarea" rows={2} style={{ flex: 1 }} value={comment} placeholder="A remark, a correction to suggest…" onChange={(e) => setComment(e.target.value)} />
              <button
                className="btn"
                disabled={busy || !comment.trim()}
                onClick={() => act(async () => { await api.post(`/api/kb/versions/${v.id}/comments`, { body: comment }); setComment(''); }, 'Comment added.')}
              >
                Comment
              </button>
            </div>
          )}
        </section>

        {/* ---- Versions ---- */}
        <section className="card card-pad stack" style={{ gap: 8 }}>
          <h3 className="section-title" style={{ margin: 0 }}>Versions</h3>
          {d.versions.map((x) => {
            const before = d.versions.find((y) => y.number === x.number - 1);
            return (
              <div key={x.id} className="row wrap" style={{ gap: 8, fontSize: 13 }}>
                <strong>v{x.number}</strong>
                <StatusBadge status={x.status} />
                {x.id === d.officialVersionId && <span className="badge ok">Official</span>}
                <span className="faint" style={{ flex: 1, minWidth: 160 }}>
                  {x.author?.name ?? '—'} · {formatDate(x.createdAt)}{x.changeSummary && ` · ${x.changeSummary}`}
                </span>
                {x.id !== v.id && <button className="btn ghost sm" onClick={() => setParams({ v: x.id })}>Read</button>}
                {before && <button className="btn ghost sm" onClick={() => setComparing({ before, after: x })}>Compare with v{before.number}</button>}
              </div>
            );
          })}
        </section>

        {/* ---- Activité ---- */}
        <section className="card card-pad stack" style={{ gap: 8 }}>
          <h3 className="section-title" style={{ margin: 0 }}>Activity</h3>
          <ul className="kb-timeline">
            {[...d.activity].reverse().map((e) => (
              <li key={e.id}>
                <time>{formatDate(e.createdAt)}</time>
                <span style={{ flex: 1, minWidth: 0 }}>
                  {e.versionNumber ? <span className="faint">v{e.versionNumber} · </span> : null}
                  {ACTION_WORD[e.action] ?? e.action}
                  {e.actor && <span className="faint"> — {e.actor.name}</span>}
                  {e.note && <div className="faint" style={{ fontSize: 12, overflowWrap: 'anywhere' }}>{e.note}</div>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {editing && (
        <KnowledgeEditor
          mode={editing === 'update' ? { kind: 'update', entryId } : { kind: 'edit', versionId: v.id, revision: v.revision, reviewed: Boolean(v.reviewedBy) }}
          categories={(cats.data ?? []).filter(Boolean) as NonNullable<KbEntryDetail['category']>[]}
          initial={
            editing === 'update'
              ? { title: (official ?? v).title, body: (official ?? v).body, format: (official ?? v).format, items: (official ?? v).items }
              : { title: v.title, body: v.body, format: v.format, items: v.items, categoryId: d.category?.id, changeSummary: v.changeSummary }
          }
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setParams({});
            data.reload();
          }}
        />
      )}

      {ask && (
        <AskModal
          ask={ask}
          busy={busy}
          onClose={() => setAsk(null)}
          onSubmit={(text, extra) => {
            if (ask.kind === 'review-changes') {
              return act(() => api.post(`/api/kb/versions/${v.id}/review`, { action: 'changes', comment: text, contentHash: v.contentHash }), 'Sent back to its author.');
            }
            if (ask.kind === 'validate') {
              return act(
                () => api.post(`/api/kb/versions/${v.id}/validate`, { action: ask.action, note: text, contentHash: v.contentHash }),
                ask.action === 'approve' ? 'Published — it is now the official reference.' : ask.action === 'reject' ? 'Rejected.' : 'Sent back to its author.',
              );
            }
            if (ask.kind === 'decide') {
              return act(() => api.post(`/api/kb/findings/${ask.finding.id}/decision`, { state: ask.state, justification: text }), 'Decision recorded.');
            }
            return act(() => api.post(`/api/kb/versions/${v.id}/findings`, { kind: extra.kind, explanation: text, excerpt: extra.excerpt, otherEntryId: extra.other || undefined }), 'Flagged.');
          }}
        />
      )}

      {comparing && (
        <Modal title={`v${comparing.before.number} → v${comparing.after.number}`} subtitle="Lines removed in red, added in green." onClose={() => setComparing(null)} wide>
          {comparing.before.title !== comparing.after.title && (
            <p style={{ fontSize: 13 }}><strong>Title:</strong> <s>{comparing.before.title}</s> → {comparing.after.title}</p>
          )}
          <LineDiff before={kbText(comparing.before)} after={kbText(comparing.after)} />
        </Modal>
      )}
    </>
  );
}

function FindingCard({
  f,
  canDecide,
  onEdit,
  onDecide,
}: {
  f: KbFinding;
  canDecide: boolean;
  onEdit?: () => void;
  onDecide: (state: 'not_a_conflict' | 'resolved' | 'acknowledged') => void;
}) {
  const blocks = kbFindingBlocks(f);
  return (
    <div className="rowcard card-pad stack" style={{ gap: 6 }}>
      <div className="row wrap" style={{ gap: 6 }}>
        <span className={f.kind === 'conflict' ? 'badge stop' : f.kind === 'duplicate' ? 'badge warn' : 'badge info'}>{KB_FINDING_LABEL[f.kind]}</span>
        {f.source === 'ai' ? <span className="faint" style={{ fontSize: 12 }}>AI · confidence {f.confidence}/100 (an estimate)</span> : <span className="faint" style={{ fontSize: 12 }}>Flagged by a member</span>}
        {blocks && <span className="badge stop">Blocks publication</span>}
        {f.state !== 'open' && (
          <span className="badge ok">{f.state === 'not_a_conflict' ? 'Not a conflict' : f.state === 'resolved' ? 'Resolved' : 'Kept as is'}</span>
        )}
      </div>
      {f.other && (
        <span style={{ fontSize: 13 }}>
          Compared with <Link to={`/knowledge/${f.other.entryId}?v=${f.other.versionId}`}>{f.other.title}</Link> <span className="faint">(v{f.other.number})</span>
        </span>
      )}
      {(f.excerpt || f.otherExcerpt) && (
        <div className="row wrap" style={{ gap: 8 }}>
          {f.excerpt && <div className="kb-quote" style={{ flex: '1 1 220px' }}><span className="eyebrow">This one</span><br />“{f.excerpt}”</div>}
          {f.otherExcerpt && <div className="kb-quote" style={{ flex: '1 1 220px' }}><span className="eyebrow">The other</span><br />“{f.otherExcerpt}”</div>}
        </div>
      )}
      {f.explanation && <div style={{ fontSize: 13 }}>{f.explanation}</div>}
      {f.recommendation && <div style={{ fontSize: 13 }}><strong>Recommendation:</strong> {f.recommendation}</div>}
      {f.state !== 'open' && (
        <div className="faint" style={{ fontSize: 12.5 }}>
          {f.decidedBy?.name} · {formatDate(f.decidedAt)} — “{f.justification}”
        </div>
      )}
      {f.state === 'open' && canDecide && (
        <div className="row wrap" style={{ gap: 6 }}>
          {f.other && <Link className="btn ghost sm" to={`/knowledge/${f.other.entryId}?v=${f.other.versionId}`}>View Related Knowledge</Link>}
          {onEdit && <button className="btn ghost sm" onClick={onEdit}>Edit Current Knowledge</button>}
          {f.kind !== 'clarification' && <button className="btn ghost sm" onClick={() => onDecide('not_a_conflict')}>Mark as Not a {f.kind === 'duplicate' ? 'Duplicate' : 'Conflict'}</button>}
          {f.kind === 'duplicate' && <button className="btn ghost sm" onClick={() => onDecide('acknowledged')}>Keep both</button>}
          <button className="btn sm" onClick={() => onDecide('resolved')}>Resolve</button>
        </div>
      )}
    </div>
  );
}

function AskModal({
  ask,
  busy,
  onClose,
  onSubmit,
}: {
  ask: NonNullable<Ask>;
  busy: boolean;
  onClose: () => void;
  onSubmit: (text: string, extra: { kind: KbFindingKind; excerpt: string; other: string }) => void;
}) {
  const [text, setText] = useState('');
  const [kind, setKind] = useState<KbFindingKind>('conflict');
  const [excerpt, setExcerpt] = useState('');
  const [other, setOther] = useState('');
  const list = useAsync(
    () => (ask.kind === 'flag' ? api.get<{ items: { entryId: string; official: { title: string } | null; latest: { title: string } }[] }>('/api/kb') : Promise.resolve(null)),
    `kb-flag:${ask.kind}`,
  );
  const words = (() => {
    switch (ask.kind) {
      case 'review-changes':
        return { title: 'Request changes', help: 'Say what has to change. It goes back to its author.', go: 'Send back', needed: true };
      case 'validate':
        return ask.action === 'approve'
          ? { title: 'Approve & Publish', help: 'It becomes the official reference. A note is optional.', go: 'Approve & Publish', needed: false }
          : ask.action === 'reject'
            ? { title: 'Reject', help: 'Say why. The version stays in the history, rejected.', go: 'Reject', needed: true }
            : { title: 'Request changes', help: 'Say what has to change. It goes back to its author, and will be reviewed again.', go: 'Send back', needed: true };
      case 'decide':
        return {
          title: ask.state === 'not_a_conflict' ? 'Not a conflict' : ask.state === 'acknowledged' ? 'Keep both' : 'Resolve',
          help:
            ask.state === 'not_a_conflict'
              ? 'Why is it not one? The justification stays with the two versions compared.'
              : ask.state === 'acknowledged'
                ? 'Why keep both? The decision stays with the two versions compared.'
                : 'How was it resolved? If the other knowledge is the one to fix, propose an update to it — nothing changes by itself.',
          go: 'Record the decision',
          needed: true,
        };
      default:
        return { title: 'Flag a conflict', help: 'What contradicts, duplicates or needs clarifying? It blocks publication until somebody decides.', go: 'Flag', needed: true };
    }
  })();
  return (
    <Modal
      title={words.title}
      subtitle={words.help}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" disabled={busy} onClick={onClose}>Cancel</button>
          <div className="spacer" />
          <button className="btn primary" disabled={busy || (words.needed && !text.trim())} onClick={() => onSubmit(text.trim(), { kind, excerpt, other })}>
            {busy ? 'Saving…' : words.go}
          </button>
        </>
      }
    >
      <div className="stack" style={{ gap: 10 }}>
        {ask.kind === 'flag' && (
          <>
            <select className="select" value={kind} onChange={(e) => setKind(e.target.value as KbFindingKind)} aria-label="Kind">
              <option value="conflict">Potential Conflict</option>
              <option value="duplicate">Potential Duplicate</option>
              <option value="clarification">Needs Clarification</option>
            </select>
            <select className="select" value={other} onChange={(e) => setOther(e.target.value)} aria-label="Related knowledge">
              <option value="">No related knowledge</option>
              {(list.data?.items ?? []).map((i) => <option key={i.entryId} value={i.entryId}>{i.official?.title ?? i.latest.title}</option>)}
            </select>
            <input className="input" placeholder="The passage concerned (optional)" value={excerpt} onChange={(e) => setExcerpt(e.target.value)} />
          </>
        )}
        <textarea className="textarea" rows={4} value={text} onChange={(e) => setText(e.target.value)} autoFocus />
      </div>
    </Modal>
  );
}
