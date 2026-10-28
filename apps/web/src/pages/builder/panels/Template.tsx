/**
 * Un gabarit de message, et ce qu'il donne une fois rempli.
 *
 * Shared by every brick that writes to startups, because the act is the same
 * whichever one it is: a letter that is already whole, variables a click away
 * rather than typed from memory, and an example filled in with this block's own
 * data. A second copy of this would be a second place for the wording of a
 * programme to drift.
 */
import { ACCESS_VARIABLES, fillTemplate } from '@ceed/shared';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../../../ui/Icon';

/** One template, with its variables a click away and said back filled in. */
export function Template({
  label,
  help,
  value,
  onChange,
  subject,
  onSubject,
  variables,
  example,
}: {
  label: string;
  help: string;
  value: string;
  onChange: (next: string) => void;
  /**
   * L'objet, quand la lettre en porte un.
   *
   * Avec le corps plutôt que dans un écran de réglages : c'est la première
   * ligne du même message, elle prend les mêmes variables, et on ne juge
   * « Due diligence — Rafid Tech » qu'en lisant ce qui vient après.
   */
  subject?: string;
  onSubject?: (next: string) => void;
  variables: readonly Variable[];
  /** Only what this block knows — its own name, its own labels. The rest comes
      from the variables themselves, so a new one can never be forgotten here. */
  example?: Record<string, string | undefined>;
}) {
  const box = useRef<HTMLTextAreaElement>(null);
  const line = useRef<HTMLInputElement>(null);
  /* Où le bouton pose ce qu'il insère : dans le champ qu'on vient de quitter.
     Sans ça, cliquer « + Startup » en ayant l'objet en main l'écrivait dans le
     corps, deux cents mots plus bas. */
  const [where, setWhere] = useState<'body' | 'subject'>('body');
  const [show, setShow] = useState(false);

  /* Dropped at the cursor, because the alternative — appended at the end, or
     typed from memory — is how {{startup}} ends up spelled {{Startup}} and
     goes out as four braces. */
  const insert = (name: string) => {
    const token = `{{${name}}}`;
    const onSubjectLine = where === 'subject' && onSubject !== undefined;
    const el: HTMLTextAreaElement | HTMLInputElement | null = onSubjectLine ? line.current : box.current;
    const text = onSubjectLine ? (subject ?? '') : value;
    const write = onSubjectLine ? onSubject! : onChange;
    if (!el) return write(text + token);
    const from = el.selectionStart ?? text.length;
    const to = el.selectionEnd ?? from;
    write(text.slice(0, from) + token + text.slice(to));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(from + token.length, from + token.length);
    });
  };

  const known = new Set(variables.map((v) => v.name));
  const unknown = [
    ...new Set(
      [...`${value}\n${subject ?? ''}`.matchAll(/\{\{\s*([a-zA-Z_]+)\s*\}\}/g)].map((m) => m[1]!),
    ),
  ].filter((n) => !known.has(n));

  const filled = {
    ...Object.fromEntries(variables.map((v) => [v.name, v.example ?? ''])),
    // Undefined means "this block has nothing of its own to say here", so the
    // variable's own sample stands.
    ...Object.fromEntries(Object.entries(example ?? {}).filter(([, v]) => v !== undefined)),
  } as Record<string, string>;

  return (
    <div className="field">
      <div className="row">
        <label style={{ flex: 1 }}>{label}</label>
        <button className="linkish" style={{ fontSize: 12 }} onClick={() => setShow(!show)}>
          {show ? 'Hide preview' : 'Preview'}
        </button>
      </div>
      <div className="help">{help}</div>
      {/* Nommé, parce qu'une boîte d'une ligne au-dessus d'un message est
          autrement un champ dont personne ne sait ce qu'il fait. */}
      {onSubject && (
        <div className="eyebrow" style={{ marginTop: 8 }}>Subject</div>
      )}
      {onSubject && (
        <input
          ref={line}
          className="input"
          value={subject ?? ''}
          placeholder="Subject"
          aria-label={`${label} — subject`}
          style={{ marginTop: 3 }}
          onFocus={() => setWhere('subject')}
          onChange={(e) => onSubject(e.target.value)}
        />
      )}
      <textarea
        ref={box}
        className="textarea"
        rows={9}
        value={value}
        style={{ marginTop: 6 }}
        onFocus={() => setWhere('body')}
        onChange={(e) => onChange(e.target.value)}
      />
      {/* Le nom sur le bouton, parce que c'est le nom qu'on lit dans le texte.
          Sans lui, « First login » et {{acces}} sont deux choses pour qui
          regarde l'écran — et on cherche un bouton « accès » qui n'existe pas
          pendant qu'il est le premier de la rangée. */}
      <div className="row wrap" style={{ gap: 5, marginTop: 6 }}>
        {variables.map((v) => (
          <span key={v.name} className="var-chip">
            <button className="btn ghost sm" onClick={() => insert(v.name)}>
              <Icon name="plus" size={11} /> {v.label}
              <span className="faint" style={{ fontSize: 11, fontFamily: 'var(--mono)' }}>{`{{${v.name}}}`}</span>
            </button>
            <VariableInfo variable={v} />
          </span>
        ))}
      </div>
      {/* A name nobody replaces goes out written exactly as typed. Said here
          rather than discovered in somebody's inbox. */}
      {unknown.length > 0 && (
        <p className="warnline" style={{ margin: '6px 0 0', fontSize: 12 }}>
          {unknown.map((u) => `{{${u}}}`).join(', ')} {unknown.length === 1 ? 'is' : 'are'} not a variable here — it
          will go out written like that.
        </p>
      )}
      {show && (
        <>
        {/* Refermer là où on lit, plutôt que de remonter chercher le lien
            au-dessus d'une lettre de deux cents mots. */}
        <div className="row" style={{ marginTop: 8 }}>
          <span className="eyebrow" style={{ flex: 1 }}>Preview</span>
          <button className="btn ghost sm" onClick={() => setShow(false)}>
            <Icon name="x" size={12} /> Hide preview
          </button>
        </div>
        <pre className="letter" style={{ marginTop: 4 }}>
          {/* L'objet au-dessus, comme dans une boîte mail. */}
          {onSubject && (
            <strong style={{ display: 'block', marginBottom: 8 }}>
              {fillTemplate(subject ?? '', filled) || '(no subject)'}
            </strong>
          )}
          {fillTemplate(value, filled)}
        </pre>
        </>
      )}
    </div>
  );
}

