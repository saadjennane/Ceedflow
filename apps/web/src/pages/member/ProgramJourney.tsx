/**
 * Un programme, tel que la startup le suit : où elle en est, ce qui l'attend,
 * ce qu'elle y a fait.
 *
 * The Home, filtered to one programme — the same actions and the same
 * calendar, not copies — with what only this page can say on top: the phases
 * of the programme as it is built, and the history of the startup's way
 * through it, read off what it actually did.
 */
import { longDate, type MemberAction, type MemberActivity, type Task, type TaskItem } from '@ceed/shared';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { useLang } from '../../lib/lang';
import { useAsync } from '../../lib/useAsync';
import { Icon } from '../../ui/Icon';
import { MemberHome, type CandidacyState } from './MemberHome';
import { OwedItems, type Owed } from './OwedItems';
import { Answer } from './ReviewPage';

export interface Journey {
  phases: { id: string; name: string; state: 'done' | 'current' | 'upcoming' }[];
  next: string | null;
  status: string;
  startsOn: string | null;
  endsOn: string | null;
  history: { at: string; kind: string; label: string; phase: string | null; href?: string }[];
  /** Sa candidature, question par question. */
  application: { label: string; value: unknown; type: string }[];
}

const KIND_ICON: Record<string, string> = {
  application: 'form',
  selection: 'check',
  committee: 'gavel',
  deliverable: 'file',
  one_to_one: 'users',
  preparation: 'edit',
  kpi: 'board',
};

