/**
 * Funding : importer un appel d'offres, retrouver les analyses passées et les
 * opportunités qu'on a choisi de garder.
 */
import {
  OPPORTUNITY_STAGES,
  OPPORTUNITY_STAGE_LABEL,
  OPPORTUNITY_TYPE_LABEL,
  OPPORTUNITY_STATUS_WORD,
  type DetectedFunder,
  type DetectedOpportunity,
  type FunderRow,
  type FunderSearchResult,
  type OpportunityStage,
  RELEVANCE_LABEL,
  VERIFICATION_LABEL,
  type FundingAnalysisRow,
  type SavedOpportunity,
} from '@ceed/shared';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError, api } from '../../lib/api';
import { useAccount } from '../../lib/account';
import { formatDate } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { Icon } from '../../ui/Icon';
import { ConfirmDialog, useToast } from '../../ui/Overlays';
import { FoundList } from './FunderSearch';
import './funding.css';

type Tab = 'funders' | 'analyze' | 'analyses' | 'opportunities';

export function FundingPage() {
  const [params, setParams] = useSearchParams();
  const tab = (['funders', 'analyze', 'analyses', 'opportunities'].includes(params.get('tab') ?? '') ? params.get('tab') : 'funders') as Tab;
  const role = useAccount().me?.account.staffRole;
  const canWrite = role === 'admin' || role === 'editor';

  return (
    <>
      <header className="topbar">
        <div>
          <h1>Funding Intelligence</h1>
          <span className="faint" style={{ fontSize: 12.5 }}>Turn a call for tenders into opportunities for CEED.</span>
        </div>
      </header>
      <nav className="tabbar" role="tablist" aria-label="Funding">
        {(
          [
            ['funders', 'Funders'],
            ['analyze', 'Analyze Document'],
            ['analyses', 'Analyses'],
            ['opportunities', 'Opportunities'],
          ] as const
        ).map(([key, label]) => (
          <button key={key} role="tab" aria-selected={tab === key} className={tab === key ? 'tab on' : 'tab'} onClick={() => setParams(key === 'funders' ? {} : { tab: key })}>
            {label}
          </button>
        ))}
      </nav>
      <div className="page stack" style={{ gap: 14, maxWidth: 1000 }}>
        {tab === 'funders' && <Funders canWrite={canWrite} />}
        {tab === 'analyze' && (canWrite ? <Analyze /> : <div className="empty">Your access is read-only — open the Analyses tab.</div>)}
        {tab === 'analyses' && <Analyses canWrite={canWrite} />}
        {tab === 'opportunities' && <Opportunities />}
      </div>
    </>
  );
}

function Analyze() {
  const [title, setTitle] = useState('');
  const [mode, setMode] = useState<'pdf' | 'text'>('pdf');
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();

  const go = async () => {
    setBusy(true);
    try {
      let id: string;
      if (mode === 'pdf') {
        if (!file) return;
        if (file.size > 10 * 1024 * 1024) throw new Error(`That file is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is 10 MB.`);
        const body = new FormData();
        body.append('title', title);
        body.append('file', file);
        const res = await fetch('/api/funding/analyses/pdf', { method: 'POST', body });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error ?? 'The upload failed.');
        id = json.id;
      } else {
        id = (await api.post<{ id: string }>('/api/funding/analyses', { title, text })).id;
      }
      navigate(`/funding/${id}`);
    } catch (err) {
      toast(err instanceof ApiError || err instanceof Error ? err.message : 'The analysis could not start.', true);
      setBusy(false);
    }
  };

  return (
    <section className="card card-pad stack" style={{ gap: 12 }}>
      <div className="field">
        <label htmlFor="fi-title">Document Title</label>
        <input id="fi-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Optional — read from the document when left empty" />
      </div>
      <div className="seg" role="group" aria-label="Source">
        <button className={mode === 'pdf' ? 'on' : ''} onClick={() => setMode('pdf')}><Icon name="file" size={13} /> PDF</button>
        <button className={mode === 'text' ? 'on' : ''} onClick={() => setMode('text')}><Icon name="edit" size={13} /> Text</button>
      </div>
      {mode === 'pdf' ? (
        <label
          className={over ? 'fi-drop on' : 'fi-drop'}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            const f = e.dataTransfer.files[0];
            if (f) setFile(f);
          }}
        >
          <input type="file" accept="application/pdf,.pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <Icon name="file" size={22} />
          <div style={{ marginTop: 6, fontWeight: 600 }}>{file ? file.name : 'Drop the call for tenders here, or choose a PDF'}</div>
          <div className="faint" style={{ fontSize: 12 }}>{file ? `${(file.size / 1024).toFixed(0)} KB` : '10 MB at most. A scanned PDF has no text — paste it instead.'}</div>
        </label>
      ) : (
        <textarea className="textarea" rows={14} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste the full text of the call for tenders." aria-label="Document text" />
      )}
      <div className="row">
        <span className="faint" style={{ fontSize: 12, flex: 1 }}>The document is analysed by the AI chosen in Settings. Nothing is added to the directory, the opportunities or Tasks until you choose.</span>
        <button className="btn primary" disabled={busy || (mode === 'pdf' ? !file : text.trim().length < 200)} onClick={go}>
          <Icon name="send" size={13} /> {busy ? 'Sending…' : 'Analyze'}
        </button>
      </div>
    </section>
  );
}