/** A variable as a letter editor offers it. */
interface Variable {
  name: string;
  label: string;
  what: string;
  example?: string;
  /** Ce qu'elle devient selon le mode d'invitation, quand elle en dépend. */
  byMode?: readonly { mode: string; text: string }[];
}

/**
 * Le petit « i » d'une variable : ce qu'elle contient, et la phrase qu'elle
 * devient — pour chaque mode d'invitation quand elle en dépend. Ouvert au
 * survol ou au clic, parce qu'un lien de créneau et un lien de rendez-vous
 * se ressemblent tant qu'on n'a pas vu ce qu'ils écrivent.
 */
function VariableInfo({ variable }: { variable: Variable }) {
  /* Ouverte au survol ; un clic la garde ouverte, un second la referme. Le
     clic ne fait plus que fixer ce que le survol a déjà ouvert — il la
     refermait aussitôt, et il fallait cliquer deux fois. */
  const [hover, setHover] = useState(false);
  const [pinned, setPinned] = useState(false);
  const open = hover || pinned;
  const button = useRef<HTMLButtonElement>(null);
  const bubble = useRef<HTMLSpanElement>(null);
  const [place, setPlace] = useState<{ top: number; left: number; width: number } | null>(null);

  /* Placée par rapport à la fenêtre, et ramenée dedans : près du bord droit
     d'un panneau, elle sortait du cadre et n'était plus lisible. */
  useLayoutEffect(() => {
    if (!open || !button.current) return;
    const r = button.current.getBoundingClientRect();
    const width = Math.min(320, window.innerWidth - 16);
    const left = Math.max(8, Math.min(r.left - 8, window.innerWidth - width - 8));
    const height = bubble.current?.offsetHeight ?? 0;
    const below = r.bottom + 6;
    const top = below + height > window.innerHeight - 8 && r.top - height - 6 > 8 ? r.top - height - 6 : below;
    setPlace({ top, left, width });
  }, [open]);

  /* Un clic ailleurs ou un défilement la referme : posée sur la fenêtre, elle
     resterait sinon flotter loin de son « i ». */
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!button.current?.contains(e.target as Node)) {
        setPinned(false);
        setHover(false);
      }
    };
    const scrolled = () => {
      setPinned(false);
      setHover(false);
    };
    document.addEventListener('mousedown', away);
    window.addEventListener('scroll', scrolled, true);
    return () => {
      document.removeEventListener('mousedown', away);
      window.removeEventListener('scroll', scrolled, true);
    };
  }, [open]);

  return (
    <span className="var-info" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <button
        ref={button}
        type="button"
        className="var-info-btn"
        aria-label={`What ${variable.label} writes`}
        aria-expanded={open}
        onClick={() => setPinned((p) => !p)}
        onBlur={() => {
          setPinned(false);
          setHover(false);
        }}
      >
        i
      </button>
      {open &&
        createPortal(
          <span
            ref={bubble}
            className="var-bubble"
            role="tooltip"
            style={place ? { top: place.top, left: place.left, width: place.width } : { visibility: 'hidden' }}
          >
            <strong style={{ display: 'block', fontSize: 12.5 }}>{variable.label}</strong>
            <span style={{ display: 'block', margin: '3px 0 6px' }}>{variable.what}</span>
            {variable.byMode?.length ? (
              variable.byMode.map((m) => (
                <span key={m.mode} style={{ display: 'block', marginTop: 4 }}>
                  <span className="eyebrow">{m.mode}</span>
                  <span className="var-sample">{m.text}</span>
                </span>
              ))
            ) : variable.example ? (
              <>
                <span className="eyebrow">Becomes</span>
                <span className="var-sample">{variable.example.replace(/\\n/g, '\n')}</span>
              </>
            ) : null}
          </span>,
          document.body,
        )}
    </span>
  );
}

/**
 * Le paragraphe qui remet un mot de passe, dans les mots de cette brique.
 *
 * One component rather than the same field written out in five panels, because
 * it is the same idea in each: what `{{acces}}` puts in this block's letters.
 * The wording of a programme belongs to the programme, but the explanation of
 * what this field is must not drift between bricks.
 */
export function AccessTemplate({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  return (
    <Template
      label="What a first login says"
      help="Dropped in wherever a letter here uses First login — and only for somebody who cannot sign in yet. Anybody who already has a password reads nothing in its place."
      value={value}
      onChange={onChange}
      variables={ACCESS_VARIABLES}
    />
  );
}
