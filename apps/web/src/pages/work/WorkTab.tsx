import type { TrackWithPhases } from '@ceed/shared';
import { EvaluationScoring } from '../builder/panels/EvaluationPanel';
import { SelectionDecision } from '../builder/panels/SelectionPanel';
import { SourcingOutreach } from '../builder/panels/SourcingPanel';
import { CommitteeWorkspace } from './CommitteeWorkspace';
import { WorkspaceShell } from './WorkspaceShell';

/** Runs one kind of block. Configuration stays in the builder. */
export function WorkTab({
  tab,
  track,
  currentBlockId,
  onSelectBlock,
  onOpenSetup,
  onChanged,
}: {
  tab: 'outreach' | 'committees' | 'scoring' | 'decisions';
  track: TrackWithPhases;
  currentBlockId: string | null;
  onSelectBlock: (id: string) => void;
  onOpenSetup: (id: string) => void;
  onChanged: () => void;
}) {
  const shared = {
    track,
    currentId: currentBlockId,
    onSelect: onSelectBlock,
    onOpenSetup,
  };

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

  if (tab === 'committees') {
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

  if (tab === 'scoring') {
    return (
      <WorkspaceShell
        {...shared}
        type="evaluation"
        empty={{ title: 'No evaluation', body: 'Add one in the builder to score candidates against a grid.' }}
      >
        {(block) => <EvaluationScoring block={block} dirty={false} onChanged={onChanged} />}
      </WorkspaceShell>
    );
  }

  return (
    <WorkspaceShell
      {...shared}
      type="selection"
      empty={{ title: 'No selection', body: 'Add one in the builder to cut the funnel.' }}
    >
      {(block) => <SelectionDecision block={block} onChanged={onChanged} />}
    </WorkspaceShell>
  );
}
