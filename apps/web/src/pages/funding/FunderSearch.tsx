/**
 * La recherche d'opportunités d'un bailleur : ce qui l'oriente, et ce qu'elle
 * a trouvé — chaque piste avec ses pages, à suivre ou à écarter.
 */
import {
  OPPORTUNITY_STATUS_WORD,
  OPPORTUNITY_TYPE_LABEL,
  RELEVANCE_LABEL,
  type FunderProfile,
  type FunderSearchResult,
} from '@ceed/shared';
import { useState } from 'react';
import { api } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { Icon } from '../../ui/Icon';
import { Modal, useToast } from '../../ui/Overlays';
import { TagField } from '../../ui/Field';
import './funding.css';

const FIELDS: { key: keyof Pick<FunderProfile, 'aliases' | 'facilities' | 'countries' | 'themes' | 'instruments' | 'sources' | 'exclusions'>; label: string; help: string }[] = [
  { key: 'aliases', label: 'Other names', help: 'Acronyms and translations — BAD, AfDB, African Development Bank.' },
  { key: 'facilities', label: 'Facilities and mechanisms', help: 'What it funds through — searched too.' },
  { key: 'countries', label: 'Countries', help: 'Where CEED can act.' },
  { key: 'themes', label: 'Themes', help: 'Read from the analyses — keep what matters to CEED.' },
  { key: 'instruments', label: 'Instruments', help: 'Calls for tenders, calls for proposals, grants, procurement plans…' },
  { key: 'sources', label: 'Sources to check first', help: 'Its procurement page, its calls for proposals, its projects in Morocco.' },
  { key: 'exclusions', label: 'Leave out', help: 'What CEED does not want proposed again.' },
];

