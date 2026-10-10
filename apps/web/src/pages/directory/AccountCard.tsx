import {
  ACCOUNT_STATE_LABEL,
  ACCOUNT_STATE_TONE,
  suggestPassword,
  type DirectoryRecord,
  type RecordAccount,
} from '@ceed/shared';
import { useState } from 'react';
import { ApiError, api } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { Icon } from '../../ui/Icon';
import { ConfirmDialog, Modal, useToast } from '../../ui/Overlays';

/* ------------------------------------------------------------------ */
/* The state, said in one line                                         */
/* ------------------------------------------------------------------ */

export function AccountBadge({ account }: { account: RecordAccount | null }) {
  if (!account) return <span className="badge">No account</span>;
  // Read from the shared table rather than restated here: a fourth state was
  // added and this line would have shown it grey with the unclaimed ones.
  const tone = ACCOUNT_STATE_TONE[account.state];
  return (
    <span className={tone === 'neutral' ? 'badge' : `badge ${tone}`}>{ACCOUNT_STATE_LABEL[account.state]}</span>
  );
}

/* ------------------------------------------------------------------ */
/* The door, on a person's record                                      */
/* ------------------------------------------------------------------ */

export function AccountCard({
  record,
  account,
  onChanged,
}: {
  record: DirectoryRecord;
  account: RecordAccount | null;
  onChanged: () => void;
}) {
  const [opening, setOpening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmDisable, setConfirmDisable] = useState(false);
  /* Shown once and never again: the password is stored as a hash, so this is
     the only moment it exists in a form anybody can read. */
  const [issued, setIssued] = useState<{ password: string; emailed: boolean } | null>(null);
  const toast = useToast();

  const act = async (what: () => Promise<void>) => {
    setBusy(true);
    try {
      await what();
      onChanged();
    } catch (err) {
      toast((err as Error).message, true);
    } finally {
      setBusy(false);
    }
  };

  const resetPassword = () =>
    act(async () => {
      const out = await api.post<{ password: string; emailed: boolean }>(
        `/api/records/${record.id}/account/password`,
      );
      setIssued(out);
    });

  const setDisabled = (disabled: boolean) =>
    act(async () => {
      await api.patch(`/api/records/${record.id}/account`, { disabled });
      toast(disabled ? `${record.name} can no longer sign in.` : `${record.name} can sign in again.`);
    });

  /* The invitation carries a fresh password, so the one shown afterwards is
     the one in their inbox — and whoever pressed this is often on the phone
     with them while the letter takes its minute. */
  const invite = () =>
    act(async () => {
      const out = await api.post<{ password: string; emailed: boolean }>(
        `/api/records/${record.id}/account/invite`,
      );
      setIssued(out);
    });

  return (
    <>
      <div className="card card-pad stack" style={{ gap: 10 }}>
        <div className="row">
          <div className="eyebrow" style={{ flex: 1 }}>
            Their account
          </div>
          <AccountBadge account={account} />
        </div>

        {!account ? (
          <>
            <p className="faint" style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5 }}>
              {record.name} has no way in yet. Open one and they can follow their application, keep their
              organisation page up to date, and review if they sit on a panel.
            </p>
            <button className="btn primary sm" onClick={() => setOpening(true)}>
              <Icon name="plus" size={13} /> Open an account
            </button>
          </>
        ) : (
          <>
            <Line label="Signs in with" value={account.email} />
            {/* Dit, parce que c'est invisible et que ça coûte une connexion.
                Tant que le mot de passe est provisoire, l'identifiant suit
                l'adresse de la fiche tout seul ; une fois qu'elle s'en est
                servie, on ne la déplace plus sous elle — alors on le dit. */}
            {record.emails.length > 0 &&
              !record.emails.some((e) => e.trim().toLowerCase() === account.email.trim().toLowerCase()) && (
              <div className="callout warn" style={{ margin: '2px 0' }}>
                <Icon name="alert" size={15} />
                <div>
                  <strong>Not one of the addresses on this record.</strong> They sign in with{' '}
                  <strong>{account.email}</strong>, and the record holds{' '}
                  <strong>{record.emails.join(', ')}</strong> — which is where letters go. Whoever writes to them names
                  the wrong one half the time.
                </div>
              </div>
            )}
            <Line label="Opened" value={formatDate(account.createdAt)} />
            {account.invitedAt && <Line label="Invited" value={formatDate(account.invitedAt)} />}

            <p className="faint" style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5 }}>
              {account.state === 'disabled'
                ? `Closed on ${formatDate(account.disabledAt)}. They cannot sign in, and any session they had ended. Their record, their marks and their organisations are untouched.`
                : account.state === 'claimed'
                ? 'They chose their own password. Nobody at CEED can read it, and nobody here can change it.'
                : account.state === 'invited'
                  ? 'The invitation went out and they have not come yet. Inviting again is a reminder.'
                    : 'The account is open but nobody has been told. Inviting them emails a password; or hand one over yourself.'}
            </p>

            <div className="row wrap" style={{ gap: 7 }}>
              {account.state !== 'claimed' && account.state !== 'disabled' && (
                <>
                  <button className="btn primary sm" disabled={busy} onClick={invite}>
                    <Icon name="send" size={13} /> {account.state === 'invited' ? 'Invite again' : 'Invite them'}
                  </button>
                  <button className="btn sm" onClick={() => setOpening(true)}>
                    <Icon name="edit" size={13} /> New password
                  </button>
                </>
              )}

              {/* Offered whoever chose the current password, which is the whole
                  point: the other route refuses to overwrite one its owner
                  chose, and somebody locked out needs exactly that. */}
              {account.state === 'claimed' && (
                <button className="btn sm" disabled={busy} onClick={() => setConfirmReset(true)}>
                  <Icon name="edit" size={13} /> Reset their password
                </button>
              )}

              {account.state === 'disabled' ? (
                <button className="btn sm" disabled={busy} onClick={() => setDisabled(false)}>
                  <Icon name="check" size={13} /> Open the account again
                </button>
              ) : (
                <button
                  className="btn ghost sm"
                  style={{ color: 'var(--stop)' }}
                  disabled={busy}
                  onClick={() => setConfirmDisable(true)}
                >
                  <Icon name="x" size={13} /> Close the account
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {confirmReset && account && (
        <ConfirmDialog
          title={`Reset the password for ${record.name}?`}
          body="A new one is generated and shown to you once. Theirs stops working immediately, along with any session they had open, and they will be asked to choose another the first time they sign in."
          confirmLabel="Reset it"
          onClose={() => setConfirmReset(false)}
          onConfirm={async () => {
            setConfirmReset(false);
            await resetPassword();
          }}
        />
      )}

      {confirmDisable && account && (
        <ConfirmDialog
          title={`Close the account for ${record.name}?`}
          body="They can no longer sign in, and any session they have open ends now. Nothing else goes: their record, the marks they gave and the organisations they belong to are untouched, and you can open it again from here."
          confirmLabel="Close it"
          destructive
          onClose={() => setConfirmDisable(false)}
          onConfirm={async () => {
            setConfirmDisable(false);
            await setDisabled(true);
          }}
        />
      )}

      {/* The one moment this password is readable. It is stored as a hash, so
          closing this window is the last time anybody sees it — which the
          window says, rather than leaving it to be discovered. */}
      {issued && (
        <Modal
          title="Their new password"
          subtitle={
            issued.emailed
              ? `On its way to ${record.name} by email. This is the last time it is readable here.`
              : `Hand it to ${record.name} — no mail went out. It is not stored anywhere you can read it again.`
          }
          onClose={() => setIssued(null)}
          footer={
            <>
              <div className="spacer" />
              <button className="btn primary" onClick={() => setIssued(null)}>
                I have it
              </button>
            </>
          }
        >
          <div className="stack" style={{ gap: 10 }}>
            <div className="row" style={{ gap: 8 }}>
              <code className="input num" style={{ flex: 1, fontSize: 16, letterSpacing: '0.02em' }}>
                {issued.password}
              </code>
              <button
                className="btn sm"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(issued.password);
                    toast('Copied.');
                  } catch {
                    toast('Select it and copy it by hand.', true);
                  }
                }}
              >
                <Icon name="copy" size={13} /> Copy
              </button>
            </div>
            <p className="faint" style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5 }}>
              They will be asked to replace it the first time they sign in. Until they do, this password is one you
              know as well — which is why the account counts as unclaimed again.
            </p>
          </div>
        </Modal>
      )}

      {opening && (
        <OpenAccountModal
          record={record}
          account={account}
          onClose={() => setOpening(false)}
          onDone={() => {
            setOpening(false);
            onChanged();
          }}
        />
      )}
    </>
  );
}

