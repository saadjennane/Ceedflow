import {
  CANDIDATE_STATUSES,
  STATUS_TONE,
  orderedBlocks,
  type ApplicationConfig,
  type Candidate,
  type CandidateStatus,
  type EditionDetail,
  type FormField,
  type TrackWithPhases,
} from '@ceed/shared';
import { useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { SelectField, TextField } from '../../ui/Field';
import { Icon } from '../../ui/Icon';
import { ConfirmDialog, Drawer, Modal, useToast } from '../../ui/Overlays';

interface FunnelStep {
  blockId: string;
  name: string;
  type: string;
  count: number;
}

const tone = (status: CandidateStatus) => {
  const t = STATUS_TONE[status];
  return t === 'neutral' ? 'badge' : `badge ${t}`;
};

export function CandidatesTab({
  edition,
  track,
  candidates,
  onChanged,
}: {
  edition: EditionDetail;
  track: TrackWithPhases;
  candidates: Candidate[];
  onChanged: () => void;
}) {
  const funnel = useAsync(
    () => api.get<FunnelStep[]>(`/api/editions/${edition.id}/funnel?trackId=${track.id}`),
    `${edition.id}:${track.id}:${candidates.length}`,
  );

  const fields = useMemo(() => {
    const blocks = orderedBlocks(track).filter((b) => b.type === 'application');
    return blocks.flatMap((b) => (b.config as ApplicationConfig).fields);
  }, [track]);

  const [shown, setShown] = useState<string[] | null>(null);
  const columns = shown ?? fields.filter((f) => f.showInTable).map((f) => f.id);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>({ key: 'orgName', dir: 1 });
  const [openId, setOpenId] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [adding, setAdding] = useState(false);

  const value = (candidate: Candidate, key: string): string | number => {
    if (key === 'orgName') return candidate.orgName;
    if (key === 'contactName') return candidate.contactName;
    if (key === 'status') return candidate.status;
    if (key === 'source') return candidate.source;
    if (key === 'submittedAt') return candidate.submittedAt;
    const raw = candidate.answers[key];
    if (Array.isArray(raw)) return raw.join(', ');
    return (raw as string | number) ?? '';
  };

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = candidates.filter((c) => {
      if (status && c.status !== status) return false;
      if (!needle) return true;
      return [c.orgName, c.contactName, c.email, c.source, ...Object.values(c.answers).map(String)]
        .join(' ')
        .toLowerCase()
        .includes(needle);
    });
    return filtered.sort((a, b) => {
      const av = value(a, sort.key);
      const bv = value(b, sort.key);
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * sort.dir;
      return String(av).localeCompare(String(bv), undefined, { numeric: true }) * sort.dir;
    });
  }, [candidates, query, status, sort]);

  const open = candidates.find((c) => c.id === openId) ?? null;

  const header = (key: string, label: string, align?: 'right') => (
    <th
      key={key}
      style={{ textAlign: align, cursor: 'pointer' }}
      onClick={() => setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: 1 }))}
    >
      {label}
      {sort.key === key && <Icon name={sort.dir === 1 ? 'chevronDown' : 'chevronRight'} size={11} />}
    </th>
  );

  return (
    <div className="page">
      {funnel.data && funnel.data.length > 1 && (
        <div className="funnel">
          {funnel.data.map((step, i) => (
            <div key={step.blockId} style={{ display: 'contents' }}>
              {i > 0 && (
                <div className="funnel-arrow">
                  <Icon name="arrowRight" size={16} />
                </div>
              )}
              <div className="funnel-step">
                <div className="eyebrow">{step.name}</div>
                <div className="n">{step.count}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="row wrap">
        <div className="search">
          <Icon name="search" size={14} />
          <input
            placeholder="Search candidates"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search candidates"
          />
        </div>
        <select className="status-select" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="">Every status</option>
          {CANDIDATE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <span className="faint num" style={{ fontSize: 12.5 }}>
          {rows.length} of {candidates.length}
        </span>
        <div className="spacer" />
        <button className="btn" onClick={() => setPicking(true)} disabled={!fields.length}>
          <Icon name="grid" size={14} /> Columns
        </button>
        <button className="btn primary" onClick={() => setAdding(true)}>
          <Icon name="plus" /> Add candidate
        </button>
      </div>

      {!candidates.length ? (
        <div className="empty">
          <h3>No candidate yet</h3>
          <p>
            Publish the application form in the builder and share its link, or add a candidate by hand if the
            application came in another way.
          </p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                {header('orgName', 'Organisation')}
                {header('contactName', 'Contact')}
                {columns.map((id) => {
                  const field = fields.find((f) => f.id === id);
                  return field ? header(field.id, field.label) : null;
                })}
                {header('source', 'Source')}
                {header('status', 'Status')}
                {header('submittedAt', 'Received')}
              </tr>
            </thead>
            <tbody>
              {rows.map((candidate) => (
                <tr key={candidate.id} style={{ cursor: 'pointer' }} onClick={() => setOpenId(candidate.id)}>
                  <td className="name">{candidate.orgName}</td>
                  <td className="muted">{candidate.contactName || '—'}</td>
                  {columns.map((id) => (
                    <td key={id} className="muted">
                      {String(value(candidate, id) || '—')}
                    </td>
                  ))}
                  <td className="muted">{candidate.source || '—'}</td>
                  <td>
                    <span className={tone(candidate.status)}>{candidate.status}</span>
                  </td>
                  <td className="muted">{formatDate(candidate.submittedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {picking && (
        <Modal
          title="Columns"
          subtitle="Any question on the application form can become a column."
          onClose={() => setPicking(false)}
          footer={
            <>
              <button className="btn ghost" onClick={() => setShown(fields.filter((f) => f.showInTable).map((f) => f.id))}>
                Reset
              </button>
              <div className="spacer" />
              <button className="btn primary" onClick={() => setPicking(false)}>
                Done
              </button>
            </>
          }
        >
          <div className="rows">
            {fields.map((field) => (
              <label className="check rowcard" style={{ padding: '9px 11px' }} key={field.id}>
                <input
                  type="checkbox"
                  checked={columns.includes(field.id)}
                  onChange={(e) =>
                    setShown(e.target.checked ? [...columns, field.id] : columns.filter((id) => id !== field.id))
                  }
                />
                <span style={{ fontSize: 13 }}>{field.label}</span>
              </label>
            ))}
          </div>
        </Modal>
      )}

      {adding && (
        <AddCandidateModal
          editionId={edition.id}
          trackId={track.id}
          fields={fields}
          onClose={() => setAdding(false)}
          onCreated={onChanged}
        />
      )}

      {open && (
        <CandidateDrawer
          candidate={open}
          fields={fields}
          onClose={() => setOpenId(null)}
          onChanged={() => {
            onChanged();
            setOpenId(null);
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function CandidateDrawer({
  candidate,
  fields,
  onClose,
  onChanged,
}: {
  candidate: Candidate;
  fields: FormField[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const toast = useToast();

  const answered = fields.filter((f) => {
    const value = candidate.answers[f.id];
    return value !== undefined && value !== '' && !(Array.isArray(value) && !value.length);
  });

  return (
    <>
      <Drawer
        title={candidate.orgName}
        subtitle={`${candidate.contactName || 'No contact'} · received ${formatDate(candidate.submittedAt)}`}
        onClose={onClose}
        footer={
          <>
            <button className="btn danger sm" onClick={() => setConfirm(true)}>
              <Icon name="trash" size={13} /> Delete
            </button>
            <div className="spacer" />
            <button className="btn ghost" onClick={onClose}>
              Close
            </button>
          </>
        }
      >
        <div className="row wrap">
          <span className={tone(candidate.status)}>{candidate.status}</span>
          {candidate.source && <span className="badge">{candidate.source}</span>}
        </div>

        <div className="field">
          <label>Status</label>
          <div className="help">
            Statuses are normally written by a selection when it is published. Change it here only to record something
            that happened outside the funnel — a withdrawal, for instance.
          </div>
          <select
            className="select"
            value={candidate.status}
            onChange={async (e) => {
              await api.patch(`/api/candidates/${candidate.id}`, { status: e.target.value });
              toast(`${candidate.orgName} marked ${e.target.value.toLowerCase()}.`);
              onChanged();
            }}
          >
            {CANDIDATE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div className="public-sep" />

        <h3 className="section-title">Contact</h3>
        <dl className="answers">
          <dt>Contact</dt>
          <dd>{candidate.contactName || '—'}</dd>
          <dt>Email</dt>
          <dd>{candidate.email || '—'}</dd>
          <dt>Phone</dt>
          <dd>{candidate.phone || '—'}</dd>
        </dl>

        <h3 className="section-title">Application</h3>
        {answered.length ? (
          <dl className="answers">
            {answered.map((field) => (
              <div key={field.id} style={{ display: 'contents' }}>
                <dt>{field.label}</dt>
                <dd>{String(candidate.answers[field.id])}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="faint" style={{ margin: 0 }}>
            No answer recorded — this candidate was added by hand.
          </p>
        )}
      </Drawer>

      {confirm && (
        <ConfirmDialog
          title={`Delete ${candidate.orgName}?`}
          body="Their application, scores and decisions go with them."
          confirmLabel="Delete candidate"
          destructive
          onClose={() => setConfirm(false)}
          onConfirm={async () => {
            await api.del(`/api/candidates/${candidate.id}`);
            toast('Candidate deleted.');
            onChanged();
          }}
        />
      )}
    </>
  );
}

function AddCandidateModal({
  editionId,
  trackId,
  fields,
  onClose,
  onCreated,
}: {
  editionId: string;
  trackId: string;
  fields: FormField[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [draft, setDraft] = useState({ orgName: '', contactName: '', email: '', phone: '', source: '' });
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const set = (patch: Partial<typeof draft>) => setDraft((d) => ({ ...d, ...patch }));

  const choiceFields = fields.filter((f) => f.type === 'select');

  return (
    <Modal
      title="Add a candidate"
      subtitle="For an application that arrived outside the form — by email, at an event, through a partner."
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            disabled={saving || !draft.orgName.trim()}
            onClick={async () => {
              setSaving(true);
              try {
                await api.post(`/api/editions/${editionId}/candidates`, { ...draft, trackId, answers });
                toast(`${draft.orgName} added.`);
                onCreated();
                onClose();
              } catch (err) {
                toast((err as Error).message, true);
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? 'Adding…' : 'Add candidate'}
          </button>
        </>
      }
    >
      <TextField label="Organisation" value={draft.orgName} onChange={(v) => set({ orgName: v })} placeholder="SportIQ" />
      <div className="grid-2">
        <TextField label="Contact" value={draft.contactName} onChange={(v) => set({ contactName: v })} />
        <TextField label="Email" value={draft.email} onChange={(v) => set({ email: v })} type="email" />
      </div>
      <div className="grid-2">
        <TextField label="Phone" value={draft.phone} onChange={(v) => set({ phone: v })} />
        <TextField label="Source" value={draft.source} onChange={(v) => set({ source: v })} placeholder="Partner referral" />
      </div>
      {choiceFields.map((field) => (
        <SelectField
          key={field.id}
          label={field.label}
          value={(answers[field.id] as string) ?? ''}
          onChange={(v) => setAnswers((a) => ({ ...a, [field.id]: v }))}
          placeholder="Not answered"
          options={field.options.map((o) => ({ value: o, label: o }))}
        />
      ))}
    </Modal>
  );
}
