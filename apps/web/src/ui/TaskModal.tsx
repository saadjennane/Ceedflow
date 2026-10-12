/**
 * Donner une tâche.
 *
 * Trois questions dans l'ordre où on se les pose : quoi, à qui, pour quand.
 * Le « à propos de » vient en dernier parce qu'il est souvent déjà rempli —
 * la fenêtre s'ouvre depuis une fiche ou depuis un programme, et elle sait
 * alors de quoi elle parle.
 *
 * Plusieurs destinataires créent plusieurs tâches, et c'est dit sous le champ :
 * sinon « fait » serait un mot sans sujet.
 */
import { type DirectoryRecord } from '@ceed/shared';
import { useState } from 'react';
import { ApiError, api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { PeoplePicker } from '../pages/directory/PeoplePicker';
import { TextField } from './Field';
import { Icon } from './Icon';
import { Modal, useToast } from './Overlays';

export interface TaskAttach {
  recordId?: string | null;
  editionId?: string | null;
  blockId?: string | null;
  candidateId?: string | null;
  /** Ce que la fenêtre dit de l'attache, quand elle en a une. */
  about?: string;
}

export function TaskModal({
  attach,
  onClose,
  onSaved,
}: {
  attach?: TaskAttach;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState({ title: '', detail: '', dueOn: '' });
  const [people, setPeople] = useState<string[]>([]);
  const [orgs, setOrgs] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  /* Les sociétés aussi peuvent porter une tâche : « Rafid Tech doit envoyer
     son RIB » n'est à personne en particulier, et tous ceux qui tiennent sa
     page la voient. */
  const companies = useAsync(() => api.get<DirectoryRecord[]>('/api/records?kind=org'), 'orgs-for-task');

  const set = (partial: Partial<typeof draft>) => setDraft((d) => ({ ...d, ...partial }));
  const owners = [...people, ...orgs];

  const save = async () => {
    setSaving(true);
    setErrors({});
    try {
      const made = await api.post<unknown[]>('/api/tasks', {
        ...draft,
        dueOn: draft.dueOn || null,
        ownerIds: owners,
        recordId: attach?.recordId ?? null,
        editionId: attach?.editionId ?? null,
        blockId: attach?.blockId ?? null,
        candidateId: attach?.candidateId ?? null,
      });
      toast(made.length === 1 ? 'Given.' : `Given to ${made.length}.`);
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
      title="Give a task"
      subtitle={attach?.about ? `About ${attach.about}.` : undefined}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={saving || !draft.title.trim() || !owners.length} onClick={save}>
            {saving ? 'Giving…' : owners.length > 1 ? `Give ${owners.length} tasks` : 'Give it'}
          </button>
        </>
      }
    >
      <TextField
        label="What has to be done"
        value={draft.title}
        error={errors.title}
        placeholder="Chase the commercial register"
        onChange={(v) => set({ title: v })}
      />

      <div className="field">
        <label>More, if it needs it</label>
        <textarea className="textarea" rows={2} value={draft.detail} onChange={(e) => set({ detail: e.target.value })} />
      </div>

      <PeoplePicker label="Who does it" value={people} onChange={setPeople} />

      <div className="field">
        <label>Or an organisation</label>
        <div className="help">Everybody who holds its page sees it, and the first one to deal with it ticks it.</div>
        <div className="work-pick" style={{ maxHeight: 150, overflowY: 'auto' }}>
          {(companies.data ?? []).slice(0, 60).map((org) => (
            <button
              key={org.id}
              type="button"
              className={orgs.includes(org.id) ? 'track on' : 'track'}
              onClick={() => setOrgs((x) => (x.includes(org.id) ? x.filter((o) => o !== org.id) : [...x, org.id]))}
            >
              {org.name}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label htmlFor="task-due">By when</label>
        <input
          id="task-due"
          className="input"
          type="date"
          value={draft.dueOn}
          onChange={(e) => set({ dueOn: e.target.value })}
        />
        <div className="hint">Leave it empty for something with no date. Late is counted from the day after.</div>
      </div>

      {owners.length > 1 && (
        <p className="faint" style={{ margin: 0, fontSize: 12 }}>
          <Icon name="alert" size={12} /> One task each, so that “done” can name somebody.
        </p>
      )}
    </Modal>
  );
}
