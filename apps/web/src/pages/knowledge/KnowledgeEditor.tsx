/**
 * Écrire une connaissance — la première version, une mise à jour, ou une
 * correction. Du Markdown simple, une barre d'outils pour qui ne le connaît
 * pas, et l'aperçu de ce que les autres liront.
 */
import { type KbCategory } from '@ceed/shared';
import { useRef, useState } from 'react';
import { ApiError, api } from '../../lib/api';
import { Icon } from '../../ui/Icon';
import { Markdown } from '../../ui/Markdown';
import { Modal, useToast } from '../../ui/Overlays';
import { SelectField, TextField } from '../../ui/Field';

type Mode =
  | { kind: 'create' }
  | { kind: 'update'; entryId: string }
  | { kind: 'edit'; versionId: string; revision: number; reviewed: boolean };

export function KnowledgeEditor({
  mode,
  categories,
  initial,
  onClose,
  onSaved,
}: {
  mode: Mode;
  categories: KbCategory[];
  initial?: { title: string; body: string; categoryId?: string; changeSummary?: string };
  onClose: () => void;
  onSaved: (ids: { entryId?: string; versionId?: string }) => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [body, setBody] = useState(initial?.body ?? '');
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? '');
  const [changeSummary, setChangeSummary] = useState(initial?.changeSummary ?? '');
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const box = useRef<HTMLTextAreaElement>(null);
  const toast = useToast();

  /* Le marquage autour de la sélection, ou en tête des lignes choisies. */
  const wrap = (before: string, after = before) => {
    const el = box.current;
    if (!el) return;
    const { selectionStart: a, selectionEnd: b, scrollTop } = el;
    const next = body.slice(0, a) + before + body.slice(a, b) + after + body.slice(b);
    setBody(next);
    requestAnimationFrame(() => {
      el.focus({ preventScroll: true });
      el.setSelectionRange(a + before.length, b + before.length);
      el.scrollTop = scrollTop;
    });
  };
  const prefix = (mark: (i: number) => string) => {
    const el = box.current;
    if (!el) return;
    const { selectionStart: a, selectionEnd: b, scrollTop } = el;
    const start = body.lastIndexOf('\n', a - 1) + 1;
    const lines = body.slice(start, b).split('\n');
    const done = lines.map((l, i) => mark(i) + l).join('\n');
    setBody(body.slice(0, start) + done + body.slice(b));
    requestAnimationFrame(() => {
      el.focus({ preventScroll: true });
      el.setSelectionRange(start, start + done.length);
      el.scrollTop = scrollTop;
    });
  };

  const save = async () => {
    setBusy(true);
    setErrors({});
    try {
      if (mode.kind === 'create') {
        const made = await api.post<{ entryId: string; versionId: string }>('/api/kb/entries', { categoryId, title, body });
        toast('Saved — the AI analysis is running.');
        onSaved(made);
      } else if (mode.kind === 'update') {
        const made = await api.post<{ versionId: string }>(`/api/kb/entries/${mode.entryId}/versions`, { title, body, changeSummary });
        toast('New version saved — the AI analysis is running. The published version stays the reference until this one is published.');
        onSaved({ entryId: mode.entryId, versionId: made.versionId });
      } else {
        const done = await api.patch<{ reanalyse: boolean }>(`/api/kb/versions/${mode.versionId}`, {
          title, body, changeSummary, categoryId: categoryId || undefined, revision: mode.revision,
        });
        toast(done.reanalyse ? 'Saved — the text changed, so it is analysed and reviewed again.' : 'Saved.');
        onSaved({ versionId: mode.versionId });
      }
    } catch (err) {
      if (err instanceof ApiError && err.fields) setErrors(err.fields);
      toast((err as Error).message, true);
    } finally {
      setBusy(false);
    }
  };

  const heading = mode.kind === 'create' ? 'New knowledge' : mode.kind === 'update' ? 'Propose an update' : 'Correct this version';

  return (
    <Modal
      title={heading}
      subtitle={
        mode.kind === 'create'
          ? 'Saved, it is analysed by the AI, then reviewed by a colleague and validated by the president.'
          : mode.kind === 'update'
            ? 'A new version, through the whole circuit. The published one stays official until then.'
            : 'Changing the title or the text starts the analysis and the review again.'
      }
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn ghost" disabled={busy} onClick={onClose}>Cancel</button>
          <div className="spacer" />
          <button className="btn primary" disabled={busy || !title.trim() || (mode.kind === 'create' && !categoryId)} onClick={save}>
            {busy ? 'Saving…' : mode.kind === 'edit' ? 'Save' : 'Save & Analyze'}
          </button>
        </>
      }
    >
      <div className="stack kb-editor" style={{ gap: 12 }}>
        {mode.kind === 'edit' && mode.reviewed && (
          <div className="callout warn">
            <Icon name="alert" size={15} /> This version was reviewed. Changing its text cancels that review.
          </div>
        )}
        <TextField label="Title" value={title} onChange={setTitle} error={errors.title} placeholder="Procédure de sélection des startups" />
        {mode.kind !== 'update' && (
          <SelectField
            label="Category"
            value={categoryId}
            onChange={setCategoryId}
            placeholder="Choose a category"
            error={errors.categoryId}
            options={categories.filter((c) => c.active || c.id === categoryId).map((c) => ({ value: c.id, label: c.name }))}
          />
        )}
        <div className="field">
          <div className="row">
            <label style={{ flex: 1 }}>Content</label>
            <button className="linkish" style={{ fontSize: 12 }} onClick={() => setPreview(!preview)}>
              {preview ? 'Write' : 'Preview'}
            </button>
          </div>
          {preview ? (
            <div className="card card-pad" style={{ minHeight: 280 }}>
              <Markdown text={body} />
            </div>
          ) : (
            <>
              <div className="kb-toolbar" role="toolbar" aria-label="Formatting">
                <button className="btn ghost sm" onClick={() => prefix(() => '## ')}>Heading</button>
                <button className="btn ghost sm" onClick={() => wrap('**')}><strong>B</strong></button>
                <button className="btn ghost sm" onClick={() => wrap('_')}><em>I</em></button>
                <button className="btn ghost sm" onClick={() => prefix(() => '- ')}>• List</button>
                <button className="btn ghost sm" onClick={() => prefix((i) => `${i + 1}. `)}>1. List</button>
                <button className="btn ghost sm" onClick={() => prefix(() => '> ')}>Quote</button>
              </div>
              <textarea
                ref={box}
                className="textarea"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={'## Ce qu’il faut savoir\n\nUne procédure, des questions-réponses, une note interne…\n\n- un point\n- un autre point'}
              />
            </>
          )}
          {errors.body && <div style={{ color: 'var(--stop)', fontSize: 12 }}>{errors.body}</div>}
        </div>
        {mode.kind !== 'create' && (
          <TextField label="What changes" value={changeSummary} onChange={setChangeSummary} placeholder="Deux jours de congé en plus à partir de 2027." />
        )}
      </div>
    </Modal>
  );
}
