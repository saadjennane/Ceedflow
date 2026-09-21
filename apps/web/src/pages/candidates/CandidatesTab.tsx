import {
  orderedBlocks,
  type ApplicationConfig,
  type Block,
  type BlockOutcome,
  type EvaluationConfig,
  type Candidate,
  type EditionDetail,
  type FormField,
  type TrackWithPhases,
} from '@ceed/shared';
import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AccountBadge } from '../directory/AccountCard';
import { api } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { TextField } from '../../ui/Field';
import { FormFieldInput } from '../../ui/FormField';
import { Icon } from '../../ui/Icon';
import { SearchBox } from '../../ui/SearchBox';
import { ConfirmDialog, Drawer, Modal, useToast } from '../../ui/Overlays';
import { CohortTable } from './CohortTable';

interface FunnelStep {
  blockId: string;
  name: string;
  type: string;
  count: number;
}

/** One candidate at one step, wearing the word that step gives them. */
interface RosterRow {
  candidate: Candidate;
  status: { label: string; tone: 'ok' | 'warn' | 'stop' | 'neutral'; from: string; blockId: string } | null;
  /** The block whose vocabulary applies here, whether or not a word was given. */
  decidesAt: { id: string; name: string } | null;
}

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
  /* Keyed on a tick rather than on how many candidates there are: a verdict
     changing moves the funnel and the words in it without adding or removing a
     single row, and keying on the count left both of them stale. */
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => {
    setTick((n) => n + 1);
    onChanged();
  }, [onChanged]);

  const funnel = useAsync(
    () => api.get<FunnelStep[]>(`/api/editions/${edition.id}/funnel?trackId=${track.id}`),
    `${edition.id}:${track.id}:${candidates.length}:${tick}`,
  );
  /* A step is a place you can stand, not a number you read. Opening one shows
     who is there and the verdict of the work done on them — which is a
     different word at each step, on purpose. */
  const [picked, setStepId] = useState<string | null>(null);
  // There is no view of the funnel from nowhere: the deepest step is where the
  // work is, so that is what opens until somebody picks another.
  const steps = funnel.data ?? [];
  const stepId = picked ?? steps[steps.length - 1]?.blockId ?? null;
  const step = steps.find((f) => f.blockId === stepId) ?? null;
  const roster = useAsync(
    () => (stepId ? api.get<RosterRow[]>(`/api/blocks/${stepId}/roster`) : Promise.resolve(null)),
    `${stepId ?? 'none'}:${candidates.length}:${tick}`,
  );
  /* One vocabulary, and it is yours: the word a candidate wears at this step,
     given by the block that judged them. */
  const rowFor = (id: string) => roster.data?.find((r) => r.candidate.id === id) ?? null;
  const wordFor = (id: string) => rowFor(id)?.status ?? null;
  const wordsInPlay = useMemo(
    () => [...new Set((roster.data ?? []).map((r) => r.status?.label).filter(Boolean) as string[])].sort(),
    [roster.data],
  );

  const fields = useMemo(() => {
    const blocks = orderedBlocks(track).filter((b) => b.type === 'application');
    return blocks.flatMap((b) => (b.config as ApplicationConfig).fields);
  }, [track]);

  // The cohort is not another list: it is the candidates a Selection marked
  // Selected, across every track. The funnel below it is the track's.
  const cohort = candidates.filter((c) => c.status === 'Selected');
  const inTrack = candidates.filter((c) => c.trackId === track.id);
  // Once a cohort exists it is what the team looks at, so it opens first — but
  // only until someone picks, and never decided before the data has arrived.
  const [chosen, setSegment] = useState<'all' | 'cohort' | null>(null);
  const segment = chosen ?? (cohort.length ? 'cohort' : 'all');
  const atStep = roster.data ? roster.data.map((r) => r.candidate) : inTrack;
  const scope = segment === 'cohort' ? cohort : atStep;

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
    // Sorted so the ones still to chase come first.
    if (key === 'accountState') return candidate.accountState ?? '';
    if (key === 'status') return wordFor(candidate.id)?.label ?? '';
    if (key === 'source') return candidate.source;
    if (key === 'submittedAt') return candidate.submittedAt;
    const raw = candidate.answers[key];
    if (Array.isArray(raw)) return raw.join(', ');
    return (raw as string | number) ?? '';
  };

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = scope.filter((c) => {
      if (status && wordFor(c.id)?.label !== status) return false;
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
  }, [scope, query, status, sort, roster.data]);

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
    <div className="stack" style={{ gap: 18 }}>
      <div className="row">
        <div className="work-pick">
          {cohort.length > 0 && (
            <button className={segment === 'cohort' ? 'track on' : 'track'} onClick={() => setSegment('cohort')}>
              Cohort <span className="num">{cohort.length}</span>
            </button>
          )}
          <button className={segment === 'all' ? 'track on' : 'track'} onClick={() => setSegment('all')}>
            Candidates <span className="num">{inTrack.length}</span>
          </button>
        </div>
        <div className="spacer" />
        {segment === 'all' && (
          <button className="btn primary sm" onClick={() => setAdding(true)}>
            <Icon name="plus" size={13} /> Add candidate
          </button>
        )}
      </div>

      {segment === 'cohort' && (
        <CohortTable edition={edition} members={cohort} fields={fields} onChanged={onChanged} />
      )}

      {segment === 'all' && funnel.data && funnel.data.length > 1 && (
        <div className="funnel">
          {funnel.data.map((step, i) => (
            <div key={step.blockId} style={{ display: 'contents' }}>
              {i > 0 && (
                <div className="funnel-arrow">
                  <Icon name="arrowRight" size={16} />
                </div>
              )}
              <button
                type="button"
                className={step.blockId === stepId ? 'funnel-step on' : 'funnel-step'}
                onClick={() => setStepId(step.blockId === stepId ? null : step.blockId)}
              >
                <div className="eyebrow">{step.name}</div>
                <div className="n">{step.count}</div>
              </button>
            </div>
          ))}
        </div>
      )}

      {segment === 'all' && (
      <div className="row wrap">
        <SearchBox placeholder="Search candidates" value={query} onChange={setQuery} />
        {/* The statuses actually in play at this step, not a fixed list. */}
        <select className="status-select" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="">Every status</option>
          {wordsInPlay.map((w) => (
            <option key={w} value={w}>
              {w}
            </option>
          ))}
        </select>
        <span className="faint" style={{ fontSize: 12.5 }}>
          <span className="num">{rows.length}</span> of <span className="num">{scope.length}</span>
          {step ? ` at ${step.name}` : ''}
        </span>
        <div className="spacer" />
        <button className="btn" onClick={() => setPicking(true)} disabled={!fields.length}>
          <Icon name="grid" size={14} /> Columns
        </button>
      </div>
      )}

      {segment === 'all' && (!scope.length ? (
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
                {header('accountState', 'Account')}
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
                  <td>
                    <AccountBadge
                      account={
                        candidate.accountState
                          ? { id: '', email: candidate.email, state: candidate.accountState, invitedAt: null, createdAt: '' }
                          : null
                      }
                    />
                  </td>
                  {columns.map((id) => (
                    <td key={id} className="muted">
                      {String(value(candidate, id) || '—')}
                    </td>
                  ))}
                  <td className="muted">{candidate.source || '—'}</td>
                  <td>
                    {(() => {
                      const word = wordFor(candidate.id);
                      return word ? (
                        <span
                          className={word.tone === 'neutral' ? 'badge' : `badge ${word.tone}`}
                          title={`Given by ${word.from}`}
                        >
                          {word.label}
                        </span>
                      ) : (
                        <span className="badge">No verdict yet</span>
                      );
                    })()}
                  </td>
                  <td className="muted">{formatDate(candidate.submittedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

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
          word={wordFor(open.id)}
          decidesAt={rowFor(open.id)?.decidesAt ?? null}
          fields={fields}
          onClose={() => setOpenId(null)}
          // Changing a verdict is not a reason to shut the drawer — you often
          // want to see the new word land beside the startup you are reading.
          onChanged={refresh}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function CandidateDrawer({
  candidate,
  word,
  decidesAt,
  fields,
  onClose,
  onChanged,
}: {
  candidate: Candidate;
  /** The word it wears at the open step — your vocabulary, not the plumbing's. */
  word: RosterRow['status'];
  /** Where the words come from at this step, whether or not one was given. */
  decidesAt: RosterRow['decidesAt'];
  fields: FormField[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [edits, setEdits] = useState<Record<string, unknown>>(candidate.answers);
  /* The contact lives on a person in the directory, not on this row — so
     editing it writes there, and creates the person when the candidacy never
     had one. Imported and hand-typed candidacies both arrive that way. */
  const [who, setWho] = useState({
    contactName: candidate.contactName,
    email: candidate.email,
    phone: candidate.phone,
    source: candidate.source,
  });

  const saveAll = async () => {
    setBusy(true);
    try {
      let personId = candidate.personId;
      if (who.contactName.trim()) {
        if (personId) {
          await api.patch(`/api/records/${personId}`, {
            name: who.contactName.trim(),
            email: who.email.trim(),
            phone: who.phone.trim(),
          });
        } else {
          const person = await api.post<{ id: string }>('/api/records', {
            kind: 'person',
            name: who.contactName.trim(),
            email: who.email.trim(),
            phone: who.phone.trim(),
            origin: 'manual',
            affiliateTo: candidate.orgId,
            affiliationRole: 'Founder',
            // The contact of a candidacy runs that organisation's page.
            affiliationAccess: 'admin',
          });
          personId = person.id;
        }
      }
      await api.patch(`/api/candidates/${candidate.id}`, {
        answers: edits,
        source: who.source,
        ...(personId && personId !== candidate.personId ? { personId } : {}),
      });
      toast(`${candidate.orgName} updated.`);
      setEditing(false);
      onChanged();
    } catch (err) {
      toast((err as Error).message, true);
    } finally {
      setBusy(false);
    }
  };
  const toast = useToast();

  /* The statuses the deciding block hands out — read from that block, so the
     drawer offers exactly what the review screen would. */
  /* Where the verdict is written: the block that gave the current word, else
     the one that hands them out at this step. Without the fallback the whole
     list of statuses disappeared the moment a startup had none. */
  const verdictBlockId = word?.blockId ?? decidesAt?.id ?? null;
  const deciding = useAsync(
    () => (verdictBlockId ? api.get<Block>(`/api/blocks/${verdictBlockId}`) : Promise.resolve(null)),
    verdictBlockId ?? 'none',
  );
  const choices = ((deciding.data?.config as EvaluationConfig | undefined)?.outcomes ?? []) as BlockOutcome[];

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
          {word ? (
            <span
              className={word.tone === 'neutral' ? 'badge' : `badge ${word.tone}`}
              title={`Given by ${word.from}`}
            >
              {word.label}
            </span>
          ) : (
            <span className="badge">No verdict yet</span>
          )}
          {candidate.source && <span className="badge">{candidate.source}</span>}
        </div>

        {/* Your words, not the plumbing's: this sets the verdict of the block
            that judged them, which is the same override the review screen
            offers. It used to list a closed vocabulary nobody here chose. */}
        {verdictBlockId && choices.length > 0 && (
          <div className="field">
            <label>Its status at {word?.from ?? decidesAt?.name ?? 'this step'}</label>
            <div className="help">
              Set by hand here, exactly as it would be from the review screen. A later score does not undo it.
            </div>
            <select
              className="select"
              value={choices.find((o) => o.label === word?.label)?.id ?? ''}
              disabled={busy}
              onChange={async (e) => {
                if (!e.target.value) return;
                setBusy(true);
                try {
                  await api.post(`/api/blocks/${verdictBlockId}/outcomes`, {
                    candidateId: candidate.id,
                    outcomeId: e.target.value,
                  });
                  toast(`${candidate.orgName} · ${choices.find((o) => o.id === e.target.value)?.label ?? 'updated'}.`);
                  onChanged();
                } catch (err) {
                  toast((err as Error).message, true);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {/* Only until somebody decides — never a word you can pick. */}
              {!choices.some((o) => o.label === word?.label) && <option value="">No status yet</option>}
              {choices.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Withdrawal is not a step of the funnel, it is a startup leaving it. */}
        {candidate.status !== 'Withdrawn' ? (
          <button
            className="btn ghost"
            style={{ color: 'var(--stop)', alignSelf: 'flex-start' }}
            onClick={async () => {
              await api.patch(`/api/candidates/${candidate.id}`, { status: 'Withdrawn' });
              toast(`${candidate.orgName} withdrew.`);
              onChanged();
            }}
          >
            <Icon name="x" size={13} /> Mark as withdrawn
          </button>
        ) : (
          <div className="callout warn">
            <Icon name="alert" size={15} />
            <div>
              <strong>Withdrawn.</strong> It is out of every list, every panel and every selection.{' '}
              <button
                className="linkish"
                onClick={async () => {
                  await api.patch(`/api/candidates/${candidate.id}`, { status: 'Applied' });
                  toast(`${candidate.orgName} is back in.`);
                  onChanged();
                }}
              >
                Bring it back
              </button>
            </div>
          </div>
        )}

        <div className="public-sep" />

        <div className="row">
          <h3 className="section-title" style={{ flex: 1 }}>Contact</h3>
          {/* A record typed in by hand is rarely right the first time, and
              correcting it used to mean deleting it and starting over. One
              toggle, because contact and answers are one record to you. */}
          <button className="btn sm" onClick={() => setEditing((e) => !e)}>
            <Icon name={editing ? 'x' : 'edit'} size={13} /> {editing ? 'Stop editing' : 'Edit this record'}
          </button>
        </div>
        {editing ? (
          <>
            <TextField label="Contact" value={who.contactName} onChange={(v) => setWho((w) => ({ ...w, contactName: v }))} />
            <div className="grid-2">
              <TextField label="Email" type="email" value={who.email} onChange={(v) => setWho((w) => ({ ...w, email: v }))} />
              <TextField label="Phone" value={who.phone} onChange={(v) => setWho((w) => ({ ...w, phone: v }))} />
            </div>
            <TextField label="Source" value={who.source} onChange={(v) => setWho((w) => ({ ...w, source: v }))} />
            <p className="faint" style={{ margin: 0, fontSize: 12 }}>
              This writes to the person in the directory, which is where the contact actually lives.
              {candidate.personId && (
                <>
                  {' '}
                  <Link to={`/directory/${candidate.personId}`}>Open their record</Link> for the rest — roles, city,
                  their other organisations.
                </>
              )}
            </p>
          </>
        ) : (
          <dl className="answers">
            <dt>Contact</dt>
            <dd>{candidate.contactName || '—'}</dd>
            <dt>Email</dt>
            <dd>{candidate.email || '—'}</dd>
            <dt>Phone</dt>
            <dd>{candidate.phone || '—'}</dd>
            <dt>Source</dt>
            <dd>{candidate.source || '—'}</dd>
          </dl>
        )}

        <h3 className="section-title">Application</h3>

        {editing ? (
          <>
            {fields.map((field) => (
              <FormFieldInput
                key={field.id}
                field={{ ...field, required: false }}
                value={edits[field.id]}
                onChange={(v) => setEdits((a) => ({ ...a, [field.id]: v }))}
              />
            ))}
            <div className="row" style={{ gap: 7 }}>
              <button className="btn primary sm" disabled={busy} onClick={saveAll}>
                {busy ? 'Saving…' : 'Save'}
              </button>
              <button
                className="btn ghost sm"
                onClick={() => {
                  setEdits(candidate.answers);
                  setWho({
                    contactName: candidate.contactName,
                    email: candidate.email,
                    phone: candidate.phone,
                    source: candidate.source,
                  });
                  setEditing(false);
                }}
              >
                Cancel
              </button>
            </div>
          </>
        ) : answered.length ? (
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
            Nothing answered yet — this candidacy was typed in rather than filed through the form.
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
            onClose();
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
  const [draft, setDraft] = useState({
    orgName: '', contactName: '', email: '', phone: '', role: 'Founder', source: '',
  });
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  /** Co-founders land as people affiliated to the organisation, like a team. */
  const [team, setTeam] = useState<{ name: string; role: string; email: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const set = (patch: Partial<typeof draft>) => setDraft((d) => ({ ...d, ...patch }));

  /* The whole form, not a fragment of it. This used to offer only the
     multiple-choice questions, so a candidacy typed in by hand lost its
     description, its figures and its stage — and then looked, in the table,
     like an application that had answered nothing. */

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
                await api.post(`/api/editions/${editionId}/candidates`, {
                  orgName: draft.orgName,
                  source: draft.source,
                  contact: {
                    name: draft.contactName,
                    email: draft.email,
                    phone: draft.phone,
                    role: draft.role,
                  },
                  team: team.filter((m) => m.name.trim()),
                  trackId,
                  answers,
                });
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
        <TextField label="Their role" value={draft.role} onChange={(v) => set({ role: v })} placeholder="CEO" />
      </div>
      <TextField label="Source" value={draft.source} onChange={(v) => set({ source: v })} placeholder="Partner referral" />

      {/* Co-founders are people on the organisation, not answers on a form —
          the same place the founder's own team page writes to. */}
      <div className="field">
        <label>Co-founders</label>
        <div className="hint">They join the startup's page, and the jury reads them there.</div>
        <div className="stack" style={{ gap: 7, marginTop: 6 }}>
          {team.map((mate, i) => (
            <div className="row" style={{ gap: 7 }} key={i}>
              <input
                className="input"
                placeholder="Full name"
                value={mate.name}
                onChange={(e) => setTeam((t) => t.map((m, j) => (j === i ? { ...m, name: e.target.value } : m)))}
              />
              <input
                className="input"
                style={{ maxWidth: 130 }}
                placeholder="Role"
                value={mate.role}
                onChange={(e) => setTeam((t) => t.map((m, j) => (j === i ? { ...m, role: e.target.value } : m)))}
              />
              <input
                className="input"
                type="email"
                placeholder="Email"
                value={mate.email}
                onChange={(e) => setTeam((t) => t.map((m, j) => (j === i ? { ...m, email: e.target.value } : m)))}
              />
              <button className="btn ghost icon sm" aria-label="Remove" onClick={() => setTeam((t) => t.filter((_, j) => j !== i))}>
                <Icon name="trash" size={13} />
              </button>
            </div>
          ))}
          <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => setTeam((t) => [...t, { name: '', role: '', email: '' }])}>
            <Icon name="plus" size={13} /> Add a co-founder
          </button>
        </div>
      </div>
      {fields.length > 0 && (
        <>
          <div className="public-sep" />
          <p className="faint" style={{ margin: 0, fontSize: 12.5 }}>
            The same questions the form asks. Leave blank what you do not have.
          </p>
          {fields.map((field) => (
            <FormFieldInput
              key={field.id}
              field={{ ...field, required: false }}
              value={answers[field.id]}
              onChange={(v) => setAnswers((a) => ({ ...a, [field.id]: v }))}
            />
          ))}
        </>
      )}
    </Modal>
  );
}