export function SearchPanel({ recordId, profile, canWrite, onChanged }: { recordId: string; profile: FunderProfile; canWrite: boolean; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const save = async (patch: Partial<FunderProfile>) => {
    try {
      await api.patch(`/api/funding/funders/${recordId}/profile`, patch);
      onChanged();
    } catch (err) {
      toast((err as Error).message, true);
    }
  };
  return (
    <section className="fi-card">
      <div className="row wrap" style={{ gap: 8 }}>
        <h4 style={{ flex: 1 }}>Opportunity search</h4>
        {profile.searchStatus === 'pending' && <span className="badge info">Searching…</span>}
        {profile.lastSearchAt && profile.searchStatus !== 'pending' && <span className="faint" style={{ fontSize: 12 }}>Last search {formatDate(profile.lastSearchAt)}</span>}
        <button className="btn ghost sm" onClick={() => setEditing(!editing)}>{editing ? 'Close' : 'What it searches'}</button>
        {canWrite && (
          <button
            className="btn primary sm"
            disabled={busy || profile.searchStatus === 'pending'}
            onClick={async () => {
              setBusy(true);
              try {
                await api.post(`/api/funding/funders/${recordId}/search`);
                toast('Searching — a minute or two. The leads appear below.');
                onChanged();
              } catch (err) {
                toast((err as Error).message, true);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Icon name="search" size={13} /> Search opportunities now
          </button>
        )}
      </div>
      {profile.searchStatus === 'failed' && <span className="warnline" style={{ fontSize: 12.5 }}>The last search failed — {profile.searchError}</span>}
      {!editing ? (
        <p>
          {[profile.aliases.join(', '), profile.facilities.length ? `+ ${profile.facilities.join(', ')}` : '', profile.countries.join(', '), profile.themes.slice(0, 5).join(', ')].filter(Boolean).join(' · ')}
        </p>
      ) : (
        <div className="stack" style={{ gap: 4 }}>
          {FIELDS.map((f) =>
            canWrite ? (
              <TagField key={f.key} label={f.label} help={f.help} values={profile[f.key]} onChange={(v) => save({ [f.key]: v })} placeholder="Add…" />
            ) : (
              <div key={f.key} className="field"><label>{f.label}</label><div className="faint" style={{ fontSize: 13 }}>{profile[f.key].join(', ') || '—'}</div></div>
            ),
          )}
        </div>
      )}
    </section>
  );
}

/** Les pistes trouvées par la recherche, en attente d'une décision. */
export function FoundList({ results, canWrite, showFunder, onChanged }: { results: FunderSearchResult[]; canWrite: boolean; showFunder?: boolean; onChanged: () => void }) {
  const [dismissing, setDismissing] = useState<FunderSearchResult | null>(null);
  const [reason, setReason] = useState('');
  const toast = useToast();
  if (!results.length) return null;
  return (
    <>
      {results.map((r) => (
        <div key={r.id} className={`fi-opp t-${r.type}`}>
          <div className="fi-opp-main">
            <div className="row wrap" style={{ gap: 8, alignItems: 'baseline' }}>
              <h4 style={{ flex: 1 }}>{r.title}</h4>
              <span className={r.type === 'identified_tender' ? 'badge warn' : r.type === 'future_opportunity' ? 'badge info' : 'badge'}>{OPPORTUNITY_STATUS_WORD[r.type]}</span>
            </div>
            <span className="faint" style={{ fontSize: 13 }}>
              {[showFunder ? r.funderName : '', r.organization, r.nature].filter(Boolean).join(' · ')}
            </span>
            {r.summary && <p style={{ margin: 0, fontSize: 13.5 }}>{r.summary}</p>}
            {r.fundingNote && <p style={{ margin: 0, fontSize: 13 }}><strong>Financement — </strong>{r.fundingNote}</p>}
            <div className="fi-keyfacts">
              {r.deadline && <span>Deadline <b>{r.deadline}</b></span>}
              {r.amount && <span>Amount <b>{r.amount}</b></span>}
              {r.publishedAt && <span>Published <b>{r.publishedAt}</b></span>}
            </div>
            <div className="fi-tags">
              <span className="badge">{OPPORTUNITY_TYPE_LABEL[r.type]}</span>
              <span className={r.relevance === 'high' ? 'badge ok' : r.relevance === 'low' ? 'badge' : 'badge info'} title={r.relevanceReason}>{RELEVANCE_LABEL[r.relevance]}</span>
              {r.eligibilityToVerify && <span className="badge warn">Eligibility to Verify</span>}
              <span className="badge ok">Found by search · {formatDate(r.foundAt)}</span>
            </div>
            <div>{r.urls.map((u) => <a key={u} href={u} target="_blank" rel="noreferrer" style={{ display: 'block', fontSize: 12, overflowWrap: 'anywhere' }}>{u}</a>)}</div>
            {canWrite && (
              <div className="row" style={{ gap: 6 }}>
                <div className="spacer" />
                <button className="btn ghost sm" onClick={() => setDismissing(r)}>Dismiss</button>
                <button
                  className="btn sm"
                  onClick={async () => {
                    try {
                      await api.post(`/api/funding/found/${r.id}/save`);
                      toast('Saved — now followed with this funder.');
                      onChanged();
                    } catch (err) {
                      toast((err as Error).message, true);
                    }
                  }}
                >
                  <Icon name="check" size={12} /> Save
                </button>
              </div>
            )}
          </div>
        </div>
      ))}
      {dismissing && (
        <Modal
          title="Dismiss this lead"
          subtitle="Why? The next searches take it into account."
          onClose={() => setDismissing(null)}
          footer={
            <>
              <button className="btn ghost" onClick={() => setDismissing(null)}>Cancel</button>
              <div className="spacer" />
              <button
                className="btn primary"
                onClick={async () => {
                  try {
                    await api.post(`/api/funding/found/${dismissing.id}/dismiss`, { reason });
                    setDismissing(null);
                    setReason('');
                    onChanged();
                  } catch (err) {
                    toast((err as Error).message, true);
                  }
                }}
              >
                Dismiss
              </button>
            </>
          }
        >
          <input className="input" autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Out of scope, closed, not for CEED… (optional)" />
        </Modal>
      )}
    </>
  );
}
