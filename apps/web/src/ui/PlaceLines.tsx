/**
 * Plusieurs lieux pour la même fiche.
 *
 * Une startup a son siège à Casablanca et son atelier à Agadir ; un partenaire
 * a trois bureaux. Il n'y avait qu'une ville, et le reste finissait dans la
 * description — c'est-à-dire nulle part où l'on puisse chercher.
 *
 * Le premier de la liste est celui que montrent les écrans qui n'ont la place
 * que d'un : un tableau, un export. L'ordre est donc une décision, comme pour
 * les numéros, et c'est pour ça qu'on peut remonter une ligne.
 */
import { COUNTRIES, citiesOf } from '@ceed/shared';
import { useId } from 'react';
import { useLang } from '../lib/lang';
import { Icon } from './Icon';

export interface Place {
  city: string;
  country: string;
}

export function PlaceLines({
  label,
  values,
  onChange,
}: {
  label: string;
  values: Place[];
  onChange: (next: Place[]) => void;
}) {
  const { t, lang } = useLang();
  const listId = useId();
  /* Une ligne d'emblée : sans elle, il faudrait cliquer « ajouter » pour
     saisir la première ville, ce qui est un clic pour rien. */
  const lines = values.length ? values : [{ city: '', country: '' }];
  const set = (index: number, next: Partial<Place>) =>
    onChange(lines.map((p, i) => (i === index ? { ...p, ...next } : p)));

  return (
    <div className="field">
      <label>{label}</label>
      <div className="stack" style={{ gap: 6 }}>
        {lines.map((place, index) => (
          <div className="row" key={index} style={{ gap: 6 }}>
            {/* Le pays d'abord, parce que c'est lui qui décide des villes
                proposées ensuite — et parce qu'une liste de pays est finie,
                alors qu'une liste de villes ne l'est pas. */}
            <select
              className="input"
              value={place.country}
              style={{ flex: 1, minWidth: 0 }}
              aria-label={index === 0 ? `${label} country` : `${label} country ${index + 1}`}
              onChange={(e) => set(index, { country: e.target.value })}
            >
              <option value="">{lang === 'fr' ? 'Pays…' : 'Country…'}</option>
              {/* Ce qui est déjà écrit sur la fiche reste choisi, même si ce
                  n'est pas une de nos orthographes : une liste n'a pas à
                  effacer ce que quelqu'un a saisi avant elle. */}
              {place.country && !COUNTRIES.includes(place.country as (typeof COUNTRIES)[number]) && (
                <option value={place.country}>{place.country}</option>
              )}
              {COUNTRIES.map((country) => (
                <option key={country} value={country}>{country}</option>
              ))}
            </select>
            {/* La ville se propose et ne s'impose pas : une liste fermée aurait
                rejeté quelqu'un le jour où nous oublions sa ville. */}
            <input
              className="input"
              value={place.city}
              list={`${listId}-${index}`}
              style={{ flex: 1, minWidth: 0 }}
              aria-label={index === 0 ? `${label} city` : `${label} city ${index + 1}`}
              placeholder={citiesOf(place.country).length ? (lang === 'fr' ? 'Ville' : 'City') : 'Casablanca'}
              onChange={(e) => set(index, { city: e.target.value })}
            />
            <datalist id={`${listId}-${index}`}>
              {citiesOf(place.country).map((city) => (
                <option key={city} value={city} />
              ))}
            </datalist>
            {index > 0 && (
              <button
                className="btn ghost icon sm"
                aria-label={lang === 'fr' ? 'Mettre en premier' : 'Make it the first'}
                title={lang === 'fr' ? 'Mettre en premier' : 'Make it the first'}
                onClick={() => onChange([place, ...lines.filter((_, i) => i !== index)])}
              >
                <Icon name="chevronUp" size={13} />
              </button>
            )}
            {lines.length > 1 && (
              <button
                className="btn ghost icon sm"
                aria-label={lang === 'fr' ? 'Retirer ce lieu' : 'Remove this place'}
                onClick={() => onChange(lines.filter((_, i) => i !== index))}
              >
                <Icon name="x" size={13} />
              </button>
            )}
          </div>
        ))}
      </div>
      <button
        className="btn sm"
        style={{ alignSelf: 'flex-start', marginTop: 6 }}
        onClick={() => onChange([...lines, { city: '', country: lines[0]?.country ?? '' }])}
      >
        <Icon name="plus" size={13} /> {t('place.add')}
      </button>
    </div>
  );
}