function Analyses({ canWrite }: { canWrite: boolean }) {
  const list = useAsync(() => api.get<FundingAnalysisRow[]>('/api/funding/analyses'), 'funding-list');
  const [removing, setRemoving] = useState<FundingAnalysisRow | null>(null);
  const toast = useToast();
  if (list.error) return <div className="empty">{list.error}</div>;
  if (!list.data) return <div className="faint">Loading…</div>;
  if (!list.data.length) return <div className="empty">No document analysed yet.</div>;
  return (
    <>
      <div className="rows">
        {list.data.map((a) => (
          <div key={a.id} className="rowcard card-pad row wrap" style={{ gap: 10 }}>
            <Link to={`/funding/${a.id}`} style={{ flex: 1, minWidth: 200, textDecoration: 'none', color: 'inherit' }}>
              <strong>{a.title || 'Untitled document'}</strong>
              <div className="faint" style={{ fontSize: 12 }}>{formatDate(a.createdAt)} · by {a.createdByName || '—'}</div>
            </Link>
            {a.status === 'pending' && <span className="badge info">Analysing…</span>}
            {a.status === 'failed' && <span className="badge stop">Analysis failed</span>}
            {a.status === 'done' && <span className="faint" style={{ fontSize: 12.5 }}>{a.organizations} organisations · <strong>{a.opportunities}</strong> opportunities</span>}
            {canWrite && (
              <button className="btn ghost icon sm" aria-label="Delete" title="Delete" onClick={() => setRemoving(a)}>
                <Icon name="trash" size={13} />
              </button>
            )}
          </div>
        ))}
      </div>
      {removing && (
        <ConfirmDialog
          title={`Delete “${removing.title || 'Untitled document'}”?`}
          body="The analysis and its proposals go. Tasks already created and opportunities already saved stay."
          confirmLabel="Delete"
          destructive
          onClose={() => setRemoving(null)}
          onConfirm={async () => {
            try {
              await api.del(`/api/funding/analyses/${removing.id}`);
              setRemoving(null);
              list.reload();
            } catch (err) {
              toast((err as Error).message, true);
            }
          }}
        />
      )}
    </>
  );
}

/** L'étape d'une opportunité, changée en un clic. */
export function StageSelect({ id, stage, canWrite, onChanged }: { id: string; stage: OpportunityStage; canWrite: boolean; onChanged: () => void }) {
  const toast = useToast();
  return (
    <select
      className="select"
      style={{ width: 'auto', height: 30, fontSize: 12.5 }}
      disabled={!canWrite}
      value={stage}
      aria-label="Stage"
      onChange={async (e) => {
        try {
          await api.patch(`/api/funding/opportunities/${id}`, { stage: e.target.value });
          onChanged();
        } catch (err) {
          toast((err as Error).message, true);
        }
      }}
    >
      {OPPORTUNITY_STAGES.map((st) => <option key={st} value={st}>{OPPORTUNITY_STAGE_LABEL[st]}</option>)}
    </select>
  );
}

/** Une opportunité suivie : son étape, son bailleur, ce qui la fonde. */
export function SavedOpportunityCard({ o, canWrite, onChanged }: { o: SavedOpportunity; canWrite: boolean; onChanged: () => void }) {
  return (
    <div className={`fi-opp t-${o.type}`}>
      <div className="fi-opp-main">
        <div className="fi-tags">
          <span className="badge">{OPPORTUNITY_TYPE_LABEL[o.type]}</span>
          <span className={o.relevance === 'high' ? 'badge ok' : o.relevance === 'low' ? 'badge' : 'badge info'}>{RELEVANCE_LABEL[o.relevance]}</span>
          <div className="spacer" />
          <StageSelect id={o.id} stage={o.stage} canWrite={canWrite} onChanged={onChanged} />
        </div>
        <h4>{o.title}</h4>
        <div className="fi-keyfacts">
          {o.recordId ? (
            <Link to={`/funding/funders/${o.recordId}`}><b>{o.recordName || o.organization}</b></Link>
          ) : (
            o.organization && <span><b>{o.organization}</b> <span className="faint">(not tracked)</span></span>
          )}
          <span>{OPPORTUNITY_STAGE_LABEL[o.stage]} since {formatDate(o.stageChangedAt)}</span>
          {o.analysisId && <Link to={`/funding/${o.analysisId}`}>From: {o.analysisTitle || 'an analysis'}</Link>}
        </div>
        {o.summary && <p style={{ margin: 0, fontSize: 13 }}>{o.summary}</p>}
        {o.verification.length > 0 && (
          <div className="fi-verif">
            {o.verification.map((v, i) => (
              <div key={i}><span className={`v-pill v-${v.status}`}>{VERIFICATION_LABEL[v.status]}</span> {v.claim}</div>
            ))}
          </div>
        )}
        {o.links.length > 0 && <div>{o.links.map((u) => <a key={u} href={u} target="_blank" rel="noreferrer" style={{ display: 'block', fontSize: 12, overflowWrap: 'anywhere' }}>{u}</a>)}</div>}
        {o.history.length > 1 && (
          <span className="faint" style={{ fontSize: 12 }}>
            {o.history.map((h) => `${OPPORTUNITY_STAGE_LABEL[h.stage]} ${formatDate(h.at)}${h.byName ? ` (${h.byName})` : ''}`).join(' → ')}
          </span>
        )}
      </div>
    </div>
  );
}

