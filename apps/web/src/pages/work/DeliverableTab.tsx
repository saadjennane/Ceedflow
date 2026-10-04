import { type Block, type BrickStatus, type Candidate, type FormField } from '@ceed/shared';
import { useState } from 'react';
import { api } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { Icon } from '../../ui/Icon';
import { Modal, useToast } from '../../ui/Overlays';
import { download, toWorkbook, type Cell } from '../../lib/xlsx';
import { NotifyDialog } from './NotifyDialog';

type State = 'received' | 'accepted' | 'rejected';

interface ReturnView {
  itemId: string;
  value: unknown;
  state: State;
  reason: string;
  returnedAt: string | null;
  reviewedAt: string | null;
}

interface Row {
  candidate: Candidate;
  returns: ReturnView[];
  done: number;
  accepted: number;
  rejected: number;
  owes: boolean;
  required: number;
  complete: boolean;
  askedAt: string | null;
  delivery: 'arrived' | 'flying' | 'lost' | null;
  blocked: 'none' | 'no_email' | 'no_account' | 'suppressed';
}

interface Notice {
  id: string;
  kind: 'request' | 'reminder';
  state: 'planned' | 'sent' | 'cancelled' | 'abandoned';
  reason: string;
  scheduledFor: string;
  sentAt: string | null;
  createdByName: string;
  named: number;
  wrote: number;
  skipped: Record<string, number>;
}

interface View {
  blockId: string;
  name: string;
  intro: string;
  status: BrickStatus;
  items: FormField[];
  rows: Row[];
  notices: Notice[];
}

/** Why a startup will hear nothing — the same words the launch dialog uses. */
const WHY: Record<Row['blocked'], string> = {
  none: '',
  no_email: 'No address on the candidacy — nothing to write to.',
  no_account: 'No account to log into, so a link would lead nowhere.',
  suppressed: 'Their address bounced for good; nothing is sent to it again.',
};

const given = (value: unknown) =>
  !(value === null || value === undefined || value === '' || (Array.isArray(value) && !value.length));

/** What a value looks like in a cell: a file opens, anything else is read. */
function Given({ value }: { value: unknown }) {
  if (!given(value)) return <span className="faint">—</span>;
  if (typeof value === 'object' && value !== null && 'uploadId' in value) {
    const file = value as { uploadId: string; filename: string };
    return (
      <a href={`/api/uploads/${file.uploadId}`} target="_blank" rel="noreferrer" title={file.filename}>
        <Icon name="file" size={13} /> {file.filename}
      </a>
    );
  }
  return <>{Array.isArray(value) ? value.join(', ') : String(value)}</>;
}

/**
 * One thing handed in, with what CEED made of it.
 *
 * The two buttons only appear on something nobody has read yet. Once a cell
 * has been judged it says so and offers the way back instead — a row of
 * identical controls on every cell would make a read file look exactly like
 * an unread one, which is the distinction this whole screen is for.
 */
function Cell({
  got,
  onAccept,
  onSendBack,
  onReopen,
}: {
  got: ReturnView | undefined;
  onAccept: () => void;
  onSendBack: () => void;
  onReopen: () => void;
}) {
  if (!got || !given(got.value)) return <span className="faint">—</span>;

  if (got.state === 'accepted') {
    return (
      <span className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
        <Given value={got.value} />
        <button
          className="btn ghost icon sm"
          title="Accepted — put it back to unread"
          aria-label="Put back to unread"
          style={{ color: 'var(--ok)' }}
          onClick={onReopen}
        >
          <Icon name="check" size={13} />
        </button>
      </span>
    );
  }

  if (got.state === 'rejected') {
    return (
      <span className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
        <span className="faint" style={{ textDecoration: 'line-through' }}>
          <Given value={got.value} />
        </span>
        <span className="badge warn" title={got.reason}>
          Sent back
        </span>
      </span>
    );
  }

  return (
    <span className="row" style={{ gap: 4, justifyContent: 'flex-end' }}>
      <Given value={got.value} />
      <button className="btn ghost icon sm" title="In order" aria-label="Accept" onClick={onAccept}>
        <Icon name="check" size={13} />
      </button>
      <button
        className="btn ghost icon sm"
        title="Send it back"
        aria-label="Send it back"
        style={{ color: 'var(--stop)' }}
        onClick={onSendBack}
      >
        <Icon name="x" size={13} />
      </button>
    </span>
  );
}

