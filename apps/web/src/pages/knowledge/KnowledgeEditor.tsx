/**
 * Écrire une connaissance — la première version, une mise à jour, ou une
 * correction. Du Markdown simple, une barre d'outils pour qui ne le connaît
 * pas, et l'aperçu de ce que les autres liront.
 */
import { KB_FORMAT_LABEL, type KbCategory, type KbChecklistItem, type KbFormat } from '@ceed/shared';
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
  initial?: { title: string; body: string; format?: KbFormat; items?: KbChecklistItem[]; categoryId?: string; changeSummary?: string };
  onClose: () => void;
  onSaved: (ids: { entryId?: string; versionId?: string }) => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [body, setBody] = useState(initial?.body ?? '');
  const [format, setFormat] = useState<KbFormat>(initial?.format ?? 'info');
  const [items, setItems] = useState<KbChecklistItem[]>(initial?.items?.length ? initial.items : [{ title: '', note: '' }]);
  /* Une ligne laissée vide ne part pas : on n'enregistre que les points écrits. */
  const written = items.filter((i) => i.title.trim());
  const setItem = (i: number, patch: Partial<KbChecklistItem>) => setItems(items.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  const move = (i: number, by: number) => {
    const j = i + by;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j]!, next[i]!];
    setItems(next);
  };
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? '');
  const [changeSummary, setChangeSummary] = useState(initial?.changeSummary ?? '');
  const [preview, setPreview] = useState(false);
  /* Une checklist tirée d'un texte collé : l'IA propose, l'éditeur se remplit, rien ne s'enregistre. */
  const [drafting, setDrafting] = useState<{ text: string; busy: boolean; error: string } | null>(null);
  const draft = async () => {
    if (!drafting) return;
    if (written.length && !window.confirm('Replace the points already written with those read in the text?')) return;
    setDrafting({ ...drafting, busy: true, error: '' });
    try {
      const got = await api.post<{ title: string; context: string; items: KbChecklistItem[] }>('/api/kb/checklist-draft', { text: drafting.text });
      setItems(got.items);
      if (!title.trim() && got.title) setTitle(got.title);
      if (!body.trim() && got.context) setBody(got.context);
      setDrafting(null);
      toast(`${got.items.length} point${got.items.length === 1 ? '' : 's'} read in the text — check them before saving.`);
    } catch (err) {
      setDrafting((d) => d && { ...d, busy: false, error: (err as Error).message });
    }
  };
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
        const made = await api.post<{ entryId: string; versionId: string }>('/api/kb/entries', { categoryId, title, body, format, items: written });
        toast('Saved — the AI analysis is running.');
        onSaved(made);
      } else if (mode.kind === 'update') {
        const made = await api.post<{ versionId: string }>(`/api/kb/entries/${mode.entryId}/versions`, { title, body, format, items: written, changeSummary });
        toast('New version saved — the AI analysis is running. The published version stays the reference until this one is published.');
        onSaved({ entryId: mode.entryId, versionId: made.versionId });
      } else {
        const done = await api.patch<{ reanalyse: boolean }>(`/api/kb/versions/${mode.versionId}`, {
          title, body, format, items: written, changeSummary, categoryId: categoryId || undefined, revision: mode.revision,
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
          <button className="btn primary" disabled={busy || !title.trim() || (mode.kind === 'create' && !categoryId) || (format === 'checklist' && !written.length)} onClick={save}>
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
        <div className="field">
          <label>Format</label>
          <div className="row" style={{ gap: 8 }}>
            {(['info', 'checklist'] as const).map((f) => (
              <button key={f} type="button" className={format === f ? 'pick on' : 'pick'} style={{ flex: 1 }} onClick={() => setFormat(f)}>
                <Icon name={f === 'checklist' ? 'check' : 'file'} />
                <div>
                  <strong>{KB_FORMAT_LABEL[f]}</strong>
                  <span>
                    {f === 'info'
                      ? 'Something to read: a rule, a procedure, an answer.'
                      : 'Steps to follow. “Add to backlog” turns its points into tasks, each time you need them.'}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
        <TextField label="Title" value={title} onChange={setTitle} error={errors.title} placeholder={format === 'checklist' ? 'Préparer un comité de sélection' : 'Procédure de sélection des startups'} />
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
        {format === 'checklist' && (
          <div className="field">
            <label>Points</label>
            <span className="faint" style={{ fontSize: 12.5 }}>
              Each point becomes a task in the backlog. Owner and link are given there, when the task is created.
            </span>
            {drafting ? (
              <div className="card card-pad stack" style={{ gap: 8 }}>
                <textarea
                  className="textarea"
                  style={{ minHeight: 160 }}
                  value={drafting.text}
                  disabled={drafting.busy}
                  placeholder="Paste a procedure, an email, meeting notes, a document… The AI reads the process in it and proposes its steps."
                  onChange={(e) => setDrafting({ ...drafting, text: e.target.value })}
                  aria-label="Text to read"
                />
                {drafting.error && <div style={{ color: 'var(--stop)', fontSize: 12 }}>{drafting.error}</div>}
                <div className="row" style={{ gap: 8 }}>
                  <button type="button" className="btn primary sm" disabled={drafting.busy || !drafting.text.trim()} onClick={draft}>
                    {drafting.busy ? 'Reading the text… (up to a minute)' : 'Generate the points'}
                  </button>
                  <button type="button" className="btn ghost sm" disabled={drafting.busy} onClick={() => setDrafting(null)}>Cancel</button>
                </div>
              </div>
            ) : (
              <button type="button" className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => setDrafting({ text: '', busy: false, error: '' })}>
                <Icon name="refresh" size={13} /> Generate from text
              </button>
            )}
            <div className="kb-items">
              {items.map((item, i) => (
                <div key={i} className="kb-item">
                  <span className="num">{i + 1}.</span>
                  <div className="kb-item-fields">
                    <input
                      className="input"
                      value={item.title}
                      maxLength={300}
                      placeholder="Réserver la salle du jury"
                      aria-label={`Point ${i + 1}`}
                      onChange={(e) => setItem(i, { title: e.target.value })}
                    />
                    <input
                      className="input"
                      style={{ fontSize: 12.5 }}
                      value={item.note}
                      maxLength={2000}
                      placeholder="Detail (optional) — becomes the task’s description"
                      aria-label={`Detail of point ${i + 1}`}
                      onChange={(e) => setItem(i, { note: e.target.value })}
                    />
                  </div>
                  <div className="kb-item-tools">
                    <button type="button" className="btn ghost sm" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">↑</button>
                    <button type="button" className="btn ghost sm" disabled={i === items.length - 1} onClick={() => move(i, 1)} aria-label="Move down">↓</button>
                    <button type="button" className="btn ghost sm" disabled={items.length === 1} onClick={() => setItems(items.filter((_, k) => k !== i))} aria-label="Remove">
                      <Icon name="trash" size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <button type="button" className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => setItems([...items, { title: '', note: '' }])}>
              <Icon name="plus" size={13} /> Add a point
            </button>
            {errors.items && <div style={{ color: 'var(--stop)', fontSize: 12 }}>{errors.items}</div>}
          </div>
        )}
        <div className="field">
          <div className="row">
            <label style={{ flex: 1 }}>{format === 'checklist' ? 'Context (optional)' : 'Content'}</label>
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
