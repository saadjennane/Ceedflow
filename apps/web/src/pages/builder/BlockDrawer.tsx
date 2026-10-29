import {
  blockMissing,
  blockStatus,
  BLOCK_TYPE_META,
  type ApplicationConfig,
  type Block,
  type Candidate,
  type CommitteeConfig,
  type DeliverableConfig,
  type EvaluationConfig,
  type OneToOneConfig,
  type SelectionConfig,
  type SourcingConfig,
  type TrackWithPhases,
  type BrickWindow,
} from '@ceed/shared';
import { useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { Icon } from '../../ui/Icon';
import { DoorToggle } from './panels/shared';
import { ConfirmDialog, Drawer, useToast } from '../../ui/Overlays';
import { APPLICATION_TABS, ApplicationSetup, type ApplicationTab } from './panels/ApplicationPanel';
import { EVALUATION_TABS, EvaluationSetup, type EvaluationTab } from './panels/EvaluationPanel';
import { CommitteeSetup, committeeTabs, type CommitteeTab } from './panels/CommitteePanel';
import { DELIVERABLE_TABS, DeliverableSetup, type DeliverableTab } from './panels/DeliverablePanel';
import { SELECTION_TABS, SelectionSetup, type SelectionTab } from './panels/SelectionPanel';
import { SOURCING_TABS, SourcingSetup, type SourcingTab } from './panels/SourcingPanel';
import { ONE_TO_ONE_TABS, OneToOneSetup, type OneToOneTab } from './panels/OneToOnePanel';

/**
 * The block's action does not live here — it lives in the edition's work tabs.
 * This is the way through to it.
 */
const WORK_TAB: Partial<Record<string, { tab: string; label: string }>> = {
  sourcing: { tab: 'outreach', label: 'Outreach' },
  committee: { tab: 'committees', label: 'Committees' },
  evaluation: { tab: 'review', label: 'Review' },
  deliverable: { tab: 'deliverables', label: 'Deliverables' },
  selection: { tab: 'review', label: 'Review' },
  one_to_one: { tab: 'one-to-one', label: 'One to One' },
};

/** What the header toggle opens, said in the words of each brick. */
const DOOR_LABEL: Partial<Record<string, string>> = {
  application: 'the application form',
  evaluation: 'reviewing',
  committee: 'the panel, for its jurors',
  deliverable: 'the list, for the startups',
  one_to_one: 'the meetings, for the interlocutors',
};

/** What opens or closes a door — the only part of a brick saved the moment it changes. */
const DOOR_KEYS = ['visibility', 'visibilitySetAt', 'openedAt'];

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
  const [evalTab, setEvalTab] = useState<EvaluationTab>('Overview');
  /* Opening a deliverables block from its own tab is nearly always about the
     list, the same way a committee's setup is nearly always about its panels. */
  const [delivTab, setDelivTab] = useState<DeliverableTab>(
    currentTab === 'deliverables' ? 'What you ask for' : 'Overview',
  );
  const [selTab, setSelTab] = useState<SelectionTab>('Overview');
  // Opening a committee's setup from the Committees tab is nearly always about
  // its panels, so that is where it lands.
  const [commTab, setCommTab] = useState<CommitteeTab>(currentTab === 'committees' ? 'Panels' : 'Overview');
  const [srcTab, setSrcTab] = useState<SourcingTab>('Channels');
  const [otoTab, setOtoTab] = useState<OneToOneTab>('Overview');
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const dirty = useMemo(
    () => name !== block.name || JSON.stringify(draft) !== JSON.stringify(block.config),
    [name, draft, block],
  );

  /**
   * Ouvrir ou fermer une porte prend effet tout de suite, sans « Save
   * changes » : un interrupteur qu'on bascule et qui n'agit qu'au bouton
   * suivant, c'est une brique qu'on croit ouverte et qui ne l'est pas. Le
   * reste du brouillon, lui, attend toujours le bouton.
   */
  const persistDoor = async (config: Record<string, unknown>) => {
    try {
      await api.patch(`/api/blocks/${block.id}`, { config });
      onChanged();
      const visibility = config.visibility ?? (config.rsvp as { visibility?: string } | undefined)?.visibility;
      toast(
        visibility === 'open' ? 'Open now — saved.' : visibility === 'closed' ? 'Closed now — saved.' : 'Following its dates — saved.',
      );
    } catch (err) {
      toast((err as Error).message, true);
    }
  };
  const patch = (partial: Record<string, unknown>) => {
    const keys = Object.keys(partial);
    const saved = block.config as Record<string, unknown>;
    if (keys.length && keys.every((k) => DOOR_KEYS.includes(k))) {
      void persistDoor(partial);
    } else if (keys.length === 1 && keys[0] === 'rsvp') {
      /* La porte des créneaux d'un comité : seulement ce qui l'ouvre ou la
         ferme part tout de suite — une date de réponse modifiée attend le bouton. */
      const next = partial.rsvp as Record<string, unknown>;
      const prev = (draft.rsvp ?? {}) as Record<string, unknown>;
      const changed = Object.keys(next).filter((k) => next[k] !== prev[k]);
      if (changed.length && changed.every((k) => DOOR_KEYS.includes(k))) {
        const door = Object.fromEntries(changed.map((k) => [k, next[k]]));
        void persistDoor({ rsvp: { ...((saved.rsvp ?? {}) as object), ...door } });
      }
    }
    setDraft((d) => ({ ...d, ...partial }));
  };

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
  // Turning a committee into asynchronous work takes the Invitations tab away,
  // so a tab that is no longer there falls back rather than showing nothing.
  const commTabs = committeeTabs(draft as unknown as CommitteeConfig);
  // Only the three bricks that show something to somebody outside CEED.
  /* Deliverables sits here with the rest rather than carrying its own copy of
     the control in its Overview: it has exactly one door, and a block with one
     door shows it in one place. */
  const hasDoor =
    block.type === 'application' ||
    block.type === 'evaluation' ||
    block.type === 'committee' ||
    block.type === 'deliverable' ||
    block.type === 'one_to_one';
  const committeeTab = commTabs.includes(commTab) ? commTab : 'Overview';

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
        /* The door sits beside the name, and reads the draft rather than the
           saved block — otherwise the toggle flips nothing you can see until
           after a save. */
        headerExtra={
          hasDoor ? (
            <DoorToggle
              config={draft as unknown as BrickWindow}
              patch={patch as (p: Partial<BrickWindow>) => void}
              status={blockStatus(
                { type: block.type, config: draft, nextSittingOn: block.nextSittingOn },
                'main',
                block.sittings ?? 0,
              )}
              missing={blockMissing(
                { type: block.type, config: draft, nextSittingOn: block.nextSittingOn },
                'main',
                block.sittings ?? 0,
              )}
              label={DOOR_LABEL[block.type] ?? 'this block'}
            />
          ) : undefined
        }
        /* A block with several sides to configure gets tabs, the way the
           prototype had them. The rest are one panel and need none. */
        tabs={
          block.type === 'application'
            ? APPLICATION_TABS.map((t) => (
                <button key={t} role="tab" className={t === appTab ? 'tab on' : 'tab'} onClick={() => setAppTab(t)}>
                  {t}
                </button>
              ))
            : block.type === 'evaluation'
              ? EVALUATION_TABS.map((t) => (
                  <button key={t} role="tab" className={t === evalTab ? 'tab on' : 'tab'} onClick={() => setEvalTab(t)}>
                    {/* A panel that votes has no grid: the same tab holds the
                        headings the juror reads before choosing a status. */}
                    {t === 'Grid' && (draft as { method?: string }).method === 'verdict' ? 'What to look at' : t}
                  </button>
                ))
              : block.type === 'sourcing'
                ? SOURCING_TABS.map((t) => (
                    <button key={t} role="tab" className={t === srcTab ? 'tab on' : 'tab'} onClick={() => setSrcTab(t)}>
                      {t}
                    </button>
                  ))
                : block.type === 'deliverable'
                ? DELIVERABLE_TABS.map((t) => (
                    <button
                      key={t}
                      role="tab"
                      className={t === delivTab ? 'tab on' : 'tab'}
                      onClick={() => setDelivTab(t)}
                    >
                      {t}
                    </button>
                  ))
                : block.type === 'one_to_one'
                ? ONE_TO_ONE_TABS.map((t) => (
                    <button key={t} role="tab" className={t === otoTab ? 'tab on' : 'tab'} onClick={() => setOtoTab(t)}>
                      {t}
                    </button>
                  ))
                : block.type === 'selection'
                ? SELECTION_TABS.map((t) => (
                    <button key={t} role="tab" className={t === selTab ? 'tab on' : 'tab'} onClick={() => setSelTab(t)}>
                      {t}
                    </button>
                  ))
                : block.type === 'committee'
                ? commTabs.map((t) => (
                    <button
                      key={t}
                      role="tab"
                      className={t === committeeTab ? 'tab on' : 'tab'}
                      onClick={() => setCommTab(t)}
                    >
                      {t}
                    </button>
                  ))
                : undefined
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
        {/* Deux portes sur un comité : la liste des jurés, et la page où les
            startups prennent leur créneau. La seconde s'oublie facilement —
            dite ici, dès qu'on ouvre la brique. */}
        {block.type === 'committee' && (() => {
          const c = draft as unknown as CommitteeConfig;
          if (c.format !== 'event' || c.rsvpMode === 'none') return null;
          const facts = { type: block.type, config: draft, nextSittingOn: block.nextSittingOn };
          const main = blockStatus(facts, 'main', block.sittings ?? 0);
          const rsvp = blockStatus(facts, 'rsvp', block.sittings ?? 0);
          if (rsvp === 'live') return null;
          return (
            <div className={main === 'live' ? 'callout warn' : 'callout'}>
              <Icon name="alert" size={15} />
              <div style={{ flex: 1 }}>
                {main === 'live' ? (
                  <>
                    <strong>The jurors see their list, but the startups cannot pick their slot yet.</strong> The
                    booking page is a separate switch — it is {rsvp === 'scheduled' ? 'scheduled, not open yet' : 'closed'}.
                  </>
                ) : (
                  <>
                    Two switches here: the block (what the jurors see) and the booking page (where startups{' '}
                    {c.rsvpMode === 'slots' ? 'pick their slot' : 'confirm their time'}). The booking page is not open.
                  </>
                )}
                <div className="row" style={{ gap: 6, marginTop: 7 }}>
                  {(block.sittings ?? 0) > 0 && (
                    <button
                      className="btn sm primary"
                      onClick={() =>
                        patch({
                          rsvp: {
                            ...((draft.rsvp ?? {}) as object),
                            visibility: 'open',
                            visibilitySetAt: new Date().toISOString().slice(0, 10),
                          },
                        })
                      }
                    >
                      Open the booking page now
                    </button>
                  )}
                  <button className="btn sm" onClick={() => setCommTab('Invitations')}>
                    See Invitations
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        {workTab && workTab.tab !== currentTab && appTab === 'Overview' && evalTab === 'Overview' && committeeTab === 'Overview' && srcTab === 'Channels' && (
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

        {block.type === 'sourcing' && (
          <SourcingSetup
            block={block}
            config={draft as unknown as SourcingConfig}
            patch={patch}
            track={track}
            tab={srcTab}
          />
        )}
        {block.type === 'application' && (
          <ApplicationSetup block={block} config={draft as unknown as ApplicationConfig} patch={patch} tab={appTab} />
        )}
        {block.type === 'evaluation' && (
          <EvaluationSetup
            block={block}
            config={draft as unknown as EvaluationConfig}
            patch={patch}
            track={track}
            tab={evalTab}
          />
        )}
        {block.type === 'committee' && (
          <CommitteeSetup block={block} config={draft as unknown as CommitteeConfig} patch={patch} tab={committeeTab} />
        )}
        {block.type === 'selection' && (
          <SelectionSetup
            block={block}
            config={draft as unknown as SelectionConfig}
            patch={patch}
            track={track}
            tab={selTab}
          />
        )}
        {block.type === 'one_to_one' && (
          <OneToOneSetup block={block} config={draft as unknown as OneToOneConfig} patch={patch} tab={otoTab} />
        )}
        {block.type === 'deliverable' && (
          <DeliverableSetup
            config={draft as unknown as DeliverableConfig}
            patch={patch}
            tab={delivTab}
          />
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
