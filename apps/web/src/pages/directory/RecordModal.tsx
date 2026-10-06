import { fullName, rolesFor, splitName, type DirectoryRecord, type RecordKind } from '@ceed/shared';
import { useState } from 'react';
import { ApiError, api } from '../../lib/api';
import { TagField, TextArea, TextField } from '../../ui/Field';
import { Modal, useToast } from '../../ui/Overlays';

/** Typed by the team — one of the two ways a record gets into the directory. */
export function RecordModal({
  kind,
  record,
  initialName,
  onClose,
  onSaved,
}: {
  kind: RecordKind;
  /** Given when editing rather than creating. */
  record?: DirectoryRecord;
  /** Carries over what was typed in the search that led here. */
  initialName?: string;
  onClose: () => void;
  onSaved: (record: DirectoryRecord) => void;
}) {
  const isOrg = kind === 'org';
  const editing = Boolean(record);
  /* Une personne a deux champs, une organisation un seul. The split is the
     first space until somebody corrects it, and correcting it is the whole
     reason the two fields are here rather than one. */
  const parts = splitName(record?.name ?? initialName ?? '');
  const [draft, setDraft] = useState({
    name: record?.name ?? initialName ?? '',
    firstName: record?.firstName || (isOrg ? '' : parts.firstName),
    lastName: record?.lastName || (isOrg ? '' : parts.lastName),
    jobTitle: record?.jobTitle ?? '',
    department: record?.department ?? '',
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
      /* The name every screen shows follows from the two fields rather than
         living beside them: two sources for one string is how a directory ends
         up listing somebody under a name their own page does not use. */
      const body = isOrg ? draft : { ...draft, name: fullName(draft.firstName, draft.lastName) };
      const saved = editing
        ? await api.patch<DirectoryRecord>(`/api/records/${record!.id}`, body)
        : await api.post<DirectoryRecord>('/api/records', { kind, origin: 'manual', ...body });
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
      subtitle={editing ? undefined : 'Kept by the CEED team until the person registers themselves.'}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            disabled={saving || !(isOrg ? draft.name.trim() : draft.firstName.trim())}
            onClick={save}
          >
            {saving ? 'Saving…' : editing ? 'Save' : 'Add'}
          </button>
        </>
      }
    >
      {isOrg ? (
        <TextField
          label="Organisation"
          value={draft.name}
          onChange={(v) => set({ name: v })}
          error={errors.name}
          placeholder="Nakhla Bio"
        />
      ) : (
        <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <TextField
              label="First name"
              value={draft.firstName}
              onChange={(v) => set({ firstName: v })}
              error={errors.name}
              placeholder="Sarah"
            />
          </div>
          <div style={{ flex: 1 }}>
            <TextField
              label="Last name"
              value={draft.lastName}
              onChange={(v) => set({ lastName: v })}
              placeholder="Benali"
            />
          </div>
        </div>
      )}

      {/* Ce qu'ils font là où ils travaillent — pas ce qu'ils sont pour CEED,
          qui est la rangée de rôles juste en dessous. Un jury se convoque
          depuis ce fichier, et c'est la fonction qui distingue deux Nadia. */}
      {!isOrg && (
        <div className="grid-2">
          <TextField
            label="Fonction"
            value={draft.jobTitle}
            onChange={(v) => set({ jobTitle: v })}
            placeholder="Directrice de l'innovation"
          />
          <TextField
            label="Direction"
            value={draft.department}
            onChange={(v) => set({ department: v })}
            placeholder="Direction des engagements"
          />
        </div>
      )}

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
