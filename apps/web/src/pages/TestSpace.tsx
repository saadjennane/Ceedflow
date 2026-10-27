/**
 * L'espace de test, dans les Settings : de fausses startups, de faux comptes,
 * des copies de programmes, et la purge.
 *
 * Everything made here is marked TEST. A test programme is invisible to real
 * members, and its letters only ever go to test addresses — aliases of a
 * colleague's own (saad+jury@…), which land in that colleague's inbox.
 */
import { ACCOUNT_STATE_LABEL, type DirectoryRecord, type ProgramWithEditions, type RecordAccount } from '@ceed/shared';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { Icon } from '../ui/Icon';
import { useToast } from '../ui/Overlays';

interface Sandbox {
  colleagues: string[];
  startups: { record: DirectoryRecord; owner: string }[];
  people: { record: DirectoryRecord; owner: string; account: RecordAccount | null; organisations: string[] }[];
  programs: { id: string; name: string; editions: { id: string; name: string }[] }[];
}

const ROLES = [
  { key: 'founder', label: 'Founder of a test startup' },
  { key: 'applicant', label: 'Founder with no organisation yet' },
  { key: 'jury', label: 'Juror' },
  { key: 'mentor', label: 'Mentor / expert' },
] as const;

export function TestSpace() {
  const sandbox = useAsync(() => api.get<Sandbox>('/api/sandbox'), 'sandbox');
  const programs = useAsync(() => api.get<ProgramWithEditions[]>('/api/programs'), 'programs-for-copy');
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (key: string, work: () => Promise<unknown>, said: string) => {
    setBusy(key);
    try {
      await work();
      toast(said);
      sandbox.reload();
    } catch (err) {
      toast((err as Error).message, true);
    } finally {
      setBusy(null);
    }
  };

  const data = sandbox.data;

  return (
    <section className="card card-pad stack" style={{ maxWidth: 880, gap: 16 }}>
      <div>
        <h2 style={{ fontSize: 16, margin: 0 }}>
          Test space <span className="badge warn">TEST</span>
        </h2>
        <p className="faint" style={{ margin: '2px 0 0', fontSize: 12.5, lineHeight: 1.55 }}>
          Fake startups, fake accounts and copies of programmes, inside the real app. A test programme is invisible to
          real members, and its letters only go to test addresses — aliases of your own, like{' '}
          <code>saad+jury@ceed-morocco.org</code>, which land in your inbox. Anything else it writes is blocked.
        </p>
      </div>

      {sandbox.error && <div className="callout warn">{sandbox.error}</div>}

      {/* ---- Startups ---- */}
      <div className="stack" style={{ gap: 8 }}>
        <div className="row">
          <strong style={{ flex: 1, fontSize: 13.5 }}>Test startups</strong>
          <button
            className="btn sm"
            disabled={busy === 'startups' || (data?.startups.length ?? 0) >= 6}
            onClick={() => run('startups', () => api.post('/api/sandbox/startups', { count: 3 }), 'Three test startups created.')}
          >
            <Icon name="plus" size={13} /> Generate 3
          </button>
        </div>
        {data && !data.startups.length && (
          <p className="faint" style={{ margin: 0, fontSize: 12.5 }}>
            None yet. Each comes with a complete page — sector, team, turnover, funding, needs and two documents.
          </p>
        )}
        <div className="row wrap" style={{ gap: 6 }}>
          {data?.startups.map((s) => (
            <Link key={s.record.id} className="badge" to={`/directory/${s.record.id}`}>
              {s.record.name}
            </Link>
          ))}
        </div>
      </div>

      {/* ---- People ---- */}
      <div className="stack" style={{ gap: 8 }}>
        <strong style={{ fontSize: 13.5 }}>Test accounts</strong>
        <NewPerson startups={data?.startups.map((s) => s.record) ?? []} onMade={sandbox.reload} />
        {data && data.people.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Who</th>
                  <th>Address</th>
                  <th>Role</th>
                  <th>Account</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.people.map((p) => (
                  <tr key={p.record.id}>
                    <td>
                      <Link to={`/directory/${p.record.id}`}>{p.record.name}</Link>
                      {p.organisations.length > 0 && <div className="faint" style={{ fontSize: 11.5 }}>{p.organisations.join(', ')}</div>}
                    </td>
                    <td style={{ fontSize: 12 }}>{p.record.email}</td>
                    <td style={{ fontSize: 12 }}>{p.record.jobTitle}</td>
                    <td>
                      <span className={p.account?.state === 'claimed' ? 'badge ok' : 'badge'}>
                        {p.account ? ACCOUNT_STATE_LABEL[p.account.state] : 'No account'}
                      </span>
                    </td>
                    <td>
                      {p.account?.state !== 'claimed' && (
                        <button
                          className="btn sm"
                          disabled={busy === p.record.id}
                          title="Mail a fresh password to this address"
                          onClick={() =>
                            run(p.record.id, () => api.post(`/api/sandbox/people/${p.record.id}/access`), `Password sent to ${p.record.email}.`)
                          }
                        >
                          <Icon name="send" size={13} /> Resend access
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ---- Programmes ---- */}
      <div className="stack" style={{ gap: 8 }}>
        <strong style={{ fontSize: 13.5 }}>Test programmes</strong>
        <NewProgram
          editions={(programs.data ?? [])
            .filter((p) => !p.isTest)
            .flatMap((p) => p.editions.map((e) => ({ id: e.id, label: `${p.name} — ${e.name}` })))}
          onMade={sandbox.reload}
        />
        <div className="row wrap" style={{ gap: 6 }}>
          {data?.programs.map((p) => (
            <Link key={p.id} className="badge warn" to={`/programs/${p.id}`}>
              {p.name}
            </Link>
          ))}
        </div>
      </div>

      {/* ---- Purge ---- */}
      <Purge onDone={sandbox.reload} />
    </section>
  );
}

function NewPerson({ startups, onMade }: { startups: DirectoryRecord[]; onMade: () => void }) {
  const empty = { email: '', firstName: '', lastName: '', role: 'founder' as (typeof ROLES)[number]['key'], orgId: '' };
  const [draft, setDraft] = useState(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const set = (p: Partial<typeof draft>) => {
    setDraft((d) => ({ ...d, ...p }));
    // Ce qu'on corrige cesse d'être signalé.
    setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !(k in p))));
  };

  const save = async () => {
    setSaving(true);
    setErrors({});
    try {
      await api.post('/api/sandbox/people', { ...draft, orgId: draft.role === 'founder' ? draft.orgId || null : null });
      toast(`Account opened — the password is on its way to ${draft.email}.`);
      setDraft(empty);
      onMade();
    } catch (err) {
      if (err instanceof ApiError && err.fields) setErrors(err.fields);
      toast((err as Error).message, true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rowcard stack" style={{ gap: 8 }}>
      <div className="row wrap" style={{ gap: 8 }}>
        <input
          className={errors.email ? 'input bad' : 'input'}
          style={{ flex: 2, minWidth: 220 }}
          name="email"
          type="email"
          placeholder="saad+jury@ceed-morocco.org"
          aria-label="Test address"
          value={draft.email}
          onChange={(e) => set({ email: e.target.value })}
        />
        <input name="firstName" className={errors.firstName ? 'input bad' : 'input'} style={{ flex: 1, minWidth: 120 }} placeholder="First name" aria-label="First name" value={draft.firstName} onChange={(e) => set({ firstName: e.target.value })} />
        <input name="lastName" className={errors.lastName ? 'input bad' : 'input'} style={{ flex: 1, minWidth: 120 }} placeholder="Last name" aria-label="Last name" value={draft.lastName} onChange={(e) => set({ lastName: e.target.value })} />
      </div>
      <div className="row wrap" style={{ gap: 8 }}>
        <select className="input" style={{ flex: 1, minWidth: 200 }} aria-label="Role" value={draft.role} onChange={(e) => set({ role: e.target.value as typeof draft.role })}>
          {ROLES.map((r) => (
            <option key={r.key} value={r.key}>
              {r.label}
            </option>
          ))}
        </select>
        {draft.role === 'founder' && (
          <select
            className={errors.orgId ? 'input bad' : 'input'}
            style={{ flex: 1, minWidth: 200 }}
            name="orgId"
            aria-label="Startup"
            value={draft.orgId}
            onChange={(e) => set({ orgId: e.target.value })}
          >
            <option value="">{startups.length ? 'Which test startup…' : 'Generate test startups first'}</option>
            {startups.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}
        <button className="btn primary" disabled={saving || !draft.email.trim() || !draft.firstName.trim()} onClick={save}>
          {saving ? 'Opening…' : 'Open the account'}
        </button>
      </div>
      <span className={Object.keys(errors).length ? '' : 'faint'} style={{ fontSize: 11.5, color: Object.keys(errors).length ? 'var(--stop)' : undefined }}>
        {Object.values(errors)[0] ?? 'An alias of a CEED colleague’s address, with a “+”: the password and every letter land in their inbox.'}
      </span>
    </div>
  );
}

function NewProgram({ editions, onMade }: { editions: { id: string; label: string }[]; onMade: () => void }) {
  const [from, setFrom] = useState('');
  const [tomorrow, setTomorrow] = useState(true);
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const make = async () => {
    setSaving(true);
    try {
      await api.post('/api/sandbox/programs', { fromEditionId: from || null, startTomorrow: tomorrow });
      toast(from ? 'Copied into a test programme.' : 'Test programme created.');
      onMade();
    } catch (err) {
      toast((err as Error).message, true);
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="row wrap" style={{ gap: 8 }}>
      <select className="input" style={{ flex: 1, minWidth: 260 }} aria-label="Copy from" value={from} onChange={(e) => setFrom(e.target.value)}>
        <option value="">A fresh selection funnel</option>
        {editions.map((e) => (
          <option key={e.id} value={e.id}>
            Copy of {e.label}
          </option>
        ))}
      </select>
      {from && (
        <label className="row" style={{ gap: 6, fontSize: 12.5 }} title="Every date moves by the same number of days, so the copy opens tomorrow">
          <input type="checkbox" checked={tomorrow} onChange={(e) => setTomorrow(e.target.checked)} /> Start tomorrow
        </label>
      )}
      <button className="btn" disabled={saving} onClick={make}>
        <Icon name="copy" size={13} /> {saving ? 'Creating…' : 'Create test programme'}
      </button>
      {from && (
        <span className="faint" style={{ fontSize: 11.5, flexBasis: '100%' }}>
          Questions, criteria, letters, sittings and One to One days are copied. Jurors, interlocutors and mentors are
          left empty — put test accounts in their place.
        </span>
      )}
    </div>
  );
}

function Purge({ onDone }: { onDone: () => void }) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const purge = async () => {
    setBusy(true);
    try {
      const out = await api.post<{ programs: number; records: number }>('/api/sandbox/purge', { confirm: typed });
      toast(`Purged: ${out.programs} programme(s), ${out.records} test record(s).`);
      setTyped('');
      onDone();
    } catch (err) {
      toast((err as Error).message, true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="callout warn" style={{ alignItems: 'center' }}>
      <Icon name="trash" size={15} />
      <div style={{ flex: 1, fontSize: 12.5 }}>
        <strong>Purge the test space.</strong> Deletes every test programme, startup, account, file and held letter —
        and nothing real. It cannot be undone.
      </div>
      <input className="input" style={{ width: 110 }} placeholder="PURGER" aria-label="Type PURGER" value={typed} onChange={(e) => setTyped(e.target.value)} />
      <button className="btn" disabled={busy || typed !== 'PURGER'} onClick={purge}>
        Purge
      </button>
    </div>
  );
}
