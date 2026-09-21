import {
  ORIGIN_LABEL,
  type DirectoryRecord,
  type RecordDetail,
  type RecordKind,
  type RemovalPlan,
} from '@ceed/shared';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { Icon } from '../../ui/Icon';
import { SearchBox } from '../../ui/SearchBox';
import { ConfirmDialog, Modal, useToast } from '../../ui/Overlays';
import '../../ui/builder.css';
import '../../ui/directory.css';
import { AccountCard } from './AccountCard';
import { initials } from './DirectoryPage';
import { RecordModal } from './RecordModal';

export function RecordPage() {
  const { recordId = '' } = useParams();
  const detail = useAsync(() => api.get<RecordDetail>(`/api/records/${recordId}`), recordId);
  const [editing, setEditing] = useState(false);
  const [linking, setLinking] = useState(false);
  const [unlinking, setUnlinking] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();

  if (detail.error) return <div className="page empty">{detail.error}</div>;
  if (!detail.data) return <div className="page empty">Loading…</div>;

  const { record, links, account } = detail.data;
  const isOrg = record.kind === 'org';
  const backTo = isOrg ? '/organisations' : '/individuals';

  return (
    <>
      <header className="topbar">
        <span className="crumbs">
          <Link to={backTo}>{isOrg ? 'Organisations' : 'Individuals'}</Link> ›
        </span>
        <h1>{record.name}</h1>
        <div className="spacer" />
        <button className="btn" onClick={() => setEditing(true)}>
          <Icon name="edit" size={14} /> Edit
        </button>
      </header>

      <div className="page rec-layout">
        <div className="stack" style={{ gap: 14 }}>
          <div className="card card-pad rec-head">
            <div className="rec-mark big">{initials(record.name)}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="row wrap" style={{ gap: 6 }}>
                {record.roles.length ? (
                  record.roles.map((r) => (
                    <span className="badge info" key={r}>
                      {r}
                    </span>
                  ))
                ) : (
                  <span className="faint" style={{ fontSize: 12.5 }}>
                    No role — known through {isOrg ? 'the programs' : 'their organisation'}
                  </span>
                )}
              </div>
              {record.bio && <p style={{ margin: '8px 0 0', fontSize: 13 }}>{record.bio}</p>}
              <div className="row wrap faint" style={{ gap: 14, marginTop: 8, fontSize: 12.5 }}>
                {record.email && <span>{record.email}</span>}
                {record.phone && <span className="num">{record.phone}</span>}
                {record.city && <span>{[record.city, record.country].filter(Boolean).join(', ')}</span>}
                {record.website && <span>{record.website}</span>}
              </div>
              {record.tags.length > 0 && (
                <div className="row wrap" style={{ gap: 5, marginTop: 8 }}>
                  {record.tags.map((t) => (
                    <span className="badge" key={t}>
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="rowcard-head" style={{ padding: '11px 14px' }}>
              <strong style={{ flex: 1, fontFamily: 'var(--display)', fontSize: 13.5 }}>
                {isOrg ? 'People' : 'Organisations'}
              </strong>
              <span className="badge num">{links.length}</span>
              <button className="btn sm" onClick={() => setLinking(true)}>
                <Icon name="plus" size={13} /> Link {isOrg ? 'a person' : 'an organisation'}
              </button>
            </div>

            {!links.length ? (
              <div className="empty" style={{ padding: 22 }}>
                {isOrg ? (
                  <>
                    <h3>Nobody holds this organisation</h3>
                    <p>An organisation carries at least one person — otherwise nobody can be reached about it.</p>
                  </>
                ) : (
                  <p>Not attached to any organisation — which is allowed: a person can stand on their own.</p>
                )}
              </div>
            ) : (
              <div className="rows" style={{ padding: 10 }}>
                {links.map(({ affiliation, record: other }) => (
                  <div className="rowcard link-row" key={affiliation.id}>
                    <Link to={`/directory/${other.id}`} className="rec-name" style={{ flex: 1, minWidth: 0 }}>
                      <span className="rec-mark">{initials(other.name)}</span>
                      <span>
                        <span style={{ fontWeight: 600, fontSize: 13 }}>{other.name}</span>
                        <span className="faint" style={{ display: 'block', fontSize: 12 }}>
                          {[affiliation.role, affiliation.since && `since ${affiliation.since}`]
                            .filter(Boolean)
                            .join(' · ') || '—'}
                        </span>
                      </span>
                    </Link>
                    <button
                      className="btn ghost icon sm"
                      aria-label="Unlink"
                      onClick={() => setUnlinking(affiliation.id)}
                    >
                      <Icon name="trash" size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <aside className="stack" style={{ gap: 14 }}>
          {/* A person can be given a way in; an organisation is reached through
              the people attached to it. */}
          {!isOrg && <AccountCard record={record} account={account} onChanged={detail.reload} />}

          <div className="card card-pad stack" style={{ gap: 10 }}>
            <div className="eyebrow">The record</div>
            <Fact label="Came from" value={ORIGIN_LABEL[record.origin]} />
            <Fact label="Added" value={formatDate(record.createdAt)} />
            <p className="faint" style={{ margin: 0, fontSize: 12, lineHeight: 1.5 }}>
              {record.origin === 'signup'
                ? 'Filled in by the person themselves. CEED can still correct it.'
                : 'Kept by the CEED team.'}
            </p>
          </div>

          <div className="card card-pad stack" style={{ gap: 8 }}>
            <div className="eyebrow">Program history</div>
            <p className="faint" style={{ margin: 0, fontSize: 12.5 }}>
              Computed from the editions, never typed. It lights up once candidates and team members point at the
              directory.
            </p>
          </div>

          <button className="btn ghost" style={{ color: 'var(--stop)' }} onClick={() => setRemoving(true)}>
            <Icon name="trash" size={13} /> Remove from the directory
          </button>
        </aside>
      </div>

      {editing && (
        <RecordModal
          kind={record.kind}
          record={record}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            detail.reload();
          }}
        />
      )}

      {linking && (
        <LinkModal
          record={record}
          taken={links.map((l) => l.record.id)}
          onClose={() => setLinking(false)}
          onSaved={() => {
            setLinking(false);
            detail.reload();
          }}
        />
      )}

      {unlinking && (
        <ConfirmDialog
          title="Remove this link?"
          body="Both records stay in the directory — only the link between them goes."
          confirmLabel="Remove the link"
          onClose={() => setUnlinking(null)}
          onConfirm={async () => {
            await api.del(`/api/affiliations/${unlinking}`);
            detail.reload();
            toast('Link removed.');
          }}
        />
      )}

      {removing && (
        <RemovalDialog
          record={record}
          onClose={() => setRemoving(false)}
          onRemoved={() => {
            toast(`${record.name} removed.`);
            navigate(backTo);
          }}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */

/**
 * Removing somebody means different things depending on what they were, so the
 * confirmation asks the server what will happen and reads the answer back. A
 * founder leaves with the application they filed; a juror is lifted off their
 * sittings and the marks they already gave stay behind.
 */
function RemovalDialog({
  record,
  onClose,
  onRemoved,
}: {
  record: DirectoryRecord;
  onClose: () => void;
  onRemoved: () => void;
}) {
  const [plan, setPlan] = useState<RemovalPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  useEffect(() => {
    api
      .get<RemovalPlan>(`/api/records/${record.id}/removal`)
      .then(setPlan)
      .catch((err) => setError((err as Error).message));
  }, [record.id]);

  const lines: string[] = [];
  if (plan) {
    if (plan.account) lines.push(`Their account (${plan.account.email}) and any session open on it.`);
    for (const c of plan.candidacies) lines.push(`The application filed for ${c.orgName || 'an organisation'}.`);
    for (const o of plan.organisations) lines.push(`${o.name} — nobody else holds that page.`);
    for (const p of plan.panels) lines.push(`Taken off ${p.name}. The sitting itself stays.`);
    for (const e of plan.evaluations) lines.push(`Taken off the reviewers of ${e.name}.`);
  }

  return (
    <ConfirmDialog
      title={`Remove ${record.name}?`}
      confirmLabel="Remove"
      destructive
      onClose={onClose}
      body={
        !plan ? (
          <span className="faint">{error ?? 'Working out what goes with them…'}</span>
        ) : plan.blocked.length ? (
          <span>{plan.blocked.join(' ')}</span>
        ) : (
          <span>
            {lines.length ? 'This also goes:' : 'Nothing else hangs off this record.'}
            {lines.length > 0 && (
              <ul style={{ margin: '7px 0 0', paddingLeft: 18, lineHeight: 1.6 }}>
                {lines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            )}
            {plan.scoresKept > 0 && (
              <span className="faint" style={{ display: 'block', marginTop: 8 }}>
                {plan.scoresKept} mark{plan.scoresKept === 1 ? '' : 's'} they already filed stay where they are, under
                the name they were filed with — a published ranking does not move because somebody left.
              </span>
            )}
            <span style={{ display: 'block', marginTop: 8 }}>This cannot be undone.</span>
          </span>
        )
      }
      onConfirm={async () => {
        try {
          await api.del(`/api/records/${record.id}`);
          onRemoved();
        } catch (err) {
          toast((err as Error).message, true);
        }
      }}
    />
  );
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="row" style={{ gap: 10, fontSize: 12.5 }}>
      <span className="faint" style={{ flex: '0 0 84px' }}>
        {label}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>{value}</span>
    </div>
  );
}

/** Attaches an existing record, or creates the other side on the spot. */
function LinkModal({
  record,
  taken,
  onClose,
  onSaved,
}: {
  record: DirectoryRecord;
  taken: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const otherKind: RecordKind = record.kind === 'org' ? 'person' : 'org';
  const options = useAsync(() => api.get<DirectoryRecord[]>(`/api/records?kind=${otherKind}`), otherKind);
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState<string | null>(null);
  const [role, setRole] = useState(record.kind === 'org' ? 'Founder & CEO' : '');
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const list = (options.data ?? [])
    .filter((o) => !taken.includes(o.id))
    .filter((o) => o.name.toLowerCase().includes(query.trim().toLowerCase()))
    .slice(0, 40);

  const link = async (otherId: string) => {
    setSaving(true);
    try {
      await api.post('/api/affiliations', {
        personId: record.kind === 'person' ? record.id : otherId,
        orgId: record.kind === 'org' ? record.id : otherId,
        role,
      });
      toast('Linked.');
      onSaved();
    } catch (err) {
      toast((err as Error).message, true);
    } finally {
      setSaving(false);
    }
  };

  if (creating) {
    return (
      <RecordModal
        kind={otherKind}
        onClose={() => setCreating(false)}
        onSaved={(created) => {
          setCreating(false);
          link(created.id);
        }}
      />
    );
  }

  return (
    <Modal
      title={record.kind === 'org' ? `Who holds ${record.name}?` : `Where does ${record.name} belong?`}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <div className="spacer" />
          <button className="btn" onClick={() => setCreating(true)}>
            <Icon name="plus" size={13} /> Not in the directory yet
          </button>
        </>
      }
    >
      <div className="grid-2">
        <div className="field">
          <label>Search</label>
          <SearchBox value={query} onChange={setQuery} placeholder="Name…" />
        </div>
        <div className="field">
          <label>Role there</label>
          <input className="input" value={role} onChange={(e) => setRole(e.target.value)} placeholder="Founder & CEO" />
        </div>
      </div>

      <div className="rows" style={{ maxHeight: 280, overflow: 'auto' }}>
        {list.map((o) => (
          <button
            key={o.id}
            className={chosen === o.id ? 'rowcard link-row on' : 'rowcard link-row'}
            disabled={saving}
            onClick={() => {
              setChosen(o.id);
              link(o.id);
            }}
          >
            <span className="rec-mark">{initials(o.name)}</span>
            <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
              <span style={{ fontWeight: 600, fontSize: 13 }}>{o.name}</span>
              <span className="faint" style={{ display: 'block', fontSize: 12 }}>
                {o.roles.join(', ') || o.city || '—'}
              </span>
            </span>
            <span className="faint" style={{ fontSize: 11.5 }}>
              {o.origin === 'signup' ? 'Registered' : o.origin === 'import' ? 'File' : 'By hand'}
            </span>
          </button>
        ))}
        {!list.length && <div className="empty">Nobody matches. Create the record instead.</div>}
      </div>
    </Modal>
  );
}
