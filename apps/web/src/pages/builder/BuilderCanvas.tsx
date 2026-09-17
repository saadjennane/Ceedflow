import {
  BLOCK_LIBRARY,
  BLOCK_TYPE_META,
  type Block,
  type BlockType,
  type EditionDetail,
  type PhaseWithBlocks,
  type SelectionConfig,
  type TrackWithPhases,
} from '@ceed/shared';
import { useMemo, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { formatRange, formatDate } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { DateField, TextField } from '../../ui/Field';
import { Icon } from '../../ui/Icon';
import { ConfirmDialog, Modal, useToast } from '../../ui/Overlays';
import { TrackBar } from '../EditionPage';
import { PROGRESS_TONE, blockLine, progressOf } from './blockSummary';

/** What is being dragged. dataTransfer cannot be read during dragover, so it lives here. */
type DragPayload =
  | { kind: 'new'; type: BlockType }
  | { kind: 'move'; blockId: string }
  | { kind: 'phase'; phaseId: string };

interface FunnelStep {
  blockId: string;
  name: string;
  count: number;
}

export function BuilderCanvas({
  edition,
  track,
  onOpenBlock,
  onSelectTrack,
  onChanged,
  onPublish,
}: {
  edition: EditionDetail;
  track: TrackWithPhases;
  onOpenBlock: (id: string | null) => void;
  onSelectTrack: (id: string) => void;
  onChanged: () => void;
  onPublish: () => void;
}) {
  const setOpenBlockId = onOpenBlock;
  const [addingPhase, setAddingPhase] = useState(false);
  const [phaseName, setPhaseName] = useState('');
  const [search, setSearch] = useState('');
  const [drop, setDrop] = useState<{ phaseId: string; index: number } | null>(null);
  const [phaseDropId, setPhaseDropId] = useState<string | null>(null);
  const drag = useRef<DragPayload | null>(null);
  const toast = useToast();

  const funnel = useAsync(
    () => api.get<FunnelStep[]>(`/api/editions/${edition.id}/funnel?trackId=${track.id}`),
    `${edition.id}:${track.id}:${JSON.stringify(track.phases.map((p) => p.blocks.map((b) => b.id)))}`,
  );

  /** For a selection block: how many arrived, how many passed. */
  const funnelFor = useMemo(() => {
    const steps = funnel.data ?? [];
    return (blockId: string): [number, number] | null => {
      const at = steps.findIndex((s) => s.blockId === blockId);
      if (at <= 0) return null;
      return [steps[at - 1].count, steps[at].count];
    };
  }, [funnel.data]);

  const phases = track.phases;
  const hasCohortSelection = phases
    .flatMap((p) => p.blocks)
    .some((b) => b.type === 'selection' && (b.config as SelectionConfig).outputKind === 'cohort');
  const hasSelection = phases.flatMap((p) => p.blocks).some((b) => b.type === 'selection');

  const clearDrag = () => {
    drag.current = null;
    setDrop(null);
    setPhaseDropId(null);
  };

  const handleDrop = async (phaseId: string, index: number) => {
    const payload = drag.current;
    clearDrag();
    if (!payload) return;
    if (payload.kind === 'new') {
      const block = await api.post<Block>('/api/blocks', { phaseId, type: payload.type, position: index });
      onChanged();
      toast(`${BLOCK_TYPE_META[payload.type].label} added.`);
      setOpenBlockId(block.id);
    } else if (payload.kind === 'move') {
      await api.post(`/api/blocks/${payload.blockId}/move`, { phaseId, position: index });
      onChanged();
    }
  };

  const handlePhaseDrop = async (targetPhaseId: string) => {
    const payload = drag.current;
    clearDrag();
    if (!payload || payload.kind !== 'phase' || payload.phaseId === targetPhaseId) return;
    const ids = phases.map((p) => p.id).filter((id) => id !== payload.phaseId);
    ids.splice(ids.indexOf(targetPhaseId), 0, payload.phaseId);
    await api.post(`/api/tracks/${track.id}/phase-order`, { ids });
    onChanged();
  };

  const groups = BLOCK_LIBRARY.map((group) => ({
    ...group,
    types: group.types.filter((t) => BLOCK_TYPE_META[t].label.toLowerCase().includes(search.trim().toLowerCase())),
  })).filter((group) => group.types.length);

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h2>Program Builder</h2>
          <p>Build this edition by organising phases and dragging blocks into each phase.</p>
        </div>
        <div className="row">
          <span className="btn off" title="Not built yet">
            Preview
          </span>
          <span className="btn off" title="Not built yet">
            Timeline
          </span>
          <span className="saved">
            <Icon name="check" size={13} /> Changes save as you make them
          </span>
          <button
            className="btn primary"
            disabled={edition.status !== 'Draft'}
            title={edition.status === 'Draft' ? 'Open the edition to candidates' : `Already ${edition.status.toLowerCase()}`}
            onClick={onPublish}
          >
            Publish Edition
          </button>
        </div>
      </header>

      <TrackBar edition={edition} currentTrackId={track.id} onSelect={onSelectTrack} onChanged={onChanged} />

      <div className="builder">
        <aside className="library" aria-label="Block library">
          <div className="library-head">
            <h3>Block Library</h3>
            <p>Drag a block into a phase</p>
          </div>
          <input
            className="input"
            placeholder="Search blocks…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search blocks"
          />
          {groups.map((group) => (
            <div key={group.group} className="lib-group">
              <div className="lib-group-title">{group.group}</div>
              {group.types.map((type) => {
                const meta = BLOCK_TYPE_META[type];
                return (
                  <div
                    key={type}
                    className={meta.implemented ? 'lib-block' : 'lib-block off'}
                    draggable={meta.implemented}
                    title={meta.implemented ? meta.blurb : 'Not built yet'}
                    onDragStart={() => {
                      drag.current = { kind: 'new', type };
                    }}
                    onDragEnd={clearDrag}
                    onDoubleClick={async () => {
                      if (!meta.implemented || !phases.length) return;
                      const block = await api.post<Block>('/api/blocks', { phaseId: phases[0].id, type });
                      onChanged();
                      setOpenBlockId(block.id);
                    }}
                  >
                    <span className="grip">
                      <Icon name="drag" size={13} />
                    </span>
                    <span className="blk-ico">
                      <Icon name={meta.icon} size={14} />
                    </span>
                    {meta.label}
                  </div>
                );
              })}
            </div>
          ))}
          {!groups.length && <div className="phase-empty">No block matches “{search}”</div>}
        </aside>

        <div className="phase-list">
          {hasSelection && !hasCohortSelection && (
            <div className="callout warn">
              <Icon name="alert" size={15} />
              <div>
                <strong>No Selection forms the cohort yet.</strong> Open the Selection that ends the funnel and set its
                output to <b>the cohort</b> — otherwise nothing tells the program who the cohort is.
              </div>
            </div>
          )}

          {phases.map((phase, index) => (
            <PhaseSection
              key={phase.id}
              phase={phase}
              index={index}
              drop={drop?.phaseId === phase.id ? drop.index : null}
              phaseDrop={phaseDropId === phase.id}
              funnelFor={funnelFor}
              onBlockOpen={setOpenBlockId}
              onChanged={onChanged}
              onDragStartPhase={() => {
                drag.current = { kind: 'phase', phaseId: phase.id };
              }}
              onDragStartBlock={(blockId) => {
                drag.current = { kind: 'move', blockId };
              }}
              onDragEnd={clearDrag}
              onDragOverList={(i) => drag.current?.kind !== 'phase' && setDrop({ phaseId: phase.id, index: i })}
              onDropList={(i) => handleDrop(phase.id, i)}
              onDragOverHead={() => drag.current?.kind === 'phase' && setPhaseDropId(phase.id)}
              onDropHead={() => handlePhaseDrop(phase.id)}
              onLeave={() => setDrop((d) => (d?.phaseId === phase.id ? null : d))}
            />
          ))}

          <button className="phase-add" onClick={() => setAddingPhase(true)}>
            <Icon name="plus" size={15} /> Add Phase
          </button>
        </div>
      </div>


      {addingPhase && (
        <Modal
          title="Add a phase"
          subtitle="Phases run in order. Blocks inside a phase run within it."
          onClose={() => setAddingPhase(false)}
          footer={
            <>
              <button className="btn ghost" onClick={() => setAddingPhase(false)}>
                Cancel
              </button>
              <button
                className="btn primary"
                onClick={async () => {
                  await api.post('/api/phases', { trackId: track.id, name: phaseName.trim() || undefined });
                  setPhaseName('');
                  setAddingPhase(false);
                  onChanged();
                  toast('Phase added.');
                }}
              >
                Add phase
              </button>
            </>
          }
        >
          <TextField
            label="Phase name"
            value={phaseName}
            onChange={setPhaseName}
            placeholder={`Phase ${phases.length + 1}`}
            help="You can rename it later."
          />
        </Modal>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function PhaseSection({
  phase,
  index,
  drop,
  phaseDrop,
  funnelFor,
  onBlockOpen,
  onChanged,
  onDragStartPhase,
  onDragStartBlock,
  onDragEnd,
  onDragOverList,
  onDropList,
  onDragOverHead,
  onDropHead,
  onLeave,
}: {
  phase: PhaseWithBlocks;
  index: number;
  drop: number | null;
  phaseDrop: boolean;
  funnelFor: (blockId: string) => [number, number] | null;
  onBlockOpen: (id: string) => void;
  onChanged: () => void;
  onDragStartPhase: () => void;
  onDragStartBlock: (blockId: string) => void;
  onDragEnd: () => void;
  onDragOverList: (index: number) => void;
  onDropList: (index: number) => void;
  onDragOverHead: () => void;
  onDropHead: () => void;
  onLeave: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const toast = useToast();

  const progress = progressOf(phase.startsOn, phase.endsOn);

  /** Index the dragged block would take, from the pointer's position over the rows. */
  const indexAt = (clientY: number): number => {
    const rows = Array.from(bodyRef.current?.querySelectorAll<HTMLElement>('[data-block]') ?? []);
    for (let i = 0; i < rows.length; i++) {
      const box = rows[i].getBoundingClientRect();
      if (clientY < box.top + box.height / 2) return i;
    }
    return rows.length;
  };

  return (
    <section className={phaseDrop ? 'phase drag-over' : 'phase'}>
      <header
        className="phase-head"
        onDragOver={(e) => {
          e.preventDefault();
          onDragOverHead();
        }}
        onDrop={(e) => {
          e.preventDefault();
          onDropHead();
        }}
      >
        <span className="grip" draggable onDragStart={onDragStartPhase} onDragEnd={onDragEnd} title="Drag to reorder phase">
          <Icon name="drag" size={14} />
        </span>
        <span className="phase-num">Phase {index + 1}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <button className="phase-name" onClick={() => setEditing(true)}>
            {phase.name}
          </button>
          <div className="phase-sub">
            {formatRange(phase.startsOn, phase.endsOn)} · {phase.blocks.length} block
            {phase.blocks.length === 1 ? '' : 's'}
          </div>
        </div>
        <div className="phase-head-actions">
          {progress && <span className={PROGRESS_TONE[progress]}>{progress}</span>}
          <button className="btn ghost icon sm" onClick={() => setEditing(true)} aria-label="Edit phase">
            <Icon name="settings" size={14} />
          </button>
          <button className="btn ghost icon sm" onClick={() => setConfirm(true)} aria-label="Delete phase">
            <Icon name="x" size={14} />
          </button>
        </div>
      </header>

      <div
        className="phase-body"
        ref={bodyRef}
        onDragOver={(e) => {
          e.preventDefault();
          onDragOverList(indexAt(e.clientY));
        }}
        onDragLeave={onLeave}
        onDrop={(e) => {
          e.preventDefault();
          onDropList(indexAt(e.clientY));
        }}
      >
        {phase.blocks.map((block, i) => (
          <div key={block.id}>
            {drop === i && <div className="drop-line" />}
            <BlockRow
              block={block}
              funnel={
                block.type === 'selection' && (block.config as SelectionConfig).publishedAt
                  ? funnelFor(block.id)
                  : null
              }
              onOpen={() => onBlockOpen(block.id)}
              onDragStart={() => onDragStartBlock(block.id)}
              onDragEnd={onDragEnd}
              onChanged={onChanged}
            />
          </div>
        ))}
        {drop === phase.blocks.length && <div className="drop-line" />}
        {!phase.blocks.length && <div className="phase-empty">Drag blocks from the library into this phase</div>}
      </div>

      {editing && (
        <PhaseModal
          phase={phase}
          onClose={() => setEditing(false)}
          onSaved={() => {
            onChanged();
            toast('Phase updated.');
          }}
        />
      )}

      {confirm && (
        <ConfirmDialog
          title={`Delete ${phase.name}?`}
          body={
            phase.blocks.length
              ? `Its ${phase.blocks.length} block${phase.blocks.length === 1 ? '' : 's'} and their configuration go with it.`
              : 'This phase is empty.'
          }
          confirmLabel="Delete phase"
          destructive
          onClose={() => setConfirm(false)}
          onConfirm={async () => {
            await api.del(`/api/phases/${phase.id}`);
            onChanged();
            toast('Phase deleted.');
          }}
        />
      )}
    </section>
  );
}

function BlockRow({
  block,
  funnel,
  onOpen,
  onDragStart,
  onDragEnd,
  onChanged,
}: {
  block: Block;
  funnel: [number, number] | null;
  onOpen: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onChanged: () => void;
}) {
  const meta = BLOCK_TYPE_META[block.type];
  const line = blockLine(block);
  const [confirm, setConfirm] = useState(false);
  const toast = useToast();

  return (
    <>
      <div
        data-block
        className={`block t-${block.type}`}
        draggable
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onClick={onOpen}
        tabIndex={0}
        role="button"
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onOpen())}
      >
        <span className="grip">
          <Icon name="drag" size={13} />
        </span>
        <div className="block-ico">
          <Icon name={meta.icon} size={15} />
        </div>
        <div className="block-main">
          <div className="block-name">{block.name}</div>
          <div className="block-desc">{line.description}</div>
        </div>
        <div className="block-meta">
          {line.chips.map((chip) => (
            <span
              key={chip.label}
              className={chip.tone === 'cohort' ? 'cohort-chip' : chip.tone ? `badge ${chip.tone}` : 'badge'}
            >
              {chip.label}
            </span>
          ))}
          {funnel && (
            <span className="funnel-chip num" title="Funnel step">
              {funnel[0]} → {funnel[1]}
            </span>
          )}
          {line.date && <span className="block-date">{formatDate(line.date)}</span>}
          {line.progress && <span className={PROGRESS_TONE[line.progress]}>{line.progress}</span>}
        </div>
        <div className="block-actions">
          <button
            className="btn ghost icon sm"
            onClick={(e) => {
              e.stopPropagation();
              onOpen();
            }}
            aria-label="Configure"
          >
            <Icon name="settings" size={13} />
          </button>
          <button
            className="btn ghost icon sm"
            onClick={(e) => {
              e.stopPropagation();
              setConfirm(true);
            }}
            aria-label="Delete block"
          >
            <Icon name="x" size={13} />
          </button>
        </div>
      </div>

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
            toast(`${block.name} removed.`);
          }}
        />
      )}
    </>
  );
}

function PhaseModal({
  phase,
  onClose,
  onSaved,
}: {
  phase: PhaseWithBlocks;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState({ name: phase.name, startsOn: phase.startsOn, endsOn: phase.endsOn });
  return (
    <Modal
      title="Phase"
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            disabled={!draft.name.trim()}
            onClick={async () => {
              await api.patch(`/api/phases/${phase.id}`, draft);
              onSaved();
              onClose();
            }}
          >
            Save
          </button>
        </>
      }
    >
      <TextField label="Phase name" value={draft.name} onChange={(v) => setDraft((d) => ({ ...d, name: v }))} />
      <div className="grid-2">
        <DateField label="Starts on" value={draft.startsOn} onChange={(v) => setDraft((d) => ({ ...d, startsOn: v }))} />
        <DateField label="Ends on" value={draft.endsOn} onChange={(v) => setDraft((d) => ({ ...d, endsOn: v }))} />
      </div>
    </Modal>
  );
}
