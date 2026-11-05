/**
 * Le modèle d'une question « fichier », côté CEED : on le dépose, la personne
 * qui répond le télécharge, le remplit et le renvoie au même endroit.
 *
 * Un seul par question — deux modèles, ce sont deux questions.
 */
import { MAX_UPLOAD_BYTES, type FormField } from '@ceed/shared';
import { useState } from 'react';
import { Icon } from './Icon';

export function TemplateSetting({
  field,
  onChange,
}: {
  field: Pick<FormField, 'template' | 'templateFormatOnly'>;
  onChange: (partial: Partial<FormField>) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');

  const upload = async (file: File) => {
    setProblem('');
    if (file.size > MAX_UPLOAD_BYTES) {
      setProblem(`That file is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is 10 MB.`);
      return;
    }
    setBusy(true);
    try {
      const body = new FormData();
      body.append('file', file);
      const res = await fetch('/api/templates', { method: 'POST', body });
      if (!res.ok) throw new Error((await res.json())?.error ?? 'Upload failed.');
      onChange({ template: (await res.json()) as { uploadId: string; filename: string } });
    } catch (err) {
      setProblem((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="field">
      <label>Template</label>
      <div className="help">A document they download, fill in and send back here. Replacing it leaves the files already sent as they are.</div>
      {field.template ? (
        <div className="rowcard link-row" style={{ marginTop: 6 }}>
          <Icon name="file" size={15} />
          <strong style={{ flex: 1, minWidth: 0, fontSize: 13, overflowWrap: 'anywhere' }}>{field.template.filename}</strong>
          <a className="btn ghost sm" href={`/api/public/templates/${field.template.uploadId}`}>
            Download
          </a>
          <label className="btn ghost sm">
            <input type="file" hidden disabled={busy} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
            {busy ? 'Sending…' : 'Replace'}
          </label>
          <button className="btn ghost icon sm" aria-label="Remove the template" onClick={() => onChange({ template: undefined, templateFormatOnly: undefined })}>
            <Icon name="trash" size={13} />
          </button>
        </div>
      ) : (
        <label className="dropzone" style={{ marginTop: 6 }}>
          <input type="file" disabled={busy} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          <Icon name="file" size={16} />
          <span>{busy ? 'Sending…' : 'Add a template — Word, Excel, PowerPoint or PDF'}</span>
        </label>
      )}
      {problem && <div style={{ color: 'var(--stop)', fontSize: 12 }}>{problem}</div>}
      {field.template && (
        <label className="check" style={{ marginTop: 6 }}>
          <input
            type="checkbox"
            checked={Boolean(field.templateFormatOnly)}
            onChange={(e) => onChange({ templateFormatOnly: e.target.checked || undefined })}
          />
          <span>Only accept a file in the template’s format</span>
        </label>
      )}
    </div>
  );
}
