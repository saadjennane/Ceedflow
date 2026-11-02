/**
 * Settings › Startup sheet : les attributs de la fiche startup.
 *
 * The fixed ones are listed for what they are — screens, filters and exports
 * lean on them, so they keep their name and their type. Next to them, the ones
 * CEED adds: a name, a type, and whether the startup sees it in its space.
 */
import {
  ATTRIBUTE_TYPES,
  ATTRIBUTE_TYPE_LABEL,
  PROFILE_SOURCES,
  hasOptions,
  type AttributeType,
  type OrgAttribute,
} from '@ceed/shared';
import { useState } from 'react';
import { ApiError, api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { Icon } from '../ui/Icon';
import { Modal, useToast } from '../ui/Overlays';

export function SheetSettings() {
  const list = useAsync(() => api.get<OrgAttribute[]>('/api/org-attributes'), 'org-attributes');
  const [editing, setEditing] = useState<OrgAttribute | 'new' | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const toast = useToast();

  const all = list.data ?? [];
  const live = all.filter((a) => !a.archived);
  const archived = all.filter((a) => a.archived);

  const patch = async (a: OrgAttribute, body: Partial<OrgAttribute>, said?: string) => {
    try {
      await api.patch(`/api/org-attributes/${a.id}`, body);
      list.reload();
      if (said) toast(said);
    } catch (err) {
      toast((err as Error).message, true);
    }
  };
  /* Monter ou descendre : l'ordre entier est réécrit, pour qu'il ne dépende
     pas de places laissées par des attributs archivés. */
  const move = async (index: number, by: -1 | 1) => {
    const order = [...live];
    const [moved] = order.splice(index, 1);
    if (!moved) return;
    order.splice(index + by, 0, moved);
    for (const [position, a] of order.entries()) {
      if (a.position !== position) await api.patch(`/api/org-attributes/${a.id}`, { position });
    }
    list.reload();
  };

  return (
    <>
      <section className="card" style={{ maxWidth: 880 }}>
        <div className="rowcard-head" style={{ padding: '13px 16px' }}>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: 16 }}>Added attributes</h2>
            <p className="faint" style={{ margin: '2px 0 0', fontSize: 12.5 }}>
              What CEED wants to know about every startup, beyond the fixed sheet. Each change is kept in the sheet’s
              history.
            </p>
          </div>
          <button className="btn primary sm" onClick={() => setEditing('new')}>
            <Icon name="plus" size={13} /> Add an attribute
          </button>
        </div>
        <div className="card-pad stack" style={{ gap: 8 }}>
          {list.error && <div className="callout warn">{list.error}</div>}
          {list.data && !live.length && (
            <p className="faint" style={{ margin: 0, fontSize: 13 }}>
              No added attribute yet. The ICE number, the programme they aim for, an internal note…
            </p>
          )}
          {live.map((a, i) => (
            <div key={a.id} className="rowcard row" style={{ padding: '9px 12px', gap: 10 }}>
              <div className="stack" style={{ gap: 0 }}>
                <button className="btn ghost icon sm" disabled={i === 0} aria-label="Move up" onClick={() => move(i, -1)}>
                  <Icon name="chevronUp" size={12} />
                </button>
                <button className="btn ghost icon sm" disabled={i === live.length - 1} aria-label="Move down" onClick={() => move(i, 1)}>
                  <Icon name="chevronDown" size={12} />
                </button>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong style={{ fontSize: 13.5 }}>{a.label}</strong>
                {a.labelEn && <span className="faint" style={{ fontSize: 12.5 }}> · {a.labelEn}</span>}
                <div className="faint" style={{ fontSize: 12 }}>
                  {ATTRIBUTE_TYPE_LABEL[a.type]}
                  {hasOptions(a.type) ? ` — ${a.options.join(', ')}` : ''}
                  {a.type === 'amount' ? ` — ${a.currency}` : ''}
                </div>
              </div>
              {/* Visible : la startup le voit et le remplit dans son espace. */}
              <label className="check" style={{ fontSize: 12.5 }} title="The startup sees it and fills it in its space">
                <input
                  type="checkbox"
                  checked={a.visible}
                  onChange={(e) =>
                    patch(a, { visible: e.target.checked }, e.target.checked ? 'The startups see it now.' : 'Only CEED sees it now.')
                  }
                />
                <span>Startup sees it</span>
              </label>
              <button className="btn ghost sm" onClick={() => setEditing(a)}>
                <Icon name="edit" size={12} /> Edit
              </button>
              <button
                className="btn ghost icon sm"
                aria-label="Archive"
                title="Archive — it leaves the sheets; its values and history stay"
                onClick={() => patch(a, { archived: true }, 'Archived — its values and history are kept.')}
              >
                <Icon name="trash" size={12} />
              </button>
            </div>
          ))}
          {archived.length > 0 && (
            <button className="linkish" style={{ alignSelf: 'flex-start', fontSize: 12.5 }} onClick={() => setShowArchived((x) => !x)}>
              {showArchived ? 'Hide' : 'Show'} {archived.length} archived
            </button>
          )}
          {showArchived &&
            archived.map((a) => (
              <div key={a.id} className="rowcard row" style={{ padding: '8px 12px', gap: 10, opacity: 0.75 }}>
                <span style={{ flex: 1, fontSize: 13 }}>
                  {a.label} <span className="faint">· {ATTRIBUTE_TYPE_LABEL[a.type]}</span>
                </span>
                <button className="btn ghost sm" onClick={() => patch(a, { archived: false }, 'Back on the sheets.')}>
                  Restore
                </button>
              </div>
            ))}
        </div>
      </section>

      <section className="card" style={{ maxWidth: 880 }}>
        <div className="rowcard-head" style={{ padding: '13px 16px' }}>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: 16 }}>Fixed attributes</h2>
            <p className="faint" style={{ margin: '2px 0 0', fontSize: 12.5 }}>
              The sheet every startup fills. Their name and type stay as they are: screens, filters and exports rely on
              them.
            </p>
          </div>
        </div>
        <div className="card-pad row wrap" style={{ gap: 6 }}>
          {PROFILE_SOURCES.map((s) => (
            <span key={s.key} className="badge">
              {s.en}
            </span>
          ))}
        </div>
      </section>

      {editing && (
        <AttributeModal
          attribute={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            list.reload();
          }}
        />
      )}
    </>
  );
}

