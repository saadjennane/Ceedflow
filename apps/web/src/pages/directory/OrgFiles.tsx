/**
 * Les fichiers d'une organisation, tous au même endroit, et ceux qui l'ont
 * accompagnée en One to One.
 */
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { Icon } from '../../ui/Icon';

interface OrgFile { uploadId: string; filename: string; size: number; at: string; origin: string; label: string }
interface Companion { personId: string; name: string; held: number; planned: number; programmes: string[] }

const kb = (n: number) => (n > 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1000))} KB`);

export function OrgFiles({ recordId }: { recordId: string }) {
  const files = useAsync(() => api.get<OrgFile[]>(`/api/records/${recordId}/files`), `files:${recordId}`);
  if (files.error) return <div className="empty">{files.error}</div>;
  return (
    <section className="card card-pad stack" style={{ gap: 8 }}>
      <div className="eyebrow">Every file it gave</div>
      {files.data && !files.data.length && <p className="faint" style={{ margin: 0, fontSize: 12.5 }}>No file yet.</p>}
      {(files.data ?? []).map((f, i) => (
        <a key={`${f.uploadId}:${i}`} className="rowcard link-row" href={`/api/uploads/${f.uploadId}`} target="_blank" rel="noreferrer">
          <Icon name="file" size={14} />
          <span style={{ flex: 1, minWidth: 0 }}>
            <strong style={{ fontSize: 13 }}>{f.label}</strong>
            <span className="faint" style={{ display: 'block', fontSize: 12, overflowWrap: 'anywhere' }}>
              {[f.filename, kb(f.size), f.at ? formatDate(f.at.slice(0, 10)) : null].filter(Boolean).join(' · ')}
            </span>
          </span>
          <span className="badge">{f.origin}</span>
        </a>
      ))}
    </section>
  );
}

export function Companions({ recordId }: { recordId: string }) {
  const list = useAsync(() => api.get<Companion[]>(`/api/records/${recordId}/companions`), `companions:${recordId}`);
  if (!list.data?.length) return null;
  return (
    <section className="card card-pad stack" style={{ gap: 8 }}>
      <div className="eyebrow">Who accompanied it</div>
      {list.data.map((c) => (
        <Link key={c.personId} className="rowcard link-row" to={`/directory/${c.personId}`}>
          <Icon name="users" size={14} />
          <span style={{ flex: 1, minWidth: 0 }}>
            <strong style={{ fontSize: 13 }}>{c.name}</strong>
            <span className="faint" style={{ display: 'block', fontSize: 12 }}>{c.programmes.join(', ')}</span>
          </span>
          <span className="badge num">{c.held} held{c.planned ? ` · ${c.planned} to come` : ''}</span>
        </Link>
      ))}
    </section>
  );
}
