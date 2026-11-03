/**
 * La fiche d'une organisation en blocs : chacun dit où il en est, ce qui lui
 * manque, et s'ouvre seul dans l'éditeur. La même grille pour la startup dans
 * son espace et pour CEED sur sa page.
 */
import { PROFILE_SECTIONS, profileDone, profileMissing, profileOf, type DirectoryRecord, type ProfileSection } from '@ceed/shared';
import { say, type Lang } from '../lib/lang';
import { ASK_WORD } from './OrgProfile';
import { SECTION_WORD } from './OrgSheet';

export function ProfileBlocks({
  record,
  lang,
  onEdit,
}: {
  record: DirectoryRecord;
  lang: Lang;
  /** Absent: read only. */
  onEdit?: (section: ProfileSection) => void;
}) {
  const p = profileOf(record);
  return (
    <div className="profile-blocks">
      {PROFILE_SECTIONS.map((sec) => {
        const done = profileDone(p, sec);
        const missing = profileMissing(p, sec);
        return (
          <div key={sec} className="rowcard card-pad stack" style={{ gap: 4 }}>
            <div className="row" style={{ gap: 6 }}>
              <strong style={{ flex: 1, fontSize: 13 }}>{say(SECTION_WORD[sec], lang)}</strong>
              {done === 100 ? (
                <span className="badge ok">{lang === 'fr' ? 'Complet' : 'Complete'}</span>
              ) : (
                <span className="badge warn num">{done} %</span>
              )}
            </div>
            {missing.length > 0 && (
              <span className="faint" style={{ fontSize: 12 }}>
                {lang === 'fr' ? 'À compléter : ' : 'To fill in: '}
                {missing.slice(0, 4).map((k) => say(ASK_WORD[k], lang)).join(', ')}
                {missing.length > 4 ? '…' : ''}
              </span>
            )}
            {onEdit && (
              <button className="linkish" style={{ alignSelf: 'flex-start', fontSize: 12.5 }} onClick={() => onEdit(sec)}>
                {lang === 'fr' ? 'Modifier' : 'Edit'}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