/**
 * Who has sent what.
 *
 * The same matrix, read along either axis: by startup to ask whether a file is
 * complete, by item to ask who still owes the RIB. Those are the two questions
 * the work actually poses, a day apart, and turning the table is cheaper than
 * keeping two screens that can disagree.
 */
export function DeliverableTab({ block }: { block: Block }) {
  const view = useAsync(() => api.get<View>(`/api/blocks/${block.id}/deliverables`), block.id);
  const [by, setBy] = useState<'startup' | 'item'>('startup');
  const [sendingBack, setSendingBack] = useState<{ row: Row; item: FormField } | null>(null);
  const [reason, setReason] = useState('');
  const [notifying, setNotifying] = useState<'request' | 'reminder' | null>(null);
  /* Writing to one startup, from its own row. Always offered: the list's
     filters build a list nobody has looked at, and somebody pressing this has
     looked — at a letter that came back, or at an address fixed since. */
  const [writingTo, setWritingTo] = useState<Row | null>(null);
  const toast = useToast();

  const review = async (candidateId: string, itemId: string, state: State, why = '') => {
    try {
      view.set(
        await api.post<View>(`/api/blocks/${block.id}/deliverables/${candidateId}/review`, {
          itemId,
          state,
          reason: why,
        }),
      );
    } catch (err) {
      toast((err as Error).message, true);
    }
  };

  if (view.error) return <div className="empty">{view.error}</div>;
  if (!view.data) return <div className="empty" style={{ padding: 40 }} />;
  const { items, rows } = view.data;

  if (!items.length) {
    return (
      <div className="empty">
        <h3>Nothing is being asked yet</h3>
        <p>Open this block's setup and list what a file needs — the documents and the figures both.</p>
      </div>
    );
  }
  if (!rows.length) {
    return (
      <div className="empty">
        <h3>Nobody has reached this step</h3>
        <p>Startups arrive here once they pass the selection before it.</p>
      </div>
    );
  }

  const valueOf = (row: Row, itemId: string) => row.returns.find((r) => r.itemId === itemId);
  const sentFor = (itemId: string) => rows.filter((row) => given(valueOf(row, itemId)?.value)).length;
  const complete = rows.filter((r) => r.complete).length;

  /* The two acts, counted the way the server resolves them: whoever has not
     been asked, and whoever still owes something they can act on.
     Reachable only — the number is in the button, so it is a promise about
     what pressing it does. Counting a startup with no address there offered
     an act that could not happen: the button said one, the dialog said none,
     and the only thing left to press was Cancel. Who cannot be reached is the
     callout's business, which names them. */
  const unheard = rows.filter((r) => !r.askedAt);
  const toAsk = unheard.filter((r) => r.blocked === 'none').length;
  const toChase = rows.filter((r) => r.askedAt && r.owes && r.blocked === 'none').length;
  const mute = unheard.length - toAsk;
  const asked = rows.length - unheard.length;
  const planned = view.data.notices.filter((n) => n.state === 'planned');

  const cancel = async (noticeId: string) => {
    try {
      view.set(await api.post<View>(`/api/blocks/${block.id}/deliverables/notices/${noticeId}/cancel`, {}));
      toast('Called off.');
    } catch (err) {
      toast((err as Error).message, true);
    }
  };

  const exportMatrix = () => {
    const head: Cell[] = ['Startup', 'Contact', 'Dossier'];
    for (const item of items) head.push(item.required ? `${item.label} *` : item.label);
    const sheet: Cell[][] = [head];
    for (const row of rows) {
      const line: Cell[] = [
        row.candidate.orgName,
        row.candidate.contactName || '',
        `${row.done}/${row.required}`,
      ];
      for (const item of items) {
        const got = valueOf(row, item.id)?.value;
        if (!given(got)) line.push('');
        else if (typeof got === 'object' && got !== null && 'filename' in got) {
          line.push(String((got as { filename: string }).filename));
        } else line.push(Array.isArray(got) ? got.join(', ') : (got as string | number));
      }
      sheet.push(line);
    }
    download(
      toWorkbook([{ name: block.name.slice(0, 31) || 'Deliverables', rows: sheet }]),
      `${block.name} — ${new Date().toISOString().slice(0, 10)}.xlsx`.replace(/[/\\:*?"<>|]/g, '-'),
    );
  };

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="row wrap">
        <span className="badge num">{rows.length} startups</span>
        <span className={complete === rows.length ? 'badge ok' : 'badge'}>
          <span className="num">{complete}</span> complete
        </span>
        {/* The axis, not a filter: the same rows either way. */}
        <div className="seg" role="group" aria-label="Read by">
          <button className={by === 'startup' ? 'on' : ''} onClick={() => setBy('startup')}>
            By startup
          </button>
          <button className={by === 'item' ? 'on' : ''} onClick={() => setBy('item')}>
            By item
          </button>
        </div>
        <div className="spacer" />
        <button className="btn sm" onClick={exportMatrix}>
          <Icon name="file" size={13} /> Export
        </button>
        {/* Chasing is offered only once there is somebody who has been asked
            and is late. Before that it would be a button for nothing. */}
        {toChase > 0 && (
          <button className="btn sm" onClick={() => setNotifying('reminder')}>
            <Icon name="clock" size={13} /> Chase {toChase}
          </button>
        )}
        {toAsk > 0 && (
          <button className="btn primary sm" onClick={() => setNotifying('request')}>
            <Icon name="send" size={13} /> Ask {toAsk} startup{toAsk === 1 ? '' : 's'}
          </button>
        )}
      </div>

      {/* Where this stands as an act, not as a table. The three states are the
          three questions somebody opening this tab actually has: has anybody
          been told, is anything waiting to go, and is anybody still late. */}
      {asked === 0 && toAsk > 0 ? (
        <div className="callout">
          <Icon name="alert" size={15} />
          <div>
            <strong>Nobody has been asked yet.</strong> The list below is who the selection kept — opening the block
            lets them send, and asking them is what tells them to.
          </div>
        </div>
      ) : unheard.length > 0 ? (
        <div className="callout warn">
          <Icon name="alert" size={15} />
          <div>
            <strong>
              {unheard.length} of {rows.length} have not been asked.
            </strong>{' '}
            {mute > 0 && (
              <>
                {mute === unheard.length ? (mute === 1 ? 'That one has' : 'They have') : `${mute} of them have`}{' '}
                nothing to write to — no address, no account, or an address that bounced. Fixing that in the directory
                puts them back on the list.{' '}
              </>
            )}
            {toAsk > 0 && 'The rest are startups the selection has added since the last send.'}
          </div>
        </div>
      ) : (
        <div className="callout ok">
          <Icon name="check" size={15} />
          <div>
            <strong>All {rows.length} have been asked.</strong>{' '}
            {toChase > 0
              ? `${toChase} still owe something — chasing writes to those, and to nobody whose file is only waiting on us.`
              : 'Nothing is outstanding on their side.'}
          </div>
        </div>
      )}

      {/* Planned, and callable off until the morning it goes. */}
      {planned.length > 0 && (
        <div className="rows">
          {planned.map((n) => (
            <div className="rowcard row" key={n.id} style={{ padding: '8px 11px', gap: 10 }}>
              <Icon name="clock" size={14} />
              <span style={{ flex: 1, fontSize: 13 }}>
                {n.kind === 'request' ? 'Request' : 'Reminder'} to <span className="num">{n.named}</span>, the morning
                of {formatDate(n.scheduledFor.slice(0, 10))}
                {n.createdByName && <span className="faint"> · set by {n.createdByName}</span>}
              </span>
              <button className="btn ghost sm" onClick={() => void cancel(n.id)}>
                Call it off
              </button>
            </div>
          ))}
        </div>
      )}

      {/* A send that did not reach everybody it named says so here, once, with
          the reason — never folded into a count that reads as success. */}
      {view.data.notices
        .filter((n) => n.state === 'sent' && Object.keys(n.skipped).length > 0)
        .slice(0, 1)
        .map((n) => (
          <p className="warnline" key={n.id} style={{ margin: 0, fontSize: 12.5 }}>
            Last send: {n.wrote} written, {n.named - n.wrote} not —{' '}
            {Object.entries(n.skipped)
              .map(([why, count]) => `${count} ${why.replace(/_/g, ' ')}`)
              .join(', ')}
            .
          </p>
        ))}
      {view.data.notices
        .filter((n) => n.state === 'abandoned')
        .slice(0, 1)
        .map((n) => (
          <p className="warnline" key={n.id} style={{ margin: 0, fontSize: 12.5 }}>
            A {n.kind} planned for {formatDate(n.scheduledFor.slice(0, 10))} never went out. {n.reason}
          </p>
        ))}

      {view.data.intro && (
        <p className="faint" style={{ margin: 0, fontSize: 12.5 }}>
          They are told: “{view.data.intro}”
        </p>
      )}

      {by === 'startup' ? (
        <div className="table-wrap tall">
          <table className="data score-table">
            <thead>
              <tr>
                <th>Startup</th>
                <th>Asked</th>
                <th>File</th>
                {items.map((item) => (
                  <th key={item.id} title={item.help || undefined}>
                    {item.label || 'Untitled'}
                    {item.required && <span style={{ color: 'var(--stop)' }}> *</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.candidate.id}>
                  <td className="name">{row.candidate.orgName}</td>
                  <td>
                    {/* Whether this one knows it is being asked. The ones who
                        cannot be written to carry why, because that is the row
                        somebody has to go and fix in the directory. */}
                    {row.askedAt ? (
                      /* The date is when we wrote; the word after it is whether
                         it arrived. A letter that came back is not a startup
                         that was told, and a column that showed only the date
                         would read as though it were. */
                      <span className="row" style={{ gap: 5, fontSize: 12 }}>
                        <span className="faint">{formatDate(row.askedAt.slice(0, 10))}</span>
                        {row.delivery === 'lost' ? (
                          <span className="badge warn" title="It came back, or could not be written.">
                            did not arrive
                          </span>
                        ) : row.delivery === 'arrived' ? (
                          <span style={{ color: 'var(--ok)' }} title="Their mail server took it.">
                            <Icon name="check" size={12} />
                          </span>
                        ) : null}
                      </span>
                    ) : row.blocked !== 'none' ? (
                      <span className="badge warn" title={WHY[row.blocked]}>
                        {row.blocked === 'no_email' ? 'No address' : row.blocked === 'no_account' ? 'No account' : 'Bounced'}
                      </span>
                    ) : (
                      <span className="faint" style={{ fontSize: 12 }}>
                        Not yet
                      </span>
                    )}
                    <button
                      className="btn ghost icon sm"
                      style={{ marginLeft: 4 }}
                      aria-label={`Write to ${row.candidate.orgName}`}
                      title={
                        row.blocked !== 'none'
                          ? WHY[row.blocked]
                          : row.askedAt
                            ? 'Write to this one again'
                            : 'Write to this one now'
                      }
                      disabled={row.blocked !== 'none'}
                      onClick={() => setWritingTo(row)}
                    >
                      <Icon name="send" size={12} />
                    </button>
                  </td>
                  <td>
                    {/* Accepted over required, because a file nobody has read
                        is not a file in order. What merely arrived is said
                        beside it, in the quieter tone. */}
                    <span className={row.complete ? 'badge ok num' : 'badge num'}>
                      {row.accepted}/{row.required}
                    </span>
                    {row.rejected > 0 && (
                      <span className="badge warn num" style={{ marginLeft: 5 }}>
                        {row.rejected} back
                      </span>
                    )}
                  </td>
                  {items.map((item) => {
                    const got = valueOf(row, item.id);
                    return (
                      <td
                        key={item.id}
                        className="muted"
                        style={{ textAlign: 'right' }}
                        title={got?.returnedAt ? `Sent ${formatDate(got.returnedAt.slice(0, 10))}` : undefined}
                      >
                        <Cell
                          got={got}
                          onAccept={() => void review(row.candidate.id, item.id, 'accepted')}
                          onSendBack={() => { setReason(''); setSendingBack({ row, item }); }}
                          onReopen={() => void review(row.candidate.id, item.id, 'received')}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        /* The other axis: one block per thing asked for, and who is missing it
           listed by name — which is what chasing a single document needs. */
        <div className="stack" style={{ gap: 10 }}>
          {items.map((item) => {
            const sent = sentFor(item.id);
            const missing = rows.filter((row) => !given(valueOf(row, item.id)?.value));
            return (
              <section className="card" key={item.id}>
                <div className="rowcard-head" style={{ padding: '12px 16px' }}>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ fontSize: 15, margin: 0 }}>
                      {item.label || 'Untitled'}
                      {item.required && <span style={{ color: 'var(--stop)' }}> *</span>}
                    </h3>
                    {item.help && (
                      <p className="faint" style={{ margin: '2px 0 0', fontSize: 12.5 }}>
                        {item.help}
                      </p>
                    )}
                  </div>
                  <span className={sent === rows.length ? 'badge ok num' : 'badge num'}>
                    {sent}/{rows.length}
                  </span>
                </div>
                <div className="rows" style={{ padding: 12 }}>
                  {rows.map((row) => {
                    const got = valueOf(row, item.id);
                    return (
                      <div className="rowcard row" key={row.candidate.id} style={{ padding: '8px 11px', gap: 12 }}>
                        {/* The ones still missing read heavier: this list is
                            for chasing, and the names to chase are the point. */}
                        <span style={{ flex: 1, fontSize: 13, fontWeight: given(got?.value) ? 400 : 600 }}>
                          {row.candidate.orgName}
                        </span>
                        <span className="faint" style={{ fontSize: 12, flexShrink: 0 }}>
                          {got?.returnedAt ? formatDate(got.returnedAt.slice(0, 10)) : ''}
                        </span>
                        <span style={{ fontSize: 13, textAlign: 'right', minWidth: 160 }}>
                          <Cell
                            got={got}
                            onAccept={() => void review(row.candidate.id, item.id, 'accepted')}
                            onSendBack={() => { setReason(''); setSendingBack({ row, item }); }}
                            onReopen={() => void review(row.candidate.id, item.id, 'received')}
                          />
                        </span>
                      </div>
                    );
                  })}
                  {missing.length === 0 && (
                    <p className="faint" style={{ margin: 0, fontSize: 12.5 }}>
                      Everybody has sent this one.
                    </p>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {notifying && (
        <NotifyDialog
          block={block}
          kind={notifying}
          status={view.data.status}
          onDone={(next) => view.set(next as View)}
          onClose={() => setNotifying(null)}
        />
      )}

      {writingTo && (
        <NotifyDialog
          block={block}
          /* A startup that owes nothing would get a chase about nothing, so
             the letter matches what is actually true of it. */
          kind={writingTo.askedAt && writingTo.owes ? 'reminder' : 'request'}
          status={view.data.status}
          only={{ id: writingTo.candidate.id, name: writingTo.candidate.orgName }}
          onDone={(next) => view.set(next as View)}
          onClose={() => setWritingTo(null)}
        />
      )}

      {/* A reason is asked for, not offered: "send it again" with nothing
          attached is how a file goes round twice. */}
      {sendingBack && (
        <Modal
          title={`Send ${sendingBack.item.label || 'this'} back to ${sendingBack.row.candidate.orgName}?`}
          subtitle="They see what you write here, and sending it again puts it back to unread."
          onClose={() => setSendingBack(null)}
          footer={
            <>
              <div className="spacer" />
              <button className="btn ghost" onClick={() => setSendingBack(null)}>
                Cancel
              </button>
              <button
                className="btn primary"
                disabled={!reason.trim()}
                onClick={async () => {
                  const { row, item } = sendingBack;
                  setSendingBack(null);
                  await review(row.candidate.id, item.id, 'rejected', reason.trim());
                }}
              >
                Send it back
              </button>
            </>
          }
        >
          <div className="field">
            <label>What has to be fixed</label>
            <textarea
              className="textarea"
              rows={3}
              autoFocus
              value={reason}
              placeholder="The registre is from 2024 — we need one less than three months old."
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        </Modal>
      )}
    </div>
  );
}
