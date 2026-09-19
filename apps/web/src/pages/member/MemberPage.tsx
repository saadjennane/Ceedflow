import { ORG_ROLES, type AffiliationView, type Me } from '@ceed/shared';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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

/**
 * The member space: your profile, and the organisation pages you look after.
 * The profile is your directory record — editing it here is editing the row the
 * whole product already points at.
 */
export function MemberPage() {
  const { me, loading, reload } = useAccount();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !me) navigate('/login', { replace: true });
  }, [loading, me, navigate]);

  if (loading) return <div className="member-shell" />;
  if (!me) return null;

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

      <div className="member-body stack" style={{ gap: 16 }}>
        <Reviews />
        <Profile me={me} onSaved={reload} />
        <Organisations me={me} onChanged={reload} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

/**
 * The panels you sit on. Shown first when there are any: somebody who opens
 * this page during a selection round is here to review, not to edit an address.
 */
function Reviews() {
  const panels = useAsync(() => api.get<ReviewPanel[]>('/api/me/reviews'), 'reviews');
  const list = panels.data ?? [];
  if (!list.length) return null;

  const waiting = list.reduce((n, p) => n + (p.items.length - p.done), 0);

  return (
    <section className="card">
      <div className="rowcard-head" style={{ padding: '13px 16px' }}>
        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: 16 }}>To review</h2>
          <p className="faint" style={{ margin: '2px 0 0', fontSize: 12.5 }}>
            {waiting
              ? `${waiting} startup${waiting === 1 ? '' : 's'} still waiting on you.`
              : 'Everything asked of you is done.'}
          </p>
        </div>
      </div>
      <div className="rows" style={{ padding: 12 }}>
        {list.map((panel) => (
          <Link className="rowcard link-row" key={panel.sessionId} to={`/review/${panel.sessionId}`}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontWeight: 600, fontSize: 13 }}>{panel.sessionName}</span>
              <span className="faint" style={{ display: 'block', fontSize: 12 }}>
                {panel.programName} · {panel.editionName}
                {panel.heldOn && panel.format === 'event' ? ` · ${formatDate(panel.heldOn)}` : ''}
              </span>
            </span>
            <span className={panel.done === panel.items.length ? 'badge ok num' : 'badge num'}>
              {panel.done}/{panel.items.length}
            </span>
            <Icon name="chevronRight" size={14} />
          </Link>
        ))}
      </div>
    </section>
  );
}

function Profile({ me, onSaved }: { me: Me; onSaved: () => void }) {
  const [draft, setDraft] = useState({
    firstName: me.record.firstName,
    lastName: me.record.lastName,
    phone: me.record.phone,
    city: me.record.city,
    country: me.record.country || 'Morocco',
    bio: me.record.bio,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const set = (partial: Partial<typeof draft>) => setDraft((d) => ({ ...d, ...partial }));
  const dirty =
    draft.firstName !== me.record.firstName ||
    draft.lastName !== me.record.lastName ||
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
        <div className="empty" style={{ padding: 30 }}>
          <p>
            No organisation yet. Create a page for your startup, your company or your fund — CEED will see it, and you
            keep it up to date.
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
                  {[link.affiliation.role, link.record.city, link.record.roles.join(', ')].filter(Boolean).join(' · ')}
                </span>
              </span>
              <button className="btn sm" onClick={() => setEditing(link)}>
                <Icon name="edit" size={13} /> Edit
              </button>
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
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  error?: string;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <input
        className={error ? 'input bad' : 'input'}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      {error && <div style={{ color: 'var(--stop)', fontSize: 12 }}>{error}</div>}
    </div>
  );
}
