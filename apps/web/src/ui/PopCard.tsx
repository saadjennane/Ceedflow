import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';

/**
 * Une carte qui s'ouvre d'un clic sur sa cible, au-dessus de la page (dans un
 * portail : une cellule de grille coupe ce qui dépasse, la carte ne l'est pas).
 * Elle se ferme d'un clic ailleurs, par Échap, ou en défilant.
 */
export function PopCard({
  label,
  card,
  className,
}: {
  label: ReactNode;
  card: (close: () => void) => ReactNode;
  className?: string;
}) {
  const anchor = useRef<HTMLButtonElement | null>(null);
  const box = useRef<HTMLDivElement | null>(null);
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);
  const close = () => setAt(null);

  const toggle = () => {
    if (at) return close();
    const r = anchor.current?.getBoundingClientRect();
    if (!r) return;
    /* Sous la cible ; près du bas de l'écran, au-dessus. */
    const below = r.bottom + 6;
    const top = below + 230 > window.innerHeight ? Math.max(8, r.top - 236) : below;
    setAt({ left: Math.max(8, Math.min(r.left, window.innerWidth - 310)), top });
  };

  useEffect(() => {
    if (!at) return;
    const outside = (e: MouseEvent) => {
      const t = e.target as Node;
      if (box.current?.contains(t) || anchor.current?.contains(t)) return;
      close();
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && close();
    /* Défiler la page fait partir la cible ; défiler dans la carte, non. */
    const scrolled = (e: Event) => {
      if (box.current?.contains(e.target as Node)) return;
      close();
    };
    window.addEventListener('mousedown', outside);
    window.addEventListener('keydown', key);
    window.addEventListener('scroll', scrolled, true);
    return () => {
      window.removeEventListener('mousedown', outside);
      window.removeEventListener('keydown', key);
      window.removeEventListener('scroll', scrolled, true);
    };
  }, [at]);

  return (
    <>
      <button ref={anchor} className={className ?? 'linkish pop-anchor'} aria-expanded={Boolean(at)} onClick={toggle}>
        {label}
      </button>
      {at &&
        createPortal(
          <div ref={box} className="hover-card" role="dialog" style={{ left: at.left, top: at.top }}>
            {card(close)}
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
