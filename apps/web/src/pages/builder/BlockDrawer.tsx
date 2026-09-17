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
import { ApplicationSetup, ApplicationSubmissions } from './panels/ApplicationPanel';
import { CommitteeSetup, CommitteeSittings } from './panels/CommitteePanel';
import { EvaluationScoring, EvaluationSetup } from './panels/EvaluationPanel';
import { SelectionDecision, SelectionSetup } from './panels/SelectionPanel';
import { SourcingOutreach, SourcingSetup } from './panels/SourcingPanel';

/** Every block has an action; this is where that action lives. */
const WORK_TAB: Partial<Record<string, string>> = {
  sourcing: 'Outreach',
  application: 'Submissions',
  evaluation: 'Scoring',
  committee: 'Committees',
  selection: 'Decision',
};

export function BlockDrawer({
  block,
  track,
  candidates,
  initialTab,
  onClose,
  onChanged,
  onOpenBlock,
}: {
  block: Block;
  track: TrackWithPhases;
  candidates: Candidate[];
  initialTab?: 'setup' | 'work';
  onClose: () => void;
  onChanged: () => void;
  onOpenBlock: (id: string) => void;
}) {
  const meta = BLOCK_TYPE_META[block.type];
  const [name, setName] = useState(block.name);
  const [draft, setDraft] = useState<Record<string, unknown>>(block.config as Record<string, unknown>);
  const [tab, setTab] = useState<'setup' | 'work'>(initialTab ?? 'setup');
  const [confirm, setConfirm] = useState(false);
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
        {workTab && (
          <div className="drawer-tabs" style={{ margin: '-20px -20px 0', position: 'sticky', top: -20, zIndex: 2 }}>
            <button className={tab === 'setup' ? 'on' : ''} onClick={() => setTab('setup')}>
              Setup
            </button>
            <button className={tab === 'work' ? 'on' : ''} onClick={() => setTab('work')}>
              {workTab}
            </button>
          </div>
        )}

        {tab === 'setup' ? (
          <>
            {block.type === 'sourcing' && <SourcingSetup config={draft as unknown as SourcingConfig} patch={patch} />}
            {block.type === 'application' && (
              <ApplicationSetup block={block} config={draft as unknown as ApplicationConfig} patch={patch} />
            )}
            {block.type === 'evaluation' && (
              <EvaluationSetup
                block={block}
                config={draft as unknown as EvaluationConfig}
                patch={patch}
                track={track}
              />
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
          </>
        ) : (
          <>
            {block.type === 'sourcing' && <SourcingOutreach block={block} dirty={dirty} />}
            {block.type === 'application' && (
              <ApplicationSubmissions block={block} candidates={candidates} config={draft as unknown as ApplicationConfig} />
            )}
            {block.type === 'evaluation' && (
              <EvaluationScoring block={block} dirty={dirty} onChanged={onChanged} />
            )}
            {block.type === 'committee' && (
              <CommitteeSittings block={block} dirty={dirty} onChanged={onChanged} onOpenBlock={onOpenBlock} />
            )}
            {block.type === 'selection' && <SelectionDecision block={block} onChanged={onChanged} />}
          </>
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
