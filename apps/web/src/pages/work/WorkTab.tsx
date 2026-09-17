import type { TrackWithPhases } from '@ceed/shared';
import { SourcingOutreach } from '../builder/panels/SourcingPanel';
import { CommitteeWorkspace } from './CommitteeWorkspace';
import { ReviewTab } from './ReviewTab';
import { WorkspaceShell } from './WorkspaceShell';

/** Runs one kind of work. Configuration stays in the builder. */
export function WorkTab({
  tab,
  track,
  currentBlockId,
  onSelectBlock,
  onOpenSetup,
  onChanged,
}: {
  tab: 'outreach' | 'committees' | 'review';
  track: TrackWithPhases;
  currentBlockId: string | null;
  onSelectBlock: (id: string) => void;
  onOpenSetup: (id: string) => void;
  onChanged: () => void;
}) {
  if (tab === 'review') {
    return (
      <ReviewTab
        track={track}
        currentId={currentBlockId}
        onSelect={onSelectBlock}
        onOpenSetup={onOpenSetup}
        onChanged={onChanged}
      />
    );
  }

  const shared = { track, currentId: currentBlockId, onSelect: onSelectBlock, onOpenSetup };

  if (tab === 'outreach') {
    return (
      <WorkspaceShell
        {...shared}
        type="sourcing"
        empty={{ title: 'No sourcing block', body: 'Add one in the builder to send the call out.' }}
      >
        {(block) => <SourcingOutreach block={block} dirty={false} />}
      </WorkspaceShell>
    );
  }

  return (
    <WorkspaceShell
      {...shared}
      type="committee"
      empty={{ title: 'No selection committee', body: 'Add one in the builder to run jury sittings.' }}
    >
      {(block) => <CommitteeWorkspace block={block} onOpenBlock={onSelectBlock} />}
    </WorkspaceShell>
  );
}
