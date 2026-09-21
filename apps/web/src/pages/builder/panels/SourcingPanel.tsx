import {
  ORG_ROLES,
  PERSON_ROLES,
  applyLink,
  channelSlug,
  type ApplicationConfig,
  type Block,
  type DirectoryRecord,
  type SourcingChannel,
  type SourcingConfig,
  type TrackWithPhases,
} from '@ceed/shared';
import { useState } from 'react';
import { ApiError, api } from '../../../lib/api';
import { formatDate } from '../../../lib/format';
import { useAsync } from '../../../lib/useAsync';
import { SelectField, TextArea, TextField } from '../../../ui/Field';
import { Icon } from '../../../ui/Icon';
import { ConfirmDialog, useToast } from '../../../ui/Overlays';

/* ------------------------------------------------------------------ */
/* Tabs                                                                */
/* ------------------------------------------------------------------ */

export const SOURCING_TABS = ['Channels', 'Audience', 'Message'] as const;
export type SourcingTab = (typeof SOURCING_TABS)[number];

/* ------------------------------------------------------------------ */
/* Setup                                                               */
/* ------------------------------------------------------------------ */

export function SourcingSetup({
  block,
  config,
  patch,
  track,
  tab = 'Channels',
}: {
  block: Block;
  config: SourcingConfig;
  patch: (partial: Partial<SourcingConfig>) => void;
  track: TrackWithPhases;
  tab?: SourcingTab;
}) {
  if (tab === 'Audience') return <AudienceTab config={config} patch={patch} />;
  if (tab === 'Message') return <MessageTab block={block} config={config} patch={patch} track={track} />;
  return <ChannelsTab block={block} config={config} patch={patch} track={track} />;
}

/** The application this call points at — the first form after it in the track. */
function formOf(track: TrackWithPhases, blockId: string): Block | null {
  const ordered = track.phases.flatMap((p) => p.blocks);
  const index = ordered.findIndex((b) => b.id === blockId);
  return ordered.slice(index === -1 ? 0 : index).find((b) => b.type === 'application') ?? null;
}

/* ---- Channels: where the call is pushed, and the link that proves it ---- */

