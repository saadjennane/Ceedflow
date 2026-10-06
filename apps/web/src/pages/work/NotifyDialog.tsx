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
  /** The substitutions the sender will make for this one, composed server-side. */
  values: Record<string, string>;
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
  // Said of a person, not of a candidacy: this window also writes to jurors
  // and to a directory nobody has applied from yet.
  no_email: 'no address on file',
  no_account: 'no account to log into',
  suppressed: 'their address bounced for good',
};



/** One letter already written to this startup, and what became of it. */
interface Letter {
  id: string;
  kind: string;
  state: 'queued' | 'held' | 'sent' | 'failed' | 'bounced';
  error: string;
  createdAt: string;
  sentAt: string | null;
  deliveredAt: string | null;
}

const BECAME: Record<Letter['state'], string> = {
  held: 'written, not sent',
  queued: 'waiting to go',
  sent: 'handed over',
  failed: 'could not be sent',
  bounced: 'came back',
};

export function NotifyDialog({
  block,
  kind,
  status,
  only,
  rosterPath,
  notifyPath,
  title: given,
  onBack,
  body: template,
  variables = DELIVERABLE_VARIABLES,
  onDone,
  onClose,
}: {
  block: Block;
  kind: string;
  status: BrickStatus;
  /** One startup, named from its own row — rather than whoever the list says. */
  only?: { id: string; name: string };
  /* Where the list comes from and where the act goes. Defaulted to the
     deliverables pair rather than made compulsory, because every brick that
     writes to startups uses this same window and only these two differ. */
  rosterPath?: string;
  notifyPath?: string;
  title?: string;
  /** A step back to the audience it was chosen from, where there was one. */
  onBack?: () => void;
  /** The template for this kind. Defaults to the deliverables block's own. */
  body?: string;
  variables?: readonly { name: string; label: string; what: string }[];
  onDone: (view: unknown) => void;
  onClose: () => void;
}) {
  const config = block.config as DeliverableConfig;
  const from = rosterPath ?? `/api/blocks/${block.id}/deliverables/roster`;
  const to = notifyPath ?? `/api/blocks/${block.id}/deliverables/notify`;
  const roster = useAsync(
    () => api.get<Roster>(`${from}?kind=${kind}${only ? `&candidateId=${only.id}` : ''}`),
    `${from}:${kind}:${only?.id ?? ''}`,
  );
  /* What has already gone to this one, read before writing again: "we told
     them" and "it reached them" are different answers, and the second is the
     one somebody acts on. */
  const history = useAsync(
    () =>
      only
        ? api.get<Letter[]>(`/api/blocks/${block.id}/deliverables/${only.id}/letters`)
        : Promise.resolve([] as Letter[]),
    `${block.id}:${only?.id ?? ''}`,
  );
  const [body, setBody] = useState(
    template ?? (kind === 'request' ? config.messages.request : config.messages.reminder),
  );
  /* Reading, not writing, is what this window is for: the wording was settled
     in the block's Messages tab, and what you came here to check is who gets
     it and what it says to them. So the letter opens full width and the editor
     is one press away — rather than half a window of textarea you did not ask
     for. */
  const [writing, setWriting] = useState(false);
  const [trying, setTrying] = useState(false);
  const [tryAt, setTryAt] = useState('');
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
    const known = new Set<string>(variables.map((v) => v.name));
    const found = new Set<string>();
    for (const [, name] of body.matchAll(/\{\{\s*([a-zA-Z_]+)\s*\}\}/g)) if (!known.has(name)) found.add(name);
    return [...found];
  }, [body, variables]);

  /* Asked of the substitutions the sender will actually make, not of a field
     beside them: the committee's roster left that field empty while every
     letter carried its link, so the warning fired on a letter that was fine —
     and it blocks sending, which made it a false refusal. */
  const needsLink = body.includes('{{lien}}') && willHear.length > 0 && !willHear[0]!.values.lien;
  /* Who would be handed a first password, if the message asked for one. The
     default templates do; a block set up before the variable existed kept its
     own wording and does not — and nothing would say so, which is how
     twenty-five people are sent to a page they cannot open. */
  const newcomers = willHear.filter((e) => e.values.acces).length;
  const silentOnAccess = newcomers > 0 && !body.includes('{{acces}}');
  const shown = willHear[Math.min(at, Math.max(willHear.length - 1, 0))];
  /* Filled with what the server says it will fill — never with a map this
     screen assembles. The preview's whole job is to be the letter, and a
     second map is a second chance to show one nobody receives. */
  const letter = shown ? fillTemplate(body, shown.values) : '';

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

  const tryIt = async () => {
    if (!shown) return;
    setBusy(true);
    try {
      const out = await api.post<{ live: boolean; state: string; error: string }>(
        `/api/blocks/${block.id}/notices/test`,
        { kind, body, subjectId: shown.candidate.id, to: tryAt.trim() },
      );
      /* What actually happened, from the provider itself. Announcing "sent"
         before anything was attempted is how somebody watches an inbox for a
         letter that was refused — and a refusal names the address or the
         domain that refused it, which is the only way to tell "my gmail works
         but my colleague's does not" from a product fault. */
      if (!out.live) {
        toast('Written and held — nothing leaves outside production.');
      } else if (out.state === 'sent') {
        toast(`Sent to ${tryAt.trim()}.`);
      } else {
        toast(`Not sent — ${out.error || 'the provider refused it.'}`, true);
      }
      if (out.state !== 'failed') setTrying(false);
    } catch (err) {
      toast((err as Error).message, true);
    } finally {
      setBusy(false);
    }
  };

  const launch = async () => {
    setBusy(true);
    try {
      onDone(
        await api.post(to, {
          kind,
          scheduledFor: when === 'later' ? day : null,
          body,
          ...(only ? { candidateId: only.id } : {}),
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

  const title = only ? `Write to ${only.name}` : (given ?? (kind === 'request' ? 'Ask for the documents' : 'Chase the files still short'));
  const blocking = !willHear.length || needsLink || (when === 'later' && !day);

  return (
    <Modal
      title={title}
      subtitle={
        !roster.data
          ? undefined
          : only
            ? left.length
              ? `${only.name} cannot be written to.`
              : 'This one, whatever the list says — a letter that came back, or an address fixed since.'
            : `${willHear.length} will be written to${left.length ? `, ${left.length} cannot be` : ''}.`
      }
      wide
      full={writing}
      onBack={onBack}
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
                {only
                  ? `${only.name} has no address that can be reached — fix it on their record first.`
                  : kind === 'request'
                    ? 'Every startup on this list has already been asked.'
                    : 'Every file is either complete or waiting on CEED to read it.'}
              </div>
            </div>
          )}

          {/* What was already written to them, oldest fact first in each line:
              when, and what became of it. A date alone would read as "they
              know", which a letter that came back is not. */}
          {only && history.data && history.data.length > 0 && (
            <div className="rows">
              {history.data.map((letter) => (
                <div className="rowcard row" key={letter.id} style={{ padding: '6px 10px', gap: 10, fontSize: 12.5 }}>
                  <span className="faint" style={{ width: 86, flexShrink: 0 }}>
                    {formatDate(letter.createdAt.slice(0, 10))}
                  </span>
                  <span style={{ flex: 1 }}>{letter.kind.replace(/^deliverable_/, '').replace(/_/g, ' ')}</span>
                  {letter.deliveredAt ? (
                    <span className="badge ok">arrived</span>
                  ) : letter.state === 'bounced' || letter.state === 'failed' ? (
                    <span className="badge warn" title={letter.error}>
                      {BECAME[letter.state]}
                    </span>
                  ) : (
                    <span className="faint">{BECAME[letter.state]}</span>
                  )}
                </div>
              ))}
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
          {silentOnAccess && (
            <div className="callout warn">
              <Icon name="alert" size={15} />
              <div>
                <strong>
                  {newcomers === 1
                    ? 'One of them has no account yet'
                    : `${newcomers} of them have no account yet`}
                  , and this message does not say how to get in.
                </strong>{' '}
                They would be sent to a page they cannot open. Add <strong>First login</strong> to the message — it
                stays empty for everybody who already signs in.
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

          {/* The letter, and the way to step through them. */}
          <div className={writing ? 'compose-split' : undefined}>
            {/* Composing on the left, the letter itself on the right: the two
                things you move between while getting the wording right. */}
            {writing && (
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
                {variables.map((v) => (
                  <button key={v.name} className="btn ghost sm" title={v.what} onClick={() => insert(v.name)}>
                    <Icon name="plus" size={11} /> {v.label}
                  </button>
                ))}
              </div>
              <p className="faint" style={{ margin: 0, fontSize: 12 }}>
                Edited here, this goes out once as written — the block’s own template is untouched.
              </p>
            </div>
            )}

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
              <pre className="letter" style={writing ? undefined : { maxHeight: 420 }}>
                {letter || 'Nothing to preview.'}
              </pre>
              {shown && !shown.owed && body.includes('{{pieces}}') && (
                <p className="warnline" style={{ margin: 0, fontSize: 12 }}>
                  This one owes nothing — the list in the middle of its letter is empty.
                </p>
              )}

              <div className="row wrap" style={{ gap: 7 }}>
                <button className="btn ghost sm" onClick={() => setWriting(!writing)}>
                  <Icon name="edit" size={13} /> {writing ? 'Done editing' : 'Edit the message'}
                </button>
                {/* Trying it on yourself before twenty-five people read it.
                    It changes nothing: nobody is recorded as told, and no
                    account is opened by looking. */}
                <button className="btn ghost sm" onClick={() => setTrying(!trying)} disabled={!shown}>
                  <Icon name="send" size={13} /> Send a test
                </button>
              </div>

              {trying && (
                <div className="row wrap" style={{ gap: 7 }}>
                  <input
                    className="input"
                    type="email"
                    style={{ flex: 1, minWidth: 180 }}
                    placeholder="your@address.test"
                    aria-label="Where to send the test"
                    value={tryAt}
                    onChange={(e) => setTryAt(e.target.value)}
                  />
                  <button className="btn sm" disabled={!tryAt.trim() || busy} onClick={() => void tryIt()}>
                    Send it
                  </button>
                  <span className="faint" style={{ fontSize: 12, flexBasis: '100%' }}>
                    {shown ? `The letter as ${shown.candidate.orgName} would read it. Nothing is recorded.` : ''}
                  </span>
                </div>
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
                  <div className="rowcard row" key={e.candidate.id} style={{ padding: '6px 10px', gap: 10 }}>
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
