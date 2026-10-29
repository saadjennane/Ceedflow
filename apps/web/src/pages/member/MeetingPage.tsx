/**
 * Un rendez-vous, du côté de l'interlocuteur : la startup en face, et le compte rendu.
 *
 * Opened in front of the startup, or just after. The top says who they are —
 * the fiche as the ecosystem reads it, and what they applied with — and the
 * report is written below, saved as it is typed so a closed laptop loses
 * nothing, and sent once, whole. It stays between the interlocutor and CEED.
 */
import { meetingState, type FormField, type FormPage, type OneToOneMeeting, type OrgProfile } from '@ceed/shared';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError, api } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { FormFieldInput } from '../../ui/FormField';
import { FormPageBody } from '../../ui/FormPages';
import { Icon } from '../../ui/Icon';
import { ProfileFacts } from '../../ui/OrgProfile';
import { PrepForm } from '../../ui/PrepForm';
import { useToast } from '../../ui/Overlays';
import '../../ui/builder.css';
import '../../ui/directory.css';

interface Detail extends OneToOneMeeting {
  programName: string;
  editionName: string;
  blockName: string;
  state: 'open' | 'closed';
  questions: { pages: { page: FormPage; fields: FormField[] }[] };
  prepQuestions: { pages: { page: FormPage; fields: FormField[] }[] } | null;
  profile: OrgProfile | null;
  answers: { label: string; value: unknown; type: string }[];
}

/** Le temps qu'on laisse finir une phrase avant de l'enregistrer. */
const PAUSE = 900;

export function MeetingPage() {
  const { meetingId = '' } = useParams();
  const meeting = useAsync(() => api.get<Detail>(`/api/me/meetings/${meetingId}`), meetingId);
  const navigate = useNavigate();

  useEffect(() => {
    if (meeting.error?.includes('Sign in')) navigate('/login?next=' + encodeURIComponent(`/meeting/${meetingId}`));
    else if (meeting.error?.includes('Choose your own password')) navigate('/me?next=' + encodeURIComponent(`/meeting/${meetingId}`));
  }, [meeting.error, navigate, meetingId]);

  if (meeting.loading) return <div className="member-shell" />;
  if (meeting.error || !meeting.data) {
    return (
      <div className="member-shell">
        <div className="member-body">
          <div className="empty">{meeting.error ?? 'Not found.'}</div>
        </div>
      </div>
    );
  }
  const data = meeting.data;

  return (
    <div className="member-shell">
      <div className="member-bar">
        <Link className="btn ghost sm" to="/me?tab=Meetings">
          <Icon name="chevronLeft" size={13} /> My meetings
        </Link>
        <span style={{ flex: 1, minWidth: 0 }}>
          <strong style={{ fontSize: 13 }}>{data.orgName}</strong>
          <span className="faint" style={{ display: 'block', fontSize: 12 }}>
            {data.programName} · {data.blockName}
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
        {/* Qui on a en face : la fiche telle que l'écosystème la lit, et ce
            qu'elle a dit en candidatant — jamais comment la joindre. */}
        <section className="card card-pad stack" style={{ gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 16 }}>{data.orgName}</h2>
          {data.profile ? (
            <ProfileFacts profile={data.profile} name={data.orgName} lang="en" />
          ) : (
            <p className="faint" style={{ margin: 0, fontSize: 12.5 }}>The startup has not filled in its profile yet.</p>
          )}
          {data.answers.length > 0 && (
            <details>
              <summary className="eyebrow" style={{ cursor: 'pointer' }}>What they applied with</summary>
              <div className="stack" style={{ gap: 10, marginTop: 10 }}>
                {data.answers.map((a, i) => (
                  <div key={i}>
                    <div className="eyebrow">{a.label}</div>
                    <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>
                      {Array.isArray(a.value) ? a.value.join(', ') : typeof a.value === 'object' ? '(file)' : String(a.value)}
                    </div>
                  </div>
                ))}
              </div>
            </details>
          )}
        </section>

        {/* Ce que la startup a préparé : l'interlocuteur le lit avant, et le
            corrige ou le complète — la startup verra sa version. */}
        {data.prepQuestions && (
          <section className="card card-pad stack" style={{ gap: 10 }}>
            <div className="row">
              <h2 style={{ margin: 0, fontSize: 16, flex: 1 }}>The startup’s preparation</h2>
              {data.prepSubmittedAt ? (
                <span className="badge ok">Sent · {formatDate(data.prepSubmittedAt)}</span>
              ) : (
                <span className="badge">Not sent yet</span>
              )}
            </div>
            <p className="faint" style={{ margin: 0, fontSize: 12.5 }}>
              You can correct or complete it. The startup sees your version; your report below stays private.
            </p>
            <PrepForm
              pages={data.prepQuestions.pages}
              answers={data.prep}
              readOnly={data.state === 'closed'}
              saveLabel="Save the preparation"
              savedSay="Preparation saved."
              onSave={async (answers) => {
                await api.put(`/api/me/meetings/${data.id}/prep`, { answers });
                meeting.reload();
              }}
            />
          </section>
        )}

        <Report meeting={data} onSent={meeting.reload} />
      </div>
    </div>
  );
}

