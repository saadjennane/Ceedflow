/**
 * Le courrier qui n'appartient à aucune brique.
 *
 * Une demande de pièces appartient à sa due diligence, et son gabarit vit dans
 * la config de cette étape-là. Une tâche n'est d'aucun programme : ce qu'elle
 * écrit est de la maison, écrit une fois pour tout l'espace.
 *
 * Une clé jamais enregistrée ne manque pas — elle rend son défaut. C'est ce
 * qui fait qu'un déploiement envoie une lettre entière le premier jour, avant
 * que personne n'ait ouvert l'écran des réglages.
 */
import { HOUSE_LETTERS, HOUSE_LETTER_DEFAULTS, type HouseLetter, type HouseLetterKey } from '@ceed/shared';
import { all } from '../db/client.js';

interface Row {
  key: HouseLetterKey;
  subject: string;
  body: string;
  enabled: boolean;
  updatedAt: string | null;
  updatedByName: string;
}

const SELECT = `
  select key, subject, body, enabled,
         updated_at::text as "updatedAt", updated_by_name as "updatedByName"
    from house_letters`;

/** Le défaut, tant que personne n'a rien écrit par-dessus. */
const withDefaults = (key: HouseLetterKey, row: Row | undefined): HouseLetter => ({
  key,
  subject: row?.subject ?? HOUSE_LETTER_DEFAULTS[key].subject,
  body: row?.body ?? HOUSE_LETTER_DEFAULTS[key].body,
  enabled: row?.enabled ?? true,
  updatedAt: row?.updatedAt ?? null,
  updatedByName: row?.updatedByName ?? '',
});

export async function houseLetters(): Promise<HouseLetter[]> {
  const rows = await all<Row>(SELECT);
  return HOUSE_LETTERS.map((key) => withDefaults(key, rows.find((r) => r.key === key)));
}

export async function houseLetter(key: HouseLetterKey): Promise<HouseLetter> {
  const rows = await all<Row>(`${SELECT} where key = $1`, [key]);
  return withDefaults(key, rows[0]);
}

/**
 * Enregistre ce qui a changé, et laisse le reste.
 *
 * L'insertion pose le défaut pour les champs qu'on ne touche pas, plutôt que
 * la chaîne vide : enregistrer un objet sur une clé jamais ouverte ne doit pas
 * vider le corps de la lettre au passage.
 */
export async function setHouseLetter(
  key: HouseLetterKey,
  patch: { subject?: string; body?: string; enabled?: boolean },
  byName = '',
): Promise<HouseLetter> {
  const now = await houseLetter(key);
  const next = {
    subject: patch.subject ?? now.subject,
    body: patch.body ?? now.body,
    enabled: patch.enabled ?? now.enabled,
  };
  await all(
    `insert into house_letters (key, subject, body, enabled, updated_by_name)
     values ($1, $2, $3, $4, $5)
     on conflict (key) do update
        set subject = excluded.subject, body = excluded.body, enabled = excluded.enabled,
            updated_at = now(), updated_by_name = excluded.updated_by_name`,
    [key, next.subject, next.body, next.enabled, byName],
  );
  return houseLetter(key);
}