export function ProgramJourney({
  state,
  home,
  readOnly,
  previewJourneys,
  onBack,
  onOwed,
  onTick,
  onTickItem,
  onGo,
}: {
  state: CandidacyState | null;
  home: { actions: MemberAction[]; upcoming: MemberActivity[] } | null;
  readOnly: boolean;
  /** En aperçu, le parcours vient avec la page : la route membre n'est pas à CEED. */
  previewJourneys?: Record<string, Journey | null>;
  onBack: () => void;
  onOwed: (candidateId: string, owed: Owed[]) => void;
  onTick: (task: Task) => void;
  onTickItem: (task: Task, item: TaskItem) => void;
  onGo: (href: string) => void;
}) {
  const { t, lang } = useLang();
  const fr = lang === 'fr';
  const journey = useAsync(
    async () => (state && !readOnly ? api.get<Journey>(`/api/me/journey/${state.candidateId}`) : null),
    `journey:${state?.candidateId ?? ''}`,
  );
  const [reading, setReading] = useState(false);
  if (!state) return <div className="empty">{t('prog.none')}</div>;
  const p = state.programme;
  const j = readOnly ? (previewJourneys?.[state.candidateId] ?? null) : journey.data;
  const editionId = p.editionId;
  const mine = home
    ? {
        actions: home.actions.filter((a) => a.editionId === editionId),
        upcoming: home.upcoming.filter((u) => u.editionId === editionId),
      }
    : null;

  return (
    <div className="stack" style={{ gap: 16 }}>
      {/* L'en-tête : le programme, et où l'on en est. */}
      <section className="card card-pad stack" style={{ gap: 12 }}>
        <div className="row" style={{ gap: 10 }}>
          <button className="btn ghost icon sm" onClick={onBack} aria-label={t('prog.back')}>
            <Icon name="chevronLeft" size={14} />
          </button>
          <span className="rec-mark" style={{ background: p.colour ?? 'var(--blue)', color: '#fff' }} aria-hidden="true">
            {p.programName.slice(0, 1).toUpperCase()}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 17 }}>{p.programName}</h2>
            <span className="faint" style={{ fontSize: 12.5 }}>
              {[p.editionName, state.orgName, p.startsOn ? formatDate(p.startsOn) : null, p.endsOn ? `→ ${formatDate(p.endsOn)}` : null]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </div>
        </div>

        {/* Les phases du programme tel qu'il est construit — pas une liste écrite d'avance. */}
        {j && j.phases.length > 0 && (
          <div className="stack" style={{ gap: 8 }}>
            <div className="journey-steps" role="list">
              {j.phases.map((ph) => (
                <div key={ph.id} role="listitem" className={`journey-step ${ph.state}`}>
                  <span className="journey-dot">
                    {ph.state === 'done' ? <Icon name="check" size={11} /> : null}
                  </span>
                  <span className="journey-name">{ph.name}</span>
                </div>
              ))}
            </div>
            <span className="faint" style={{ fontSize: 12.5 }}>
              {j.phases.find((x) => x.state === 'current')
                ? `${fr ? 'Phase actuelle' : 'Current phase'} : ${j.phases.find((x) => x.state === 'current')!.name}`
                : ''}
              {j.next ? ` · ${fr ? 'Ensuite' : 'Next'} : ${j.next}` : ''}
            </span>
          </div>
        )}
      </section>

      {/* Ce qui est attendu, et ce qui vient — les mêmes lignes que la Home. */}
      {mine && (
        <MemberHome
          home={mine}
          programs={[]}
          onTick={onTick}
          onTickItem={onTickItem}
          onOpen={() => undefined}
          onGo={onGo}
          withProgrammes={false}
          split
        />
      )}

      {/* Les pièces demandées, à remplir ici même. */}
      {state.owed.length > 0 && (
        <div id="owed" style={{ scrollMarginTop: 16 }}>
        <OwedItems
          candidateId={state.candidateId}
          orgName={state.orgName}
          given={state.owed}
          /* Sur la page du programme, la liste est ce qu'on vient chercher : ouverte. */
          startOpen
          onSaved={(owed) => onOwed(state.candidateId, owed)}
          readOnly={readOnly}
        />
        </div>
      )}

      {/* L'historique : ce qui s'est passé, du plus récent au plus ancien. */}
      {j && (
        <section className="stack" style={{ gap: 10 }} aria-labelledby="pj-history">
          <div className="mh-head">
            <h2 id="pj-history">{fr ? 'Historique' : 'History'}</h2>
            {j.history.length > 0 && <span className="faint num">{j.history.length}</span>}
          </div>
          <div className="card card-pad">
          {!j.history.length && (
            <p className="faint" style={{ margin: 0, fontSize: 12.5 }}>
              {fr ? 'Rien encore : ce que vous ferez dans ce programme apparaîtra ici.' : 'Nothing yet: what you do in this programme will appear here.'}
            </p>
          )}
          <ol className="timeline">
            {j.history.map((e, i) => {
              /* Chaque ligne mène à ce qui a été fait : la candidature se déplie,
                 les pièces sont plus haut, le reste a sa page. */
              const open =
                e.kind === 'application' && j.application.length
                  ? { onClick: () => setReading((v) => !v) }
                  : e.kind === 'deliverable' && state.owed.length
                    ? { onClick: () => document.getElementById('owed')?.scrollIntoView({ behavior: 'smooth' }) }
                    : null;
              const body = (
                <>
                  <strong style={{ fontSize: 13 }}>{e.label}</strong>
                  <span className="faint" style={{ display: 'block', fontSize: 12 }}>
                    {[longDate(e.at.slice(0, 10)), e.phase].filter(Boolean).join(' · ')}
                  </span>
                </>
              );
              const more = e.href || open;
              return (
                <li key={i} className="timeline-item">
                  <span className="timeline-dot">
                    <Icon name={KIND_ICON[e.kind] ?? 'check'} size={12} />
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    {e.href ? (
                      <Link to={e.href} className="linkish" style={{ display: 'block', textAlign: 'left' }}>{body}</Link>
                    ) : open ? (
                      <button type="button" className="linkish" style={{ display: 'block', textAlign: 'left' }} onClick={open.onClick}>{body}</button>
                    ) : (
                      body
                    )}
                    {e.kind === 'application' && reading && (
                      <div className="stack card-pad" style={{ gap: 10, marginTop: 8, border: '1px solid var(--line)', borderRadius: 'var(--r-lg)' }}>
                        {j.application.map((a) => (
                          <div key={a.label}>
                            <div className="eyebrow">{a.label}</div>
                            <Answer value={a.value} type={a.type} />
                          </div>
                        ))}
                      </div>
                    )}
                  </span>
                  {more && (
                    <Icon
                      name={e.kind === 'application' && reading ? 'chevronUp' : 'chevronRight'}
                      size={13}
                    />
                  )}
                </li>
              );
            })}
          </ol>
          </div>
        </section>
      )}
    </div>
  );
}