function Funders({ canWrite }: { canWrite: boolean }) {
  const list = useAsync(() => api.get<FunderRow[]>('/api/funding/funders'), 'funders');
  const [name, setName] = useState('');
  const navigate = useNavigate();
  const toast = useToast();
  return (
    <>
      {canWrite && (
        <div className="row wrap" style={{ gap: 8 }}>
          <input className="input" style={{ flex: '1 1 260px' }} value={name} placeholder="Track a funder — its name (found in Organisations, or added)" onChange={(e) => setName(e.target.value)} />
          <button
            className="btn"
            disabled={!name.trim()}
            onClick={async () => {
              try {
                const { recordId } = await api.post<{ recordId: string }>('/api/funding/funders', { name: name.trim() });
                navigate(`/funding/funders/${recordId}`);
              } catch (err) {
                toast((err as Error).message, true);
              }
            }}
          >
            <Icon name="plus" size={13} /> Track
          </button>
          <button
            className="btn primary"
            disabled={!list.data?.length}
            title="Look for new opportunities of every tracked funder"
            onClick={async () => {
              try {
                const { started } = await api.post<{ started: number }>('/api/funding/funders/search');
                toast(`Searching ${started} funder${started === 1 ? '' : 's'}, one after the other — the leads appear in Opportunities.`);
              } catch (err) {
                toast((err as Error).message, true);
              }
            }}
          >
            <Icon name="search" size={13} /> Search all funders
          </button>
        </div>
      )}
      {list.error && <div className="empty">{list.error}</div>}
      <DetectedFunders canWrite={canWrite} onTracked={() => list.reload()} />
      {list.data && list.data.length > 0 && <h3 className="section-title" style={{ margin: '4px 0 0' }}>Tracked funders</h3>}
      {!list.data ? (
        <div className="faint">Loading…</div>
      ) : !list.data.length ? (
        <div className="empty">No funder tracked yet. Analyse a call for tenders and add its funders, or track one by its name.</div>
      ) : (
        <div className="fi-cards">
          {list.data.map((f) => (
            <Link key={f.id} to={`/funding/funders/${f.id}`} className="fi-card" style={{ textDecoration: 'none', color: 'inherit' }}>
              <h4>{f.name}</h4>
              {f.kind && <span className="faint" style={{ fontSize: 12.5 }}>{f.kind}</span>}
              {f.themes.length > 0 && <div className="fi-tags">{f.themes.map((t) => <span key={t} className="fi-tag">{t}</span>)}</div>}
              <div className="fi-keyfacts" style={{ marginTop: 'auto' }}>
                <span><b>{f.openOpportunities}</b> open / {f.opportunities} opportunities</span>
                <span><b>{f.analyses}</b> analyses</span>
                <span><b>{f.openTasks}</b> open tasks</span>
              </div>
              {f.lastActivity && <span className="faint" style={{ fontSize: 12 }}>Last activity {formatDate(f.lastActivity)}</span>}
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

function DetectedFunders({ canWrite, onTracked }: { canWrite: boolean; onTracked: () => void }) {
  const list = useAsync(() => api.get<DetectedFunder[]>('/api/funding/detected/funders'), 'detected-funders');
  const toast = useToast();
  if (!list.data?.length) return null;
  return (
    <section className="stack" style={{ gap: 8 }}>
      <h3 className="section-title" style={{ margin: 0 }}>Detected in analyses — not tracked yet</h3>
      <div className="rows">
        {list.data.map((f) => (
          <div key={f.recordId ?? f.name} className="rowcard card-pad row wrap" style={{ gap: 10 }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <strong>{f.name}</strong>{f.acronym && f.acronym !== f.name && <span className="faint"> · {f.acronym}</span>}
              <div className="faint" style={{ fontSize: 12 }}>
                {f.parent ? `Part of ${f.parent} · ` : ''}{f.themes.join(', ')}
              </div>
              <div style={{ fontSize: 12 }}>
                Seen in {f.analyses.map((a, i) => <span key={a.id}>{i > 0 && ', '}<Link to={`/funding/${a.id}`}>{a.title || 'an analysis'}</Link></span>)}
              </div>
            </div>
            {canWrite && (
              <button
                className="btn sm"
                onClick={async () => {
                  try {
                    await api.post('/api/funding/funders', f.recordId ? { recordId: f.recordId } : { name: f.name });
                    toast(`${f.name} is now tracked.`);
                    list.reload();
                    onTracked();
                  } catch (err) {
                    toast((err as Error).message, true);
                  }
                }}
              >
                <Icon name="plus" size={12} /> Track
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function DetectedOpportunities({ canWrite, onSaved }: { canWrite: boolean; onSaved: () => void }) {
  const list = useAsync(() => api.get<DetectedOpportunity[]>('/api/funding/detected/opportunities'), 'detected-opps');
  const toast = useToast();
  if (!list.data?.length) return null;
  return (
    <section className="stack" style={{ gap: 8 }}>
      <h3 className="section-title" style={{ margin: 0 }}>Detected — not saved yet</h3>
      {list.data.map(({ analysisId, analysisTitle, opportunity: o }) => (
        <div key={`${analysisId}:${o.key}`} className={`fi-opp t-${o.type}`}>
          <div className="fi-opp-main">
            <div className="row wrap" style={{ gap: 8, alignItems: 'baseline' }}>
              <h4 style={{ flex: 1 }}>{o.title}</h4>
              <span className={o.type === 'identified_tender' ? 'badge warn' : o.type === 'future_opportunity' ? 'badge info' : 'badge'}>{OPPORTUNITY_STATUS_WORD[o.type]}</span>
            </div>
            <span className="faint" style={{ fontSize: 13 }}>{[o.organization, o.nature].filter(Boolean).join(' · ')}</span>
            {o.summary && <p style={{ margin: 0, fontSize: 13 }}>{o.summary}</p>}
            {o.fundingNote && <p style={{ margin: 0, fontSize: 13 }}><strong>Financement — </strong>{o.fundingNote}</p>}
            <div className="row wrap" style={{ gap: 8 }}>
              <Link to={`/funding/${analysisId}`} style={{ fontSize: 12.5 }}>From: {analysisTitle || 'an analysis'}</Link>
              <div className="spacer" />
              {canWrite && (
                <button
                  className="btn sm"
                  onClick={async () => {
                    try {
                      await api.post(`/api/funding/analyses/${analysisId}/opportunities`, { opportunities: [{ key: o.key, title: o.title, summary: o.summary }] });
                      toast('Saved — it is now followed.');
                      list.reload();
                      onSaved();
                    } catch (err) {
                      toast((err as Error).message, true);
                    }
                  }}
                >
                  <Icon name="check" size={12} /> Save
                </button>
              )}
            </div>
          </div>
        </div>
      ))}
    </section>
  );
}

function FoundBySearch({ canWrite, onSaved }: { canWrite: boolean; onSaved: () => void }) {
  const found = useAsync(() => api.get<FunderSearchResult[]>('/api/funding/found'), 'funding-found');
  if (!found.data?.length) return null;
  return (
    <section className="stack" style={{ gap: 8 }}>
      <h3 className="section-title" style={{ margin: 0 }}>Found by search — waiting for a decision</h3>
      <FoundList results={found.data} canWrite={canWrite} showFunder onChanged={() => { found.reload(); onSaved(); }} />
    </section>
  );
}

function Opportunities() {
  const role = useAccount().me?.account.staffRole;
  const canWrite = role === 'admin' || role === 'editor';
  const list = useAsync(() => api.get<SavedOpportunity[]>('/api/funding/opportunities'), 'funding-opps');
  return (
    <div className="stack" style={{ gap: 14 }}>
      <FoundBySearch canWrite={canWrite} onSaved={() => list.reload()} />
      <DetectedOpportunities canWrite={canWrite} onSaved={() => list.reload()} />
      <h3 className="section-title" style={{ margin: 0 }}>Followed</h3>
      {list.error && <div className="empty">{list.error}</div>}
      {!list.data ? (
        <div className="faint">Loading…</div>
      ) : !list.data.length ? (
        <div className="empty">No opportunity followed yet — save some from the list above or from an analysis.</div>
      ) : (
        list.data.map((o) => <SavedOpportunityCard key={o.id} o={o} canWrite={canWrite} onChanged={() => list.reload()} />)
      )}
    </div>
  );
}
