/**
 * Une carte qui s'ouvre au survol, et qu'on peut atteindre avec la souris.
 *
 * Posée au-dessus de la page (dans un portail) : une cellule de grille coupe ce
 * qui dépasse, la carte ne l'est pas. Elle reste ouverte tant que la souris
 * passe de la cible à la carte, le temps d'y cliquer — copier un mail, un
 * numéro.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';

export function HoverCard({ children, card }: { children: ReactNode; card: ReactNode }) {
  const anchor = useRef<HTMLSpanElement | null>(null);
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);
  const timer = useRef<number | null>(null);

  const cancel = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
  };
  const open = () => {
    cancel();
    timer.current = window.setTimeout(() => {
      const r = anchor.current?.getBoundingClientRect();
      if (!r) return;
      /* Sous la cible ; près du bas de l'écran, au-dessus. */
      const below = r.bottom + 6;
      const top = below + 160 > window.innerHeight ? Math.max(8, r.top - 166) : below;
      setAt({ left: Math.min(r.left, window.innerWidth - 300), top });
    }, 250);
  };
  const close = () => {
    cancel();
    timer.current = window.setTimeout(() => setAt(null), 200);
  };
  useEffect(() => cancel, []);
  /* Défiler fait partir la cible : la carte s'en va avec elle. */
  useEffect(() => {
    if (!at) return;
    const off = () => setAt(null);
    window.addEventListener('scroll', off, true);
    return () => window.removeEventListener('scroll', off, true);
  }, [at]);

  return (
    <>
      <span ref={anchor} className="hover-anchor" onMouseEnter={open} onMouseLeave={close} onFocus={open} onBlur={close}>
        {children}
      </span>
      {at &&
        createPortal(
          <div className="hover-card" style={{ left: at.left, top: at.top }} onMouseEnter={cancel} onMouseLeave={close}>
            {card}
          </div>,
          document.body,
        )}
    </>
  );
}

/** Une ligne qu'on copie d'un clic : un mail, un numéro. */
export function CopyLine({ icon, text, href }: { icon: 'mail' | 'phone'; text: string; href: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="copy-line">
      <Icon name={icon} size={13} />
      <a href={href} className="copy-line-text">{text}</a>
      <button
        className="btn ghost icon sm"
        aria-label={done ? 'Copied' : `Copy ${text}`}
        title={done ? 'Copied' : 'Copy'}
        onClick={() => {
          const ok = () => {
            setDone(true);
            window.setTimeout(() => setDone(false), 1400);
          };
          navigator.clipboard?.writeText(text).then(ok, ok);
        }}
      >
        <Icon name={done ? 'check' : 'copy'} size={13} />
      </button>
    </div>
  );
}
