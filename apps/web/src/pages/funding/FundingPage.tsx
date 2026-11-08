/**
 * Funding : importer un appel d'offres, retrouver les analyses passées et les
 * opportunités qu'on a choisi de garder.
 */
import {
  OPPORTUNITY_TYPE_LABEL,
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
import './funding.css';

type Tab = 'analyze' | 'analyses' | 'opportunities';

export function FundingPage() {
  const [params, setParams] = useSearchParams();
  const tab = (['analyze', 'analyses', 'opportunities'].includes(params.get('tab') ?? '') ? params.get('tab') : 'analyze') as Tab;
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
            ['analyze', 'Analyze Document'],
            ['analyses', 'Analyses'],
            ['opportunities', 'Opportunities'],
          ] as const
        ).map(([key, label]) => (
          <button key={key} role="tab" aria-selected={tab === key} className={tab === key ? 'tab on' : 'tab'} onClick={() => setParams(key === 'analyze' ? {} : { tab: key })}>
            {label}
          </button>
        ))}
      </nav>
      <div className="page stack" style={{ gap: 14, maxWidth: 1000 }}>
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

function Opportunities() {
  const list = useAsync(() => api.get<SavedOpportunity[]>('/api/funding/opportunities'), 'funding-opps');
  if (list.error) return <div className="empty">{list.error}</div>;
  if (!list.data) return <div className="faint">Loading…</div>;
  if (!list.data.length) return <div className="empty">No opportunity saved yet — select some in an analysis and save them.</div>;
  return (
    <div className="stack" style={{ gap: 10 }}>
      {list.data.map((o) => (
        <div key={o.id} className={`fi-opp t-${o.type}`}>
          <div className="fi-opp-main">
            <div className="fi-tags">
              <span className="badge">{OPPORTUNITY_TYPE_LABEL[o.type]}</span>
              <span className={o.relevance === 'high' ? 'badge ok' : o.relevance === 'low' ? 'badge' : 'badge info'}>{RELEVANCE_LABEL[o.relevance]}</span>
            </div>
            <h4>{o.title}</h4>
            <div className="fi-keyfacts">
              {o.organization && (
                <span>
                  {o.recordId ? <Link to={`/directory/${o.recordId}`}><b>{o.organization}</b></Link> : <b>{o.organization}</b>}
                </span>
              )}
              <span>Saved {formatDate(o.createdAt)} by {o.createdByName || '—'}</span>
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
          </div>
        </div>
      ))}
    </div>
  );
}
