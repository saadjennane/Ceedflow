/**
 * Régler un One to One : qui on rencontre, comment on fixe le rendez-vous,
 * et ce que le compte rendu demande.
 *
 * The meetings themselves are planned in the edition's One to One tab — this
 * is what is the same for all of them.
 */
import { RSVP_MODES, type OneToOneConfig } from '@ceed/shared';
import { PeoplePicker } from '../../directory/PeoplePicker';
import { NumberField, TextField } from '../../../ui/Field';
import { Icon } from '../../../ui/Icon';
import { QuestionsEditor } from '../../../ui/QuestionsEditor';

export const ONE_TO_ONE_TABS = ['Overview', 'Interlocutors', 'Report'] as const;
export type OneToOneTab = (typeof ONE_TO_ONE_TABS)[number];

/** The three ways a meeting is set, in the words of the person setting it. */
export const INVITE_WORDS: Record<(typeof RSVP_MODES)[number], { title: string; line: string }> = {
  slots: {
    title: 'The startup books',
    line: 'The interlocutor publishes their availability, and the startup picks a time — like Calendly.',
  },
  confirm: {
    title: 'You propose, they confirm',
    line: 'You give a time, the startup confirms or declines it.',
  },
  none: {
    title: 'You fix it',
    line: 'You give a time and nobody is asked: it is in the diary.',
  },
};

export function OneToOneSetup({
  config,
  patch,
  tab = 'Overview',
}: {
  config: OneToOneConfig;
  patch: (partial: Partial<OneToOneConfig>) => void;
  tab?: OneToOneTab;
}) {
  if (tab === 'Interlocutors') {
    return (
      <>
        <div className="callout">
          <Icon name="users" size={15} />
          <div>
            The people startups meet here — mentors, experts, investors, colleagues. They see their own meetings in
            their space, and write the report there.
          </div>
        </div>
        <PeoplePicker
          label="Interlocutors"
          value={config.interlocutors}
          onChange={(ids) => patch({ interlocutors: ids })}
          help="Anybody in the directory. A startup’s mentor is suggested first when you plan its meetings."
        />
      </>
    );
  }

  if (tab === 'Report') {
    return (
      <>
        <div className="callout">
          <Icon name="form" size={15} />
          <div>
            What the interlocutor writes after each meeting, in front of the startup or just after. It stays between
            them and CEED — the startup does not read it. The answers add up in the One to One tab, question by
            question.
          </div>
        </div>
        <QuestionsEditor
          value={config.report}
          onChange={(partial) => patch({ report: { ...config.report, ...partial } })}
          emptyText="No question yet. A topic discussed, the next steps, how the startup is doing — add what you want to follow."
          firstPageName="The meeting"
        />
      </>
    );
  }

  return (
    <>
      <div className="field">
        <label>How a new meeting is set</label>
        <div className="help">The default for this brick — each meeting can still be set another way.</div>
        <div className="pick-list">
          {(['confirm', 'none', 'slots'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              className={config.invite === mode ? 'pick on' : 'pick'}
              onClick={() => patch({ invite: mode })}
            >
              <Icon name={config.invite === mode ? 'check' : 'square'} />
              <div>
                <strong>{INVITE_WORDS[mode].title}</strong>
                <span>{INVITE_WORDS[mode].line}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="grid-2">
        <NumberField
          label="Length of a meeting, in minutes"
          value={config.durationMinutes}
          min={5}
          max={480}
          onChange={(v) => patch({ durationMinutes: v || 45 })}
        />
        <TextField
          label="Where"
          value={config.location}
          onChange={(v) => patch({ location: v })}
          placeholder="CEED, Casablanca — or a video link"
        />
      </div>

      <p className="faint" style={{ margin: 0, fontSize: 12.5 }}>
        The switch at the top opens the meetings to the interlocutors: they see them, and write their reports, while it
        is open.
      </p>
    </>
  );
}
