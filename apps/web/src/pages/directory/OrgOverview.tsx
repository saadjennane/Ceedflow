/**
 * La vue d'ensemble d'une organisation, pour l'équipe CEED : ses programmes,
 * ce qui coince, ce dont elle a besoin. Chaque ligne mène là où se trouve le
 * détail — le programme, la brique — plutôt que de le recopier ici.
 */
import { longDate, periodLabel, type MemberAction } from '@ceed/shared';
import { Link } from 'react-router-dom';
import { Icon } from '../../ui/Icon';
import { Spark } from '../../ui/KpiPanel';

export interface OrgOverviewData {
  candidacies: {
    candidateId: string; programName: string; editionName: string; editionId: string; trackId: string;
    status: string; phase: string | null; colour: string; href: string;
  }[];
  asked: (MemberAction & { workHref: string | null })[];
  alerts: { kind: string; label: string; detail: string; href: string | null; tone: 'stop' | 'warn' }[];
  needs: { need: string; label: string; detail: string }[];
  figures: { key: string; label: string; type: string; currency: string; points: { period: string; value: unknown }[] }[];
  profile: number;
}

const STATUS_TONE: Record<string, string> = {
  Selected: 'badge ok',
  Shortlisted: 'badge info',
  Waitlisted: 'badge warn',
  'Not selected': 'badge',
  Withdrawn: 'badge',
};

const STATUS_WORD = { late: 'Late', in_progress: 'Started', pending: 'To do' } as const;

/** Ce qu'une ligne demande, en mots — ceux de l'équipe. */
function askedTitle(a: MemberAction): string {
  switch (a.kind) {
    case 'deliverable': return `Send its pieces — ${a.label}`;
    case 'prepare': return `Prepare its One to One${a.label ? ` with ${a.label}` : ''}`;
    case 'answer_meeting': return a.answer === 'book' ? `Book its One to One${a.label ? ` with ${a.label}` : ''}` : `Confirm its One to One${a.label ? ` with ${a.label}` : ''}`;
    case 'answer_committee': return a.answer === 'book' ? `Book its committee slot — ${a.label}` : `Confirm its committee slot — ${a.label}`;
    case 'kpi': return `Give its indicators — ${a.label}`;
    case 'task': return `Task — ${a.label}`;
    default: return a.label;
  }
}

/** Les chiffres qui disent sa taille, sous l'en-tête. */
export function KeyFigures({ figures }: { figures: OrgOverviewData['figures'] }) {
  if (!figures.length) return null;
  return (
    <div className="key-figures">
      {figures.map((f) => {
        const last = f.points.at(-1);
        const n = typeof last?.value === 'number' ? last.value : Number(last?.value);
        return (
          <div key={f.key} className="key-figure">
            <span className="eyebrow">{f.label}</span>
            <strong className="num">
              {Number.isFinite(n) ? n.toLocaleString('fr-FR') : '—'}
              {f.type === 'amount' && f.currency ? <span className="faint" style={{ fontSize: 12, fontWeight: 500 }}> {f.currency}</span> : null}
            </strong>
            <span className="row" style={{ gap: 6 }}>
              {last?.period && <span className="faint" style={{ fontSize: 11.5 }}>{periodLabel(last.period)}</span>}
              {f.points.length > 1 && <Spark points={f.points} />}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function OrgOverview({ data, onFill }: { data: OrgOverviewData; onFill: () => void }) {
  return (
    <div className="stack" style={{ gap: 14 }}>
      <section className="card card-pad stack" style={{ gap: 8 }}>
        <div className="eyebrow">Programmes</div>
        {!data.candidacies.length && <p className="faint" style={{ margin: 0, fontSize: 12.5 }}>Not in any programme yet.</p>}
        {data.candidacies.map((c) => (
          <Link key={c.candidateId} to={c.href} className="rowcard link-row" title="Open it in the programme">
            <span className="rec-mark" style={{ background: c.colour, color: '#fff' }} aria-hidden="true">
              {c.programName.slice(0, 1).toUpperCase()}
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <strong style={{ fontSize: 13 }}>{c.programName}</strong>
              <span className="faint" style={{ display: 'block', fontSize: 12 }}>
                {[c.editionName, c.phase ? `Phase: ${c.phase}` : null].filter(Boolean).join(' · ')}
              </span>
            </span>
            <span className={STATUS_TONE[c.status] ?? 'badge'}>{c.status}</span>
            <Icon name="chevronRight" size={14} />
          </Link>
        ))}
      </section>

      {/* Ce qui lui est demandé en ce moment — les mêmes lignes que sa propre Home — et où le suivre. */}
      <section className="card card-pad stack" style={{ gap: 8 }}>
        <div className="eyebrow">What is asked of it</div>
        {!data.asked.length && (
          <p style={{ margin: 0, fontSize: 13 }}>
            <Icon name="check" size={13} /> Nothing waiting on it.
          </p>
        )}
        {data.asked.map((a) => {
          const body = (
            <>
              <span className={a.status === 'late' ? 'badge stop' : a.status === 'in_progress' ? 'badge warn' : 'badge'}>
                {STATUS_WORD[a.status]}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <strong style={{ fontSize: 13 }}>{askedTitle(a)}</strong>
                <span className="faint" style={{ display: 'block', fontSize: 12 }}>
                  {[
                    a.programName,
                    a.of ? `${a.left} of ${a.of} left` : null,
                    a.back ? 'pieces sent back' : null,
                    a.dueOn ? `due ${longDate(a.dueOn)}` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </span>
              {a.workHref && <Icon name="chevronRight" size={14} />}
            </>
          );
          return a.workHref ? (
            <Link key={a.id} to={a.workHref} className="rowcard link-row">{body}</Link>
          ) : (
            <div key={a.id} className="rowcard link-row">{body}</div>
          );
        })}
      </section>

      {data.alerts.length > 0 && (
      <section className="card card-pad stack" style={{ gap: 8 }}>
        <div className="eyebrow">To watch</div>
        {data.alerts.map((a, i) => {
          const body = (
            <>
              <Icon name="alert" size={14} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <strong style={{ fontSize: 13, color: a.tone === 'stop' ? 'var(--stop)' : undefined }}>{a.label}</strong>
                <span className="faint" style={{ display: 'block', fontSize: 12 }}>{a.detail}</span>
              </span>
              {a.href && <Icon name="chevronRight" size={14} />}
            </>
          );
          return a.href ? (
            <Link key={i} to={a.href} className="rowcard link-row">{body}</Link>
          ) : (
            <button key={i} className="rowcard link-row" style={{ width: '100%', textAlign: 'left' }} onClick={onFill}>
              {body}
            </button>
          );
        })}
      </section>
      )}

      {data.needs.length > 0 && (
        <section className="card card-pad stack" style={{ gap: 8 }}>
          <div className="eyebrow">What it needs</div>
          <div className="row wrap" style={{ gap: 6 }}>
            {data.needs.map((n) => (
              <span key={n.need} className="badge info" style={{ fontSize: 12.5 }}>
                {n.label}
                {n.detail ? ` — ${n.detail}` : ''}
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
