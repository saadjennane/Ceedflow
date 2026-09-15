import type { Candidate, CommitteeConfig } from '@ceed/shared';
import { DateField, NumberField, TagField, TextArea, TextField } from '../../../ui/Field';
import { Icon } from '../../../ui/Icon';

export function CommitteeSetup({
  config,
  patch,
  candidates,
}: {
  config: CommitteeConfig;
  patch: (partial: Partial<CommitteeConfig>) => void;
  candidates: Candidate[];
}) {
  const inPlay = candidates.filter((c) => c.status !== 'Withdrawn' && c.status !== 'Not selected');
  const all = config.candidateIds.length === 0;

  const toggle = (id: string) => {
    const explicit = all ? inPlay.map((c) => c.id) : config.candidateIds;
    const next = explicit.includes(id) ? explicit.filter((x) => x !== id) : [...explicit, id];
    patch({ candidateIds: next.length === inPlay.length ? [] : next });
  };

  return (
    <>
      <div className="callout">
        <Icon name="gavel" size={15} />
        The committee is the sitting itself: when the jury meets and who they review. The decision that comes out of it
        belongs to a Selection block placed after this one.
      </div>

      <div className="grid-2">
        <DateField label="Held on" value={config.heldAt} onChange={(v) => patch({ heldAt: v })} />
        <NumberField
          label="Duration (minutes)"
          value={config.durationMinutes}
          onChange={(v) => patch({ durationMinutes: v })}
          min={0}
        />
      </div>

      <TextField
        label="Where"
        value={config.location}
        onChange={(v) => patch({ location: v })}
        placeholder="CEED Morocco, Casablanca"
      />

      <TagField
        label="Jury"
        values={config.juryIds}
        onChange={(v) => patch({ juryIds: v })}
        help="Names for now — they become directory profiles once Community is built."
        placeholder="Add a jury member"
      />

      <TextArea
        label="How the day runs"
        value={config.agenda}
        onChange={(v) => patch({ agenda: v })}
        rows={3}
        placeholder="Fifteen minutes of pitch and ten of questions per startup."
      />

      <div className="public-sep" />

      <div className="row">
        <h3 className="section-title">Who is reviewed</h3>
        <span className="badge num">{all ? inPlay.length : config.candidateIds.length}</span>
        <div className="spacer" />
        {!all && (
          <button className="btn sm ghost" onClick={() => patch({ candidateIds: [] })}>
            Reset to everyone
          </button>
        )}
      </div>

      <p className="faint" style={{ margin: 0, fontSize: 12.5 }}>
        {all
          ? 'Everyone still in the funnel when the committee sits. Untick a candidate to fix an explicit list instead.'
          : 'An explicit list. Candidates who arrive later will not be added automatically.'}
      </p>

      {!inPlay.length ? (
        <div className="empty" style={{ padding: 26 }}>
          No candidate has reached this point yet.
        </div>
      ) : (
        <div className="rows">
          {inPlay.map((candidate) => {
            const on = all || config.candidateIds.includes(candidate.id);
            return (
              <label className="check rowcard" style={{ padding: '9px 11px' }} key={candidate.id}>
                <input type="checkbox" checked={on} onChange={() => toggle(candidate.id)} />
                <span style={{ flex: 1 }}>
                  <strong style={{ fontSize: 13 }}>{candidate.orgName}</strong>
                  <div className="faint" style={{ fontSize: 12 }}>
                    {candidate.contactName} · {candidate.status}
                  </div>
                </span>
              </label>
            );
          })}
        </div>
      )}
    </>
  );
}
