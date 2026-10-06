/**
 * Ce qu'une startup doit faire, et où.
 *
 * A founder signs in to answer one question: is something expected of me. The
 * page therefore opens on the answer — the documents still owed, the morning
 * they pitch — and not on a list of programmes they would have to walk into to
 * find out.
 *
 * Underneath, the programmes themselves, because that is where the work is
 * done once you know there is some.
 */
import { itemComplete, longDate, type DeliverableItem } from '@ceed/shared';
import { useLang } from '../../lib/lang';
import { Icon } from '../../ui/Icon';
import { type AgendaEntry } from './Agenda';
import { type MyProgram } from './MemberPage';
import { type Owed } from './OwedItems';

export interface CandidacyState {
  candidateId: string;
  orgName: string;
  programme: MyProgram;
  owed: Owed[];
  agenda: AgendaEntry[];
}

/** What is still theirs to send, in the words the strip uses. */
export function owedLine(owed: Owed[]): { left: number; of: number; closesAt: string | null; back: boolean } | null {
  let left = 0;
  let of = 0;
  let back = false;
  let closesAt: string | null = null;

  for (const ask of owed) {
    if (!ask.open) continue;
    const need = ask.config.items.filter((i: DeliverableItem) => i.required);
    const mine = (id: string) => ask.returns.find((r) => r.itemId === id);
    const sent = need.filter((i) => itemComplete(i, mine(i.id)?.value)).length;
    of += need.length;
    left += need.length - sent;
    if (ask.returns.some((r) => r.state === 'rejected')) back = true;
    if (ask.config.closesAt && (!closesAt || ask.config.closesAt < closesAt)) closesAt = ask.config.closesAt;
  }
  return of === 0 ? null : { left, of, closesAt, back };
}

/** A day in the near future is a thing to do; one long past is not. */
const soon = (on: string | null): boolean => {
  if (!on) return true;
  const day = new Date(`${on.slice(0, 10)}T23:59:59`);
  return day.getTime() >= Date.now();
};

export function MemberHome({
  states,
  onOpen,
}: {
  states: CandidacyState[];
  onOpen: (editionId: string) => void;
}) {
  const { t, lang } = useLang();

  /* Une ligne par chose à faire, pas une par programme : ce qui compte est le
     geste, et le programme n'est que l'endroit où il se fait. */
  const todo: { key: string; title: string; detail: string; editionId: string }[] = [];
  for (const state of states) {
    const owed = owedLine(state.owed);
    if (owed && (owed.left > 0 || owed.back)) {
      todo.push({
        key: `owed-${state.candidateId}`,
        title: owed.back ? t('owed.back') : t('owed.fill'),
        detail: [
          state.programme.programName,
          `${owed.of - owed.left}/${owed.of}`,
          owed.closesAt ? `${t('owed.before')} ${longDate(owed.closesAt)}` : null,
        ]
          .filter(Boolean)
          .join(' · '),
        editionId: state.programme.editionId,
      });
    }
    for (const entry of state.agenda.filter((a) => soon(a.on))) {
      todo.push({
        key: `agenda-${state.candidateId}-${entry.name}`,
        title: t('prog.jury'),
        detail: [
          entry.name,
          entry.on ? longDate(entry.on) : null,
          entry.startsAt ? `${t('prog.at')} ${entry.startsAt}` : null,
          entry.location,
        ]
          .filter(Boolean)
          .join(' · '),
        editionId: state.programme.editionId,
      });
    }
  }

  return (
    <div className="stack" style={{ gap: 16 }}>
      <section className="card card-pad stack" style={{ gap: 10 }}>
        <div className="eyebrow">{t('home.todo')}</div>
        {!todo.length ? (
          <div className="stack" style={{ gap: 2 }}>
            <p style={{ margin: 0, fontSize: 13.5 }}>{t('home.nothing')}</p>
            <p className="faint" style={{ margin: 0, fontSize: 12.5 }}>{t('home.nothingMore')}</p>
          </div>
        ) : (
          <div className="rows">
            {todo.map((item) => (
              <button
                className="rowcard row"
                key={item.key}
                style={{ padding: '11px 13px', gap: 11, width: '100%', textAlign: 'left' }}
                onClick={() => onOpen(item.editionId)}
              >
                <Icon name="check" size={15} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <strong style={{ fontSize: 13.5 }}>{item.title}</strong>
                  <span className="faint" style={{ display: 'block', fontSize: 12.5 }}>{item.detail}</span>
                </span>
                <Icon name="chevronRight" size={15} />
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="card card-pad stack" style={{ gap: 10 }}>
        <div className="eyebrow">{t('home.programmes')}</div>
        <div className="rows">
          {states.length === 0 && (
            <p className="faint" style={{ margin: 0, fontSize: 12.5 }}>{t('prog.noneMore')}</p>
          )}
          {[...new Map(states.map((s) => [s.programme.editionId, s.programme])).values()].map((p) => (
            <button
              className="rowcard row"
              key={p.editionId}
              style={{ padding: '11px 13px', gap: 11, width: '100%', textAlign: 'left' }}
              onClick={() => onOpen(p.editionId)}
            >
              <span style={{ flex: 1, minWidth: 0 }}>
                <strong style={{ fontSize: 13.5 }}>{p.programName}</strong>
                <span className="faint" style={{ display: 'block', fontSize: 12.5 }}>
                  {[p.editionName, p.city, p.startsOn ? longDate(p.startsOn) : null].filter(Boolean).join(' · ')}
                </span>
              </span>
              <span className="faint" style={{ fontSize: 12.5 }}>
                {lang === 'fr' ? 'Ouvrir' : 'Open'}
              </span>
              <Icon name="chevronRight" size={15} />
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
