/**
 * Les réglages de la Knowledge Base : qui est le président, avec quelle IA
 * l'analyse se fait, et les catégories. Un administrateur les change ; le
 * président ne se désigne jamais lui-même.
 */
import { KB_DEFAULT_MODEL, type KbCategory, type KbSettings } from '@ceed/shared';
import { useEffect, useState } from 'react';
import { ApiError, api } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { Icon } from '../../ui/Icon';
import { useToast } from '../../ui/Overlays';

export function KnowledgeSettings({ mayManage }: { mayManage: boolean }) {
  const settings = useAsync(() => api.get<KbSettings>('/api/kb/settings'), 'kb-settings');
  const cats = useAsync(() => api.get<KbCategory[]>('/api/kb/categories'), 'kb-cats-settings');
  const [president, setPresident] = useState('');
  const [provider, setProvider] = useState<KbSettings['provider']>('');
  const [model, setModel] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [test, setTest] = useState<{ ok: boolean; message: string } | null>(null);
  const [newCat, setNewCat] = useState('');
  const toast = useToast();

  useEffect(() => {
    if (!settings.data) return;
    setPresident(settings.data.president?.email ?? '');
    setProvider(settings.data.provider);
    setModel(settings.data.model);
  }, [settings.data]);

  const save = async () => {
    setBusy(true);
    setErrors({});
    try {
      settings.set(await api.put<KbSettings>('/api/kb/settings', { presidentEmail: president, provider, model }));
      toast('Knowledge Base settings saved.');
    } catch (err) {
      if (err instanceof ApiError && err.fields) setErrors(err.fields);
      toast((err as Error).message, true);
    } finally {
      setBusy(false);
    }
  };

  const tryIt = async () => {
    setBusy(true);
    setTest(null);
    try {
      setTest(await api.post<{ ok: boolean; message: string }>('/api/kb/settings/test'));
    } catch (err) {
      setTest({ ok: false, message: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const changeCat = async (id: string, patch: Partial<KbCategory>) => {
    try {
      cats.set(await api.patch<KbCategory[]>(`/api/kb/categories/${id}`, patch));
    } catch (err) {
      toast((err as Error).message, true);
    }
  };

  const s = settings.data;
  if (!s) return <div className="faint">Loading…</div>;
  const keyThere = provider ? s.keys[provider] : false;

  return (
    <div className="stack" style={{ gap: 16, maxWidth: 680 }}>
      {!mayManage && <div className="callout"><Icon name="info" size={15} /> Only an administrator changes these settings.</div>}

      <section className="card card-pad stack" style={{ gap: 10 }}>
        <h3 className="section-title" style={{ margin: 0 }}>President</h3>
        <p className="faint" style={{ margin: 0, fontSize: 12.5 }}>
          The only person who approves and publishes. A CeedFlow account on the CEED team, with write access — designated by another administrator, never by themselves.
        </p>
        <div className="field">
          <label htmlFor="kb-president">President email</label>
          <input id="kb-president" className="input" disabled={!mayManage} value={president} onChange={(e) => setPresident(e.target.value)} placeholder="president@ceed-morocco.org" />
          {errors.presidentEmail && <div style={{ color: 'var(--stop)', fontSize: 12 }}>{errors.presidentEmail}</div>}
          {s.president && <div className="faint" style={{ fontSize: 12 }}>Now: {s.president.name} ({s.president.email})</div>}
        </div>
      </section>

      <section className="card card-pad stack" style={{ gap: 10 }}>
        <h3 className="section-title" style={{ margin: 0 }}>AI analysis</h3>
        <div className="row wrap" style={{ gap: 8 }}>
          <div className="field" style={{ flex: '1 1 180px' }}>
            <label htmlFor="kb-provider">Provider</label>
            <select
              id="kb-provider"
              className="select"
              disabled={!mayManage}
              value={provider}
              onChange={(e) => {
                const p = e.target.value as KbSettings['provider'];
                setProvider(p);
                if (p && !model) setModel(KB_DEFAULT_MODEL[p]);
              }}
            >
              <option value="">None — analyses fail until one is chosen</option>
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
            </select>
          </div>
          <div className="field" style={{ flex: '1 1 180px' }}>
            <label htmlFor="kb-model">Model</label>
            <input id="kb-model" className="input" disabled={!mayManage || !provider} value={model} onChange={(e) => setModel(e.target.value)} placeholder={provider === 'anthropic' ? 'claude-sonnet-5-5' : 'the OpenAI model name'} />
          </div>
        </div>
        {provider && (
          <div className={keyThere ? 'faint' : 'callout warn'} style={{ fontSize: 12.5 }}>
            {keyThere
              ? `${provider === 'openai' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY'} is set on the server.`
              : `${provider === 'openai' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY'} is not set on the server — add it to its environment variables, then restart it.`}
          </div>
        )}
        <div className="row wrap" style={{ gap: 8 }}>
          <button className="btn primary" disabled={!mayManage || busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
          {mayManage && s.provider && (
            <button className="btn" disabled={busy} onClick={tryIt}>Test connection</button>
          )}
          {test && <span className={test.ok ? 'badge ok' : 'badge stop'}>{test.ok ? 'Connected' : 'Not connected'}</span>}
        </div>
        {test && <div className="faint" style={{ fontSize: 12.5, overflowWrap: 'anywhere' }}>{test.message}</div>}
      </section>

      <section className="card card-pad stack" style={{ gap: 8 }}>
        <h3 className="section-title" style={{ margin: 0 }}>Categories</h3>
        {(cats.data ?? []).map((c, i, list) => (
          <div key={c.id} className="row" style={{ gap: 8 }}>
            <input
              className="input"
              style={{ flex: 1 }}
              disabled={!mayManage}
              defaultValue={c.name}
              aria-label="Category name"
              onBlur={(e) => e.target.value.trim() && e.target.value !== c.name && changeCat(c.id, { name: e.target.value.trim() })}
            />
            <button className="btn ghost icon sm" disabled={!mayManage || i === 0} aria-label="Move up" onClick={() => changeCat(c.id, { position: list[i - 1]!.position - 1 })}>↑</button>
            <label className="row faint" style={{ gap: 4, fontSize: 12.5 }}>
              <input type="checkbox" disabled={!mayManage} checked={c.active} onChange={(e) => changeCat(c.id, { active: e.target.checked })} /> Active
            </label>
          </div>
        ))}
        {mayManage && (
          <div className="row" style={{ gap: 8 }}>
            <input className="input" style={{ flex: 1 }} value={newCat} placeholder="A new category" onChange={(e) => setNewCat(e.target.value)} />
            <button
              className="btn"
              disabled={!newCat.trim()}
              onClick={async () => {
                try {
                  cats.set(await api.post<KbCategory[]>('/api/kb/categories', { name: newCat.trim() }));
                  setNewCat('');
                } catch (err) {
                  toast((err as Error).message, true);
                }
              }}
            >
              <Icon name="plus" size={12} /> Add
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
