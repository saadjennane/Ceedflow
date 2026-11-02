/**
 * Le Setup du reporting — qui s'ouvre comme celui d'une brique, sans en être une.
 *
 * Indicators: the programme's (every edition shares them, so cohorts compare)
 * and this edition's own; each one linked to the startup sheet or the
 * programme's own, as a form question is. Moments: when the cohort is
 * measured. Messages: what it is told. Everything saves as it is changed.
 */
import {
  REPORTING_VARIABLES,
  idOf,
  type EditionDetail,
  type EditionReporting,
  type FormField,
  type KpiMoment,
  type ReportingView,
} from '@ceed/shared';
import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { DateField, TextArea, TextField } from '../../ui/Field';
import { Icon } from '../../ui/Icon';
import { Drawer, useToast } from '../../ui/Overlays';
import { QuestionsEditor } from '../../ui/QuestionsEditor';

const TABS = ['Indicators', 'Moments', 'Messages'] as const;
type SetupTab = (typeof TABS)[number];

/** Enregistre après une pause : une frappe n'est pas une décision. */
function useSaver<T>(save: (value: T) => Promise<void>) {
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const last = useRef<T | null>(null);
  const flush = () => {
    clearTimeout(timer.current);
    if (last.current !== null) {
      const v = last.current;
      last.current = null;
      void save(v);
    }
  };
  useEffect(() => flush, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (value: T, now = false) => {
    last.current = value;
    clearTimeout(timer.current);
    if (now) flush();
    else timer.current = setTimeout(flush, 700);
  };
}

export function ReportingSetup({
  edition,
  view,
  onClose,
  onChanged,
}: {
  edition: EditionDetail;
  view: ReportingView;
  onClose: () => void;
  onChanged: (next: ReportingView) => void;
}) {
  const [tab, setTab] = useState<SetupTab>('Indicators');
  const [programFields, setProgramFields] = useState<FormField[]>(view.programIndicators);
  const [editionFields, setEditionFields] = useState<FormField[]>(view.editionIndicators);
  const [moments, setMoments] = useState<KpiMoment[]>(view.moments);
  const [messages, setMessages] = useState(view.messages);
  const [saving, setSaving] = useState(0);
  const toast = useToast();

  const run = async (go: () => Promise<void>) => {
    setSaving((n) => n + 1);
    try {
      await go();
    } catch (err) {
      toast((err as Error).message, true);
    } finally {
      setSaving((n) => n - 1);
    }
  };
  const saveEdition = (patch: Partial<EditionReporting>) =>
    run(async () => onChanged(await api.put<ReportingView>(`/api/editions/${edition.id}/reporting`, patch)));
  const saveProgram = useSaver<FormField[]>((indicators) =>
    run(async () => {
      await api.put(`/api/programs/${edition.program.id}/reporting`, { indicators });
      onChanged(await api.get<ReportingView>(`/api/editions/${edition.id}/reporting`));
    }),
  );
  const saveEditionFields = useSaver<FormField[]>((indicators) => saveEdition({ indicators }));
  const saveMoments = useSaver<KpiMoment[]>((next) => saveEdition({ moments: next }));
  const saveMessages = useSaver<EditionReporting['messages']>((next) => saveEdition({ messages: next }));

  const setMoment = (id: string, patch: Partial<KpiMoment>) => {
    const next = moments.map((m) => (m.id === id ? { ...m, ...patch } : m));
    setMoments(next);
    saveMoments(next, patch.opensOn !== undefined || patch.closesOn !== undefined);
  };

  return (
    <Drawer
      wide
      title="Reporting"
      subtitle={`${edition.program.name} · ${edition.name} — not a brick: what the programme measures`}
      onClose={onClose}
      tabs={TABS.map((t) => (
        <button key={t} role="tab" className={t === tab ? 'tab on' : 'tab'} onClick={() => setTab(t)}>
          {t}
        </button>
      ))}
      footer={
        <>
          <span className="faint" style={{ fontSize: 12 }} role="status">
            {saving > 0 ? 'Saving…' : 'Saved as you go ✓'}
          </span>
          <div className="spacer" />
          <button className="btn primary" onClick={onClose}>Close</button>
        </>
      }
    >
      {tab === 'Indicators' && (
        <div className="stack" style={{ gap: 18 }}>
          <div className="callout">
            <Icon name="board" size={15} />
            <div>
              What each startup of the cohort gives at every moment. <strong>From the sheet</strong> (headcount,
              turnover…): prefilled by its sheet, and updating it. Otherwise, the programme’s own.
            </div>
          </div>
          <section className="stack" style={{ gap: 6 }}>
            <h3 className="section-title" style={{ margin: 0 }}>For the whole programme</h3>
            <p className="faint" style={{ margin: 0, fontSize: 12.5 }}>
              Every edition of {edition.program.name} is measured on these — that is what lets cohorts be compared.
            </p>
            <QuestionsEditor
              value={{ layout: 'single', pages: [], fields: programFields }}
              onChange={(partial) => {
                if (!partial.fields) return;
                setProgramFields(partial.fields);
                saveProgram(partial.fields);
              }}
              emptyText="No indicator yet. Headcount, turnover, pilots signed…"
              profileLink
              kpiPeriodSaid="The period is the one of each moment’s opening date."
            />
          </section>
          <section className="stack" style={{ gap: 6 }}>
            <h3 className="section-title" style={{ margin: 0 }}>This edition only</h3>
            <QuestionsEditor
              value={{ layout: 'single', pages: [], fields: editionFields }}
              onChange={(partial) => {
                if (!partial.fields) return;
                setEditionFields(partial.fields);
                saveEditionFields(partial.fields);
              }}
              emptyText="Nothing more for this edition."
              profileLink
              kpiPeriodSaid="The period is the one of each moment’s opening date."
            />
          </section>
        </div>
      )}

      {tab === 'Moments' && (
        <div className="stack" style={{ gap: 10 }}>
          <div className="callout">
            <Icon name="calendar" size={15} />
            <div>
              When the cohort is measured. The first is the baseline the evolution starts from. A value from the sheet
              is written at the moment’s opening date; the deadline only makes it late.
            </div>
          </div>
          {moments.map((m, i) => (
            <div key={m.id} className="rowcard card-pad stack" style={{ gap: 8 }}>
              <div className="row" style={{ gap: 8 }}>
                <span className="badge num">{i === 0 ? 'Baseline' : i + 1}</span>
                <input
                  className="input"
                  style={{ flex: 1 }}
                  value={m.name}
                  aria-label="Name"
                  onChange={(e) => setMoment(m.id, { name: e.target.value })}
                />
                {m.launchedAt ? (
                  <span className="badge ok">Sent {new Date(m.launchedAt).toLocaleDateString('fr-FR')}</span>
                ) : (
                  <button
                    className="btn ghost icon sm"
                    aria-label="Remove this moment"
                    onClick={() => {
                      const next = moments.filter((x) => x.id !== m.id);
                      setMoments(next);
                      saveMoments(next, true);
                    }}
                  >
                    <Icon name="trash" size={12} />
                  </button>
                )}
              </div>
              <div className="grid-2">
                <DateField label="Opens on" value={m.opensOn} onChange={(v) => setMoment(m.id, { opensOn: v || null })} />
                <DateField label="Deadline" value={m.closesOn} onChange={(v) => setMoment(m.id, { closesOn: v || null })} />
              </div>
            </div>
          ))}
          <button
            className="btn sm"
            style={{ alignSelf: 'flex-start' }}
            onClick={() => {
              const next = [...moments, { id: idOf.field().replace('fld_', 'mom_'), name: 'New moment', opensOn: null, closesOn: null, launchedAt: null }];
              setMoments(next);
              saveMoments(next, true);
            }}
          >
            <Icon name="plus" size={12} /> Add a moment
          </button>
        </div>
      )}

      {tab === 'Messages' && (
        <div className="stack" style={{ gap: 12 }}>
          <p className="faint" style={{ margin: 0, fontSize: 12.5 }}>
            Variables: {REPORTING_VARIABLES.map((v) => `{{${v.name}}}`).join(' · ')}
          </p>
          <h3 className="section-title" style={{ margin: 0 }}>When a moment is sent</h3>
          <TextField
            label="Subject"
            value={messages.openSubject}
            onChange={(v) => {
              const next = { ...messages, openSubject: v };
              setMessages(next);
              saveMessages(next);
            }}
          />
          <TextArea
            label="Letter"
            rows={9}
            value={messages.open}
            onChange={(v) => {
              const next = { ...messages, open: v };
              setMessages(next);
              saveMessages(next);
            }}
          />
          <h3 className="section-title" style={{ margin: 0 }}>The reminder</h3>
          <TextField
            label="Subject"
            value={messages.remindSubject}
            onChange={(v) => {
              const next = { ...messages, remindSubject: v };
              setMessages(next);
              saveMessages(next);
            }}
          />
          <TextArea
            label="Letter"
            rows={7}
            value={messages.remind}
            onChange={(v) => {
              const next = { ...messages, remind: v };
              setMessages(next);
              saveMessages(next);
            }}
          />
        </div>
      )}
    </Drawer>
  );
}
