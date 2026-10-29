/**
 * Préparer une séance, du côté de la startup — dans son espace, connectée.
 *
 * The booking link only picks a time; what the startup writes before the
 * session is written here, behind its sign-in. The interlocutor reads it
 * beforehand and may correct it; once locked, the startup reads the corrected
 * version without changing it.
 */
import { type FormField, type FormPage } from '@ceed/shared';
import { useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { Icon } from '../../ui/Icon';
import { PrepForm } from '../../ui/PrepForm';
import '../../ui/builder.css';
import '../../ui/directory.css';

interface Prepare {
  id: string;
  blockName: string;
  programName: string;
  orgName: string;
  personName: string;
  heldOn: string | null;
  startTime: string | null;
  location: string;
  meetingLink: string;
  token?: string;
  status: 'planned' | 'held' | 'cancelled' | 'no_show';
  prep: {
    pages: { page: FormPage; fields: FormField[] }[];
    answers: Record<string, unknown>;
    locked: boolean;
    submittedAt: string | null;
    editedByName: string;
  } | null;
}

export function PreparePage() {
  const { meetingId = '' } = useParams();
  const page = useAsync(() => api.get<Prepare>(`/api/me/prepare/${meetingId}`), meetingId);
  const navigate = useNavigate();

  useEffect(() => {
    const next = encodeURIComponent(`/prepare/${meetingId}`);
    if (page.error?.includes('Sign in')) navigate(`/login?next=${next}`);
    else if (page.error?.includes('Choose your own password')) navigate(`/me?next=${next}`);
  }, [page.error, navigate, meetingId]);

  if (page.loading) return <div className="member-shell" />;
  if (page.error || !page.data) {
    return (
      <div className="member-shell">
        <div className="member-body">
          <div className="empty">{page.error ?? 'Not found.'}</div>
        </div>
      </div>
    );
  }
  const data = page.data;
  const prep = data.prep;

  return (
    <div className="member-shell">
      <div className="member-bar">
        <Link className="btn ghost sm" to="/me">
          <Icon name="chevronLeft" size={13} /> My space
        </Link>
        <span style={{ flex: 1, minWidth: 0 }}>
          <strong style={{ fontSize: 13 }}>
            {data.blockName}
            {data.personName ? ` · with ${data.personName}` : ''}
          </strong>
          <span className="faint" style={{ display: 'block', fontSize: 12 }}>
            {data.orgName} · {data.programName}
            {data.heldOn ? ` · ${formatDate(data.heldOn)}${data.startTime ? ` ${data.startTime}` : ''}` : ''}
            {data.location ? ` · ${data.location}` : ''}
          </span>
          {data.meetingLink && (
            <a href={data.meetingLink} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>
              Join the video call
            </a>
          )}
        </span>
      </div>

      <div className="member-body stack" style={{ gap: 16 }}>
        {!prep ? (
          <div className="empty">
            {data.status === 'cancelled' ? 'This meeting was cancelled.' : 'Nothing to prepare for this meeting.'}
          </div>
        ) : (
          <section className="card card-pad stack" style={{ gap: 10 }}>
            <div className="row wrap" style={{ gap: 6 }}>
              <h2 style={{ margin: 0, fontSize: 16, flex: 1 }}>Prepare the session</h2>
              {prep.locked ? (
                <span className="badge">Locked</span>
              ) : prep.submittedAt ? (
                <span className="badge ok">Sent · {formatDate(prep.submittedAt)}</span>
              ) : (
                <span className="badge warn">To prepare</span>
              )}
            </div>
            <p className="faint" style={{ margin: 0, fontSize: 12.5 }}>
              {prep.locked
                ? 'Your preparation is locked: you can read it, no longer change it.'
                : 'Your interlocutor reads it before the session. You can change it until it is locked.'}
              {prep.editedByName && ` Updated by ${prep.editedByName}.`}
            </p>
            <PrepForm
              key={`${prep.submittedAt}-${prep.locked}`}
              pages={prep.pages}
              answers={prep.answers}
              readOnly={prep.locked}
              saveLabel="Save draft"
              sendLabel={prep.submittedAt ? 'Update' : 'Send to my interlocutor'}
              savedSay="Saved."
              onSave={async (answers, send) => {
                page.set(await api.put<Prepare>(`/api/me/prepare/${meetingId}`, { answers, submit: send }));
              }}
            />
          </section>
        )}
      </div>
    </div>
  );
}
