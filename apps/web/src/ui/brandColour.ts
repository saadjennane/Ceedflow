/**
 * La couleur d'une organisation : celle qu'elle a choisie, sinon celle de son
 * logo, sinon une couleur tirée de son nom.
 *
 * The logo's colour is read in the browser, once per logo: drawn small on a
 * canvas, the near-white, near-black and grey pixels set aside — a logo on a
 * white square is not white — and the most common remaining hue kept. It is
 * remembered by logo, so a directory of a hundred cards reads each image once.
 */
import { useEffect, useState } from 'react';
import { colourOf } from './Showcase';

/** Une couleur choisie : un hex à six chiffres, ou rien (la couleur du logo). */
export const isHex = (v: string | null | undefined): v is string => Boolean(v && /^#[0-9a-fA-F]{6}$/.test(v));

const memory = new Map<string, string | null>();
const waiting = new Map<string, Promise<string | null>>();
const KEY = (id: string) => `ceed.logoColour.${id}`;

const hex = (r: number, g: number, b: number) =>
  `#${[r, g, b].map((n) => Math.round(n).toString(16).padStart(2, '0')).join('')}`;

/** La teinte dominante d'une image, ou null quand elle n'a que du gris. */
function dominant(img: HTMLImageElement): string | null {
  const size = 40;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, size, size);
  const { data } = ctx.getImageData(0, 0, size, size);
  /* Douze tranches de teinte ; dans chacune, la somme des couleurs, pondérée par leur vivacité. */
  const bins = Array.from({ length: 12 }, () => ({ w: 0, r: 0, g: 0, b: 0 }));
  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b, a] = [data[i]!, data[i + 1]!, data[i + 2]!, data[i + 3]!];
    if (a < 128) continue;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const light = (max + min) / 510;
    const sat = max === min ? 0 : (max - min) / (255 - Math.abs(max + min - 255));
    if (sat < 0.25 || light < 0.12 || light > 0.92) continue;
    let h = 0;
    if (max === r) h = ((g - b) / (max - min) + 6) % 6;
    else if (max === g) h = (b - r) / (max - min) + 2;
    else h = (r - g) / (max - min) + 4;
    const bin = bins[Math.floor(h * 2) % 12]!;
    const w = sat;
    bin.w += w;
    bin.r += r * w;
    bin.g += g * w;
    bin.b += b * w;
  }
  const best = bins.reduce((a, b) => (b.w > a.w ? b : a));
  /* Quelques pixels de couleur sur un logo noir ne font pas une couleur de marque. */
  if (best.w < size * size * 0.03) return null;
  return hex(best.r / best.w, best.g / best.w, best.b / best.w);
}

function logoColour(uploadId: string): Promise<string | null> {
  if (memory.has(uploadId)) return Promise.resolve(memory.get(uploadId)!);
  try {
    const kept = localStorage.getItem(KEY(uploadId));
    if (kept !== null) {
      const value = kept === '' ? null : kept;
      memory.set(uploadId, value);
      return Promise.resolve(value);
    }
  } catch {
    /* pas de stockage : on recalcule */
  }
  const pending = waiting.get(uploadId);
  if (pending) return pending;
  const job = new Promise<string | null>((resolve) => {
    const img = new Image();
    img.onload = () => {
      let value: string | null = null;
      try {
        value = dominant(img);
      } catch {
        value = null;
      }
      memory.set(uploadId, value);
      try {
        localStorage.setItem(KEY(uploadId), value ?? '');
      } catch {
        /* tant pis */
      }
      resolve(value);
    };
    img.onerror = () => resolve(null);
    img.src = `/api/uploads/${uploadId}`;
  });
  waiting.set(uploadId, job);
  return job;
}

/** La couleur à peindre pour une organisation. */
export function useBrandColour(input: { name: string; brandColour?: string | null; logoUploadId?: string | null }): string {
  const chosen = isHex(input.brandColour) ? input.brandColour : null;
  const logo = !chosen && input.logoUploadId ? input.logoUploadId : null;
  const [fromLogo, setFromLogo] = useState<string | null>(() => (logo ? (memory.get(logo) ?? null) : null));
  useEffect(() => {
    if (!logo) {
      setFromLogo(null);
      return;
    }
    let live = true;
    void logoColour(logo).then((c) => live && setFromLogo(c));
    return () => {
      live = false;
    };
  }, [logo]);
  return chosen ?? fromLogo ?? colourOf(input.name);
}

/** Pour le sélecteur : la couleur que le logo donnerait, si on ne choisit rien. */
export function useLogoColour(logoUploadId: string | null | undefined): string | null {
  const [c, setC] = useState<string | null>(null);
  useEffect(() => {
    if (!logoUploadId) {
      setC(null);
      return;
    }
    let live = true;
    void logoColour(logoUploadId).then((v) => live && setC(v));
    return () => {
      live = false;
    };
  }, [logoUploadId]);
  return c;
}
