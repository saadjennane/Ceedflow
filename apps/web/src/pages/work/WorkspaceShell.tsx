import {
  BLOCK_TYPE_META,
  blockAtWork,
  orderedBlocks,
  type Block,
  type BlockType,
  type TrackWithPhases,
} from '@ceed/shared';
import { api } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
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
  const held = useAsync(
    () => api.get<Record<string, number>>(`/api/editions/${track.editionId}/populations?trackId=${track.id}`),
    track.id,
  );
  /* The furthest one down the funnel that still has somebody in it. Opening on
     whichever block happens to be live lands on an empty page while the work
     is two steps back — a block can be open and hold nobody, and often is at
     the start of a phase. Falls back to the old reading while the counts are
     on their way, and whenever every block is empty. */
  const peopled = held.data ? blocks.filter((b) => (held.data![b.id] ?? 0) > 0) : [];
  const current =
    blocks.find((b) => b.id === currentId) ?? peopled[peopled.length - 1] ?? blockAtWork(blocks) ?? null;

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
