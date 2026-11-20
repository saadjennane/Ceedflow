/**
 * CEED Global : le réseau d'un coup d'œil, ses programmes, et ses centres.
 *
 * Trois onglets, pas un outil de BI : les quatre chiffres qui disent la taille
 * du réseau, chaque centre sur une ligne qui y mène, les programmes réunis, et
 * l'endroit où l'on crée un centre et nomme qui l'administre.
 */
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ApiError, api } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { enterCenter } from '../../lib/network';
import { useAsync } from '../../lib/useAsync';
import { Icon } from '../../ui/Icon';
import { Modal, useToast } from '../../ui/Overlays';
import '../../ui/directory.css';

interface CenterLine {
  id: string;
  name: string;
  country: string;
  city: string;
  description: string;
  status: 'active' | 'inactive';
  mailName: string;
  replyTo: string;
  createdAt: string;
  activePrograms: number;
  completedPrograms: number;
  startups: number;
  members: number;
}

interface Overview {
  totals: { centers: number; programs: number; startups: number; members: number };
  centers: CenterLine[];
}

interface NetworkProgram {
  id: string;
  name: string;
  colour: string;
  centerId: string;
  centerName: string;
  status: 'Draft' | 'Live' | 'Completed';
  startsOn: string | null;
  endsOn: string | null;
  distributedTo: { centerId: string; name: string; status: string }[];
}

interface StaffLine {
  accountId: string;
  name: string;
  email: string;
  role: 'admin' | 'editor' | 'observer';
}

const STATUS_TONE: Record<NetworkProgram['status'], string> = { Live: 'badge ok', Completed: 'badge', Draft: 'badge warn' };
const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'programs', label: 'Programmes' },
  { key: 'centers', label: 'Centres' },
] as const;

export function NetworkPage() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.key === params.get('tab')) ? (params.get('tab') as (typeof TABS)[number]['key']) : 'overview';
  const overview = useAsync(() => api.get<Overview>('/api/network/overview'), 'network-overview');

  return (
    <>
      <header className="topbar">
        <h1>Global Overview</h1>
        <div className="spacer" />
        <span className="faint" style={{ fontSize: 12.5 }}>The CEED network, every centre at once.</span>
      </header>
      <nav className="tabbar" role="tablist" aria-label="Global">
        {TABS.map((t) => (
          <button key={t.key} role="tab" className={tab === t.key ? 'tab on' : 'tab'} onClick={() => setParams(t.key === 'overview' ? {} : { tab: t.key })}>
            {t.label}
          </button>
        ))}
      </nav>
      <div className="page stack" style={{ gap: 16 }}>
        {overview.error ? (
          <div className="empty">{overview.error}</div>
        ) : !overview.data ? (
          <div className="dir-loading" aria-busy="true"><span /><span /><span /></div>
        ) : tab === 'overview' ? (
          <OverviewTab data={overview.data} />
        ) : tab === 'programs' ? (
          <ProgramsTab centers={overview.data.centers} />
        ) : (
          <CentersTab centers={overview.data.centers} onChanged={overview.reload} />
        )}
      </div>
    </>
  );
}

