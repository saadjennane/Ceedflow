/**
 * Les indicateurs d'un moment du programme, du côté de la startup.
 *
 * Opened from its to-do or from the letter, signed in. The questions linked to
 * its sheet open on what the sheet says — with the date it says it from, so a
 * figure from January is confirmed or corrected in October rather than taken
 * for granted. Sent, the answers are kept for this moment, and the sheet
 * follows.
 */
import { type KpiMeasurePage as Page } from '@ceed/shared';
import { useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { Icon } from '../../ui/Icon';
import { PrepForm } from '../../ui/PrepForm';
import '../../ui/builder.css';
import '../../ui/directory.css';

export function KpiMeasurePage() {
  const { momentId = '', candidateId = '' } = useParams();
  const url = `/api/me/kpi/${momentId}/${candidateId}`;
  const page = useAsync(() => api.get<Page>(url), url);
  const navigate = useNavigate();

  useEffect(() => {
    const next = encodeURIComponent(`/kpi/${momentId}/${candidateId}`);
    if (page.error?.includes('Sign in')) navigate(`/login?next=${next}`);
    else if (page.error?.includes('Choose your own password')) navigate(`/me?next=${next}`);
  }, [page.error, navigate, momentId, candidateId]);

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
  const notes = data.fields.filter((f) => data.asOf[f.id]);

  return (
    <div className="member-shell">
      <div className="member-bar">
        <Link className="btn ghost sm" to="/me">
          <Icon name="chevronLeft" size={13} /> Mon espace
        </Link>
        <span style={{ flex: 1, minWidth: 0 }}>
          <strong style={{ fontSize: 13 }}>Vos indicateurs — {data.momentName}</strong>
          <span className="faint" style={{ display: 'block', fontSize: 12 }}>
            {data.orgName} · {data.programName} — {data.editionName}
            {data.closesOn ? ` · avant le ${formatDate(data.closesOn)}` : ''}
          </span>
        </span>
      </div>
      <div className="member-body stack" style={{ gap: 16 }}>
        <section className="card card-pad stack" style={{ gap: 10 }}>
          <div className="row wrap" style={{ gap: 6 }}>
            <h2 style={{ margin: 0, fontSize: 16, flex: 1 }}>{data.momentName}</h2>
            {data.submittedAt ? (
              <span className="badge ok">Envoyé · {formatDate(data.submittedAt)}</span>
            ) : (
              <span className="badge warn">À renseigner</span>
            )}
          </div>
          {/* Ce que la fiche savait déjà, et de quand : à confirmer, ou à corriger. */}
          {!data.submittedAt && notes.length > 0 && (
            <p className="faint" style={{ margin: 0, fontSize: 12.5 }}>
              Repris de votre fiche — à confirmer ou corriger pour aujourd'hui :{' '}
              {notes.map((f) => `${f.label} (au ${data.asOf[f.id]})`).join(', ')}.
            </p>
          )}
          <PrepForm
            key={data.submittedAt ?? 'draft'}
            pages={[{ page: { id: '', name: '', intro: '' }, fields: data.fields }]}
            answers={data.answers}
            readOnly={false}
            saveLabel="Enregistrer le brouillon"
            sendLabel={data.submittedAt ? 'Mettre à jour' : 'Envoyer'}
            savedSay="Enregistré."
            onSave={async (answers, send) => {
              page.set(await api.put<Page>(url, { answers, submit: send }));
            }}
          />
        </section>
      </div>
    </div>
  );
}
