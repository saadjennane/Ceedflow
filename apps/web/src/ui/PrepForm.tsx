/**
 * La préparation d'une séance, à remplir ou à relire.
 *
 * One component for the three people who touch it: the startup writes it
 * before the session, the interlocutor and CEED correct or complete it. Read
 * only once it is locked for whoever may no longer change it.
 */
import type { FormField, FormPage } from '@ceed/shared';
import { useState } from 'react';
import { ApiError } from '../lib/api';
import { FormFieldInput } from './FormField';
import { FormPageBody } from './FormPages';
import { Icon } from './Icon';
import { useToast } from './Overlays';

export function PrepForm({
  pages,
  answers: initial,
  readOnly,
  onSave,
  sendLabel,
  saveLabel = 'Save',
  savedSay = 'Saved.',
}: {
  pages: { page: FormPage; fields: FormField[] }[];
  answers: Record<string, unknown>;
  readOnly: boolean;
  /** Saving, and — when the button exists — sending it whole. */
  onSave: (answers: Record<string, unknown>, send: boolean) => Promise<void>;
  /** The second button, for the startup: its preparation, sent to the interlocutor. */
  sendLabel?: string;
  saveLabel?: string;
  savedSay?: string;
}) {
  const [answers, setAnswers] = useState<Record<string, unknown>>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const toast = useToast();

  if (readOnly) {
    return (
      <div className="stack" style={{ gap: 10 }}>
        {pages.flatMap((p) => p.fields).map((f) => (
          <FormFieldInput key={f.id} field={f} value={answers[f.id]} readOnly onChange={() => {}} />
        ))}
      </div>
    );
  }

  const save = async (send: boolean) => {
    setBusy(true);
    setErrors({});
    try {
      await onSave(answers, send);
      setDirty(false);
      toast(savedSay);
    } catch (err) {
      if (err instanceof ApiError && err.fields) setErrors(err.fields);
      toast((err as Error).message, true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack" style={{ gap: 10 }}>
      {pages.map(({ page, fields }) => (
        <FormPageBody
          key={page.id || 'single'}
          heading={pages.length > 1}
          page={{ ...page, fields }}
          values={answers}
          errors={errors}
          onAnswer={(id, value) => {
            setAnswers((a) => ({ ...a, [id]: value }));
            setErrors(({ [`answers.${id}`]: _gone, ...rest }) => rest);
            setDirty(true);
          }}
        />
      ))}
      <div className="row" style={{ gap: 8 }}>
        <div className="spacer" />
        <button className={sendLabel ? 'btn' : 'btn primary'} disabled={busy || !dirty} onClick={() => save(false)}>
          {saveLabel}
        </button>
        {sendLabel && (
          <button className="btn primary" disabled={busy} onClick={() => save(true)}>
            <Icon name="send" size={13} /> {sendLabel}
          </button>
        )}
      </div>
    </div>
  );
}
