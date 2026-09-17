import type { Block, SourcingConfig } from '@ceed/shared';
import { useState } from 'react';
import { ApiError, api } from '../../../lib/api';
import { formatDate } from '../../../lib/format';
import { useAsync } from '../../../lib/useAsync';
import { DateField, TagField, TextArea, TextField } from '../../../ui/Field';
import { Icon } from '../../../ui/Icon';
import { ConfirmDialog, useToast } from '../../../ui/Overlays';

export function SourcingSetup({
  config,
  patch,
}: {
  config: SourcingConfig;
  patch: (partial: Partial<SourcingConfig>) => void;
}) {
  const recipients = config.outreach.recipients;
  const emails = recipients.kind === 'list' ? recipients.emails : [];

  const setOutreach = (partial: Partial<SourcingConfig['outreach']>) =>
    patch({ outreach: { ...config.outreach, ...partial } });

  return (
    <>
      <div className="callout">
        <Icon name="megaphone" size={15} />
        Sourcing opens the call: the message you send to your network, and the channels the call runs on. The channels
        listed here become the options a candidate picks from on the application form.
      </div>

      <div className="grid-2">
        <DateField label="Opens on" value={config.opensAt} onChange={(v) => patch({ opensAt: v })} />
        <DateField label="Closes on" value={config.closesAt} onChange={(v) => patch({ closesAt: v })} />
      </div>

      <TagField
        label="Channels"
        values={config.channels}
        onChange={(v) => patch({ channels: v })}
        help="LinkedIn, Instagram, a partner, a university — wherever you are pushing the call."
        placeholder="Add a channel"
      />

      <div className="public-sep" />

      <h3 className="section-title">Prospecting message</h3>

      <TextField
        label="Subject"
        value={config.outreach.subject}
        onChange={(v) => setOutreach({ subject: v })}
        placeholder="Grow 2026 is open — six months of support for Moroccan startups"
      />
      <TextArea
        label="Message"
        value={config.outreach.body}
        onChange={(v) => setOutreach({ body: v })}
        rows={7}
        placeholder="Tell them what the program is, who it is for, and when applications close."
      />
      <TagField
        label="Recipients"
        values={emails}
        onChange={(v) => setOutreach({ recipients: { kind: 'list', emails: v } })}
        help="Addresses for now. Once the directory exists, this becomes an audience query on it."
        placeholder="partner@example.ma"
      />

      <p className="faint" style={{ margin: 0, fontSize: 12 }}>
        Save the block, then send from the <strong>Outreach</strong> tab.
      </p>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Outreach — the action                                               */
/* ------------------------------------------------------------------ */

interface Send {
  id: string;
  subject: string;
  body: string;
  recipients: string[];
  sentAt: string;
}

export function SourcingOutreach({ block, dirty }: { block: Block; dirty: boolean }) {
  const view = useAsync(() => api.get<{ sends: Send[] }>(`/api/blocks/${block.id}/outreach`), block.id);
  const [confirm, setConfirm] = useState(false);
  const [sending, setSending] = useState(false);
  const toast = useToast();

  const config = block.config as SourcingConfig;
  const emails = config.outreach.recipients.kind === 'list' ? config.outreach.recipients.emails : [];
  const valid = emails.filter((e) => e.includes('@'));

  const send = async () => {
    setSending(true);
    try {
      const result = await api.post<{ sends: Send[] }>(`/api/blocks/${block.id}/outreach/send`);
      view.set(result);
      toast(`Recorded for ${valid.length} recipient${valid.length === 1 ? '' : 's'}.`);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : (err as Error).message, true);
    } finally {
      setSending(false);
    }
  };

  if (view.error) return <div className="empty">{view.error}</div>;
  if (!view.data) return <div className="empty">Loading…</div>;

  return (
    <>
      {dirty && (
        <div className="callout warn">
          <Icon name="alert" size={15} />
          You have unsaved changes in Setup. Save them first — the send uses what is stored, not what is on screen.
        </div>
      )}

      <div className="callout">
        <Icon name="alert" size={15} />
        No mail routing is wired in yet, so sending <strong>records</strong> the message and its recipients rather than
        delivering it. The trace below is what a real send will produce once a provider is connected.
      </div>

      <div className="card card-pad stack" style={{ gap: 10 }}>
        <div className="eyebrow">Ready to send</div>
        <div style={{ fontWeight: 600 }}>{config.outreach.subject || <span className="faint">No subject yet</span>}</div>
        <p className="muted" style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 13 }}>
          {config.outreach.body || 'No message yet.'}
        </p>
        <div className="row wrap">
          <span className="badge info num">{valid.length} recipients</span>
          {emails.length !== valid.length && (
            <span className="badge stop num">{emails.length - valid.length} invalid</span>
          )}
          <div className="spacer" />
          <button
            className="btn primary"
            disabled={sending || dirty || !valid.length || !config.outreach.subject.trim()}
            onClick={() => setConfirm(true)}
          >
            <Icon name="send" size={14} /> Send to {valid.length}
          </button>
        </div>
      </div>

      <h3 className="section-title">Sent</h3>
      {!view.data.sends.length ? (
        <div className="empty" style={{ padding: 26 }}>
          Nothing sent yet.
        </div>
      ) : (
        <div className="rows">
          {view.data.sends.map((s) => (
            <div className="rowcard" key={s.id}>
              <div className="rowcard-head">
                <span style={{ flex: 1, fontWeight: 600, fontSize: 13 }}>{s.subject}</span>
                <span className="badge num">{s.recipients.length}</span>
                <span className="faint" style={{ fontSize: 12 }}>
                  {formatDate(s.sentAt)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {confirm && (
        <ConfirmDialog
          title={`Send to ${valid.length} recipients?`}
          body="The message and its recipient list are recorded against this block. Nothing is delivered until a mail provider is connected."
          confirmLabel="Record the send"
          onClose={() => setConfirm(false)}
          onConfirm={send}
        />
      )}
    </>
  );
}