function Report({ meeting, onSent }: { meeting: Detail; onSent: () => void }) {
  const [answers, setAnswers] = useState<Record<string, unknown>>(meeting.report);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [sending, setSending] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const latest = useRef(answers);
  latest.current = answers;
  const toast = useToast();
  const closed = meeting.state === 'closed';
  const sent = Boolean(meeting.reportSubmittedAt);
  const fields = meeting.questions.pages.flatMap((p) => p.fields);

  const save = async () => {
    setSaving('saving');
    try {
      await api.put(`/api/me/meetings/${meeting.id}/report`, { answers: latest.current, submit: false });
      setSaving('saved');
    } catch (err) {
      setSaving('idle');
      toast((err as Error).message, true);
    }
  };

  /* Ce qui attend sa pause part quand la page se ferme. */
  useEffect(() => {
    const leave = () => {
      if (!timer.current) return;
      clearTimeout(timer.current);
      timer.current = undefined;
      void fetch(`/api/me/meetings/${meeting.id}/report`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ answers: latest.current, submit: false }),
        keepalive: true,
      });
    };
    window.addEventListener('pagehide', leave);
    return () => {
      window.removeEventListener('pagehide', leave);
      leave();
    };
  }, [meeting.id]);

  const answer = (id: string, value: unknown) => {
    setAnswers((a) => ({ ...a, [id]: value }));
    setErrors(({ [`answers.${id}`]: _gone, ...rest }) => rest);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = undefined;
      void save();
    }, PAUSE);
  };

  const send = async () => {
    clearTimeout(timer.current);
    timer.current = undefined;
    setSending(true);
    setErrors({});
    try {
      await api.put(`/api/me/meetings/${meeting.id}/report`, { answers: latest.current, submit: true });
      toast(sent ? 'Report updated.' : 'Report sent. Thank you.');
      onSent();
    } catch (err) {
      if (err instanceof ApiError && err.fields) setErrors(err.fields);
      toast((err as Error).message, true);
    } finally {
      setSending(false);
    }
  };

  const state = meetingState(meeting);

  return (
    <section className="card card-pad stack" style={{ gap: 12 }}>
      <div className="row">
        <h2 style={{ margin: 0, fontSize: 16, flex: 1 }}>Report</h2>
        {sent ? (
          <span className="badge ok">Sent · {formatDate(meeting.reportSubmittedAt)}</span>
        ) : state === 'cancelled' ? (
          <span className="badge">Cancelled</span>
        ) : (
          <span className="faint" style={{ fontSize: 12 }}>
            {saving === 'saving' ? 'Saving…' : saving === 'saved' ? 'Saved ✓' : 'Saved as you write'}
          </span>
        )}
      </div>
      <p className="faint" style={{ margin: 0, fontSize: 12.5 }}>
        Read by you and the CEED team only — the startup does not see it.
      </p>

      {closed ? (
        /* Fermé : on relit ce qu'on a écrit, sans le réécrire. */
        <div className="stack" style={{ gap: 10 }}>
          {fields.map((f) => (
            <FormFieldInput key={f.id} field={f} value={answers[f.id]} readOnly onChange={() => {}} />
          ))}
          <p className="faint" style={{ margin: 0, fontSize: 12.5 }}>
            These reports are closed. Ask the CEED team if something has to change.
          </p>
        </div>
      ) : (
        <>
          {meeting.questions.pages.map(({ page, fields: pageFields }) => (
            <FormPageBody
              key={page.id || 'single'}
              heading={meeting.questions.pages.length > 1}
              page={{ ...page, fields: pageFields }}
              values={answers}
              errors={errors}
              onAnswer={answer}
            />
          ))}
          <div className="row">
            <div className="spacer" />
            <button className="btn primary" disabled={sending} onClick={send}>
              <Icon name="send" size={13} /> {sent ? 'Update the report' : 'Send the report'}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
