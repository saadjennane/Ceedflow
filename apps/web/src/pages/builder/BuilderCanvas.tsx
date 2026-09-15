import {
  BLOCK_LIBRARY,
  BLOCK_TYPE_META,
  type Block,
  type BlockType,
  type Candidate,
  type PhaseWithBlocks,
  type TrackWithPhases,
} from '@ceed/shared';
import { useRef, useState } from 'react';
import { api } from '../../lib/api';
import { formatRange } from '../../lib/format';
import { DateField, TextField } from '../../ui/Field';
import { Icon } from '../../ui/Icon';
import { ConfirmDialog, Modal, useToast } from '../../ui/Overlays';
import { BlockDrawer } from './BlockDrawer';
import { blockStatus } from './blockSummary';

/** What is being dragged. dataTransfer cannot be read during dragover, so it lives here. */
type DragPayload =
  | { kind: 'new'; type: BlockType }
  | { kind: 'move'; blockId: string; fromPhaseId: string }
  | { kind: 'phase'; phaseId: string };

export function BuilderCanvas({
  track,
  candidates,
  onChanged,
}: {
  track: TrackWithPhases;
  candidates: Candidate[];
  onChanged: () => void;
}) {
  const [openBlockId, setOpenBlockId] = useState<string | null>(null);
  const [addingPhase, setAddingPhase] = useState(false);
  const [phaseName, setPhaseName] = useState('');
  const [drop, setDrop] = useState<{ phaseId: string; index: number } | null>(null);
  const [phaseDropId, setPhaseDropId] = useState<string | null>(null);
  const drag = useRef<DragPayload | null>(null);
  const toast = useToast();

  const phases = track.phases;
  const openBlock = phases.flatMap((p) => p.blocks).find((b) => b.id === openBlockId) ?? null;

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
    const at = ids.indexOf(targetPhaseId);
    ids.splice(at, 0, payload.phaseId);
    await api.post(`/api/tracks/${track.id}/phase-order`, { ids });
    onChanged();
  };

  return (
    <div className="builder">
      <aside className="library" aria-label="Block library">
        <div className="eyebrow" style={{ padding: '0 4px 8px' }}>
          Library
        </div>
        <p className="faint" style={{ margin: '0 4px 12px', fontSize: 12, lineHeight: 1.45 }}>
          Drag a block into a phase, or click it to add it at the end of the first phase.
        </p>
        {BLOCK_LIBRARY.map((group) => (
          <div key={group.group} className="lib-group">
            <div className="lib-group-title">{group.group}</div>
            {group.types.map((type) => {
              const meta = BLOCK_TYPE_META[type];
              return (
                <button
                  key={type}
                  className={meta.implemented ? 'lib-item' : 'lib-item off'}
                  draggable={meta.implemented}
                  disabled={!meta.implemented}
                  title={meta.implemented ? meta.blurb : 'Not built yet'}
                  onDragStart={() => {
                    drag.current = { kind: 'new', type };
                  }}
                  onDragEnd={clearDrag}
                  onClick={async () => {
                    const phase = phases[0];
                    if (!phase) return;
                    const block = await api.post<Block>('/api/blocks', { phaseId: phase.id, type });
                    onChanged();
                    setOpenBlockId(block.id);
                  }}
                >
                  <span className="lib-icon">
                    <Icon name={meta.icon} size={15} />
                  </span>
                  <span>
                    <strong>{meta.label}</strong>
                    <span className="lib-blurb">{meta.blurb}</span>
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </aside>

      <div className="phases">
        {phases.map((phase, phaseIndex) => (
          <PhaseColumn
            key={phase.id}
            phase={phase}
            index={phaseIndex}
            drop={drop?.phaseId === phase.id ? drop.index : null}
            phaseDrop={phaseDropId === phase.id}
            onBlockOpen={setOpenBlockId}
            onChanged={onChanged}
            onDragStartPhase={() => {
              drag.current = { kind: 'phase', phaseId: phase.id };
            }}
            onDragStartBlock={(blockId) => {
              drag.current = { kind: 'move', blockId, fromPhaseId: phase.id };
            }}
            onDragEnd={clearDrag}
            onDragOverList={(index) => {
              if (drag.current?.kind === 'phase') return;
              setDrop({ phaseId: phase.id, index });
            }}
            onDropList={(index) => handleDrop(phase.id, index)}
            onDragOverHeader={() => drag.current?.kind === 'phase' && setPhaseDropId(phase.id)}
            onDropHeader={() => handlePhaseDrop(phase.id)}
            onLeave={() => setDrop((d) => (d?.phaseId === phase.id ? null : d))}
          />
        ))}

        <button className="phase-add" onClick={() => setAddingPhase(true)}>
          <Icon name="plus" size={18} />
          Add phase
        </button>
      </div>

      {openBlock && (
        <BlockDrawer
          block={openBlock}
          track={track}
          candidates={candidates}
          onClose={() => setOpenBlockId(null)}
          onChanged={onChanged}
        />
      )}

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

function PhaseColumn({
  phase,
  index,
  drop,
  phaseDrop,
  onBlockOpen,
  onChanged,
  onDragStartPhase,
  onDragStartBlock,
  onDragEnd,
  onDragOverList,
  onDropList,
  onDragOverHeader,
  onDropHeader,
  onLeave,
}: {
  phase: PhaseWithBlocks;
  index: number;
  drop: number | null;
  phaseDrop: boolean;
  onBlockOpen: (id: string) => void;
  onChanged: () => void;
  onDragStartPhase: () => void;
  onDragStartBlock: (blockId: string) => void;
  onDragEnd: () => void;
  onDragOverList: (index: number) => void;
  onDropList: (index: number) => void;
  onDragOverHeader: () => void;
  onDropHeader: () => void;
  onLeave: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const toast = useToast();

  /** Index the dragged block would take, from the pointer's position over the cards. */
  const indexAt = (clientY: number): number => {
    const cards = Array.from(listRef.current?.querySelectorAll<HTMLElement>('[data-block]') ?? []);
    for (let i = 0; i < cards.length; i++) {
      const box = cards[i].getBoundingClientRect();
      if (clientY < box.top + box.height / 2) return i;
    }
    return cards.length;
  };

  return (
    <section className={phaseDrop ? 'phase drop' : 'phase'}>
      <header
        className="phase-head"
        draggable
        onDragStart={onDragStartPhase}
        onDragEnd={onDragEnd}
        onDragOver={(e) => {
          e.preventDefault();
          onDragOverHeader();
        }}
        onDrop={(e) => {
          e.preventDefault();
          onDropHeader();
        }}
      >
        <span className="phase-index num">{index + 1}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <button className="phase-name" onClick={() => setEditing(true)} title="Rename or set dates">
            {phase.name}
          </button>
          <div className="phase-dates faint">{formatRange(phase.startsOn, phase.endsOn)}</div>
        </div>
        <span className="drag-grip" title="Drag to reorder">
          <Icon name="drag" size={15} />
        </span>
      </header>

      <div
        className="phase-list"
        ref={listRef}
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
            <BlockCard
              block={block}
              onOpen={() => onBlockOpen(block.id)}
              onDragStart={() => onDragStartBlock(block.id)}
              onDragEnd={onDragEnd}
            />
          </div>
        ))}
        {drop === phase.blocks.length && <div className="drop-line" />}

        {!phase.blocks.length && <div className="phase-empty">Drop a block here</div>}
      </div>

      <footer className="phase-foot">
        <button className="btn ghost sm" onClick={() => setConfirm(true)} title="Delete phase">
          <Icon name="trash" size={13} />
        </button>
        <span className="faint num" style={{ fontSize: 12 }}>
          {phase.blocks.length} block{phase.blocks.length === 1 ? '' : 's'}
        </span>
      </footer>

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

function BlockCard({
  block,
  onOpen,
  onDragStart,
  onDragEnd,
}: {
  block: Block;
  onOpen: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const meta = BLOCK_TYPE_META[block.type];
  const status = blockStatus(block);
  return (
    <article
      data-block
      className={`block-card t-${block.type}`}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      tabIndex={0}
      role="button"
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onOpen())}
    >
      <div className="block-top">
        <span className="block-icon">
          <Icon name={meta.icon} size={14} />
        </span>
        <span className="block-type">{meta.label}</span>
        <div className="spacer" />
        {status.chip && <span className={status.chip.tone ? `badge ${status.chip.tone}` : 'badge'}>{status.chip.label}</span>}
      </div>
      <h4>{block.name}</h4>
      <p className="muted">{status.summary}</p>
    </article>
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
