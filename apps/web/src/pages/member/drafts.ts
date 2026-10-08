/**
 * Ce qui a été tapé et n'est pas encore parti.
 *
 * Une réponse s'écrit sur un téléphone, dans un train, sur une ligne qui tient
 * mal. Le champ garde ce qu'on y met et l'envoie après une pause — mais entre
 * la pause et l'accusé du serveur, il y a l'onglet qu'on change, la page qu'on
 * ferme, la 4G qui tombe. Rien ne le disait, et le texte partait avec.
 *
 * Alors il est aussi écrit dans le navigateur, tout de suite, à chaque frappe,
 * et effacé quand le serveur l'a. Ce qui reste ici est donc exactement ce qui
 * n'est jamais arrivé : on le remet dans le champ à la visite suivante, et on
 * le renvoie.
 *
 * Par navigateur, pas par compte : il n'y a rien là-dedans qu'un serveur doive
 * connaître, et une réponse à moitié tapée n'a pas à voyager.
 */

/** Une réponse en attente, et quand elle a été tapée. */
export interface Draft {
  value: unknown;
  at: number;
}

const KEY = 'ceed.drafts';
const key = (candidateId: string, blockId: string, itemId: string) => `${candidateId}|${blockId}|${itemId}`;

/**
 * Un stockage qui peut ne pas exister.
 *
 * Navigation privée, stockage bloqué, quota plein : chaque accès peut lever.
 * Un brouillon perdu est un désagrément, une page blanche en est un autre —
 * et ce serait l'écran entier qui tomberait pour une commodité.
 */
const read = (): Record<string, Draft> => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, Draft>;
  } catch {
    return {};
  }
};

const write = (all: Record<string, Draft>): void => {
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* Rien à faire, et rien à dire : la réponse part quand même au serveur. */
  }
};

/** Gardé le temps que le serveur le reçoive. */
export function remember(candidateId: string, blockId: string, itemId: string, value: unknown): void {
  const all = read();
  all[key(candidateId, blockId, itemId)] = { value, at: Date.now() };
  write(all);
}

/** Reçu : il n'y a plus rien à rattraper. */
export function forget(candidateId: string, blockId: string, itemId: string): void {
  const all = read();
  if (!(key(candidateId, blockId, itemId) in all)) return;
  delete all[key(candidateId, blockId, itemId)];
  write(all);
}

/**
 * Ce qui n'est jamais arrivé, pour une liste donnée.
 *
 * Avec une péremption : un brouillon d'il y a trois semaines ne parle plus de
 * la même chose, et le remettre dans le champ par-dessus ce que CEED a lu
 * depuis serait reprendre la main sur une réponse réglée.
 */
const KEPT_DAYS = 7;

export function stranded(candidateId: string, blockId: string): Record<string, unknown> {
  const all = read();
  const out: Record<string, unknown> = {};
  let dropped = false;
  for (const [k, draft] of Object.entries(all)) {
    const [c, b, item] = k.split('|');
    if (Date.now() - draft.at > KEPT_DAYS * 86_400_000) {
      delete all[k];
      dropped = true;
      continue;
    }
    if (c === candidateId && b === blockId && item) out[item] = draft.value;
  }
  if (dropped) write(all);
  return out;
}