/**
 * Label above value rather than beside it. An email address is long and this
 * column is narrow: side by side, it breaks mid-word and leaves a stray letter
 * on its own line.
 */
function Line({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="faint" style={{ fontSize: 11.5 }}>
        {label}
      </div>
      <div style={{ fontSize: 12.5, overflowWrap: 'anywhere' }}>{value}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Opening one, or handing out a new password                          */
/* ------------------------------------------------------------------ */

export function OpenAccountModal({
  record,
  account,
  onClose,
  onDone,
}: {
  record: DirectoryRecord;
  account: RecordAccount | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const reissue = Boolean(account);
  const [email, setEmail] = useState(account?.email ?? record.email ?? '');
  const [password, setPassword] = useState(suggestPassword);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  /** Handed over is the point: the modal stays until it has been. */
  const [issued, setIssued] = useState(false);
  const toast = useToast();

  const submit = async () => {
    setBusy(true);
    setErrors({});
    try {
      await api.post(`/api/records/${record.id}/account`, { email: email.trim(), password });
      setIssued(true);
    } catch (err) {
      if (err instanceof ApiError && err.fields) setErrors(err.fields);
      else setErrors({ _: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const copy = () => {
    void navigator.clipboard?.writeText(`${email.trim()} · ${password}`);
    toast('Email and password copied.');
  };

  if (issued) {
    return (
      <Modal
        title={reissue ? 'New password issued' : 'Account opened'}
        onClose={onDone}
        footer={
          <>
            <div className="spacer" />
            <button className="btn" onClick={copy}>
              <Icon name="copy" size={13} /> Copy both
            </button>
            <button className="btn primary" onClick={onDone}>
              Done
            </button>
          </>
        }
      >
        <div className="stack" style={{ gap: 12 }}>
          <div className="callout warn">
            <Icon name="alert" size={15} />
            <div>
              <strong>Write this down now.</strong> The password is hashed the moment it is saved — this screen is
              the only place it will ever be readable.
            </div>
          </div>
          <div className="rowcard stack" style={{ gap: 6 }}>
            <Line label="Signs in with" value={email.trim()} />
            <div>
              <div className="faint" style={{ fontSize: 11.5 }}>
                Password
              </div>
              <code className="num" style={{ fontSize: 15 }}>
                {password}
              </code>
            </div>
          </div>
          <p className="faint" style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5 }}>
            {record.name} will be asked to replace it the first time they sign in, and nothing else in their space
            opens until they have.
          </p>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      title={reissue ? `New password for ${record.name}` : `Open an account for ${record.name}`}
      onClose={onClose}
      footer={
        <>
          <div className="spacer" />
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={busy || !email.trim() || password.length < 8} onClick={submit}>
            {busy ? 'One moment…' : reissue ? 'Issue it' : 'Open the account'}
          </button>
        </>
      }
    >
      <div className="stack" style={{ gap: 12 }}>
        {errors._ && (
          <div className="callout warn">
            <Icon name="alert" size={15} />
            <div>{errors._}</div>
          </div>
        )}

        <p className="faint" style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5 }}>
          {reissue
            ? 'The old password stops working immediately, and any session still open on it ends.'
            : 'You choose the first password, so it is provisional by construction — they replace it before anything else opens.'}
        </p>

        <div className="field">
          <label>Email</label>
          <input
            className={errors.email ? 'input bad' : 'input'}
            type="email"
            value={email}
            disabled={reissue}
            onChange={(e) => setEmail(e.target.value)}
          />
          {errors.email ? (
            <div style={{ color: 'var(--stop)', fontSize: 12 }}>{errors.email}</div>
          ) : (
            <div className="hint">{reissue ? 'The address stays as it is.' : 'This is what they sign in with.'}</div>
          )}
        </div>

        <div className="field">
          <label>Provisional password</label>
          <div className="row" style={{ gap: 7 }}>
            <input
              className={errors.password ? 'input bad' : 'input'}
              style={{ flex: 1 }}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button className="btn sm" onClick={() => setPassword(suggestPassword())} title="Suggest another">
              <Icon name="edit" size={13} />
            </button>
          </div>
          {errors.password ? (
            <div style={{ color: 'var(--stop)', fontSize: 12 }}>{errors.password}</div>
          ) : (
            <div className="hint">Three words and a number — readable over the phone. At least 8 characters.</div>
          )}
        </div>
      </div>
    </Modal>
  );
}
