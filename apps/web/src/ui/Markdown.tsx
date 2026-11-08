/**
 * Un Markdown simple, rendu sans HTML : titres, paragraphes, listes, gras et
 * italique. Chaque morceau devient un élément React — rien de ce qu'on écrit
 * ne peut s'exécuter dans la page de qui le lit.
 */
import { Fragment, type ReactNode } from 'react';

/** Le gras (**x**) et l'italique (_x_ ou *x*) d'une ligne. */
function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|_[^_]+_|\*[^*]+\*)/g;
  let last = 0;
  let n = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > last) out.push(text.slice(last, m.index));
    const t = m[0];
    out.push(t.startsWith('**') ? <strong key={`${key}-${n++}`}>{t.slice(2, -2)}</strong> : <em key={`${key}-${n++}`}>{t.slice(1, -1)}</em>);
    last = m.index! + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  let i = 0;
  let k = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (!line.trim()) {
      i++;
      continue;
    }
    if (heading) {
      const level = heading[1]!.length;
      const body = inline(heading[2]!, `h${k}`);
      blocks.push(level === 1 ? <h2 key={k++}>{body}</h2> : level === 2 ? <h3 key={k++}>{body}</h3> : <h4 key={k++}>{body}</h4>);
      i++;
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i]!)) items.push(lines[i++]!.replace(/^\s*[-*]\s+/, ''));
      blocks.push(<ul key={k++}>{items.map((t, j) => <li key={j}>{inline(t, `u${k}-${j}`)}</li>)}</ul>);
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i]!)) items.push(lines[i++]!.replace(/^\s*\d+[.)]\s+/, ''));
      blocks.push(<ol key={k++}>{items.map((t, j) => <li key={j}>{inline(t, `o${k}-${j}`)}</li>)}</ol>);
      continue;
    }
    if (/^>\s?/.test(line)) {
      const quoted: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i]!)) quoted.push(lines[i++]!.replace(/^>\s?/, ''));
      blocks.push(<blockquote key={k++}>{inline(quoted.join(' '), `q${k}`)}</blockquote>);
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i]!.trim() && !/^(#{1,3}\s|\s*[-*]\s|\s*\d+[.)]\s|>)/.test(lines[i]!)) para.push(lines[i++]!);
    blocks.push(
      <p key={k++}>
        {para.map((p, j) => (
          <Fragment key={j}>
            {j > 0 && <br />}
            {inline(p, `p${k}-${j}`)}
          </Fragment>
        ))}
      </p>,
    );
  }
  return <div className="kb-md">{blocks.length ? blocks : <p className="faint">Nothing written yet.</p>}</div>;
}
