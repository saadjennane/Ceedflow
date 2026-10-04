/**
 * Looking at the list before writing to it.
 *
 * This dialog exists because the alternative was a side effect: opening the
 * block would have written to everybody it happened to contain, and sixteen
 * founders told by mistake is not something an undo button fixes. So telling
 * them is an act, and the act starts by naming who hears it.
 *
 * Everything shown here comes from the server's own resolution of the list —
 * the counts, the reasons somebody is left out, and the missing items each
 * letter will list. Nothing is worked out again on this side: the number in the
 * button is a promise about who will be written to, and a promise computed
 * twice is a promise that will eventually be broken.
 */
import {
  DELIVERABLE_VARIABLES,
  fillTemplate,
  type Block,
  type BrickStatus,
  type Candidate,
  type DeliverableConfig,
} from '@ceed/shared';
import { useMemo, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { Icon } from '../../ui/Icon';
import { Modal, useToast } from '../../ui/Overlays';

type Blocked = 'none' | 'no_email' | 'no_account' | 'suppressed';

interface Entry {
  candidate: Candidate;
  owes: boolean;
  askedAt: string | null;
  blocked: Blocked;
  owed: string;
}

interface Roster {
  entries: Entry[];
  link: string;
  closesAt: string | null;
  /** The closing day in the words the letter uses — composed by the server, so
      the preview is the letter rather than this screen's rendering of it. */
  dateLabel: string;
}

/** Why somebody hears nothing, in the words the dialog uses. */
const WHY: Record<Exclude<Blocked, 'none'>, string> = {
  no_email: 'no address on the candidacy',
  no_account: 'no account to log into',
  suppressed: 'their address bounced for good',
};

const KNOWN: ReadonlySet<string> = new Set<string>(DELIVERABLE_VARIABLES.map((v) => v.name));

export function NotifyDialog({
  block,
  kind,
  status,
  onDone,
  onClose,
}: {
  block: Block;
  kind: 'request' | 'reminder';
  status: BrickStatus;
  onDone: (view: unknown) => void;
  onClose: () => void;
}) {
  const config = block.config as DeliverableConfig;
  const roster = useAsync(
    () => api.get<Roster>(`/api/blocks/${block.id}/deliverables/roster?kind=${kind}`),
    `${block.id}:${kind}`,
  );
  const [body, setBody] = useState(kind === 'request' ? config.messages.request : config.messages.reminder);
  const [when, setWhen] = useState<'now' | 'later'>('now');
  const [day, setDay] = useState<string | null>(null);
  const [at, setAt] = useState(0);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);
  const toast = useToast();

  const entries = roster.data?.entries ?? [];
  /* The letters, and only them: somebody with no address is on the screen by
     name and out of this list, which is the distinction the dialog is for. */
  const willHear = entries.filter((e) => e.blocked === 'none');
  const left = entries.filter((e) => e.blocked !== 'none');

  /** A name nobody will replace. Left visible rather than emptied, and said. */
  const unknown = useMemo(() => {
    const found = new Set<string>();
    for (const [, name] of body.matchAll(/\{\{\s*([a-zA-Z_]+)\s*\}\}/g)) if (!KNOWN.has(name)) found.add(name);
    return [...found];
  }, [body]);

  const needsLink = body.includes('{{lien}}') && !roster.data?.link;
  const shown = willHear[Math.min(at, Math.max(willHear.length - 1, 0))];
  const letter = shown
    ? fillTemplate(body, {
        startup: shown.candidate.orgName,
        pieces: shown.owed,
        date: roster.data?.dateLabel ?? '',
        lien: roster.data?.link ?? '',
      })
    : '';

  /** Dropped where the cursor is, so the text stays text somebody rearranges. */
  const insert = (name: string) => {
    const el = box.current;
    const token = `{{${name}}}`;
    if (!el) return setBody(body + token);
    const from = el.selectionStart ?? body.length;
    const to = el.selectionEnd ?? from;
    setBody(body.slice(0, from) + token + body.slice(to));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(from + token.length, from + token.length);
    });
  };

  const launch = async () => {
    setBusy(true);
    try {
      onDone(
        await api.post(`/api/blocks/${block.id}/deliverables/notify`, {
          kind,
          scheduledFor: when === 'later' ? day : null,
          body,
        }),
      );
      toast(
        when === 'later'
          ? `Planned for the morning of ${formatDate(day)} — ${willHear.length} startups.`
          : `${willHear.length} letters written.`,
      );
      onClose();
    } catch (err) {
      toast((err as Error).message, true);
    } finally {
      setBusy(false);
    }
  };

  const title = kind === 'request' ? 'Ask for the documents' : 'Chase the files still short';
  const blocking = !willHear.length || needsLink || (when === 'later' && !day);

  return (
    <Modal
      title={title}
      subtitle={
        roster.data
          ? `${willHear.length} will be written to${left.length ? `, ${left.length} cannot be` : ''}.`
          : undefined
      }
      wide
      onClose={onClose}
      footer={
        <>
          <div className="seg" role="group" aria-label="When">
            <button className={when === 'now' ? 'on' : ''} onClick={() => setWhen('now')}>
              Now
            </button>
            <button className={when === 'later' ? 'on' : ''} onClick={() => setWhen('later')}>
              On a date
            </button>
          </div>
          {when === 'later' && (
            <input
              className="input"
              type="date"
              style={{ width: 150 }}
              aria-label="The morning it goes out"
              value={day ?? ''}
              onChange={(e) => setDay(e.target.value || null)}
            />
          )}
          <div className="spacer" />
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={busy || blocking} onClick={() => void launch()}>
            <Icon name="send" size={14} />
            {when === 'later' ? `Plan it (${willHear.length})` : `Send to ${willHear.length}`}
          </button>
        </>
      }
    >
      {roster.error && <div className="empty">{roster.error}</div>}
      {!roster.data && !roster.error && <div className="empty" style={{ padding: 30 }} />}

      {roster.data && (
        <div className="stack" style={{ gap: 12 }}>
          {/* What stands in the way, before anything about the wording: these
              are the only things that make the act go wrong. */}
          {!willHear.length && (
            <div className="callout warn">
              <Icon name="alert" size={15} />
              <div>
                <strong>Nobody to write to.</strong>{' '}
                {kind === 'request'
                  ? 'Every startup on this list has already been asked.'
                  : 'Every file is either complete or waiting on CEED to read it.'}
              </div>
            </div>
          )}
          {needsLink && (
            <div className="callout warn">
              <Icon name="alert" size={15} />
              <div>
                <strong>We don’t know this platform’s own web address yet.</strong> The letter ends on “go here”, and
                there is nowhere to point. Reload this page, or take the link out of the message.
              </div>
            </div>
          )}
          {status !== 'live' && (
            <div className="callout">
              <Icon name="clock" size={15} />
              <div>
                <strong>The list is not open.</strong>{' '}
                {status === 'scheduled'
                  ? 'A letter sent now would arrive before they can send anything — a planned one waits for the opening date rather than going out early.'
                  : 'They would have nothing to send. Open it from the block’s setup first.'}
              </div>
            </div>
          )}
          {unknown.length > 0 && (
            <div className="callout warn">
              <Icon name="alert" size={15} />
              <div>
                <strong>
                  {unknown.map((u) => `{{${u}}}`).join(', ')} {unknown.length === 1 ? 'is not' : 'are not'} a variable.
                </strong>{' '}
                It will go out written exactly like that. Use the buttons below the message.
              </div>
            </div>
          )}

          <div className="compose-split">
            {/* Composing on the left, the letter itself on the right: the two
                things you move between while getting the wording right. */}
            <div className="stack" style={{ gap: 8 }}>
              <div className="field">
                <label htmlFor="notify-body">What they read</label>
                <textarea
                  id="notify-body"
                  ref={box}
                  className="textarea"
                  rows={14}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                />
              </div>
              <div className="row wrap" style={{ gap: 5 }}>
                {DELIVERABLE_VARIABLES.map((v) => (
                  <button key={v.name} className="btn ghost sm" title={v.what} onClick={() => insert(v.name)}>
                    <Icon name="plus" size={11} /> {v.label}
                  </button>
                ))}
              </div>
              <p className="faint" style={{ margin: 0, fontSize: 12 }}>
                Edited here, this goes out once as written — the block’s own template is untouched.
              </p>
            </div>

            <div className="stack" style={{ gap: 8 }}>
              <div className="row" style={{ gap: 6 }}>
                <strong style={{ fontSize: 13, flex: 1 }}>{shown?.candidate.orgName ?? 'Nobody to show'}</strong>
                {willHear.length > 1 && (
                  <>
                    <button
                      className="btn ghost icon sm"
                      aria-label="Previous recipient"
                      disabled={at === 0}
                      onClick={() => setAt(at - 1)}
                    >
                      ‹
                    </button>
                    <span className="faint num" style={{ fontSize: 12 }}>
                      {Math.min(at + 1, willHear.length)} / {willHear.length}
                    </span>
                    <button
                      className="btn ghost icon sm"
                      aria-label="Next recipient"
                      disabled={at >= willHear.length - 1}
                      onClick={() => setAt(at + 1)}
                    >
                      ›
                    </button>
                  </>
                )}
              </div>
              {shown && (
                <p className="faint" style={{ margin: 0, fontSize: 12 }}>
                  to {shown.candidate.contactName || 'the candidacy contact'} · {shown.candidate.email}
                </p>
              )}
              {/* The letter, filled in. This is the only place the per-recipient
                  variable is visible as the thing that differs. */}
              <pre className="letter">{letter || 'Nothing to preview.'}</pre>
              {shown && !shown.owed && body.includes('{{pieces}}') && (
                <p className="warnline" style={{ margin: 0, fontSize: 12 }}>
                  This one owes nothing — the list in the middle of its letter is empty.
                </p>
              )}
            </div>
          </div>

          {/* Named, and left out by name: a count alone would not let anybody
              notice that the one startup missing is the one that matters. */}
          {left.length > 0 && (
            <details>
              <summary className="faint" style={{ fontSize: 12.5, cursor: 'pointer' }}>
                {left.length} will hear nothing
              </summary>
              <div className="rows" style={{ marginTop: 6 }}>
                {left.map((e) => (
                  <div className="rowcard" key={e.candidate.id} style={{ padding: '6px 10px', gap: 10 }}>
                    <span style={{ flex: 1, fontSize: 13 }}>{e.candidate.orgName}</span>
                    <span className="badge warn">{WHY[e.blocked as Exclude<Blocked, 'none'>]}</span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </Modal>
  );
}
