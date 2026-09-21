import {
  ACCOUNT_STATE_LABEL,
  STAFF_ROLES,
  STAFF_ROLE_HINT,
  STAFF_ROLE_LABEL,
  isWorkspaceAdmin,
  type StaffMember,
  type StaffRole,
} from '@ceed/shared';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAccount } from '../lib/account';
import { ApiError, api } from '../lib/api';
import { initials } from './directory/DirectoryPage';
import { Icon } from '../ui/Icon';
import { Modal, useToast } from '../ui/Overlays';
import '../ui/builder.css';
import '../ui/directory.css';

interface Invite {
  email: string;
  password: string;
}

/**
 * The workspace's own settings. For now it holds one thing — who is at CEED and
 * what each of them may do — because that is the part that decides everything
 * else on the screens around it.
 */
export function SettingsPage() {
  const { me } = useAccount();
  const navigate = useNavigate();
  const [team, setTeam] = useState<StaffMember[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [invite, setInvite] = useState<Invite | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const toast = useToast();

  const mayManage = isWorkspaceAdmin(me?.account.staffRole ?? 'observer');

  const load = async () => setTeam(await api.get<StaffMember[]>('/api/staff'));
  useEffect(() => {
    void load();
  }, []);

  const act = async (id: string, run: () => Promise<unknown>) => {
    setBusy(id);
    try {
      await run();
      await load();
    } catch (err) {
      toast((err as Error).message, true);
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Settings</h1>
          <p className="faint" style={{ margin: '3px 0 0', fontSize: 13 }}>
            The CEED workspace and who holds it.
          </p>
        </div>
      </header>

      <div className="page-body">
        {/* A list of a handful of people, not a table: past a readable width the
            name and its controls drift to opposite edges of the screen. */}
        <section className="card" style={{ maxWidth: 880 }}>
          <div className="rowcard-head" style={{ padding: '13px 16px' }}>
            <div style={{ flex: 1 }}>
              <h2 style={{ fontSize: 16 }}>The CEED team</h2>
              <p className="faint" style={{ margin: '2px 0 0', fontSize: 12.5 }}>
                Everyone who can sign in to this workspace, and on what terms.
              </p>
            </div>
            {mayManage && (
              <button className="btn primary sm" onClick={() => setAdding(true)}>
                <Icon name="plus" size={13} /> Add someone
              </button>
            )}
          </div>

          <div className="rows" style={{ padding: 12 }}>
            {!mayManage && (
              <p className="faint" style={{ margin: '0 0 6px', fontSize: 12.5, lineHeight: 1.5 }}>
                Only an administrator adds colleagues or changes what they may do.
              </p>
            )}

            {team === null ? (
              <p className="faint" style={{ margin: 0, fontSize: 12.5 }}>Loading…</p>
            ) : (
              team.map((m) => {
                const isMe = m.accountId === me?.account.id;
                return (
                  <div className="rowcard team-row" key={m.accountId}>
                    <span className="rec-mark">{initials(m.person.name)}</span>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>
                        {m.person.name}
                        {isMe && <span className="faint" style={{ fontWeight: 400 }}> · you</span>}
                      </div>
                      <div className="faint team-who" title={m.email}>
                        {m.email}
                      </div>
                    </div>

                    {mayManage && !isMe ? (
                      <select
                        className="input"
                        value={m.role}
                        title={STAFF_ROLE_HINT[m.role]}
                        disabled={busy === m.accountId}
                        onChange={(e) =>
                          act(m.accountId, () =>
                            api.patch(`/api/staff/${m.accountId}`, { role: e.target.value as StaffRole }),
                          )
                        }
                      >
                        {STAFF_ROLES.map((r) => (
                          <option key={r} value={r}>
                            {STAFF_ROLE_LABEL[r]}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="badge" title={STAFF_ROLE_HINT[m.role]}>
                        {STAFF_ROLE_LABEL[m.role]}
                      </span>
                    )}

                    <span className={m.state === 'claimed' ? 'badge ok' : 'badge'} style={{ flexShrink: 0 }}>
                      {ACCOUNT_STATE_LABEL[m.state]}
                    </span>

                    {mayManage && !isMe && (
                      <div className="row" style={{ gap: 5, flexShrink: 0 }}>
                        {m.state !== 'claimed' && (
                          <button
                            className="btn sm"
                            title="Issue a new provisional password"
                            disabled={busy === m.accountId}
                            onClick={() =>
                              act(m.accountId, async () => {
                                const res = await api.post<{ invite: Invite }>(`/api/staff/${m.accountId}/invite`);
                                setInvite(res.invite);
                              })
                            }
                          >
                            <Icon name="send" size={13} />
                          </button>
                        )}
                        <button
                          className="btn sm"
                          title="Take them off the CEED team"
                          disabled={busy === m.accountId}
                          onClick={() =>
                            act(m.accountId, async () => {
                              await api.del(`/api/staff/${m.accountId}`);
                              toast(`${m.person.name} is off the CEED team.`);
                            })
                          }
                        >
                          <Icon name="trash" size={13} />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          <div className="rowcard-head" style={{ padding: '10px 16px', borderTop: '1px solid var(--line)' }}>
            <p className="faint" style={{ margin: 0, fontSize: 12, lineHeight: 1.6 }}>
              Taking somebody off the team withdraws their way into this workspace. Their record and their account
              stay — they may still be a mentor, sit on a jury, or look after an organisation page.
            </p>
          </div>
        </section>

        {/* Your own account, under the list of everybody else's. Signing out
            lives here because this is where somebody looks for it — the control
            in the sidebar is a shortcut, not the place it is filed. */}
        <section className="card card-pad stack" style={{ maxWidth: 880, gap: 12, marginTop: 14 }}>
          <div>
            <h2 style={{ fontSize: 16, margin: 0 }}>Your account</h2>
            <p className="faint" style={{ margin: '2px 0 0', fontSize: 12.5 }}>
              {me?.account.email}
              {me?.account.staffRole ? ` · ${STAFF_ROLE_LABEL[me.account.staffRole]}` : ''}
            </p>
          </div>

          <div className="row" style={{ gap: 7 }}>
            <Link className="btn sm" to="/me">
              <Icon name="edit" size={13} /> Your profile and password
            </Link>
            <button
              className="btn sm"
              onClick={async () => {
                await api.post('/api/auth/logout');
                navigate('/login', { replace: true });
              }}
            >
              <Icon name="x" size={13} /> Sign out
            </button>
          </div>

          <p className="faint" style={{ margin: 0, fontSize: 12, lineHeight: 1.6 }}>
            Signing out ends this session on this browser only. Sessions you have open elsewhere stay open — change
            your password to end all of them at once.
          </p>
        </section>
      </div>

      {adding && (
        <AddStaffModal
          onClose={() => setAdding(false)}
          onAdded={(issued) => {
            setAdding(false);
            setInvite(issued);
            void load();
          }}
        />
      )}

      {invite && <InviteHandover invite={invite} onClose={() => setInvite(null)} />}
    </>
  );
}

/* ------------------------------------------------------------------ */

function AddStaffModal({
  onClose,
  onAdded,
}: {
  onClose: () => void;
  onAdded: (invite: Invite | null) => void;
}) {
  const [draft, setDraft] = useState({ name: '', email: '', role: 'editor' as StaffRole });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const set = (partial: Partial<typeof draft>) => setDraft((d) => ({ ...d, ...partial }));

  const save = async () => {
    setSaving(true);
    setErrors({});
    try {
      const res = await api.post<{ invite: Invite | null; promoted: boolean }>('/api/staff', draft);
      toast(
        res.promoted
          ? `${draft.name} already had an account — they are on the CEED team now.`
          : `${draft.name} is on the CEED team.`,
      );
      onAdded(res.invite);
    } catch (err) {
      if (err instanceof ApiError && err.fields) setErrors(err.fields);
      else toast((err as Error).message, true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Add someone to the CEED team"
      subtitle="They get a way into this workspace, with a password they replace on arrival."
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={saving || !draft.name.trim() || !draft.email.trim()} onClick={save}>
            {saving ? 'One moment…' : 'Add them'}
          </button>
        </>
      }
    >
      <div className="stack" style={{ gap: 12 }}>
        <div className="field">
          <label>Full name</label>
          <input
            className={errors.name ? 'input bad' : 'input'}
            value={draft.name}
            onChange={(e) => set({ name: e.target.value })}
          />
          {errors.name && <div style={{ color: 'var(--stop)', fontSize: 12 }}>{errors.name}</div>}
        </div>

        <div className="field">
          <label>Email</label>
          <input
            className={errors.email ? 'input bad' : 'input'}
            type="email"
            value={draft.email}
            onChange={(e) => set({ email: e.target.value })}
          />
          {errors.email ? (
            <div style={{ color: 'var(--stop)', fontSize: 12 }}>{errors.email}</div>
          ) : (
            <div className="hint">This is what they sign in with.</div>
          )}
        </div>

        <div className="field">
          <label>What they may do</label>
          <select className="input" value={draft.role} onChange={(e) => set({ role: e.target.value as StaffRole })}>
            {STAFF_ROLES.map((r) => (
              <option key={r} value={r}>
                {STAFF_ROLE_LABEL[r]}
              </option>
            ))}
          </select>
          <div className="hint">{STAFF_ROLE_HINT[draft.role]}</div>
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */

function InviteHandover({ invite, onClose }: { invite: Invite; onClose: () => void }) {
  const toast = useToast();
  const copy = () => {
    void navigator.clipboard?.writeText(`${invite.email} · ${invite.password}`);
    toast('Email and password copied.');
  };

  return (
    <Modal
      title="They can come in"
      onClose={onClose}
      footer={
        <>
          <div className="spacer" />
          <button className="btn" onClick={copy}>
            <Icon name="copy" size={13} /> Copy both
          </button>
          <button className="btn primary" onClick={onClose}>
            Done
          </button>
        </>
      }
    >
      <div className="stack" style={{ gap: 12 }}>
        <div className="callout warn">
          <Icon name="alert" size={15} />
          <div>
            <strong>Pass this on now.</strong> The password is hashed the moment it is saved — this screen is the only
            place it will ever be readable.
          </div>
        </div>
        <div className="rowcard stack" style={{ gap: 6, padding: 11 }}>
          <div>
            <div className="faint" style={{ fontSize: 11.5 }}>Signs in with</div>
            <div style={{ fontSize: 12.5, overflowWrap: 'anywhere' }}>{invite.email}</div>
          </div>
          <div>
            <div className="faint" style={{ fontSize: 11.5 }}>Password</div>
            <code className="num" style={{ fontSize: 15 }}>{invite.password}</code>
          </div>
        </div>
        <p className="faint" style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5 }}>
          They will be asked to replace it the first time they sign in, and nothing in the workspace opens until they
          have.
        </p>
      </div>
    </Modal>
  );
}
