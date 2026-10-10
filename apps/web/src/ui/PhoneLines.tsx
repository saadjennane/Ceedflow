/**
 * Plusieurs numéros pour la même personne, ou la même société.
 *
 * Un fondateur a un portable et un fixe au bureau ; une société a un standard
 * et le numéro qu'elle donne à ses clients. Il n'y avait qu'une case, alors le
 * second finissait dans la description — ou nulle part, et c'est le jour où on
 * cherche à joindre quelqu'un qu'on s'en aperçoit.
 *
 * Le premier de la liste est celui que les écrans montrent quand ils n'ont la
 * place que d'un : le tableau des candidatures, un export. L'ordre est donc une
 * décision, et c'est pour ça qu'on peut remonter une ligne.
 */
import { phoneProblem } from '@ceed/shared';
import { useLang } from '../lib/lang';
import { Icon } from './Icon';

export function PhoneLines({
  label,
  values,
  onChange,
  readOnly = false,
}: {
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
  readOnly?: boolean;
}) {
  const { t, lang } = useLang();
  /* Une ligne vide d'emblée : sans elle, il faudrait cliquer « ajouter » pour
     saisir le premier numéro, ce qui est un clic pour rien. */
  const lines = values.length ? values : [''];

  const set = (index: number, next: string) =>
    onChange(lines.map((v, i) => (i === index ? next : v)));

  if (readOnly) {
    return (
      <div className="field">
        <label>{label}</label>
        <div className="stack" style={{ gap: 2 }}>
          {values.filter(Boolean).length ? (
            values.filter(Boolean).map((v) => (
              <div className="num" key={v} style={{ fontSize: 13 }}>{v}</div>
            ))
          ) : (
            <span className="faint" style={{ fontSize: 13 }}>—</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="field">
      <label>{label}</label>
      <div className="stack" style={{ gap: 6 }}>
        {lines.map((value, index) => {
          const problem = phoneProblem(value);
          return (
            <div key={index} className="stack" style={{ gap: 2 }}>
              <div className="row" style={{ gap: 6 }}>
                <input
                  className={problem ? 'input bad' : 'input'}
                  value={value}
                  style={{ flex: 1, minWidth: 0 }}
                  aria-label={index === 0 ? label : `${label} ${index + 1}`}
                  placeholder="+212 6 12 34 56 78"
                  onChange={(e) => set(index, e.target.value)}
                />
                {/* Remonter, parce que le premier est celui qu'on donne : une
                    liste qu'on ne peut pas ordonner oblige à tout retaper. */}
                {index > 0 && (
                  <button
                    className="btn ghost icon sm"
                    aria-label={lang === 'fr' ? 'Mettre en premier' : 'Make it the first'}
                    title={lang === 'fr' ? 'Mettre en premier' : 'Make it the first'}
                    onClick={() => onChange([value, ...lines.filter((_, i) => i !== index)])}
                  >
                    <Icon name="chevronUp" size={13} />
                  </button>
                )}
                {lines.length > 1 && (
                  <button
                    className="btn ghost icon sm"
                    aria-label={lang === 'fr' ? 'Retirer ce numéro' : 'Remove this number'}
                    onClick={() => onChange(lines.filter((_, i) => i !== index))}
                  >
                    <Icon name="x" size={13} />
                  </button>
                )}
              </div>
              {problem && <div style={{ color: 'var(--stop)', fontSize: 12 }}>{t('bad.phone')}</div>}
            </div>
          );
        })}
      </div>
      <button
        className="btn sm"
        style={{ alignSelf: 'flex-start', marginTop: 6 }}
        onClick={() => onChange([...lines, ''])}
      >
        <Icon name="plus" size={13} /> {t('phone.add')}
      </button>
    </div>
  );
}
