import { ORG_ACCESS_LABEL, ORG_ROLES, canEditOrg, type AffiliationView, type Me } from '@ceed/shared';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError, api } from '../../lib/api';
import { useAccount } from '../../lib/account';
import { formatDate } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import type { ReviewPanel } from './ReviewPage';
import { Icon } from '../../ui/Icon';
import { Modal, useToast } from '../../ui/Overlays';
import '../../ui/builder.css';
import '../../ui/directory.css';
import { initials } from '../directory/DirectoryPage';
import { TeamModal } from './TeamPanel';

/**
 * The member space: your profile, and the organisation pages you look after.
 * The profile is your directory record — editing it here is editing the row the
 * whole product already points at.
 */
/** The four places a member has. Jury only exists for somebody on a panel. */
const MEMBER_TABS = ['Profile', 'Programs', 'Jury', 'Settings'] as const;
type MemberTab = (typeof MEMBER_TABS)[number];

export function MemberPage() {
  const { me, loading, reload } = useAccount();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  /* Kept in the URL so coming back, refreshing or following a link lands where
     you were rather than at the top of the pile. */
  const panels = useAsync(() => api.get<ReviewPanel[]>('/api/me/reviews'), 'reviews');
  const isJuror = (panels.data?.length ?? 0) > 0;
  const tabs = MEMBER_TABS.filter((t) => t !== 'Jury' || isJuror);
  const asked = params.get('tab') as MemberTab | null;
  const tab: MemberTab = asked && tabs.includes(asked) ? asked : 'Profile';
  const setTab = (next: MemberTab) =>
    setParams((p) => {
      const q = new URLSearchParams(p);
      q.set('tab', next);
      return q;
    });

  useEffect(() => {
    if (!loading && !me) navigate('/login', { replace: true });
  }, [loading, me, navigate]);

  if (loading) return <div className="member-shell" />;
  if (!me) return null;
  // A password CEED chose is not yet this person's account. Nothing else opens
  // until they have replaced it — the server refuses it anyway.
  if (me.account.mustChangePassword) {
    return (
      <ChoosePassword
        me={me}
        // Having replaced it, somebody at CEED belongs in the workspace rather
        // than on their own profile page.
        onDone={() => (me.account.staffRole ? navigate('/', { replace: true }) : reload())}
      />
    );
  }

  return (
    <div className="member-shell">
      <div className="member-bar">
        <span className="rec-mark">{initials(me.record.name)}</span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <strong style={{ fontSize: 13 }}>{me.record.name}</strong>
          <span className="faint" style={{ display: 'block', fontSize: 12 }}>
            {me.account.email}
          </span>
        </span>
        {/* Somebody at CEED has two places to be, and this page is the smaller
            one. Without this, the way back is a URL they have to know. */}
        {me.account.staffRole && (
          <Link className="btn sm" to="/">
            <Icon name="grid" size={13} /> CEED workspace
          </Link>
        )}
        <button
          className="btn sm"
          onClick={async () => {
            await api.post('/api/auth/logout');
            navigate('/login');
          }}
        >
          Sign out
        </button>
      </div>

      <nav className="tabbar" role="tablist" aria-label="Your space">
        {tabs.map((t) => (
          <button key={t} role="tab" className={t === tab ? 'tab on' : 'tab'} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </nav>

      <div className="member-body stack" style={{ gap: 16 }}>
        {tab === 'Profile' && (
          <>
            <Profile me={me} onSaved={reload} />
            <Organisations me={me} onChanged={reload} />
          </>
        )}
        {tab === 'Programs' && <Programs />}
        {tab === 'Jury' && <Jury panels={panels.data ?? []} />}
        {tab === 'Settings' && <Settings me={me} />}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

/**
 * The one screen a provisional password reaches. It is not a warning that can
 * be dismissed: it is the whole member space until a password is chosen.
 */
function ChoosePassword({ me, onDone }: { me: Me; onDone: () => void }) {
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const mismatch = confirm.length > 0 && confirm !== newPassword;
  const ready = currentPassword && newPassword.length >= 8 && confirm === newPassword;

  const submit = async () => {
    setBusy(true);
    setErrors({});
    try {
      await api.post('/api/me/password', { currentPassword, newPassword });
      toast('Password changed. Welcome.');
      onDone();
    } catch (err) {
      if (err instanceof ApiError && err.fields) setErrors(err.fields);
      else setErrors({ _: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="public">
      <div className="public-card" style={{ maxWidth: 460 }}>
        <div className="public-top" />
        <div className="public-body stack" style={{ gap: 14 }}>
          <h1>Choose your password</h1>
          <p className="public-intro">
            The password you signed in with was set by CEED, and we know it. Replace it with one only you
            know — nothing else opens until you do.
          </p>
          <p className="faint" style={{ margin: 0, fontSize: 12.5 }}>
            Signed in as <strong>{me.account.email}</strong>
          </p>

          {errors._ && (
            <div className="callout warn">
              <Icon name="alert" size={15} />
              <div>{errors._}</div>
            </div>
          )}

          <div className="field">
            <label>The password you were given</label>
            <input
              className={errors.currentPassword ? 'input bad' : 'input'}
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrent(e.target.value)}
            />
            {errors.currentPassword && (
              <div style={{ color: 'var(--stop)', fontSize: 12 }}>{errors.currentPassword}</div>
            )}
          </div>

          <div className="field">
            <label>Your new password</label>
            <input
              className={errors.newPassword ? 'input bad' : 'input'}
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNext(e.target.value)}
            />
            {errors.newPassword ? (
              <div style={{ color: 'var(--stop)', fontSize: 12 }}>{errors.newPassword}</div>
            ) : (
              <div className="hint">At least 8 characters.</div>
            )}
          </div>

          <div className="field">
            <label>Type it once more</label>
            <input
              className={mismatch ? 'input bad' : 'input'}
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && ready && submit()}
            />
            {mismatch && <div style={{ color: 'var(--stop)', fontSize: 12 }}>The two do not match.</div>}
          </div>

          <button className="btn primary" disabled={busy || !ready} onClick={submit}>
            {busy ? 'One moment…' : 'Save my password'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

/**
 * The panels you sit on. Shown first when there are any: somebody who opens
 * this page during a selection round is here to review, not to edit an address.
 */
/**
 * The two things a member can do to their own account, and nothing else. The
 * email is what they sign in with, so changing it is CEED's to do — offering it
 * here would be offering a door that does not open.
 */
function Settings({ me }: { me: Me }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [closing, setClosing] = useState(false);
  const [typed, setTyped] = useState('');
  const navigate = useNavigate();
  const toast = useToast();

  const change = async () => {
    setErrors({});
    if (next !== confirm) {
      setErrors({ confirm: 'These two do not match.' });
      return;
    }
    setSaving(true);
    try {
      await api.post('/api/me/password', { currentPassword: current, newPassword: next });
      setCurrent(''); setNext(''); setConfirm('');
      toast('Password changed.');
    } catch (err) {
      if (err instanceof ApiError && err.fields) setErrors(err.fields);
      else toast((err as Error).message, true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <section className="card card-pad stack" style={{ gap: 12 }}>
        <h2 style={{ fontSize: 16 }}>Password</h2>
        <Text label="Current password" type="password" value={current} error={errors.currentPassword} onChange={setCurrent} />
        <div className="grid-2">
          <Text label="New password" type="password" value={next} error={errors.newPassword} onChange={setNext} />
          <Text label="Again" type="password" value={confirm} error={errors.confirm} onChange={setConfirm} />
        </div>
        <button
          className="btn primary sm"
          style={{ alignSelf: 'flex-start' }}
          disabled={saving || !current || next.length < 8 || !confirm}
          onClick={change}
        >
          {saving ? 'Saving…' : 'Change password'}
        </button>
        <p className="faint" style={{ margin: 0, fontSize: 12 }}>
          Eight characters at least. You stay signed in here; anywhere else you were signed in is signed out.
        </p>
      </section>

      <section className="card card-pad stack" style={{ gap: 12 }}>
        <h2 style={{ fontSize: 16 }}>Close your account</h2>
        {/* Said plainly, because what goes and what stays is the whole decision
            and nobody should have to guess it from the word "delete". */}
        <p className="faint" style={{ margin: 0, fontSize: 12.5 }}>
          Your way of signing in is removed, here and everywhere you are signed in. What you did stays with CEED:
          an application you sent, a panel you sat on, marks you gave. Those belong to the programme&apos;s record,
          not to your login. CEED can give you a new password later if you come back.
        </p>
        <button className="btn danger sm" style={{ alignSelf: 'flex-start' }} onClick={() => setClosing(true)}>
          <Icon name="trash" size={13} /> Close my account
        </button>
      </section>

      {closing && (
        <Modal
          title="Close your account?"
          subtitle={me.account.email}
          onClose={() => { setClosing(false); setTyped(''); }}
          footer={
            <>
              <button className="btn ghost" onClick={() => { setClosing(false); setTyped(''); }}>
                Cancel
              </button>
              <div className="spacer" />
              <button
                className="btn danger"
                disabled={typed.trim().toLowerCase() !== 'close'}
                onClick={async () => {
                  try {
                    await api.del('/api/me');
                    navigate('/login', { replace: true });
                  } catch (err) {
                    toast((err as Error).message, true);
                  }
                }}
              >
                Close my account
              </button>
            </>
          }
        >
          <p style={{ margin: '0 0 12px', fontSize: 13 }}>
            You will be signed out straight away and this password will stop working. Nothing you sent or wrote is
            deleted.
          </p>
          <Text label="Type close to confirm" value={typed} onChange={setTyped} placeholder="close" />
        </Modal>
      )}
    </>
  );
}

/** One published edition, as the server hands it to a member. */
interface MyProgram {
  programId: string;
  programName: string;
  editionId: string;
  editionName: string;
  editionStatus: 'Draft' | 'Live' | 'Completed';
  city: string;
  startsOn: string | null;
  endsOn: string | null;
  applications: 'not_configured' | 'scheduled' | 'live' | 'closed' | null;
  opensAt: string | null;
  applyUrl: string | null;
  mine: { id: string; orgName: string }[];
}

/**
 * What the programmes are doing, said in the one word that matters to somebody
 * outside CEED: can I apply. It is read from the Application brick itself —
 * closing the form is what closes applications, and nothing else says it.
 */
function applicationLine(p: MyProgram): { label: string; tone: string } {
  if (p.editionStatus === 'Completed') return { label: 'Completed', tone: 'badge' };
  if (p.applications === 'live') return { label: 'Applications open', tone: 'badge ok' };
  if (p.applications === 'scheduled')
    return { label: p.opensAt ? `Applications open ${formatDate(p.opensAt)}` : 'Applications not open yet', tone: 'badge warn' };
  if (p.applications === 'closed') return { label: 'Applications closed', tone: 'badge' };
  return { label: 'No form', tone: 'badge' };
}

function Programs() {
  const programs = useAsync(() => api.get<MyProgram[]>('/api/me/programs'), 'programs');
  const list = programs.data ?? [];

  if (programs.error) return <div className="empty">{programs.error}</div>;
  if (!programs.data) return <div className="empty">Loading…</div>;
  if (!list.length) {
    return (
      <div className="empty">
        <h3>Nothing open yet</h3>
        <p>CEED&apos;s programmes appear here as soon as they are published.</p>
      </div>
    );
  }

  return (
    <div className="rows">
      {list.map((p) => {
        const state = applicationLine(p);
        return (
          <section className="card card-pad stack" key={p.editionId} style={{ gap: 10 }}>
            <div className="row">
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2 style={{ fontSize: 16, margin: 0 }}>{p.programName}</h2>
                <p className="faint" style={{ margin: '2px 0 0', fontSize: 12.5 }}>
                  {[p.editionName, p.city, p.startsOn ? formatDate(p.startsOn) : null].filter(Boolean).join(' · ')}
                </p>
              </div>
              <span className={state.tone}>{state.label}</span>
            </div>

            {/* Their own side of it, when they have one. */}
            {p.mine.length > 0 && (
              <div className="rows">
                {p.mine.map((c) => (
                  <div className="rowcard link-row" key={c.id}>
                    <Icon name="check" size={13} />
                    <span style={{ flex: 1, fontSize: 13 }}>
                      <strong>{c.orgName}</strong> applied
                    </span>
                  </div>
                ))}
              </div>
            )}

            {p.applyUrl && !p.mine.length && (
              <a className="btn primary sm" style={{ alignSelf: 'flex-start' }} href={p.applyUrl}>
                <Icon name="form" size={13} /> Apply
              </a>
            )}
          </section>
        );
      })}
    </div>
  );
}

/**
 * Your panels, under the programme that invited you. Grouped rather than made
 * into a screen of its own: with one programme and one panel, a page that only
 * held a link to another page would be a click for nothing.
 */
function Jury({ panels }: { panels: ReviewPanel[] }) {
  // A shut panel asks nothing of you, so it does not count as waiting.
  const waiting = panels
    .filter((p) => p.state === 'open')
    .reduce((n, p) => n + (p.items.length - p.done), 0);

  const programmes = [...new Map(panels.map((p) => [`${p.programName}|${p.editionName}`, p])).values()];

  return (
    <>
      <div className="callout">
        <Icon name="gavel" size={15} />
        <div>
          {waiting
            ? `${waiting} startup${waiting === 1 ? '' : 's'} still waiting on you.`
            : 'Everything asked of you is done.'}{' '}
          What you write is yours — the others on a panel do not see it, and you do not see theirs.
        </div>
      </div>

      {programmes.map((head) => {
        const mine = panels.filter((p) => p.programName === head.programName && p.editionName === head.editionName);
        return (
          <section className="card" key={`${head.programName}|${head.editionName}`}>
            <div className="rowcard-head" style={{ padding: '13px 16px' }}>
              <div style={{ flex: 1 }}>
                <h2 style={{ fontSize: 16 }}>{head.programName}</h2>
                <p className="faint" style={{ margin: '2px 0 0', fontSize: 12.5 }}>
                  {head.editionName} · {head.committeeName}
                </p>
              </div>
            </div>
            <div className="rows" style={{ padding: 12 }}>
              {mine.map((panel) => (
                <Link className="rowcard link-row" key={panel.sessionId} to={`/review/${panel.sessionId}`}>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{panel.sessionName}</span>
                    <span className="faint" style={{ display: 'block', fontSize: 12 }}>
                      {panel.heldOn && panel.format === 'event'
                        ? formatDate(panel.heldOn)
                        : 'Spread over days'}
                    </span>
                  </span>
                  {panel.state === 'closed' && <span className="badge">Closed</span>}
                  {panel.state === 'not_open' && <span className="badge">Opens {formatDate(panel.opensAt)}</span>}
                  <span className={panel.done === panel.items.length ? 'badge ok num' : 'badge num'}>
                    {panel.done}/{panel.items.length}
                  </span>
                  <Icon name="chevronRight" size={14} />
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </>
  );
}

/**
 * A record entered as one name — which is most of them, since that is what the
 * import and the quick add both write — has nothing in either half. Showing
 * two empty boxes to somebody whose name is on the screen above them reads as
 * though CEED holds nothing about them. The name is split on first sight so
 * they can correct it rather than retype it.
 */
function splitName(record: { firstName: string; lastName: string; name: string }) {
  if (record.firstName || record.lastName) return { firstName: record.firstName, lastName: record.lastName };
  const parts = record.name.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return { firstName: record.name.trim(), lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

function Profile({ me, onSaved }: { me: Me; onSaved: () => void }) {
  const [draft, setDraft] = useState({
    ...splitName(me.record),
    phone: me.record.phone,
    city: me.record.city,
    country: me.record.country || 'Morocco',
    bio: me.record.bio,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const set = (partial: Partial<typeof draft>) => setDraft((d) => ({ ...d, ...partial }));
  const known = splitName(me.record);
  const dirty =
    draft.firstName !== known.firstName ||
    draft.lastName !== known.lastName ||
    draft.phone !== me.record.phone ||
    draft.city !== me.record.city ||
    draft.country !== (me.record.country || 'Morocco') ||
    draft.bio !== me.record.bio;

  const save = async () => {
    setSaving(true);
    setErrors({});
    try {
      await api.patch('/api/me', draft);
      onSaved();
      toast('Profile saved.');
    } catch (err) {
      if (err instanceof ApiError && err.fields) setErrors(err.fields);
      else toast((err as Error).message, true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="card card-pad stack" style={{ gap: 12 }}>
      <div className="row">
        <h2 style={{ fontSize: 16 }}>Your profile</h2>
        <div className="spacer" />
        <button className="btn primary sm" disabled={saving || !dirty} onClick={save}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      <div className="grid-2">
        <Text label="First name" value={draft.firstName} error={errors.firstName} onChange={(v) => set({ firstName: v })} />
        <Text label="Last name" value={draft.lastName} error={errors.lastName} onChange={(v) => set({ lastName: v })} />
      </div>
      <div className="grid-2">
        <Text label="Phone" value={draft.phone} onChange={(v) => set({ phone: v })} placeholder="+212 6 …" />
        <Text label="City" value={draft.city} onChange={(v) => set({ city: v })} placeholder="Casablanca" />
      </div>
      <Text label="Country" value={draft.country} onChange={(v) => set({ country: v })} />
      <div className="field">
        <label>About you</label>
        <textarea className="textarea" rows={3} value={draft.bio} onChange={(e) => set({ bio: e.target.value })} />
      </div>
      <p className="faint" style={{ margin: 0, fontSize: 12 }}>
        Your email is what you sign in with, so it is changed from the account rather than here.
      </p>
    </section>
  );
}

/* ------------------------------------------------------------------ */

function Organisations({ me, onChanged }: { me: Me; onChanged: () => void }) {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AffiliationView | null>(null);
  const [team, setTeam] = useState<AffiliationView | null>(null);

  return (
    <section className="card">
      <div className="rowcard-head" style={{ padding: '13px 16px' }}>
        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: 16 }}>Your organisations</h2>
          <p className="faint" style={{ margin: '2px 0 0', fontSize: 12.5 }}>
            The pages you look after. You can hold several, or none at all.
          </p>
        </div>
        <button className="btn primary sm" onClick={() => setCreating(true)}>
          <Icon name="plus" size={13} /> Create a page
        </button>
      </div>

      {!me.organisations.length ? (
        <div className="empty" style={{ padding: 24 }}>
          {/* Holding none is a normal state, not a step left undone: a mentor,
              a juror, somebody CEED simply knows. The empty box used to offer
              one thing to do and so read as a condition of entry. */}
          <p style={{ margin: 0 }}>
            <strong>You do not need one.</strong> Nothing on this page waits for it.
          </p>
          <p className="faint" style={{ margin: '6px 0 0', fontSize: 12.5, lineHeight: 1.6 }}>
            A page is what you apply to a programme with, and what a jury reads about your company. Create one when
            you have something to put on it.
          </p>
        </div>
      ) : (
        <div className="rows" style={{ padding: 12 }}>
          {me.organisations.map((link) => (
            <div className="rowcard link-row" key={link.affiliation.id}>
              <span className="rec-mark">{initials(link.record.name)}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{link.record.name}</span>
                <span className="faint" style={{ display: 'block', fontSize: 12 }}>
                  {[
                    link.affiliation.role,
                    ORG_ACCESS_LABEL[link.affiliation.access],
                    link.record.city,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </span>
              <button className="btn sm" onClick={() => setTeam(link)}>
                <Icon name="users" size={13} /> Team
              </button>
              {canEditOrg(link.affiliation.access) && (
                <button className="btn sm" onClick={() => setEditing(link)}>
                  <Icon name="edit" size={13} /> Edit
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {creating && (
        <OrgModal
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            onChanged();
          }}
        />
      )}

      {editing && (
        <OrgModal
          link={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            onChanged();
          }}
        />
      )}

      {team && <TeamModal link={team} onClose={() => setTeam(null)} />}
    </section>
  );
}

function OrgModal({
  link,
  onClose,
  onSaved,
}: {
  link?: AffiliationView;
  onClose: () => void;
  onSaved: () => void;
}) {
  const editing = Boolean(link);
  const [draft, setDraft] = useState({
    name: link?.record.name ?? '',
    roles: link?.record.roles ?? ['Startup'],
    email: link?.record.email ?? '',
    phone: link?.record.phone ?? '',
    city: link?.record.city ?? '',
    country: link?.record.country || 'Morocco',
    website: link?.record.website ?? '',
    bio: link?.record.bio ?? '',
    myRole: link?.affiliation.role ?? 'Founder',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const set = (partial: Partial<typeof draft>) => setDraft((d) => ({ ...d, ...partial }));

  const save = async () => {
    setSaving(true);
    setErrors({});
    try {
      if (editing) {
        await api.patch(`/api/me/organisations/${link!.record.id}`, draft);
        toast('Saved.');
      } else {
        const { joined } = await api.post<{ joined: boolean }>('/api/me/organisations', draft);
        toast(joined ? `CEED already knew ${draft.name} — you are attached to it.` : `${draft.name} created.`);
      }
      onSaved();
    } catch (err) {
      if (err instanceof ApiError && err.fields) setErrors(err.fields);
      else toast((err as Error).message, true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={editing ? draft.name : 'Create an organisation page'}
      subtitle={editing ? undefined : 'If CEED already knows it, you will be attached to that page rather than a second one.'}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={saving || !draft.name.trim()} onClick={save}>
            {saving ? 'Saving…' : editing ? 'Save' : 'Create'}
          </button>
        </>
      }
    >
      <Text label="Name" value={draft.name} error={errors.name} onChange={(v) => set({ name: v })} placeholder="Nakhla Bio" />

      <div className="field">
        <label>What it is</label>
        <div className="work-pick">
          {ORG_ROLES.map((r) => (
            <button
              key={r}
              type="button"
              className={draft.roles.includes(r) ? 'track on' : 'track'}
              onClick={() => set({ roles: draft.roles.includes(r) ? draft.roles.filter((x) => x !== r) : [...draft.roles, r] })}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <Text label="Your role there" value={draft.myRole} onChange={(v) => set({ myRole: v })} placeholder="Founder" />

      <div className="grid-2">
        <Text label="Email" value={draft.email} onChange={(v) => set({ email: v })} />
        <Text label="Phone" value={draft.phone} onChange={(v) => set({ phone: v })} />
      </div>
      <div className="grid-2">
        <Text label="City" value={draft.city} onChange={(v) => set({ city: v })} />
        <Text label="Country" value={draft.country} onChange={(v) => set({ country: v })} />
      </div>
      <Text label="Website" value={draft.website} onChange={(v) => set({ website: v })} />
      <div className="field">
        <label>What it does</label>
        <textarea className="textarea" rows={3} value={draft.bio} onChange={(e) => set({ bio: e.target.value })} />
      </div>
    </Modal>
  );
}

function Text({
  label,
  value,
  onChange,
  placeholder,
  error,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  error?: string;
  /** A password is typed here too, and must not be readable over a shoulder. */
  type?: string;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <input
        className={error ? 'input bad' : 'input'}
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      {error && <div style={{ color: 'var(--stop)', fontSize: 12 }}>{error}</div>}
    </div>
  );
}
