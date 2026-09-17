import { BLOCK_TYPE_META, orderedBlocks, type Block, type BlockType, type TrackWithPhases } from '@ceed/shared';
import { Icon } from '../../ui/Icon';

/**
 * Every work tab has the same shape: pick which block of that kind you are
 * working on, then the plan of work. The builder composes; this runs.
 */
export function WorkspaceShell({
  track,
  type,
  currentId,
  onSelect,
  onOpenSetup,
  empty,
  children,
}: {
  track: TrackWithPhases;
  type: BlockType;
  currentId: string | null;
  onSelect: (id: string) => void;
  onOpenSetup: (id: string) => void;
  empty: { title: string; body: string };
  children: (block: Block) => React.ReactNode;
}) {
  const blocks = orderedBlocks(track).filter((b) => b.type === type);
  const current = blocks.find((b) => b.id === currentId) ?? blocks[0] ?? null;

  if (!current) {
    return (
      <div className="empty">
        <h3>{empty.title}</h3>
        <p>{empty.body}</p>
      </div>
    );
  }

  return (
    <>
      <div className="work-head">
        {blocks.length > 1 ? (
          <div className="work-pick">
            {blocks.map((block) => (
              <button
                key={block.id}
                className={block.id === current.id ? 'track on' : 'track'}
                onClick={() => onSelect(block.id)}
              >
                {block.name}
              </button>
            ))}
          </div>
        ) : (
          <h2 className="work-title">{current.name}</h2>
        )}
        <div className="spacer" />
        <button className="btn sm" onClick={() => onOpenSetup(current.id)} title="Configure this block in the builder">
          <Icon name="settings" size={13} /> Setup
        </button>
      </div>
      <p className="faint" style={{ margin: 0, fontSize: 12.5 }}>
        {BLOCK_TYPE_META[current.type].blurb}
      </p>
      {children(current)}
    </>
  );
}
