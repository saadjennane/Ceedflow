import { PROGRAM_TYPES, type Edition, type ProgramWithEditions } from '@ceed/shared';
import { useState } from 'react';
import { ApiError, api } from '../lib/api';
import { DateField, NumberField, SelectField, TextArea, TextField } from '../ui/Field';
import { Icon } from '../ui/Icon';
import { Modal, useToast } from '../ui/Overlays';

const COLOURS = ['#2F5BFF', '#00A36A', '#C77400', '#D8305A', '#7B3FE4', '#0E9FB5'];

const TEMPLATES = [
  {
    value: 'selection_funnel' as const,
    title: 'Standard selection funnel',
    blurb: 'Two phases, ready to configure: Recruitment (sourcing, application form) and Selection (evaluation, committee, selection).',
  },
  {
    value: 'blank' as const,
    title: 'Empty',
    blurb: 'One phase and nothing in it. Build the workflow from the library yourself.',
  },
];

/* ------------------------------------------------------------------ */
/* New program                                                       */
/* ------------------------------------------------------------------ */

export function CreateProgramModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (program: ProgramWithEditions) => void;
}) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [type, setType] = useState<string>('Incubation');
  const [summary, setSummary] = useState('');
  const [partner, setPartner] = useState('');
  const [colour, setColour] = useState(COLOURS[0]);

  const [editionName, setEditionName] = useState(`${new Date().getFullYear() + 1}`);
  const [startsOn, setStartsOn] = useState<string | null>(null);
  const [endsOn, setEndsOn] = useState<string | null>(null);
  const [city, setCity] = useState('Casablanca');
  const [seats, setSeats] = useState(12);
  const [template, setTemplate] = useState<'blank' | 'selection_funnel'>('selection_funnel');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const editionLabel = name ? `${name} ${editionName}`.trim() : editionName;

  const submit = async () => {
    setSaving(true);
    try {
      const program = await api.post<ProgramWithEditions>('/api/programs', {
        name,
        code,
        type,
        summary,
        partner,
        colour,
        edition: { name: editionLabel, startsOn, endsOn, city, seats, template },
      });
      onCreated(program);
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.fields) setErrors(err.fields);
      else toast((err as Error).message, true);
      setStep(1);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="New program"
      subtitle={step === 1 ? 'Step 1 of 2 — the program itself' : 'Step 2 of 2 — its first edition'}
      onClose={onClose}
      footer={
        step === 1 ? (
          <>
            <button className="btn ghost" onClick={onClose}>
              Cancel
            </button>
            <button className="btn primary" disabled={!name.trim()} onClick={() => setStep(2)}>
              Continue <Icon name="arrowRight" size={14} />
            </button>
          </>
        ) : (
          <>
            <button className="btn ghost" onClick={() => setStep(1)}>
              <Icon name="chevronLeft" size={14} /> Back
            </button>
            <div className="spacer" />
            <button className="btn primary" disabled={saving || !editionName.trim()} onClick={submit}>
              {saving ? 'Creating…' : 'Create program'}
            </button>
          </>
        )
      }
    >
      {step === 1 ? (
        <>
          <TextField
            label="Program name"
            value={name}
            onChange={setName}
            placeholder="CEED Grow"
            error={errors.name}
            help="The parent. Each run of it becomes an edition."
          />
          <div className="grid-2">
            <TextField label="Short code" value={code} onChange={setCode} placeholder="GROW" hint="optional" />
            <SelectField
              label="Type"
              value={type}
              onChange={setType}
              options={PROGRAM_TYPES.map((t) => ({ value: t, label: t }))}
            />
          </div>
          <TextField
            label="Partner organisation"
            value={partner}
            onChange={setPartner}
            placeholder="Attijariwafa Bank Foundation"
            hint="optional"
          />
          <TextArea
            label="What is this program for?"
            value={summary}
            onChange={setSummary}
            rows={3}
            placeholder="Six months of structured support for startups with first revenue."
          />
          <div className="field">
            <label>Colour</label>
            <div className="swatches">
              {COLOURS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={c === colour ? 'swatch on' : 'swatch'}
                  style={{ background: c }}
                  aria-label={c}
                  onClick={() => setColour(c)}
                />
              ))}
            </div>
          </div>
        </>
      ) : (
        <>
          <TextField
            label="Edition name"
            value={editionName}
            onChange={setEditionName}
            help={`Saved as “${editionLabel}”.`}
          />
          <div className="grid-2">
            <DateField label="Starts on" value={startsOn} onChange={setStartsOn} />
            <DateField label="Ends on" value={endsOn} onChange={setEndsOn} />
          </div>
          <div className="grid-2">
            <TextField label="City" value={city} onChange={setCity} />
            <NumberField label="Seats" value={seats} onChange={setSeats} min={0} help="How many make the cohort." />
          </div>
          <div className="field">
            <label>Start the workflow from</label>
            <div className="pick-list">
              {TEMPLATES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  className={template === t.value ? 'pick on' : 'pick'}
                  onClick={() => setTemplate(t.value)}
                >
                  <Icon name={template === t.value ? 'check' : 'square'} />
                  <div>
                    <strong>{t.title}</strong>
                    <span>{t.blurb}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* New edition on an existing program                                */
/* ------------------------------------------------------------------ */

export function CreateEditionModal({
  programs,
  initialProgramId,
  onClose,
  onCreated,
}: {
  programs: ProgramWithEditions[];
  initialProgramId: string;
  onClose: () => void;
  onCreated: (edition: Edition) => void;
}) {
  const [programId, setProgramId] = useState(initialProgramId);
  const program = programs.find((p) => p.id === programId);
  const [name, setName] = useState('');
  const [startsOn, setStartsOn] = useState<string | null>(null);
  const [endsOn, setEndsOn] = useState<string | null>(null);
  const [city, setCity] = useState('');
  const [seats, setSeats] = useState(12);
  const [source, setSource] = useState<string>('selection_funnel');
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const copyOptions = (program?.editions ?? []).map((e) => ({ value: `copy:${e.id}`, label: `Copy ${e.name}` }));

  const submit = async () => {
    setSaving(true);
    try {
      const body: Record<string, unknown> = { name: name.trim(), startsOn, endsOn, city, seats };
      if (source.startsWith('copy:')) body.copyFromEditionId = source.slice(5);
      else body.template = source;
      const edition = await api.post<Edition>(`/api/programs/${programId}/editions`, body);
      onCreated(edition);
      onClose();
    } catch (err) {
      toast((err as Error).message, true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="New edition"
      subtitle="An edition is one run of a program: its own dates, its own candidates, its own workflow."
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={saving || !name.trim() || !programId} onClick={submit}>
            {saving ? 'Creating…' : 'Create edition'}
          </button>
        </>
      }
    >
      <SelectField
        label="Program"
        value={programId}
        onChange={(value) => {
          setProgramId(value);
          setSource('selection_funnel');
        }}
        options={programs.map((p) => ({ value: p.id, label: `${p.name} · ${p.editions.length} edition${p.editions.length === 1 ? '' : 's'}` }))}
      />
      <TextField label="Edition name" value={name} onChange={setName} placeholder={`${program?.name ?? ''} 2027`.trim()} />
      <div className="grid-2">
        <DateField label="Starts on" value={startsOn} onChange={setStartsOn} />
        <DateField label="Ends on" value={endsOn} onChange={setEndsOn} />
      </div>
      <div className="grid-2">
        <TextField label="City" value={city} onChange={setCity} placeholder="Casablanca" />
        <NumberField label="Seats" value={seats} onChange={setSeats} min={0} />
      </div>
      <SelectField
        label="Workflow"
        value={source}
        onChange={setSource}
        help="Copying an edition brings its phases and blocks, never its candidates or decisions."
        options={[
          { value: 'selection_funnel', label: 'Standard selection funnel' },
          { value: 'blank', label: 'Empty' },
          ...copyOptions,
        ]}
      />
    </Modal>
  );
}
