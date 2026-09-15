import type { SourcingConfig } from '@ceed/shared';
import { DateField, NumberField, TagField, TextArea } from '../../../ui/Field';
import { Icon } from '../../../ui/Icon';

export function SourcingSetup({
  config,
  patch,
}: {
  config: SourcingConfig;
  patch: (partial: Partial<SourcingConfig>) => void;
}) {
  return (
    <>
      <div className="callout">
        <Icon name="megaphone" size={15} />
        Sourcing is the call itself: when it runs, how many candidates you are aiming for, and where they come from.
        The channels listed here become the options a candidate picks from on the application form.
      </div>

      <div className="grid-2">
        <DateField label="Opens on" value={config.opensAt} onChange={(v) => patch({ opensAt: v })} />
        <DateField label="Closes on" value={config.closesAt} onChange={(v) => patch({ closesAt: v })} />
      </div>

      <NumberField
        label="Target number of applications"
        value={config.target}
        onChange={(v) => patch({ target: v })}
        min={0}
        help="Used to show how the call is tracking. Leave at 0 if you have no target."
      />

      <TagField
        label="Channels"
        values={config.channels}
        onChange={(v) => patch({ channels: v })}
        help="LinkedIn, Instagram, a partner, a university — wherever you are pushing the call."
        placeholder="Add a channel"
      />

      <TextArea
        label="Who can apply"
        value={config.eligibility}
        onChange={(v) => patch({ eligibility: v })}
        rows={3}
        placeholder="Registered in Morocco, at least two founders working full time…"
      />
    </>
  );
}
