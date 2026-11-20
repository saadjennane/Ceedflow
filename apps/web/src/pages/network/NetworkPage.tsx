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
import '../../ui/builder.css';
import '../../ui/directory.css';
import { colourOf } from '../../ui/Showcase';

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

/** Les quatre chiffres du réseau, chacun avec son icône et sa couleur. */
const KPIS = [
  { key: 'centers', label: 'Active centres', icon: 'compass', tone: 'blue' },
  { key: 'programs', label: 'Live programmes', icon: 'layers', tone: 'cyan' },
  { key: 'startups', label: 'Startups supported', icon: 'star', tone: 'ok' },
  { key: 'members', label: 'Community members', icon: 'users', tone: 'violet' },
] as const;

/** La pastille d'un centre : l'initiale de son pays, à la couleur de son nom. */
function CenterMark({ c, size = 40 }: { c: { name: string; country: string }; size?: number }) {
  const letters = (c.country || c.name.replace(/^CEED\s+/i, '')).slice(0, 2).toUpperCase();
  return (
    <span className="net-mark" style={{ width: size, height: size, background: colourOf(c.name) }}>
      {letters}
    </span>
  );
}

function OverviewTab({ data }: { data: Overview }) {
  const notes: Record<(typeof KPIS)[number]['key'], string> = {
    centers: `${data.centers.length} in the network`,
    programs: 'each counted once',
    startups: 'unique across centres',
    members: 'people and organisations',
  };
  return (
    <>
      <div className="net-kpis">
        {KPIS.map((k) => (
          <div key={k.key} className={`net-kpi ${k.tone}`}>
            <span className="net-kpi-icon">
              <Icon name={k.icon} size={18} />
            </span>
            <span className="net-kpi-body">
              <span className="eyebrow">{k.label}</span>
              <b className="num">{data.totals[k.key].toLocaleString('fr-FR')}</b>
              <small>{notes[k.key]}</small>
            </span>
          </div>
        ))}
      </div>

      <div className="row" style={{ alignItems: 'baseline' }}>
        <h3 className="section-title" style={{ margin: 0 }}>Centres</h3>
        <span className="faint" style={{ fontSize: 12.5, marginLeft: 8 }}>{data.centers.length}</span>
      </div>
      <div className="net-centers">
        {data.centers.map((c) => (
          <button key={c.id} className="net-center" onClick={() => enterCenter(c.id)} title={`Enter ${c.name}`}>
            <span className="net-center-head">
              <CenterMark c={c} />
              <span className="net-center-name">
                <b>{c.name}</b>
                <span className="faint">{[c.city, c.country].filter(Boolean).join(', ') || '—'}</span>
              </span>
              {c.status === 'inactive' ? <span className="badge">Inactive</span> : <Icon name="chevronRight" size={16} />}
            </span>
            <span className="net-center-stats">
              <span><b className="num">{c.activePrograms}</b><small>Live</small></span>
              <span><b className="num">{c.completedPrograms}</b><small>Completed</small></span>
              <span><b className="num">{c.startups.toLocaleString('fr-FR')}</b><small>Startups</small></span>
              <span><b className="num">{c.members.toLocaleString('fr-FR')}</b><small>Members</small></span>
            </span>
          </button>
        ))}
      </div>
    </>
  );
}

const STATUSES = ['', 'Live', 'Draft', 'Completed'] as const;

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
  const countOf = (s: string) => programs.data!.filter((p) => (!center || p.centerId === center) && (!s || p.status === s)).length;
  return (
    <>
      <div className="row wrap" style={{ gap: 10 }}>
        <div className="work-pick">
          <button className={!center ? 'track on' : 'track'} onClick={() => setCenter('')}>
            Every centre
          </button>
          {centers.map((c) => (
            <button key={c.id} className={center === c.id ? 'track on' : 'track'} onClick={() => setCenter(c.id)}>
              {c.name}
            </button>
          ))}
        </div>
        <div className="spacer" />
        <div className="seg" role="group" aria-label="Status">
          {STATUSES.map((s) => (
            <button key={s || 'all'} className={status === s ? 'on' : ''} onClick={() => setStatus(s)}>
              {s || 'All'} <span className="num faint">{countOf(s)}</span>
            </button>
          ))}
        </div>
      </div>

      {shown.length ? (
        <div className="net-programs">
          {shown.map((p) => (
            <div key={p.id} className="net-program">
              <span className="net-program-bar" style={{ background: p.colour }} />
              <span className="net-program-main">
                <b>{p.name}</b>
                <span className="faint">
                  {p.centerName}
                  {p.startsOn ? ` · ${formatDate(p.startsOn)}` : ''}
                  {p.endsOn ? ` → ${formatDate(p.endsOn)}` : ''}
                </span>
              </span>
              <span className="net-program-reach">
                {p.distributedTo.length ? (
                  p.distributedTo.map((d) => (
                    <span key={d.centerId} className={d.status === 'accepted' ? 'badge ok' : d.status === 'pending' ? 'badge warn' : 'badge'} title={`${d.name}: ${d.status}`}>
                      {d.name}
                    </span>
                  ))
                ) : (
                  <span className="faint" style={{ fontSize: 12.5 }}>Own centre only</span>
                )}
              </span>
              <span className={STATUS_TONE[p.status]}>{p.status}</span>
            </div>
          ))}
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
      <div className="net-manage">
        {centers.map((c) => (
          <section key={c.id} className={c.status === 'active' ? 'net-manage-card' : 'net-manage-card off'}>
            <div className="net-center-head">
              <CenterMark c={c} size={44} />
              <span className="net-center-name">
                <b>{c.name}</b>
                <span className="faint">
                  {[c.city, c.country].filter(Boolean).join(', ') || 'No place yet'} · since {formatDate(c.createdAt.slice(0, 10))}
                </span>
              </span>
              <span className={c.status === 'active' ? 'badge ok' : 'badge'}>{c.status === 'active' ? 'Active' : 'Inactive'}</span>
            </div>
            {c.description && <p className="net-manage-desc">{c.description}</p>}
            <div className="net-manage-meta">
              <span><Icon name="mail" size={12} /> {c.mailName || 'Platform signature'}</span>
              <span><Icon name="send" size={12} /> {c.replyTo || 'Platform reply address'}</span>
            </div>
            <div className="net-manage-actions">
              <button className="btn primary sm" onClick={() => enterCenter(c.id)}>
                Enter <Icon name="chevronRight" size={12} />
              </button>
              <button className="btn sm" onClick={() => setStaffOf(c)}>
                <Icon name="users" size={13} /> Administrators
              </button>
              <button className="btn sm" onClick={() => setEditing(c)}>
                <Icon name="edit" size={13} /> Edit
              </button>
              <div className="spacer" />
              {c.status === 'active' ? (
                <button className="btn ghost sm" onClick={() => void setStatus(c, 'inactive')}>Deactivate</button>
              ) : (
                <button className="btn ghost sm" onClick={() => void setStatus(c, 'active')}>Activate</button>
              )}
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