function AttributeModal({
  attribute,
  onClose,
  onSaved,
}: {
  attribute: OrgAttribute | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [label, setLabel] = useState(attribute?.label ?? '');
  const [labelEn, setLabelEn] = useState(attribute?.labelEn ?? '');
  const [type, setType] = useState<AttributeType>(attribute?.type ?? 'short_text');
  const [options, setOptions] = useState((attribute?.options ?? []).join('\n'));
  const [currency, setCurrency] = useState(attribute?.currency ?? 'MAD');
  const [visible, setVisible] = useState(attribute?.visible ?? true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const save = async () => {
    setSaving(true);
    setErrors({});
    const body = {
      label,
      labelEn,
      options: options.split('\n').map((o) => o.trim()).filter(Boolean),
      currency,
      visible,
    };
    try {
      if (attribute) await api.patch(`/api/org-attributes/${attribute.id}`, body);
      else await api.post('/api/org-attributes', { ...body, type });
      toast(attribute ? 'Saved.' : 'Added to every startup’s sheet.');
      onSaved();
    } catch (err) {
      if (err instanceof ApiError && err.fields) setErrors(err.fields);
      else toast((err as Error).message, true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={attribute ? `Edit — ${attribute.label}` : 'Add an attribute'}
      subtitle="On every startup’s sheet."
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={saving || !label.trim()} onClick={save}>
            {saving ? 'Saving…' : attribute ? 'Save' : 'Add'}
          </button>
        </>
      }
    >
      <div className="grid-2">
        <div className="field">
          <label>Name</label>
          <input className="input" value={label} autoFocus placeholder="Numéro ICE" onChange={(e) => setLabel(e.target.value)} />
          {errors.label && <div className="err">{errors.label}</div>}
        </div>
        <div className="field">
          <label>Name in English</label>
          <input className="input" value={labelEn} placeholder="Optional" onChange={(e) => setLabelEn(e.target.value)} />
          <div className="help">For a startup reading its space in English.</div>
        </div>
      </div>
      <div className="field">
        <label>Type</label>
        {/* Le type ne change plus une fois créé : les valeurs saisies n'y survivraient pas. */}
        <select className="input" value={type} disabled={Boolean(attribute)} onChange={(e) => setType(e.target.value as AttributeType)}>
          {ATTRIBUTE_TYPES.map((t) => (
            <option key={t} value={t}>{ATTRIBUTE_TYPE_LABEL[t]}</option>
          ))}
        </select>
        {attribute && <div className="help">The type stays once created — the values already given would not fit another.</div>}
      </div>
      {hasOptions(type) && (
        <div className="field">
          <label>Choices</label>
          <textarea className="textarea" rows={5} value={options} placeholder={'One per line'} onChange={(e) => setOptions(e.target.value)} />
          {errors.options && <div className="err">{errors.options}</div>}
        </div>
      )}
      {type === 'amount' && (
        <div className="field">
          <label>Currency</label>
          <input className="input" style={{ width: 120 }} value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} />
        </div>
      )}
      <label className="check">
        <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} />
        <span>The startup sees it, and fills it in its space</span>
      </label>
    </Modal>
  );
}
