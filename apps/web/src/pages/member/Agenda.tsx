/**
 * Ce qui vient, pour une startup.
 *
 * One kind of entry today — the morning they pitch — because that is the only
 * one the platform knows. Workshops and mentoring are bricks nobody has built;
 * when they are, they add entries to this list rather than a second screen: a
 * founder asks what is coming, not which brick holds it.
 */
import { longDate } from '@ceed/shared';
import { useLang } from '../../lib/lang';
import { Icon } from '../../ui/Icon';

export interface AgendaEntry {
  kind: 'committee';
  name: string;
  blockName: string;
  on: string | null;
  startsAt: string | null;
  endsAt: string | null;
  location: string;
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
        <div className="rowcard row" key={`${entry.blockName}-${entry.name}`} style={{ padding: '11px 13px', gap: 11 }}>
          <Icon name="calendar" size={15} />
          <span style={{ flex: 1, minWidth: 0 }}>
            <strong style={{ fontSize: 13.5 }}>{t('prog.jury')}</strong>
            <span className="faint" style={{ display: 'block', fontSize: 12.5 }}>
              {[entry.blockName, entry.name].filter(Boolean).join(' · ')}
            </span>
          </span>
          <span style={{ fontSize: 12.5, textAlign: 'right' }}>
            {entry.on ? longDate(entry.on) : '—'}
            {entry.startsAt && (
              <span className="faint" style={{ display: 'block' }}>
                {t('prog.at')} {entry.startsAt}
                {entry.endsAt ? `–${entry.endsAt}` : ''}
                {entry.location ? ` · ${entry.location}` : ''}
              </span>
            )}
          </span>
        </div>
      ))}
    </div>
  );
}
