/**
 * L'analyse d'un appel d'offres, en tableau de bord : l'essentiel d'un coup
 * d'œil, le détail en dépliant. Ce que dit le document, ce que dit le web et
 * ce que l'IA déduit restent séparés jusque dans les sources.
 */
import {
  FUNDING_ORG_ROLE_LABEL,
  OPPORTUNITY_TYPES,
  OPPORTUNITY_TYPE_LABEL,
  OVERVIEW_FIELDS,
  OVERVIEW_MISSING,
  RELEVANCE_LABEL,
  TASK_PRIORITIES,
  TASK_PRIORITY_LABEL,
  VERIFICATION_LABEL,
  type FundingAction,
  type FundingAnalysis,
  type FundingOpportunity,
  type MeetingOptions,
  type TaskPriority,
} from '@ceed/shared';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { Icon } from '../../ui/Icon';
import { ConfirmDialog, useToast } from '../../ui/Overlays';
import './funding.css';

const Page = ({ page, excerpt }: { page: number | null; excerpt?: string }) =>
  page ? <span className="fi-page" title={excerpt ? `“${excerpt}”` : undefined}>p.{page}</span> : null;

export function FundingAnalysisPage() {
  const { analysisId = '' } = useParams();
  const view = useAsync(() => api.get<FundingAnalysis>(`/api/funding/analyses/${analysisId}`), `funding:${analysisId}`);
  const options = useAsync(() => api.get<MeetingOptions>('/api/meeting-assistant/options'), 'meeting-options');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [edits, setEdits] = useState<Record<string, { title: string; summary: string }>>({});
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [tell, setTell] = useState(false);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();

  const a = view.data;
  /* Une analyse ou une recherche web en cours : la page se met à jour d'elle-même. */
  const running = a?.status === 'pending' || a?.web.status === 'pending';
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => view.reload(), 3000);
    return () => clearInterval(t);
  }, [running, view]);

  const run = async (fn: () => Promise<unknown>, said?: string) => {
    setBusy(true);
    try {
      await fn();
      if (said) toast(said);
      view.reload();
    } catch (err) {
      toast((err as Error).message, true);
    } finally {
      setBusy(false);
    }
  };

  if (view.error) return <div className="page"><div className="callout warn">{view.error}</div></div>;
  if (!a || !options.data) return <div className="page faint">Loading…</div>;
  const { canWrite, members, me } = options.data;
  const r = a.result;
  const toSave = [...picked].filter((k) => !a.saved[k]);

  return (
    <>
      <header className="topbar">
        <Link className="btn ghost sm" to="/funding?tab=analyses"><Icon name="chevronLeft" size={13} /> Analyses</Link>
        <div className="spacer" />
        {a.uploadId && <a className="btn ghost sm" href={`/api/uploads/${a.uploadId}`} target="_blank" rel="noreferrer"><Icon name="file" size={13} /> Open the PDF</a>}
        {canWrite && a.status === 'done' && (
          <button className="btn sm" disabled={busy || a.web.status === 'pending'} onClick={() => run(() => api.post(`/api/funding/analyses/${a.id}/enrich`), 'Web research started — it takes a minute or two.')}>
            <Icon name="search" size={13} /> {a.web.status === 'done' ? 'Research again' : 'Enrich with Web Research'}
          </button>
        )}
        {canWrite && a.status === 'done' && (
          <button
            className="btn primary sm"
            disabled={busy || !toSave.length}
            title={toSave.length ? undefined : 'Select opportunities below'}
            onClick={() =>
              run(async () => {
                const out = await api.post<{ saved: number }>(`/api/funding/analyses/${a.id}/opportunities`, {
                  opportunities: toSave.map((key) => {
                    const o = r!.opportunities.find((x) => x.key === key)!;
                    return { key, title: edits[key]?.title ?? o.title, summary: edits[key]?.summary ?? o.summary };
                  }),
                });
                setPicked(new Set());
                toast(`${out.saved} opportunit${out.saved === 1 ? 'y' : 'ies'} saved.`);
              })
            }
          >
            <Icon name="check" size={13} /> Save Selected Opportunities{toSave.length ? ` (${toSave.length})` : ''}
          </button>
        )}
        {canWrite && (
          <button className="btn ghost icon sm" aria-label="Delete this analysis" title="Delete" onClick={() => setRemoving(true)}>
            <Icon name="trash" size={13} />
          </button>
        )}
      </header>

      <div className="page stack" style={{ gap: 22, maxWidth: 1100 }}>
        <section className="stack" style={{ gap: 4 }}>
          <div className="row wrap" style={{ gap: 8 }}>
            {a.status === 'pending' && <span className="badge info">Analysing…</span>}
            {a.status === 'failed' && <span className="badge stop">Analysis failed</span>}
            {a.status === 'done' && <span className="badge ok">Analysed · saved</span>}
            <span className="faint" style={{ fontSize: 12.5 }}>
              {formatDate(a.analysedAt ?? a.createdAt)} · by {a.createdByName || '—'}
              {a.sourceKind === 'pdf' ? ` · ${a.filename}, ${a.pages} page${a.pages === 1 ? '' : 's'}` : ' · pasted text'}
              {a.model && ` · ${a.model}`}
            </span>
          </div>
          <h2 style={{ margin: 0, fontSize: 22 }}>{a.title || 'Untitled document'}</h2>
          {a.truncated && <div className="callout warn"><Icon name="alert" size={15} /> <div>The document was too long: only its first part was analysed.</div></div>}
        </section>

        {a.status === 'pending' && <div className="callout"><Icon name="refresh" size={15} /> <div>Reading the document… a long call can take a couple of minutes.</div></div>}
        {a.status === 'failed' && (
          <div className="callout warn">
            <Icon name="alert" size={15} />
            <div style={{ flex: 1 }}>The analysis failed — {a.error}</div>
            {canWrite && <button className="btn sm" disabled={busy} onClick={() => run(() => api.post(`/api/funding/analyses/${a.id}/analyse`))}>Run it again</button>}
          </div>
        )}

        {r && (
          <>
            {/* 1 — L'appel en cartes */}
            <section className="fi-section">
              <h3>Document Overview</h3>
              <div className="fi-overview">
                {OVERVIEW_FIELDS.filter(([k]) => k !== 'title').map(([k, label]) => {
                  const f = r.overview[k];
                  return (
                    <div key={k} className="fi-fact">
                      <span className="eyebrow">{label}</span>
                      {f.value ? <b>{f.value}</b> : <span className="missing">{OVERVIEW_MISSING[k] ?? 'Non précisé'}</span>}
                      <Page page={f.page} excerpt={f.excerpt} />
                    </div>
                  );
                })}
              </div>
              {r.warnings.length > 0 && (
                <div className="callout warn">
                  <Icon name="alert" size={15} />
                  <div>
                    <strong>Points de vigilance</strong>
                    <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{r.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
                  </div>
                </div>
              )}
            </section>

            {/* 2 — La synthèse */}
            <section className="fi-section">
              <h3>Executive Summary</h3>
              <div className="card card-pad" style={{ fontSize: 14, lineHeight: 1.6 }}>{r.summary || <span className="faint">No summary.</span>}</div>
            </section>

            {/* 3 — Les organismes */}
            <section className="fi-section">
              <h3>Funders &amp; Organizations <span className="n">{r.organizations.length}</span></h3>
              <div className="fi-cards">
                {r.organizations.map((o, i) => (
                  <div key={i} className="fi-card">
                    <div className="fi-tags">{o.roles.map((role) => <span key={role} className={role === 'funder' ? 'badge ok' : role === 'contracting_authority' ? 'badge info' : 'badge'}>{FUNDING_ORG_ROLE_LABEL[role]}</span>)}</div>
                    <h4>{o.name}{o.acronym && o.acronym !== o.name && <span className="faint" style={{ fontWeight: 500 }}> · {o.acronym}</span>}</h4>
                    {o.kind && <span className="faint" style={{ fontSize: 12.5 }}>{o.kind}</span>}
                    {o.description && <p>{o.description}</p>}
                    {o.relations && <p><strong>Relations — </strong>{o.relations}</p>}
                    {o.themes.length > 0 && <div className="fi-tags">{o.themes.map((t) => <span key={t} className="fi-tag">{t}</span>)}</div>}
                    <div className="row wrap" style={{ gap: 6, marginTop: 'auto' }}>
                      <Page page={o.page} excerpt={o.excerpt} />
                      <div className="spacer" />
                      {o.recordId ? (
                        <Link className="btn ghost sm" to={`/directory/${o.recordId}`}><Icon name="check" size={12} /> In Organisations</Link>
                      ) : canWrite ? (
                        <button className="btn sm" disabled={busy} onClick={() => run(() => api.post(`/api/funding/analyses/${a.id}/organizations/${i}`), `${o.name} added to Organisations.`)}>
                          <Icon name="plus" size={12} /> Add to Organisations
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* 4 — Les opportunités */}
            <section className="fi-section">
              <h3>Detected Opportunities <span className="n">{r.opportunities.length}</span></h3>
              <div className="fi-legend">
                <span><i style={{ background: 'var(--ok)' }} />Identified Tender — in the document</span>
                <span><i style={{ background: 'var(--blue)' }} />Future Opportunity — a phase to come</span>
                <span><i style={{ background: 'var(--warn)' }} />Strategic Prospecting — deduced</span>
                <span><i style={{ background: 'var(--cyan)' }} />Project Concept — an idea, not an existing call</span>
              </div>
              {!r.opportunities.length && <div className="empty">No opportunity for CEED in this document.</div>}
              {[...r.opportunities]
                .sort((x, y) => OPPORTUNITY_TYPES.indexOf(x.type) - OPPORTUNITY_TYPES.indexOf(y.type))
                .map((o) => (
                  <OpportunityCard
                    key={o.key}
                    o={o}
                    saved={Boolean(a.saved[o.key])}
                    duplicate={a.duplicates[o.key] ?? null}
                    canSelect={canWrite && !a.saved[o.key]}
                    checked={picked.has(o.key)}
                    edit={edits[o.key]}
                    onToggle={() => {
                      const next = new Set(picked);
                      if (next.has(o.key)) next.delete(o.key);
                      else next.add(o.key);
                      setPicked(next);
                    }}
                    onEdit={(e) => setEdits((all) => ({ ...all, [o.key]: e }))}
                  />
                ))}
            </section>

            {/* 5 — Les actions */}
            <section className="fi-section">
              <h3>Recommended Actions <span className="n">{a.actions.length}</span></h3>
              {a.actions.map((act) => (
                <ActionRow
                  key={act.id}
                  act={act}
                  opportunity={r.opportunities.find((o) => o.key === act.opportunityKey)?.title ?? ''}
                  members={members}
                  me={me}
                  canWrite={canWrite}
                  checked={chosen.has(act.id)}
                  onToggle={() => {
                    const next = new Set(chosen);
                    if (next.has(act.id)) next.delete(act.id);
                    else next.add(act.id);
                    setChosen(next);
                  }}
                  onPatch={(body) => run(() => api.patch(`/api/funding/actions/${act.id}`, body))}
                />
              ))}
              {canWrite && a.actions.some((x) => x.status !== 'created') && (
                <div className="row wrap" style={{ gap: 10 }}>
                  <label className="check" style={{ fontSize: 12.5 }}>
                    <input type="checkbox" checked={tell} onChange={(e) => setTell(e.target.checked)} />
                    <span>Email each person — one letter listing their tasks</span>
                  </label>
                  <div className="spacer" />
                  <button
                    className="btn primary sm"
                    disabled={busy || !chosen.size}
                    onClick={() =>
                      run(async () => {
                        const out = await api.post<{ created: unknown[]; failed: { id: string; error: string }[] }>(`/api/funding/analyses/${a.id}/tasks`, { ids: [...chosen], tell });
                        setChosen(new Set(out.failed.map((f) => f.id)));
                        toast(
                          out.failed.length ? `${out.created.length} created. ${out.failed.length} not: ${out.failed[0]!.error}` : `${out.created.length} task${out.created.length === 1 ? '' : 's'} created.`,
                          out.failed.length > 0,
                        );
                      })
                    }
                  >
                    <Icon name="check" size={13} /> Create Tasks{chosen.size ? ` (${chosen.size})` : ''}
                  </button>
                </div>
              )}
            </section>

            {/* 6 — Les sources, séparées */}
            <section className="fi-section">
              <h3>Sources</h3>
              <div className="fi-sources">
                <div className="fi-src">
                  <h4><Icon name="file" size={14} /> Document Findings</h4>
                  <ul>
                    {OVERVIEW_FIELDS.filter(([k]) => r.overview[k].value).map(([k, label]) => (
                      <li key={k}><strong>{label}</strong> — {r.overview[k].value} <Page page={r.overview[k].page} excerpt={r.overview[k].excerpt} />{r.overview[k].excerpt && <div className="faint">“{r.overview[k].excerpt}”</div>}</li>
                    ))}
                    {r.opportunities.flatMap((o) => o.sources.map((src, i) => (
                      <li key={`${o.key}-${i}`}><strong>{o.title}</strong> <Page page={src.page} />{src.excerpt && <div className="faint">“{src.excerpt}”</div>}</li>
                    )))}
                  </ul>
                </div>
                <div className="fi-src">
                  <h4><Icon name="search" size={14} /> External Research</h4>
                  {a.web.status === 'none' && <span className="faint" style={{ fontSize: 12.5 }}>Not run yet. “Enrich with Web Research” looks up the funders — only their names leave CeedFlow, never the document.</span>}
                  {a.web.status === 'pending' && <span className="faint" style={{ fontSize: 12.5 }}>Searching the web…</span>}
                  {a.web.status === 'failed' && <span className="warnline" style={{ fontSize: 12.5 }}>The web research could not enrich the results — {a.web.error}</span>}
                  {a.web.status === 'done' && (
                    <>
                      <ul>
                        {a.web.findings.map((f, i) => (
                          <li key={i}>
                            <strong>{f.organization}</strong>{f.topic && <span className="faint"> · {f.topic}</span>} — {f.text}
                            <div>{f.urls.map((u) => <a key={u} href={u} target="_blank" rel="noreferrer" style={{ display: 'block', fontSize: 12 }}>{u}</a>)}</div>
                          </li>
                        ))}
                      </ul>
                      <div className="faint" style={{ fontSize: 12 }}>
                        {a.web.sources.length} page{a.web.sources.length === 1 ? '' : 's'} consulted · {formatDate(a.web.ranAt)}
                      </div>
                      <ul>
                        {a.web.sources.map((src) => (
                          <li key={src.url}>
                            <a href={src.url} target="_blank" rel="noreferrer">{src.title || src.url}</a>
                            <span className="faint"> · consulted {formatDate(src.consultedAt)}{src.publishedAt ? ` · published ${src.publishedAt}` : ''}</span>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
                <div className="fi-src">
                  <h4><Icon name="info" size={14} /> AI Recommendations</h4>
                  <ul>
                    {r.opportunities.filter((o) => o.verification.some((v) => v.status === 'inferred' || v.status === 'unverified')).map((o) => (
                      <li key={o.key}>
                        <strong>{o.title}</strong> <span className="v-pill v-inferred">Inferred</span>
                        {o.rationale && <div>{o.rationale}</div>}
                      </li>
                    ))}
                  </ul>
                  {r.ceedContext.length > 0 && (
                    <div className="faint" style={{ fontSize: 12 }}>
                      CEED knowledge used:{' '}
                      {r.ceedContext.map((k, i) => (
                        <span key={k.entryId}>{i > 0 && ', '}<Link to={`/knowledge/${k.entryId}`}>{k.title}</Link></span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </section>
          </>
        )}
      </div>

      {removing && (
        <ConfirmDialog
          title={`Delete “${a.title || 'Untitled document'}”?`}
          body="The analysis and its proposals go. Tasks already created and opportunities already saved stay."
          confirmLabel="Delete"
          destructive
          onClose={() => setRemoving(false)}
          onConfirm={async () => {
            try {
              await api.del(`/api/funding/analyses/${a.id}`);
              navigate('/funding?tab=analyses');
            } catch (err) {
              toast((err as Error).message, true);
            }
          }}
        />
      )}
    </>
  );
}

function OpportunityCard({
  o,
  saved,
  duplicate,
  canSelect,
  checked,
  edit,
  onToggle,
  onEdit,
}: {
  o: FundingOpportunity;
  saved: boolean;
  duplicate: { id: string; title: string } | null;
  canSelect: boolean;
  checked: boolean;
  edit?: { title: string; summary: string };
  onToggle: () => void;
  onEdit: (e: { title: string; summary: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const title = edit?.title ?? o.title;
  const summary = edit?.summary ?? o.summary;
  return (
    <div className={`fi-opp t-${o.type}`}>
      {canSelect && <input type="checkbox" checked={checked} onChange={onToggle} aria-label={`Select ${o.title}`} style={{ marginTop: 4 }} />}
      <div className="fi-opp-main">
        <div className="fi-tags">
          <span className="badge">{OPPORTUNITY_TYPE_LABEL[o.type]}</span>
          <span className={o.relevance === 'high' ? 'badge ok' : o.relevance === 'low' ? 'badge' : 'badge info'}>{RELEVANCE_LABEL[o.relevance]}</span>
          {o.eligibilityToVerify && <span className="badge warn">Eligibility to Verify</span>}
          {o.type === 'project_concept' && <span className="badge">An idea — not an existing call</span>}
          {saved && <span className="badge ok"><Icon name="check" size={11} /> Saved</span>}
          {duplicate && !saved && <span className="badge warn">Already saved as “{duplicate.title}”</span>}
        </div>
        {checked ? (
          <input className="input" value={title} onChange={(e) => onEdit({ title: e.target.value, summary })} aria-label="Opportunity title" style={{ fontWeight: 600 }} />
        ) : (
          <h4>{title}</h4>
        )}
        <div className="fi-keyfacts">
          {o.organization && <span>Organisation <b>{o.organization}</b></span>}
          {o.amount && <span>Amount <b>{o.amount}</b></span>}
          {o.deadline && <span>Deadline <b>{o.deadline}</b></span>}
          {o.period && <span>Period <b>{o.period}</b></span>}
          {o.targetAudience && <span>For <b>{o.targetAudience}</b></span>}
        </div>
        {checked ? (
          <textarea className="textarea" rows={2} value={summary} onChange={(e) => onEdit({ title, summary: e.target.value })} aria-label="Opportunity summary" />
        ) : (
          summary && <p style={{ margin: 0, fontSize: 13 }}>{summary}</p>
        )}
        {o.interestForCeed && <p style={{ margin: 0, fontSize: 13 }}><strong>For CEED — </strong>{o.interestForCeed}</p>}
        <div className="fi-verif">
          {o.verification.map((v, i) => (
            <div key={i}><span className={`v-pill v-${v.status}`}>{VERIFICATION_LABEL[v.status]}</span> {v.claim}</div>
          ))}
        </div>
        <button className="linkish" style={{ alignSelf: 'flex-start', fontSize: 12.5 }} onClick={() => setOpen(!open)}>{open ? 'Less' : 'Why, and what next'}</button>
        {open && (
          <div className="stack" style={{ gap: 6, fontSize: 13 }}>
            {o.rationale && <div><strong>Why — </strong>{o.rationale}</div>}
            {o.relevanceReason && <div><strong>Relevance — </strong>{o.relevanceReason}</div>}
            {o.eligibility && <div><strong>Eligibility — </strong>{o.eligibility}</div>}
            {o.activities.length > 0 && <div><strong>Possible activities</strong><ul style={{ margin: '2px 0 0', paddingLeft: 18 }}>{o.activities.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
            {o.vigilance.length > 0 && <div><strong>Watch out</strong><ul style={{ margin: '2px 0 0', paddingLeft: 18 }}>{o.vigilance.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
            {o.nextAction && <div><strong>Next — </strong>{o.nextAction}</div>}
            {o.sources.length > 0 && (
              <div className="row wrap" style={{ gap: 6 }}>
                {o.sources.map((src, i) => <span key={i} className="faint" style={{ fontSize: 12 }}><Page page={src.page} /> “{src.excerpt}”</span>)}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ActionRow({
  act,
  opportunity,
  members,
  me,
  canWrite,
  checked,
  onToggle,
  onPatch,
}: {
  act: FundingAction;
  opportunity: string;
  members: { id: string; name: string }[];
  me: string;
  canWrite: boolean;
  checked: boolean;
  onToggle: () => void;
  onPatch: (body: Record<string, unknown>) => void;
}) {
  const [title, setTitle] = useState(act.title);
  const [description, setDescription] = useState(act.description);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    setTitle(act.title);
    setDescription(act.description);
  }, [act.title, act.description]);
  const done = act.status === 'created';
  const editable = canWrite && !done && act.status !== 'dismissed';
  return (
    <div className="fi-action" style={{ opacity: act.status === 'dismissed' ? 0.55 : 1 }}>
      {editable && <input type="checkbox" checked={checked} onChange={onToggle} aria-label={`Select ${act.title}`} style={{ marginTop: 8 }} />}
      {done && <Icon name="check" size={16} />}
      <div className="main">
        <input className="prop-title" style={{ fontWeight: 600, border: 0, background: 'transparent', font: 'inherit', color: 'var(--ink)' }} value={title} disabled={!editable} onChange={(e) => setTitle(e.target.value)} onBlur={() => title !== act.title && onPatch({ title })} aria-label="Action title" />
        <div className="row wrap" style={{ gap: 6 }}>
          <select className="select" style={{ width: 'auto', height: 30, fontSize: 12.5 }} disabled={!editable} value={act.assigneeId ?? ''} onChange={(e) => onPatch({ assigneeId: e.target.value || null })} aria-label="Assigned to">
            <option value="">Assign someone</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          {editable && act.assigneeId !== me && <button className="linkish" style={{ fontSize: 12 }} onClick={() => onPatch({ assigneeId: me })}>me</button>}
          <select className="select" style={{ width: 'auto', height: 30, fontSize: 12.5 }} disabled={!editable} value={act.priority} onChange={(e) => onPatch({ priority: e.target.value as TaskPriority })} aria-label="Priority">
            {TASK_PRIORITIES.map((p) => <option key={p} value={p}>{TASK_PRIORITY_LABEL[p]}</option>)}
          </select>
          {opportunity && <span className="fi-tag">{opportunity}</span>}
          {done && act.task && <Link className="badge ok" to={`/tasks?task=${act.task.id}`}>In Tasks</Link>}
          {act.status === 'failed' && act.error && <span className="badge stop">{act.error}</span>}
          <button className="linkish" style={{ fontSize: 12 }} onClick={() => setOpen(!open)}>{open ? 'Less' : 'Details'}</button>
          {editable && <button className="linkish" style={{ fontSize: 12 }} onClick={() => onPatch({ status: 'dismissed' })}>Dismiss</button>}
          {canWrite && act.status === 'dismissed' && <button className="linkish" style={{ fontSize: 12 }} onClick={() => onPatch({ status: 'proposed' })}>Restore</button>}
        </div>
        {act.rationale && <span className="faint" style={{ fontSize: 12 }}>{act.rationale}</span>}
        {open && (
          <textarea className="textarea" rows={2} value={description} disabled={!editable} placeholder="Description" onChange={(e) => setDescription(e.target.value)} onBlur={() => description !== act.description && onPatch({ description })} aria-label="Description" />
        )}
      </div>
    </div>
  );
}
