/**
 * Le centre de notifications, pour l'équipe comme pour les membres.
 *
 * What waits for the person signed in, and only for them: newest first, the
 * unread ones marked, each one leading to where something is done about it.
 * The count in the navigation is asked for once a minute — a single small
 * request — and refreshed at once when something is read here.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { formatDate } from '../lib/format';
import { Icon } from './Icon';

export interface NotificationItem {
  id: string;
  centerId: string | null;
  centerName: string | null;
  kind: string;
  title: string;
  body: string;
  href: string;
  actorName: string;
  createdAt: string;
  readAt: string | null;
}

/* ---- Le compte, partagé par tout ce qui l'affiche ---- */

let unread = 0;
const listeners = new Set<(n: number) => void>();
const announce = (n: number) => {
  unread = n;
  listeners.forEach((l) => l(n));
};
let timer: number | null = null;
const poll = () =>
  api
    .get<{ unread: number }>('/api/me/notifications/count')
    .then((r) => announce(r.unread))
    .catch(() => undefined);

/** Le nombre de notifications non lues, tenu à jour. */
export function useUnread(): number {
  const [n, setN] = useState(unread);
  useEffect(() => {
    listeners.add(setN);
    if (listeners.size === 1) {
      void poll();
      timer = window.setInterval(() => void poll(), 60_000);
    }
    return () => {
      listeners.delete(setN);
      if (!listeners.size && timer) {
        window.clearInterval(timer);
        timer = null;
      }
    };
  }, []);
  return n;
}

/* ---- Ce qu'on en dit : une icône par famille ---- */

const ICON_OF = (kind: string): string => {
  if (kind.startsWith('task')) return 'check';
  if (kind.startsWith('one_to_one') || kind === 'prep_submitted' || kind.startsWith('prepar')) return 'calendar';
  if (kind.startsWith('deliverable')) return 'file';
  if (kind.startsWith('application') || kind === 'selection') return 'form';
  if (kind.startsWith('offer')) return 'send';
  if (kind.startsWith('committee') || kind === 'jury_sitting' || kind === 'review') return 'gavel';
  if (kind === 'kpi') return 'grid';
  if (kind.startsWith('org')) return 'users';
  return 'bell';
};

const when = (iso: string) => {
  const t = new Date(iso);
  const minutes = Math.round((Date.now() - t.getTime()) / 60_000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 24 * 60) return `${Math.round(minutes / 60)} h`;
  return formatDate(iso.slice(0, 10));
};

/**
 * La liste. `centers` : les centres où l'on travaille, pour filtrer — absent
 * pour un membre, qui n'en voit qu'une liste.
 */
export function NotificationList({ centers }: { centers?: { id: string; name: string }[] }) {
  const [filter, setFilter] = useState<'unread' | 'all'>('unread');
  const [center, setCenter] = useState('');
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const load = () => {
    const q = new URLSearchParams({ ...(filter === 'unread' ? { unread: '1' } : {}), ...(center ? { center } : {}) });
    api
      .get<{ items: NotificationItem[]; unread: number }>(`/api/me/notifications?${q.toString()}`)
      .then((r) => {
        setItems(r.items);
        announce(r.unread);
      })
      .catch((err: Error) => setError(err.message));
  };
  useEffect(load, [filter, center]);

  const read = async (ids: string[] | 'all') => {
    const r = await api.post<{ unread: number }>('/api/me/notifications/read', ids === 'all' ? { all: true } : { ids });
    announce(r.unread);
  };

  const open = async (n: NotificationItem) => {
    if (!n.readAt) await read([n.id]).catch(() => undefined);
    if (!n.href) {
      setItems((list) => list?.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)) ?? null);
      return;
    }
    if (n.href.startsWith('/')) navigate(n.href);
    else window.location.assign(n.href);
  };

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="row wrap" style={{ gap: 8 }}>
        <div className="seg" role="group" aria-label="Show">
          <button className={filter === 'unread' ? 'on' : ''} onClick={() => setFilter('unread')}>
            Unread {unread > 0 && <span className="num">{unread}</span>}
          </button>
          <button className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>All</button>
        </div>
        {centers && centers.length > 1 && (
          <select className="input" style={{ width: 220 }} aria-label="Centre" value={center} onChange={(e) => setCenter(e.target.value)}>
            <option value="">Every centre</option>
            {centers.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}
        <div className="spacer" />
        {unread > 0 && (
          <button
            className="linkish"
            style={{ fontSize: 13 }}
            onClick={async () => {
              await read('all');
              load();
            }}
          >
            Mark all as read
          </button>
        )}
      </div>

      {error ? (
        <div className="empty">{error}</div>
      ) : !items ? (
        <div className="dir-loading" aria-busy="true"><span /><span /><span /></div>
      ) : !items.length ? (
        <div className="empty">
          <h3>{filter === 'unread' ? 'Nothing new' : 'No notification yet'}</h3>
          <p>What needs you — a task, a meeting, a document, an answer — shows up here.</p>
        </div>
      ) : (
        <div className="ntf-list">
          {items.map((n) => (
            <button key={n.id} className={n.readAt ? 'ntf' : 'ntf unread'} onClick={() => void open(n)}>
              <span className="ntf-icon">
                <Icon name={ICON_OF(n.kind)} size={15} />
              </span>
              <span className="ntf-main">
                <b>{n.title}</b>
                {n.body && <span className="ntf-body">{n.body}</span>}
                <span className="ntf-meta">
                  {when(n.createdAt)}
                  {centers && centers.length > 1 && n.centerName ? ` · ${n.centerName}` : ''}
                </span>
              </span>
              {!n.readAt && <span className="ntf-dot" aria-label="Unread" />}
              {n.href && <Icon name="chevronRight" size={14} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
