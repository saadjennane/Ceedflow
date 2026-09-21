import {
  ACCOUNT_STATE_LABEL,
  suggestPassword,
  type DirectoryRecord,
  type RecordAccount,
} from '@ceed/shared';
import { useState } from 'react';
import { ApiError, api } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { Icon } from '../../ui/Icon';
import { Modal, useToast } from '../../ui/Overlays';

/* ------------------------------------------------------------------ */
/* The state, said in one line                                         */
/* ------------------------------------------------------------------ */

export function AccountBadge({ account }: { account: RecordAccount | null }) {
  if (!account) return <span className="badge">No account</span>;
  const tone = account.state === 'claimed' ? 'ok' : account.state === 'invited' ? 'info' : '';
  return <span className={tone ? `badge ${tone}` : 'badge'}>{ACCOUNT_STATE_LABEL[account.state]}</span>;
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
  const toast = useToast();

  const invite = async () => {
    setBusy(true);
    try {
      await api.post(`/api/records/${record.id}/account/invite`);
      toast('Marked as invited. No mail left — that comes with the mail routing.');
      onChanged();
    } catch (err) {
      toast((err as Error).message, true);
    } finally {
      setBusy(false);
    }
  };

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
            <Line label="Opened" value={formatDate(account.createdAt)} />
            {account.invitedAt && <Line label="Invited" value={formatDate(account.invitedAt)} />}

            <p className="faint" style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5 }}>
              {account.state === 'claimed'
                ? 'They chose their own password. Nobody at CEED can read it, and nobody here can change it.'
                : account.state === 'invited'
                  ? 'The invitation went out and they have not come yet. Inviting again is a reminder.'
                  : 'The account is open but nobody has been told. Invite them, or hand the password over yourself.'}
            </p>

            {account.state !== 'claimed' && (
              <div className="row" style={{ gap: 7 }}>
                <button className="btn primary sm" disabled={busy} onClick={invite}>
                  <Icon name="send" size={13} /> {account.state === 'invited' ? 'Invite again' : 'Invite them'}
                </button>
                <button className="btn sm" onClick={() => setOpening(true)}>
                  <Icon name="edit" size={13} /> New password
                </button>
              </div>
            )}
          </>
        )}
      </div>

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
