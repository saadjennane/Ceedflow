/**
 * La liste de l'annuaire, gardée le temps de la session.
 *
 * Revenir sur Organisations montre aussitôt ce qu'on avait, puis la liste
 * fraîche la remplace. Survoler le lien dans la barre latérale la demande déjà
 * — et la grille avec : au clic, tout est là.
 */
import { api } from './api';

const lists = new Map<string, unknown>();
const flying = new Map<string, Promise<unknown>>();

export const cachedList = <T>(kind: string): T | null => (lists.get(kind) as T | undefined) ?? null;

export function loadList<T>(kind: string): Promise<T> {
  const going = flying.get(kind);
  if (going) return going as Promise<T>;
  const p = api
    .get<T>(`/api/records?kind=${kind}`)
    .then((rows) => {
      lists.set(kind, rows);
      return rows;
    })
    .finally(() => flying.delete(kind));
  flying.set(kind, p);
  return p;
}

/** Au survol d'un lien : la liste, et pour les organisations le code de la grille. */
export function prefetchDirectory(kind: 'org' | 'person') {
  if (!lists.has(kind)) void loadList(kind).catch(() => undefined);
  if (kind === 'org') void import('../pages/directory/OrgGrid').catch(() => undefined);
}
