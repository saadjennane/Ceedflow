import { PROGRAM_TYPES, type ProgramWithEditions } from '@ceed/shared';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { formatRange } from '../lib/format';
import { useAsync } from '../lib/useAsync';
import { SelectField, TextArea, TextField } from '../ui/Field';
import { Icon } from '../ui/Icon';
import { ConfirmDialog, Modal, useToast } from '../ui/Overlays';
import { CreateEditionModal } from './CreateModals';
import '../ui/programs.css';

const COLOURS = ['#2F5BFF', '#00A36A', '#C77400', '#D8305A', '#7B3FE4', '#0E9FB5'];
const STATUS_TONE: Record<string, string> = {
  Draft: 'badge',
  Published: 'badge info',
  Running: 'badge ok',
  Completed: 'badge',
};

export function ProgramPage() {
  const { programId = '' } = useParams();
  const program = useAsync(() => api.get<ProgramWithEditions>(`/api/programs/${programId}`), programId);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();

  if (program.error) return <div className="page"><div className="empty">{program.error}</div></div>;
  if (!program.data) return <div className="page"><div className="empty">Loading…</div></div>;

  const p = program.data;

  return (
    <>
      <header className="topbar">
        <div className="crumbs">
          <Link to="/">Programs</Link>
          <Icon name="chevronRight" size={13} />
        </div>
        <h1>{p.name}</h1>
        <span className="badge">{p.type}</span>
        <div className="spacer" />
        <button className="btn" onClick={() => setEditing(true)}>
          <Icon name="edit" size={14} /> Edit program
        </button>
        <button className="btn primary" onClick={() => setAdding(true)}>
          <Icon name="plus" /> New edition
        </button>
      </header>

      <div className="page">
        <div className="card card-pad stack">
          <div className="row">
            <span className="prog-chip" style={{ background: p.colour }} />
            <div className="eyebrow">{p.code || 'No code'}</div>
            {p.partner && <span className="badge">with {p.partner}</span>}
          </div>
          <p style={{ margin: 0, maxWidth: '65ch' }} className={p.summary ? '' : 'faint'}>
            {p.summary || 'No description yet.'}
          </p>
        </div>

        <div className="row">
          <h2 style={{ fontSize: 15 }}>Editions</h2>
          <span className="badge num">{p.editions.length}</span>
        </div>

        {p.editions.length ? (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Edition</th>
                  <th>Status</th>
                  <th>Dates</th>
                  <th>City</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {p.editions.map((edition) => (
                  <tr key={edition.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/editions/${edition.id}`)}>
                    <td className="name">{edition.name}</td>
                    <td>
                      <span className={STATUS_TONE[edition.status]}>{edition.status}</span>
                    </td>
                    <td className="muted">{formatRange(edition.startsOn, edition.endsOn)}</td>
                    <td className="muted">{edition.city || '—'}</td>
                    <td style={{ textAlign: 'right' }}>
                      <Icon name="chevronRight" size={14} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">
            <h3>No edition yet</h3>
            <p>Every run of {p.name} is an edition, with its own dates, workflow and candidates.</p>
            <button className="btn primary" onClick={() => setAdding(true)}>
              <Icon name="plus" /> New edition
            </button>
          </div>
        )}

        <div>
          <button className="btn danger sm" onClick={() => setConfirmDelete(true)}>
            <Icon name="trash" size={13} /> Delete program
          </button>
        </div>
      </div>

      {editing && (
        <EditProgramModal
          program={p}
          onClose={() => setEditing(false)}
          onSaved={() => {
            program.reload();
            toast('Program updated.');
          }}
        />
      )}

      {adding && (
        <CreateEditionModal
          programs={[p]}
          initialProgramId={p.id}
          onClose={() => setAdding(false)}
          onCreated={(edition) => navigate(`/editions/${edition.id}`)}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          title={`Delete ${p.name}?`}
          body={`This removes the program, its ${p.editions.length} edition${p.editions.length === 1 ? '' : 's'}, and everything inside them. It cannot be undone.`}
          confirmLabel="Delete program"
          destructive
          onClose={() => setConfirmDelete(false)}
          onConfirm={async () => {
            await api.del(`/api/programs/${p.id}`);
            toast(`${p.name} deleted.`);
            navigate('/');
          }}
        />
      )}
    </>
  );
}

function EditProgramModal({
  program,
  onClose,
  onSaved,
}: {
  program: ProgramWithEditions;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState({
    name: program.name,
    code: program.code,
    type: program.type,
    summary: program.summary,
    partner: program.partner,
    colour: program.colour,
  });
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const set = (patch: Partial<typeof draft>) => setDraft((d) => ({ ...d, ...patch }));

  return (
    <Modal
      title="Edit program"
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            disabled={saving || !draft.name.trim()}
            onClick={async () => {
              setSaving(true);
              try {
                await api.patch(`/api/programs/${program.id}`, draft);
                onSaved();
                onClose();
              } catch (err) {
                toast((err as Error).message, true);
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </>
      }
    >
      <TextField label="Program name" value={draft.name} onChange={(v) => set({ name: v })} />
      <div className="grid-2">
        <TextField label="Short code" value={draft.code} onChange={(v) => set({ code: v })} />
        <SelectField
          label="Type"
          value={draft.type}
          onChange={(v) => set({ type: v })}
          options={PROGRAM_TYPES.map((t) => ({ value: t, label: t }))}
        />
      </div>
      <TextField label="Partner organisation" value={draft.partner} onChange={(v) => set({ partner: v })} />
      <TextArea label="Description" value={draft.summary} onChange={(v) => set({ summary: v })} rows={3} />
      <div className="field">
        <label>Colour</label>
        <div className="swatches">
          {COLOURS.map((c) => (
            <button
              key={c}
              type="button"
              className={c === draft.colour ? 'swatch on' : 'swatch'}
              style={{ background: c }}
              aria-label={c}
              onClick={() => set({ colour: c })}
            />
          ))}
        </div>
      </div>
    </Modal>
  );
}
