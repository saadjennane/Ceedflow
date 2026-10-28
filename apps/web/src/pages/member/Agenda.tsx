/**
 * Ce qui vient, pour une startup.
 *
 * The morning they pitch, and their One to One meetings — one list rather
 * than a screen per brick: a founder asks what is coming, not which brick
 * holds it. A meeting still waiting on them carries its link: book a time,
 * or confirm the one proposed.
 */
import { longDate } from '@ceed/shared';
import { useLang } from '../../lib/lang';
import { Icon } from '../../ui/Icon';

export interface AgendaEntry {
  kind: 'committee' | 'one_to_one';
  with?: string;
  link?: string | null;
  name: string;
  blockName: string;
  on: string | null;
  startsAt: string | null;
  endsAt: string | null;
  location: string;
  /** When the link asks for something: to pick a time, or to confirm one. */
  answer?: 'book' | 'confirm';
  answerBy?: string | null;
  meetingLink?: string;
}

export function Agenda({ entries }: { entries: AgendaEntry[] }) {
  const { t } = useLang();

  if (!entries.length) {
    return (
      <section className="card card-pad">
        <p className="faint" style={{ margin: 0, fontSize: 12.5 }}>{t('prog.noAgenda')}</p>
      </section>
    );
  }

  return (
    <div className="rows">
      {entries.map((entry) => (
        <div className="rowcard row" key={`${entry.kind}-${entry.blockName}-${entry.name}-${entry.on}-${entry.startsAt}`} style={{ padding: '11px 13px', gap: 11 }}>
          <Icon name={entry.kind === 'one_to_one' ? 'users' : 'calendar'} size={15} />
          <span style={{ flex: 1, minWidth: 0 }}>
            <strong style={{ fontSize: 13.5 }}>
              {entry.kind === 'one_to_one' ? (entry.with ? `${t('prog.meeting')} ${entry.with}` : t('act.bookMeetingAny')) : t('prog.jury')}
            </strong>
            <span className="faint" style={{ display: 'block', fontSize: 12.5 }}>
              {[entry.blockName, entry.name].filter(Boolean).join(' · ')}
            </span>
          </span>
          <span style={{ fontSize: 12.5, textAlign: 'right' }}>
            {entry.on ? longDate(entry.on) : entry.link ? '' : '—'}
            {/* Le bouton seulement quand une réponse est attendue : choisir son heure, ou la confirmer. */}
            {entry.link && entry.answer && (
              <a className="btn primary sm" href={entry.link} style={{ display: 'inline-flex', marginTop: entry.on ? 4 : 0 }}>
                {entry.answer === 'confirm' ? t('prog.meetConfirm') : t('prog.meetBook')}
              </a>
            )}
            {entry.startsAt && (
              <span className="faint" style={{ display: 'block' }}>
                {t('prog.at')} {entry.startsAt}
                {entry.endsAt ? `–${entry.endsAt}` : ''}
                {entry.location ? ` · ${entry.location}` : ''}
              </span>
            )}
            {entry.meetingLink && (
              <a href={entry.meetingLink} target="_blank" rel="noreferrer" style={{ display: 'block', fontSize: 12 }}>
                {t('prog.videoLink')}
              </a>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}
