import {
  BLOCK_TYPE_META,
  type ApplicationConfig,
  type Block,
  type Candidate,
  type CommitteeConfig,
  type EvaluationConfig,
  type SelectionConfig,
  type SourcingConfig,
  type TrackWithPhases,
} from '@ceed/shared';
import { useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { Icon } from '../../ui/Icon';
import { ConfirmDialog, Drawer, useToast } from '../../ui/Overlays';
import { APPLICATION_TABS, ApplicationSetup, type ApplicationTab } from './panels/ApplicationPanel';
import { CommitteeSetup } from './panels/CommitteePanel';
import { EvaluationSetup } from './panels/EvaluationPanel';
import { SelectionSetup } from './panels/SelectionPanel';
import { SourcingSetup } from './panels/SourcingPanel';

/**
 * The block's action does not live here — it lives in the edition's work tabs.
 * This is the way through to it.
 */
const WORK_TAB: Partial<Record<string, { tab: string; label: string }>> = {
  sourcing: { tab: 'outreach', label: 'Outreach' },
  committee: { tab: 'committees', label: 'Committees' },
  evaluation: { tab: 'review', label: 'Review' },
  selection: { tab: 'review', label: 'Review' },
};

export function BlockDrawer({
  block,
  track,
  candidates,
  currentTab,
  onClose,
  onChanged,
  onOpenBlock,
  onOpenWork,
}: {
  block: Block;
  track: TrackWithPhases;
  candidates: Candidate[];
  /** So the way through is not offered when you are already there. */
  currentTab?: string;
  onClose: () => void;
  onChanged: () => void;
  onOpenBlock: (id: string) => void;
  onOpenWork: (tab: string, blockId: string) => void;
}) {
  const meta = BLOCK_TYPE_META[block.type];
  const [name, setName] = useState(block.name);
  const [draft, setDraft] = useState<Record<string, unknown>>(block.config as Record<string, unknown>);

  const [confirm, setConfirm] = useState(false);
  const [appTab, setAppTab] = useState<ApplicationTab>('Overview');
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const dirty = useMemo(
    () => name !== block.name || JSON.stringify(draft) !== JSON.stringify(block.config),
    [name, draft, block],
  );

  const patch = (partial: Record<string, unknown>) => setDraft((d) => ({ ...d, ...partial }));

  const save = async () => {
    setSaving(true);
    try {
      await api.patch(`/api/blocks/${block.id}`, { name: name.trim() || meta.label, config: draft });
      onChanged();
      toast('Block saved.');
    } catch (err) {
      toast((err as Error).message, true);
    } finally {
      setSaving(false);
    }
  };

  const workTab = WORK_TAB[block.type];

  return (
    <>
      <Drawer
        wide
        onClose={onClose}
        title={
          <input
            className="drawer-title-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label="Block name"
          />
        }
        subtitle={
          <span className="row" style={{ gap: 7 }}>
            <Icon name={meta.icon} size={13} />
            {meta.label} · {track.name}
          </span>
        }
        footer={
          <>
            <button className="btn danger sm" onClick={() => setConfirm(true)}>
              <Icon name="trash" size={13} /> Delete block
            </button>
            <div className="spacer" />
            {dirty && <span className="faint" style={{ fontSize: 12 }}>Unsaved changes</span>}
            <button className="btn ghost" onClick={onClose}>
              Close
            </button>
            <button className="btn primary" disabled={!dirty || saving} onClick={save}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </>
        }
      >
        {/* A block with several sides to configure gets tabs, the way the
            prototype had them. The rest are one panel and need none. */}
        {block.type === 'application' && (
          <nav className="drawer-tabs" role="tablist">
            {APPLICATION_TABS.map((t) => (
              <button
                key={t}
                role="tab"
                className={t === appTab ? 'tab on' : 'tab'}
                onClick={() => setAppTab(t)}
              >
                {t}
              </button>
            ))}
          </nav>
        )}

        {workTab && workTab.tab !== currentTab && appTab === 'Overview' && (
          <div className="callout">
            <Icon name="arrowRight" size={15} />
            <div style={{ flex: 1 }}>
              This is where <strong>{block.name}</strong> is set up. The work itself happens in{' '}
              <strong>{workTab.label}</strong>.
              <div style={{ marginTop: 7 }}>
                <button
                  className="btn sm"
                  disabled={dirty}
                  title={dirty ? 'Save your changes first' : undefined}
                  onClick={() => onOpenWork(workTab.tab, block.id)}
                >
                  Open in {workTab.label}
                </button>
              </div>
            </div>
          </div>
        )}

        {block.type === 'sourcing' && <SourcingSetup config={draft as unknown as SourcingConfig} patch={patch} />}
        {block.type === 'application' && (
          <ApplicationSetup block={block} config={draft as unknown as ApplicationConfig} patch={patch} tab={appTab} />
        )}
        {block.type === 'evaluation' && (
          <EvaluationSetup block={block} config={draft as unknown as EvaluationConfig} patch={patch} track={track} />
        )}
        {block.type === 'committee' && (
          <CommitteeSetup config={draft as unknown as CommitteeConfig} patch={patch} />
        )}
        {block.type === 'selection' && (
          <SelectionSetup block={block} config={draft as unknown as SelectionConfig} patch={patch} track={track} />
        )}
        {!meta.implemented && (
          <div className="callout">
            <Icon name="alert" size={15} />
            This block type is part of the model but is not built yet.
          </div>
        )}

        {block.type === 'application' && (
          <div className="callout">
            <Icon name="arrowRight" size={15} />
            <div>
              Every submission becomes a candidate. You will find them all in the{' '}
              <strong>Startups</strong> tab.
            </div>
          </div>
        )}
      </Drawer>

      {confirm && (
        <ConfirmDialog
          title={`Delete ${block.name}?`}
          body="Its configuration and everything recorded against it — scores, decisions — go with it."
          confirmLabel="Delete block"
          destructive
          onClose={() => setConfirm(false)}
          onConfirm={async () => {
            await api.del(`/api/blocks/${block.id}`);
            onChanged();
            onClose();
            toast('Block deleted.');
          }}
        />
      )}
    </>
  );
}
