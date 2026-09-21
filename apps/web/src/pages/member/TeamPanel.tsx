import {
  ACCOUNT_STATE_LABEL,
  ORG_ACCESS,
  ORG_ACCESS_HINT,
  ORG_ACCESS_LABEL,
  canManageTeam,
  type AffiliationView,
  type OrgAccess,
  type TeamInvite,
  type TeamMember,
} from '@ceed/shared';
import { useEffect, useState } from 'react';
import { ApiError, api } from '../../lib/api';
import { Icon } from '../../ui/Icon';
import { Modal, useToast } from '../../ui/Overlays';

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');

/* ------------------------------------------------------------------ */
/* The team, as its own organisation keeps it                          */
/* ------------------------------------------------------------------ */

export function TeamModal({ link, onClose }: { link: AffiliationView; onClose: () => void }) {
  const orgId = link.record.id;
  const mayManage = canManageTeam(link.affiliation.access);
  const [team, setTeam] = useState<TeamMember[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [invite, setInvite] = useState<TeamInvite | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const toast = useToast();

  const load = async () => setTeam(await api.get<TeamMember[]>(`/api/me/organisations/${orgId}/team`));
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

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

  const setAccess = (m: TeamMember, access: OrgAccess) =>
    act(m.affiliationId, () => api.patch(`/api/me/organisations/${orgId}/team/${m.affiliationId}`, { access }));

  const remove = (m: TeamMember) =>
    act(m.affiliationId, async () => {
      await api.del(`/api/me/organisations/${orgId}/team/${m.affiliationId}`);
      toast(`${m.person.name} is off the page.`);
    });

  const sendInvite = (m: TeamMember) =>
    act(m.affiliationId, async () => {
      setInvite(await api.post<TeamInvite>(`/api/me/organisations/${orgId}/team/${m.affiliationId}/invite`));
    });

  if (invite) {
    return <InviteHandover invite={invite} onClose={() => setInvite(null)} />;
  }

  return (
    <>
      <Modal
        title={`The team at ${link.record.name}`}
        subtitle="Who the jury reads on your page — and who you have let in."
        onClose={onClose}
        footer={
          <>
            {mayManage && (
              <button className="btn" onClick={() => setAdding(true)}>
                <Icon name="plus" size={13} /> Add someone
              </button>
            )}
            <div className="spacer" />
            <button className="btn primary" onClick={onClose}>
              Done
            </button>
          </>
        }
      >
        <div className="stack" style={{ gap: 10 }}>
          {!mayManage && (
            <p className="faint" style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5 }}>
              You are on this page but do not hold it. An administrator adds people and decides what each one may do.
            </p>
          )}

          {team === null ? (
            <p className="faint" style={{ margin: 0, fontSize: 12.5 }}>Loading…</p>
          ) : (
            team.map((m) => {
              const isMe = m.affiliationId === link.affiliation.id;
              return (
                <div className="rowcard team-row" key={m.affiliationId}>
                  <span className="rec-mark">{initials(m.person.name)}</span>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>
                      {m.person.name}
                      {isMe && <span className="faint" style={{ fontWeight: 400 }}> · you</span>}
                    </div>
                    <div className="faint team-who" title={m.person.email || undefined}>
                      {[m.role, m.person.email].filter(Boolean).join(' · ') || 'No title yet'}
                    </div>
                  </div>

                  {mayManage ? (
                    <select
                      className="input"
                      value={m.access}
                      title={ORG_ACCESS_HINT[m.access]}
                      disabled={busy === m.affiliationId}
                      onChange={(e) => setAccess(m, e.target.value as OrgAccess)}
                    >
                      {ORG_ACCESS.map((a) => (
                        <option key={a} value={a}>
                          {ORG_ACCESS_LABEL[a]}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="badge">{ORG_ACCESS_LABEL[m.access]}</span>
                  )}

                  {/* The right is granted above; the door is opened separately. */}
                  <span
                    className={m.account?.state === 'claimed' ? 'badge ok' : 'badge'}
                    style={{ flexShrink: 0 }}
                  >
                    {m.account ? ACCOUNT_STATE_LABEL[m.account.state] : 'No account'}
                  </span>

                  {mayManage && (
                    <div className="row" style={{ gap: 5, flexShrink: 0 }}>
                      {m.account?.state !== 'claimed' && (
                        <button
                          className="btn sm"
                          disabled={busy === m.affiliationId || !m.person.email}
                          title={m.person.email ? 'Open a way in for them' : 'Add an email address first.'}
                          onClick={() => sendInvite(m)}
                        >
                          <Icon name="send" size={13} />
                        </button>
                      )}
                      {/* Nobody takes themselves off their own page. */}
                      {!isMe && (
                        <button
                          className="btn sm"
                          title="Take them off the page"
                          disabled={busy === m.affiliationId}
                          onClick={() => remove(m)}
                        >
                          <Icon name="trash" size={13} />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </Modal>

      {adding && (
        <AddMemberModal
          orgId={orgId}
          onClose={() => setAdding(false)}
          onAdded={() => {
            setAdding(false);
            void load();
          }}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Adding somebody: a name on a page, nothing more                     */
/* ------------------------------------------------------------------ */

function AddMemberModal({
  orgId,
  onClose,
  onAdded,
}: {
  orgId: string;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [draft, setDraft] = useState({ name: '', email: '', phone: '', role: '', access: 'member' as OrgAccess });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const set = (partial: Partial<typeof draft>) => setDraft((d) => ({ ...d, ...partial }));

  const save = async () => {
    setSaving(true);
    setErrors({});
    try {
      const { joined } = await api.post<{ joined: boolean }>(`/api/me/organisations/${orgId}/team`, draft);
      toast(joined ? `CEED already knew ${draft.name} — they are on your page now.` : `${draft.name} added.`);
      onAdded();
    } catch (err) {
      if (err instanceof ApiError && err.fields) setErrors(err.fields);
      else toast((err as Error).message, true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Add someone to the page"
      subtitle="This puts their name on your team. Letting them in is a separate step."
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={saving || !draft.name.trim()} onClick={save}>
            {saving ? 'Saving…' : 'Add'}
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
          <label>Title</label>
          <input className="input" value={draft.role} onChange={(e) => set({ role: e.target.value })} />
          <div className="hint">CTO, COO, Head of sales — what the jury reads. Not a permission.</div>
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
            <div className="hint">Optional now, required the day you invite them.</div>
          )}
        </div>

        <div className="field">
          <label>What they may do</label>
          <select className="input" value={draft.access} onChange={(e) => set({ access: e.target.value as OrgAccess })}>
            {ORG_ACCESS.map((a) => (
              <option key={a} value={a}>
                {ORG_ACCESS_LABEL[a]}
              </option>
            ))}
          </select>
          <div className="hint">{ORG_ACCESS_HINT[draft.access]}</div>
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* The one moment the password is readable                             */
/* ------------------------------------------------------------------ */

function InviteHandover({ invite, onClose }: { invite: TeamInvite; onClose: () => void }) {
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
        <div className="rowcard stack" style={{ gap: 6 }}>
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
          They will be asked to replace it the first time they sign in. Until they do, they stay a name on your page —
          CEED's people list only shows them once they have come in themselves.
        </p>
      </div>
    </Modal>
  );
}
