import { fullName, rolesFor, splitName, type DirectoryRecord, type RecordKind } from '@ceed/shared';
import { useState } from 'react';
import { ApiError, api } from '../../lib/api';
import { TagField, TextArea, TextField } from '../../ui/Field';
import { Modal, useToast } from '../../ui/Overlays';
import { PhoneLines } from '../../ui/PhoneLines';
import { RecordImage } from '../../ui/OrgProfile';
import { ProfileFields } from '../../ui/OrgProfile';

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
    phones: record?.phones ?? [],
    city: record?.city ?? '',
    country: record?.country ?? 'Morocco',
    website: record?.website ?? '',
    bio: record?.bio ?? '',
    tags: record?.tags ?? [],
    logoUploadId: record?.logoUploadId ?? null,
    pitch: record?.pitch ?? '',
    sector: record?.sector ?? '',
    stage: record?.stage ?? '',
    foundedYear: record?.foundedYear ?? null,
    teamSize: record?.teamSize ?? null,
    linkedin: record?.linkedin ?? '',
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
        ? await api.patch<DirectoryRecord & { login?: 'moved' | 'kept' | 'taken' | 'none' }>(
            `/api/records/${record!.id}`,
            body,
          )
        : await api.post<DirectoryRecord>('/api/records', { kind, origin: 'manual', ...body });
      /* Ce que l'adresse a fait au compte, dit sur le coup : « enregistré »
         tout court laisserait quelqu'un croire que la connexion a suivi, ou
         qu'elle n'a pas suivi, selon ce qu'il espérait. */
      const login = 'login' in saved ? saved.login : 'none';
      toast(
        !editing
          ? `${saved.name} added to the directory.`
          : login === 'moved'
            ? 'Saved — they now sign in with this address too.'
            : login === 'kept'
              ? 'Saved. Their sign-in address is unchanged: they already have it. Send the access again to move it.'
              : login === 'taken'
                ? 'Saved, but another account already signs in with this address — theirs is unchanged.'
                : 'Saved.',
      );
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

      {/* Une organisation a un logo, une personne une photo : c'est la même
          image sur la même fiche, et seul le mot change. */}
      {!isOrg && (
        <RecordImage
          label="Photo"
          uploadId={draft.logoUploadId}
          name={draft.name}
          onChange={(v) => set({ logoUploadId: v })}
        />
      )}

      <TextField label="Email" value={draft.email} onChange={(v) => set({ email: v })} placeholder="contact@…" />
      <PhoneLines label="Phone" values={draft.phones} onChange={(v) => set({ phones: v })} />
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

      {/* La même fiche que le fondateur remplit, modifiable ici : CEED saisit
          souvent pour une startup qui a envoyé ça par mail. */}
      {isOrg && (
        <>
          <div className="eyebrow" style={{ marginTop: 4 }}>Profile the jury reads</div>
          <ProfileFields draft={draft} set={(partial) => set(partial)} name={draft.name} lang="en" />
        </>
      )}
    </Modal>
  );
}