function ChannelsTab({
  block,
  config,
  patch,
  track,
}: {
  block: Block;
  config: SourcingConfig;
  patch: (partial: Partial<SourcingConfig>) => void;
  track: TrackWithPhases;
}) {
  const [adding, setAdding] = useState('');
  const toast = useToast();
  const form = formOf(track, block.id);
  const token = form ? ((form.config as ApplicationConfig).publicToken ?? '') : '';
  const origin = typeof window === 'undefined' ? '' : window.location.origin;

  const add = () => {
    const label = adding.trim();
    if (!label) return;
    const id = channelSlug(label);
    if (config.channels.some((c) => c.id === id)) {
      toast('That channel already exists.', true);
      return;
    }
    patch({ channels: [...config.channels, { id, label }] });
    setAdding('');
  };

  return (
    <>
      <div className="callout">
        <Icon name="megaphone" size={15} />
        <div>
          A channel is a road the call travels — and a link. Publish its own link and the form stamps every candidacy
          with where it came from, without asking anybody to remember.
        </div>
      </div>

      {!form && (
        <div className="callout warn">
          <Icon name="alert" size={15} />
          <div>Nothing after this block collects applications, so these channels have no form to point at.</div>
        </div>
      )}

      <div className="rows">
        {config.channels.map((channel) => (
          <div className="rowcard" key={channel.id}>
            <div className="rowcard-head">
              <span style={{ flex: 1, fontWeight: 600, fontSize: 13 }}>{channel.label}</span>
              <button
                className="btn ghost icon sm"
                aria-label={`Remove ${channel.label}`}
                onClick={() =>
                  patch({
                    channels: config.channels.filter((c) => c.id !== channel.id),
                    outreach:
                      config.outreach.channelId === channel.id
                        ? { ...config.outreach, channelId: null }
                        : config.outreach,
                  })
                }
              >
                <Icon name="trash" size={13} />
              </button>
            </div>
            {token && (
              <div className="row" style={{ gap: 8, marginTop: 2 }}>
                <code className="faint" style={{ flex: 1, fontSize: 11.5, overflow: 'hidden' }}>
                  {applyLink(token, channel.id, origin)}
                </code>
                <button
                  className="btn ghost sm"
                  onClick={() => {
                    void navigator.clipboard?.writeText(applyLink(token, channel.id, origin));
                    toast('Link copied.');
                  }}
                >
                  <Icon name="copy" size={13} /> Copy
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="row" style={{ gap: 8 }}>
        <input
          className="input"
          value={adding}
          placeholder="LinkedIn, a partner, a university…"
          aria-label="New channel"
          onChange={(e) => setAdding(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
        />
        <button className="btn sm" onClick={add} disabled={!adding.trim()}>
          <Icon name="plus" size={13} /> Add
        </button>
      </div>

      <p className="faint" style={{ margin: 0, fontSize: 12 }}>
        Anyone arriving on the bare link is asked which of these brought them, so a road you did not tag still counts.
      </p>
    </>
  );
}

/* ---- Audience: a question asked of the directory ---- */

function AudienceTab({
  config,
  patch,
}: {
  config: SourcingConfig;
  patch: (partial: Partial<SourcingConfig>) => void;
}) {
  const records = useAsync(() => api.get<DirectoryRecord[]>('/api/records'), 'records');
  const [query, setQuery] = useState('');
  const audience = config.audience;
  const all = records.data ?? [];

  const tags = [...new Set(all.flatMap((r) => r.tags ?? []))].sort();
  const setAudience = (partial: Partial<SourcingConfig['audience']>) =>
    patch({ audience: { ...audience, ...partial } });

  const toggle = (key: 'roles' | 'tags' | 'recordIds', value: string) =>
    setAudience({
      [key]: audience[key].includes(value)
        ? audience[key].filter((v) => v !== value)
        : [...audience[key], value],
    });

  // The same rule the server applies when it resolves who gets written to.
  const caught = all.filter(
    (r) =>
      audience.recordIds.includes(r.id) ||
      ((audience.roles.length > 0 || audience.tags.length > 0) &&
        (audience.roles.some((role) => (r.roles ?? []).includes(role)) ||
          audience.tags.some((tag) => (r.tags ?? []).includes(tag)))),
  );
  const reachable = caught.filter((r) => r.email.trim());

  const needle = query.trim().toLowerCase();
  const found = needle
    ? all.filter((r) => r.name.toLowerCase().includes(needle) || r.email.toLowerCase().includes(needle)).slice(0, 8)
    : [];

  return (
    <>
      <div className="callout">
        <Icon name="users" size={15} />
        <div>
          Who the call is written to, asked of the directory rather than typed out. Add a role or a tag and everyone
          carrying it is in — including whoever joins the directory tomorrow.
        </div>
      </div>

      <div className="field">
        <label>Roles</label>
        <div className="work-pick">
          {[...new Set([...ORG_ROLES, ...PERSON_ROLES])].map((role) => (
            <button
              key={role}
              type="button"
              className={audience.roles.includes(role) ? 'track on' : 'track'}
              onClick={() => toggle('roles', role)}
            >
              {role}
            </button>
          ))}
        </div>
      </div>

      {tags.length > 0 && (
        <div className="field">
          <label>Tags</label>
          <div className="work-pick">
            {tags.map((tag) => (
              <button
                key={tag}
                type="button"
                className={audience.tags.includes(tag) ? 'track on' : 'track'}
                onClick={() => toggle('tags', tag)}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="field">
        <label>And these in particular</label>
        <input
          className="input"
          value={query}
          placeholder="Search the directory…"
          aria-label="Search the directory"
          onChange={(e) => setQuery(e.target.value)}
        />
        {found.length > 0 && (
          <div className="rows" style={{ marginTop: 6 }}>
            {found.map((record) => (
              <button
                type="button"
                key={record.id}
                className={audience.recordIds.includes(record.id) ? 'pick on' : 'pick'}
                onClick={() => toggle('recordIds', record.id)}
              >
                <Icon name={audience.recordIds.includes(record.id) ? 'check' : 'square'} />
                <div>
                  <strong>{record.name}</strong>
                  <span>{record.email || 'No email'}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="card card-pad row wrap" style={{ gap: 10 }}>
        <span className="badge info num">{reachable.length} will be written to</span>
        {caught.length !== reachable.length && (
          <span className="badge warn num">{caught.length - reachable.length} without an email</span>
        )}
        {!caught.length && <span className="faint" style={{ fontSize: 12 }}>Nobody yet.</span>}
      </div>
    </>
  );
}

/* ---- Message: what goes out, and under which channel ---- */

function MessageTab({
  block,
  config,
  patch,
  track,
}: {
  block: Block;
  config: SourcingConfig;
  patch: (partial: Partial<SourcingConfig>) => void;
  track: TrackWithPhases;
}) {
  const form = formOf(track, block.id);
  const token = form ? ((form.config as ApplicationConfig).publicToken ?? '') : '';
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  const setOutreach = (partial: Partial<SourcingConfig['outreach']>) =>
    patch({ outreach: { ...config.outreach, ...partial } });

  const channel: SourcingChannel | null =
    config.channels.find((c) => c.id === config.outreach.channelId) ?? null;

  return (
    <>
      <div className="callout">
        <Icon name="send" size={15} />
        <div>
          The invitation your network receives. It counts as one channel, and that channel&apos;s link is what goes in
          the message — so a candidacy born of this mail comes back carrying it.
        </div>
      </div>

      <SelectField
        label="Goes out as"
        value={config.outreach.channelId ?? ''}
        onChange={(v) => setOutreach({ channelId: v || null })}
        placeholder="No channel — the plain link"
        options={config.channels.map((c) => ({ value: c.id, label: c.label }))}
        help="Pick the channel this mailing belongs to. Add channels in the first tab."
      />

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
        placeholder="Tell them what the programme is, who it is for, and when applications close."
      />

      {token ? (
        <div className="field">
          <label>The link it carries</label>
          <code className="faint" style={{ fontSize: 11.5 }}>
            {applyLink(token, channel?.id ?? null, origin)}
          </code>
          <div className="hint">
            Added to the end of the message when it goes out{channel ? ` and counted as ${channel.label}` : ''}.
          </div>
        </div>
      ) : (
        <div className="callout warn">
          <Icon name="alert" size={15} />
          <div>No application form after this block, so the message has no link to carry.</div>
        </div>
      )}

      <p className="faint" style={{ margin: 0, fontSize: 12 }}>
        Save the block, then send from the <strong>Outreach</strong> tab.
      </p>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Outreach — the action, and what it produced                         */
/* ------------------------------------------------------------------ */

interface Prospect {
  id: string;
  name: string;
  kind: string;
  email: string;
  roles: string[];
}

interface ChannelResult {
  id: string;
  label: string;
  written: number | null;
  applied: number;
  retained: number;
  link: string;
}

interface OutreachView {
  config: SourcingConfig;
  form: { blockId: string; token: string; published: boolean } | null;
  audience: Prospect[];
  unreachable: number;
  channels: ChannelResult[];
  sends: { id: string; subject: string; recipients: string[]; sentAt: string; channelId: string | null }[];
}

export function SourcingOutreach({ block, dirty }: { block: Block; dirty: boolean }) {
  const view = useAsync(() => api.get<OutreachView>(`/api/blocks/${block.id}/outreach`), block.id);
  const [confirm, setConfirm] = useState(false);
  const [sending, setSending] = useState(false);
  const toast = useToast();

  if (view.error) return <div className="empty">{view.error}</div>;
  if (!view.data) return <div className="empty">Loading…</div>;

  const { config, audience, unreachable, channels, sends, form } = view.data;
  const channel = config.channels.find((c) => c.id === config.outreach.channelId) ?? null;

  const send = async () => {
    setSending(true);
    try {
      view.set(await api.post<OutreachView>(`/api/blocks/${block.id}/outreach/send`));
      toast(`Recorded for ${audience.length} recipient${audience.length === 1 ? '' : 's'}.`);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : (err as Error).message, true);
    } finally {
      setSending(false);
    }
  };

  const totals = channels.reduce(
    (acc, c) => ({ applied: acc.applied + c.applied, retained: acc.retained + c.retained }),
    { applied: 0, retained: 0 },
  );

  return (
    <>
      {dirty && (
        <div className="callout warn">
          <Icon name="alert" size={15} />
          You have unsaved changes in Setup. Save them first — the send uses what is stored, not what is on screen.
        </div>
      )}

      {/* ---- what each road brought in ---- */}
      <h3 className="section-title">Where the candidates came from</h3>
      {!channels.length ? (
        <div className="empty" style={{ padding: 26 }}>
          <h3>No channel yet</h3>
          <p>Add the roads the call travels in Setup, and each one gets a link that counts for itself.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Channel</th>
                <th className="num">Written to</th>
                <th className="num">Applied</th>
                <th className="num">Still in</th>
              </tr>
            </thead>
            <tbody>
              {channels.map((c) => (
                <tr key={c.id || 'other'}>
                  <td className="name">{c.label}</td>
                  <td className="num muted">{c.written ?? '—'}</td>
                  <td className="num">{c.applied}</td>
                  <td className="num">{c.retained}</td>
                </tr>
              ))}
              <tr>
                <td className="name faint">All roads</td>
                <td className="num muted">—</td>
                <td className="num">{totals.applied}</td>
                <td className="num">{totals.retained}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      {!form?.published && (
        <p className="faint" style={{ margin: 0, fontSize: 12 }}>
          The form is not published yet, so none of these links work for an applicant.
        </p>
      )}

      {/* ---- the invitation ---- */}
      <h3 className="section-title">The invitation</h3>
      <div className="callout">
        <Icon name="alert" size={15} />
        <div>
          No mail routing is wired in yet, so sending <strong>records</strong> the message and its recipients rather
          than delivering it. Everything else — the audience, the link, the counting — works now.
        </div>
      </div>

      <div className="card card-pad stack" style={{ gap: 10 }}>
        <div className="eyebrow">Ready to send{channel ? ` · as ${channel.label}` : ''}</div>
        <div style={{ fontWeight: 600 }}>{config.outreach.subject || <span className="faint">No subject yet</span>}</div>
        <p className="muted" style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 13 }}>
          {config.outreach.body || 'No message yet.'}
        </p>
        <div className="row wrap">
          <span className="badge info num">{audience.length} recipients</span>
          {unreachable > 0 && <span className="badge warn num">{unreachable} without an email</span>}
          <div className="spacer" />
          <button
            className="btn primary"
            disabled={sending || dirty || !audience.length || !config.outreach.subject.trim()}
            onClick={() => setConfirm(true)}
          >
            <Icon name="send" size={14} /> Send to {audience.length}
          </button>
        </div>
      </div>

      <h3 className="section-title">Sent</h3>
      {!sends.length ? (
        <div className="empty" style={{ padding: 26 }}>
          Nothing sent yet.
        </div>
      ) : (
        <div className="rows">
          {sends.map((s) => (
            <div className="rowcard" key={s.id}>
              <div className="rowcard-head">
                <span style={{ flex: 1, fontWeight: 600, fontSize: 13 }}>{s.subject}</span>
                {s.channelId && (
                  <span className="badge">
                    {config.channels.find((c) => c.id === s.channelId)?.label ?? s.channelId}
                  </span>
                )}
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
          title={`Send to ${audience.length} recipients?`}
          body={`The message and its recipients are recorded against this block${
            channel ? ` and counted as ${channel.label}` : ''
          }. Nothing is delivered until a mail provider is connected.`}
          confirmLabel="Record the send"
          onClose={() => setConfirm(false)}
          onConfirm={async () => {
            setConfirm(false);
            await send();
          }}
        />
      )}
    </>
  );
}