function OverviewTab({ data }: { data: Overview }) {
  const tiles = [
    { label: 'Active centres', value: data.totals.centers, note: `${data.centers.length} in the network` },
    { label: 'Live programmes', value: data.totals.programs, note: 'each counted once' },
    { label: 'Startups supported', value: data.totals.startups, note: 'unique across centres' },
    { label: 'Community members', value: data.totals.members, note: 'people and organisations' },
  ];
  return (
    <>
      <div className="dir-tiles">
        {tiles.map((t) => (
          <div key={t.label} className="dir-tile" style={{ cursor: 'default' }}>
            <span className="eyebrow">{t.label}</span>
            <b className="num">{t.value}</b>
            <small>{t.note}</small>
          </div>
        ))}
      </div>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Centre</th>
              <th>Country</th>
              <th className="right">Live programmes</th>
              <th className="right">Completed</th>
              <th className="right">Startups</th>
              <th className="right">Members</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data.centers.map((c) => (
              <tr key={c.id}>
                <td>
                  <b>{c.name}</b>
                  {c.status === 'inactive' && <span className="badge" style={{ marginLeft: 6 }}>Inactive</span>}
                </td>
                <td className="muted">{c.country || '—'}</td>
                <td className="right num">{c.activePrograms}</td>
                <td className="right num">{c.completedPrograms}</td>
                <td className="right num">{c.startups}</td>
                <td className="right num">{c.members}</td>
                <td className="right">
                  <button className="btn sm" onClick={() => enterCenter(c.id)}>
                    Enter <Icon name="chevronRight" size={12} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function ProgramsTab({ centers }: { centers: CenterLine[] }) {
  const programs = useAsync(() => api.get<NetworkProgram[]>('/api/network/programs'), 'network-programs');
  const [center, setCenter] = useState('');
  const [status, setStatus] = useState('');
  const shown = useMemo(
    () => (programs.data ?? []).filter((p) => (!center || p.centerId === center) && (!status || p.status === status)),
    [programs.data, center, status],
  );
  if (programs.error) return <div className="empty">{programs.error}</div>;
  if (!programs.data) return <div className="dir-loading" aria-busy="true"><span /><span /></div>;
  return (
    <>
      <div className="row wrap" style={{ gap: 8 }}>
        <select className="input" style={{ width: 220 }} aria-label="Centre" value={center} onChange={(e) => setCenter(e.target.value)}>
          <option value="">Every centre</option>
          {centers.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select className="input" style={{ width: 180 }} aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Every status</option>
          <option value="Live">Live</option>
          <option value="Draft">Draft</option>
          <option value="Completed">Completed</option>
        </select>
        <span className="faint num" style={{ fontSize: 12.5 }}>{shown.length} of {programs.data.length}</span>
      </div>
      {shown.length ? (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Programme</th>
                <th>Organised by</th>
                <th>Status</th>
                <th>Dates</th>
                <th>Shown in</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => (
                <tr key={p.id}>
                  <td>
                    <span className="row" style={{ gap: 8 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 3, background: p.colour, flex: 'none' }} />
                      <b>{p.name}</b>
                    </span>
                  </td>
                  <td>{p.centerName}</td>
                  <td><span className={STATUS_TONE[p.status]}>{p.status}</span></td>
                  <td className="muted" style={{ whiteSpace: 'nowrap' }}>
                    {p.startsOn ? formatDate(p.startsOn) : '—'}
                    {p.endsOn ? ` → ${formatDate(p.endsOn)}` : ''}
                  </td>
                  <td>
                    {p.distributedTo.length ? (
                      <span className="row wrap" style={{ gap: 4 }}>
                        {p.distributedTo.map((d) => (
                          <span key={d.centerId} className={d.status === 'accepted' ? 'badge ok' : d.status === 'pending' ? 'badge warn' : 'badge'} title={d.status}>
                            {d.name}
                          </span>
                        ))}
                      </span>
                    ) : (
                      <span className="faint">Its own centre only</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty">No programme matches.</div>
      )}
    </>
  );
}

function CentersTab({ centers, onChanged }: { centers: CenterLine[]; onChanged: () => void }) {
  const [editing, setEditing] = useState<CenterLine | 'new' | null>(null);
  const [staffOf, setStaffOf] = useState<CenterLine | null>(null);
  const [invite, setInvite] = useState<{ email: string; password: string } | null>(null);
  const toast = useToast();

  const setStatus = async (c: CenterLine, status: 'active' | 'inactive') => {
    try {
      await api.patch(`/api/centers/${c.id}`, { status });
      toast(status === 'active' ? `${c.name} is active.` : `${c.name} is inactive — its team cannot sign in to it.`);
      onChanged();
    } catch (err) {
      toast((err as Error).message, true);
    }
  };

  return (
    <>
      <div className="row">
        <span className="faint" style={{ fontSize: 13 }}>Each centre runs its own programmes, community and team.</span>
        <div className="spacer" />
        <button className="btn primary" onClick={() => setEditing('new')}>
          <Icon name="plus" size={14} /> New centre
        </button>
      </div>
      <div className="stack" style={{ gap: 8 }}>
        {centers.map((c) => (
          <section key={c.id} className="card" style={{ padding: '14px 16px' }}>
            <div className="row wrap" style={{ gap: 10 }}>
              <div style={{ flex: 1, minWidth: 220 }}>
                <b style={{ fontSize: 15 }}>{c.name}</b>
                <span className={c.status === 'active' ? 'badge ok' : 'badge'} style={{ marginLeft: 8 }}>
                  {c.status === 'active' ? 'Active' : 'Inactive'}
                </span>
                <div className="faint" style={{ fontSize: 12.5 }}>
                  {[c.city, c.country].filter(Boolean).join(', ') || 'No place yet'} · since {formatDate(c.createdAt.slice(0, 10))}
                </div>
              </div>
              <button className="btn sm" onClick={() => setStaffOf(c)}>
                <Icon name="users" size={13} /> Administrators
              </button>
              <button className="btn sm" onClick={() => setEditing(c)}>
                <Icon name="edit" size={13} /> Edit
              </button>
              {c.status === 'active' ? (
                <button className="btn ghost sm" onClick={() => void setStatus(c, 'inactive')}>Deactivate</button>
              ) : (
                <button className="btn ghost sm" onClick={() => void setStatus(c, 'active')}>Activate</button>
              )}
              <button className="btn sm" onClick={() => enterCenter(c.id)}>
                Enter <Icon name="chevronRight" size={12} />
              </button>
            </div>
          </section>
        ))}
      </div>

      {editing && (
        <CenterForm
          center={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(made) => {
            setEditing(null);
            if (made) setInvite(made);
            onChanged();
          }}
        />
      )}
      {staffOf && <Admins center={staffOf} onClose={() => setStaffOf(null)} onInvite={setInvite} />}
      {invite && (
        <Modal
          title="Their way in"
          subtitle="Shown once. They choose their own password when they first sign in."
          onClose={() => setInvite(null)}
          footer={
            <>
              <div className="spacer" />
              <button className="btn primary" onClick={() => setInvite(null)}>Done</button>
            </>
          }
        >
          <dl className="answers">
            <dt>Email</dt>
            <dd>{invite.email}</dd>
            <dt>Provisional password</dt>
            <dd className="num">{invite.password}</dd>
          </dl>
        </Modal>
      )}
    </>
  );
}

function CenterForm({
  center,
  onClose,
  onSaved,
}: {
  center: CenterLine | null;
  onClose: () => void;
  onSaved: (invite: { email: string; password: string } | null) => void;
}) {
  const [name, setName] = useState(center?.name ?? '');
  const [country, setCountry] = useState(center?.country ?? '');
  const [city, setCity] = useState(center?.city ?? '');
  const [description, setDescription] = useState(center?.description ?? '');
  const [mailName, setMailName] = useState(center?.mailName ?? '');
  const [replyTo, setReplyTo] = useState(center?.replyTo ?? '');
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const save = async () => {
    setBusy(true);
    setErrors({});
    try {
      if (center) {
        await api.patch(`/api/centers/${center.id}`, { name, country, city, description, mailName, replyTo });
        toast('Saved.');
        onSaved(null);
      } else {
        const made = await api.post<{ invite: { email: string; password: string | null } | null }>('/api/centers', {
          name, country, city, description,
          ...(adminEmail.trim() ? { admin: { name: adminName, email: adminEmail } } : {}),
        });
        toast(`${name} is in the network.`);
        onSaved(made.invite?.password ? { email: made.invite.email, password: made.invite.password } : null);
      }
    } catch (err) {
      if (err instanceof ApiError && err.fields) setErrors(err.fields);
      toast((err as Error).message, true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={center ? `Edit ${center.name}` : 'New centre'}
      onClose={onClose}
      footer={
        <>
          <div className="spacer" />
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={busy || name.trim().length < 2} onClick={() => void save()}>
            {busy ? 'Saving…' : center ? 'Save' : 'Create the centre'}
          </button>
        </>
      }
    >
      <div className="stack" style={{ gap: 12 }}>
        <Field label="Name" value={name} onChange={setName} error={errors.name} placeholder="CEED Tunisie" />
        <div className="grid-2">
          <Field label="Country" value={country} onChange={setCountry} />
          <Field label="Main city" value={city} onChange={setCity} hint="Optional" />
        </div>
        <div className="field">
          <label>Description</label>
          <textarea className="textarea" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        {center ? (
          <div className="grid-2">
            <Field label="Letters signed by" value={mailName} onChange={setMailName} placeholder={center.name} hint="Empty: the platform’s name" />
            <Field label="Replies go to" value={replyTo} onChange={setReplyTo} error={errors.replyTo} placeholder="contact@…" hint="Empty: the platform’s address" />
          </div>
        ) : (
          <>
            <div className="public-sep" />
            <span className="eyebrow">Its first administrator</span>
            <div className="grid-2">
              <Field label="Name" value={adminName} onChange={setAdminName} />
              <Field label="Email" value={adminEmail} onChange={setAdminEmail} error={errors.email} hint="An existing account keeps its password" />
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

function Admins({
  center,
  onClose,
  onInvite,
}: {
  center: CenterLine;
  onClose: () => void;
  onInvite: (invite: { email: string; password: string }) => void;
}) {
  const staff = useAsync(() => api.get<StaffLine[]>(`/api/centers/${center.id}/staff`), `center-staff:${center.id}`);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const add = async () => {
    setBusy(true);
    try {
      const made = await api.post<{ staff: StaffLine[]; invite: { email: string; password: string | null } }>(`/api/centers/${center.id}/admins`, { name, email });
      staff.set(made.staff);
      setName('');
      setEmail('');
      toast(`${made.invite.email} administers ${center.name}.`);
      if (made.invite.password) onInvite({ email: made.invite.email, password: made.invite.password });
    } catch (err) {
      toast((err as Error).message, true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`${center.name} — team`}
      subtitle="Its administrators manage the rest of the team from the centre’s own settings."
      onClose={onClose}
      footer={
        <>
          <div className="spacer" />
          <button className="btn ghost" onClick={onClose}>Close</button>
        </>
      }
    >
      <div className="stack" style={{ gap: 12 }}>
        {(staff.data ?? []).length ? (
          <div className="rows">
            {staff.data!.map((s) => (
              <div key={s.accountId} className="rowcard row" style={{ padding: '8px 11px', gap: 10 }}>
                <span style={{ flex: 1 }}>
                  <b style={{ fontSize: 13.5 }}>{s.name}</b>
                  <span className="faint" style={{ display: 'block', fontSize: 12 }}>{s.email}</span>
                </span>
                <span className={s.role === 'admin' ? 'badge ok' : 'badge'}>{s.role}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="faint" style={{ margin: 0 }}>{staff.data ? 'Nobody yet.' : 'Loading…'}</p>
        )}
        <div className="public-sep" />
        <span className="eyebrow">Name an administrator</span>
        <div className="grid-2">
          <Field label="Name" value={name} onChange={setName} />
          <Field label="Email" value={email} onChange={setEmail} />
        </div>
        <div className="row">
          <div className="spacer" />
          <button className="btn primary sm" disabled={busy || !email.trim() || name.trim().length < 2} onClick={() => void add()}>
            <Icon name="plus" size={13} /> Add
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Field({
  label,
  value,
  onChange,
  error,
  hint,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  hint?: string;
  placeholder?: string;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <input className="input" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      {error ? <div className="err">{error}</div> : hint ? <div className="help">{hint}</div> : null}
    </div>
  );
}
