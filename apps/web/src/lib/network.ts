/**
 * Le réseau CEED, côté écran : où l'on peut travailler, où l'on travaille.
 *
 * Changer de centre recharge l'application : chaque liste, chaque cache, chaque
 * page ouverte repart du nouveau centre, et rien de l'ancien ne reste à l'écran
 * sous le nom du nouveau.
 */
import { useEffect, useState } from 'react';
import { CENTER_KEY, api } from './api';

export interface NetworkCenter {
  id: string;
  name: string;
  country: string;
  city: string;
  status: 'active' | 'inactive';
  logoUploadId: string | null;
  role: 'admin' | 'editor' | 'observer' | null;
}

export interface NetworkMe {
  global: boolean;
  current: string;
  centers: NetworkCenter[];
  /** Les programmes que le réseau propose à ce centre et qui attendent sa réponse. */
  pendingOffers: number;
  /** Les centres actifs du réseau. */
  networkSize: number;
}

let cached: NetworkMe | null = null;
let flying: Promise<NetworkMe> | null = null;

export function loadNetwork(): Promise<NetworkMe> {
  if (cached) return Promise.resolve(cached);
  flying ??= api.get<NetworkMe>('/api/network/me').then((me) => {
    cached = me;
    return me;
  });
  return flying;
}

export function useNetwork(): NetworkMe | null {
  const [me, setMe] = useState<NetworkMe | null>(cached);
  useEffect(() => {
    let live = true;
    void loadNetwork()
      .then((m) => live && setMe(m))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  return me;
}

/** Entrer dans un centre : l'application repart de lui, sur sa page d'accueil. */
export function enterCenter(id: string, to = '/') {
  try {
    localStorage.setItem(CENTER_KEY, id);
  } catch {
    /* sans stockage, le serveur prend le premier centre */
  }
  window.location.assign(to);
}
