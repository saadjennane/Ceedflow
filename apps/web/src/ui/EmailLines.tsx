/**
 * Plusieurs adresses pour la même fiche.
 *
 * Une société a un contact@ et la boîte de son dirigeant ; quelqu'un a son
 * adresse professionnelle et celle qu'il relève vraiment. La première est
 * celle à laquelle on écrit quand il n'y en a qu'une à choisir — c'est pour ça
 * qu'on peut en remonter une.
 *
 * Jumelle de PhoneLines, et c'est voulu : deux champs qui font la même chose
 * doivent se manœuvrer pareil.
 */
import { emailProblem } from '@ceed/shared';
import { useLang } from '../lib/lang';
import { Icon } from './Icon';

export function EmailLines({
  label,
  values,
  onChange,
}: {
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
}) {
  const { t, lang } = useLang();
  const lines = values.length ? values : [''];
  const set = (index: number, next: string) => onChange(lines.map((v, i) => (i === index ? next : v)));

  return (
    <div className="field">
      <label>{label}</label>
      <div className="stack" style={{ gap: 6 }}>
        {lines.map((value, index) => {
          const problem = emailProblem(value);
          return (
            <div key={index} className="stack" style={{ gap: 2 }}>
              <div className="row" style={{ gap: 6 }}>
                <input
                  className={problem ? 'input bad' : 'input'}
                  type="email"
                  value={value}
                  style={{ flex: 1, minWidth: 0 }}
                  aria-label={index === 0 ? label : `${label} ${index + 1}`}
                  placeholder="contact@…"
                  onChange={(e) => set(index, e.target.value)}
                />
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
                    aria-label={lang === 'fr' ? 'Retirer cette adresse' : 'Remove this address'}
                    onClick={() => onChange(lines.filter((_, i) => i !== index))}
                  >
                    <Icon name="x" size={13} />
                  </button>
                )}
              </div>
              {problem && <div style={{ color: 'var(--stop)', fontSize: 12 }}>{t('bad.email')}</div>}
            </div>
          );
        })}
      </div>
      <button className="btn sm" style={{ alignSelf: 'flex-start', marginTop: 6 }} onClick={() => onChange([...lines, ''])}>
        <Icon name="plus" size={13} /> {t('email.add')}
      </button>
    </div>
  );
}
