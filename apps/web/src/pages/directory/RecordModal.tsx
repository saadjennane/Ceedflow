import { rolesFor, type DirectoryRecord, type RecordKind } from '@ceed/shared';
import { useState } from 'react';
import { ApiError, api } from '../../lib/api';
import { TagField, TextArea, TextField } from '../../ui/Field';
import { Modal, useToast } from '../../ui/Overlays';

/**
 * The second of the three ways in: typed by the team. A record added here is
 * Unclaimed — CEED maintains it until somebody takes it over.
 */
export function RecordModal({
  kind,
  record,
  onClose,
  onSaved,
}: {
  kind: RecordKind;
  /** Given when editing rather than creating. */
  record?: DirectoryRecord;
  onClose: () => void;
  onSaved: (record: DirectoryRecord) => void;
}) {
  const isOrg = kind === 'org';
  const editing = Boolean(record);
  const [draft, setDraft] = useState({
    name: record?.name ?? '',
    roles: record?.roles ?? (isOrg ? ['Startup'] : []),
    email: record?.email ?? '',
    phone: record?.phone ?? '',
    city: record?.city ?? '',
    country: record?.country ?? 'Morocco',
    website: record?.website ?? '',
    bio: record?.bio ?? '',
    tags: record?.tags ?? [],
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const set = (partial: Partial<typeof draft>) => setDraft((d) => ({ ...d, ...partial }));
  const toggleRole = (role: string) =>
    set({ roles: draft.roles.includes(role) ? draft.roles.filter((r) => r !== role) : [...draft.roles, role] });

  const save = async () => {
    setSaving(true);
    setErrors({});
    try {
      const saved = editing
        ? await api.patch<DirectoryRecord>(`/api/records/${record!.id}`, draft)
        : await api.post<DirectoryRecord>('/api/records', { kind, origin: 'manual', ownership: 'Unclaimed', ...draft });
      toast(editing ? 'Saved.' : `${saved.name} added to the directory.`);
      onSaved(saved);
    } catch (err) {
      if (err instanceof ApiError && err.fields) setErrors(err.fields);
      else toast((err as Error).message, true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={editing ? draft.name || 'Record' : isOrg ? 'Add an organisation' : 'Add a person'}
      subtitle={
        editing
          ? undefined
          : `Added by the team, so the page starts Unclaimed — ${isOrg ? 'invite a contact' : 'invite them'} to hand it over.`
      }
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={saving || !draft.name.trim()} onClick={save}>
            {saving ? 'Saving…' : editing ? 'Save' : 'Add'}
          </button>
        </>
      }
    >
      <TextField
        label={isOrg ? 'Organisation' : 'Full name'}
        value={draft.name}
        onChange={(v) => set({ name: v })}
        error={errors.name}
        placeholder={isOrg ? 'Nakhla Bio' : 'Sarah Benali'}
      />

      <div className="field">
        <label>Roles</label>
        <div className="work-pick">
          {rolesFor(kind).map((r) => (
            <button
              key={r}
              className={draft.roles.includes(r) ? 'track on' : 'track'}
              onClick={() => toggleRole(r)}
              type="button"
            >
              {r}
            </button>
          ))}
        </div>
        <div className="hint">
          {isOrg
            ? 'What this organisation is to CEED. It can be several at once.'
            : 'Leave empty for a contact known through their organisation.'}
        </div>
      </div>

      <div className="grid-2">
        <TextField label="Email" value={draft.email} onChange={(v) => set({ email: v })} placeholder="contact@…" />
        <TextField label="Phone" value={draft.phone} onChange={(v) => set({ phone: v })} />
      </div>
      <div className="grid-2">
        <TextField label="City" value={draft.city} onChange={(v) => set({ city: v })} placeholder="Casablanca" />
        <TextField label="Country" value={draft.country} onChange={(v) => set({ country: v })} />
      </div>
      {isOrg && <TextField label="Website" value={draft.website} onChange={(v) => set({ website: v })} />}
      <TextArea
        label={isOrg ? 'What they do' : 'About'}
        value={draft.bio}
        onChange={(v) => set({ bio: v })}
        rows={3}
      />
      <TagField label="Tags" values={draft.tags} onChange={(v) => set({ tags: v })} placeholder="Add a tag" />
    </Modal>
  );
}
