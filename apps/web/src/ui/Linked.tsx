import { Fragment } from 'react';

/**
 * An answer's text, with the addresses in it made clickable.
 *
 * A founder pastes a website, a deck, a logo in storage — as plain text those
 * are a line of noise you have to select and copy. Only http and https are
 * turned into links: these strings come from a form anybody on the internet
 * can fill in, and `javascript:` in an href is how that becomes a way in.
 */

/* Stops before the punctuation a sentence puts after an address — a full stop,
   a closing bracket, a comma — so "see https://ceedflow.com." does not link
   the full stop as part of the address. */
const URL_IN_TEXT = /(https?:\/\/[^\s<>"'`]*[^\s<>"'`.,;:!?)\]}])/g;

export function Linked({ text }: { text: string }) {
  const pieces = text.split(URL_IN_TEXT);
  if (pieces.length === 1) return <>{text}</>;

  return (
    <>
      {pieces.map((piece, i) =>
        // The capturing group puts the addresses at the odd indexes.
        i % 2 === 1 ? (
          <a key={i} href={piece} target="_blank" rel="noreferrer">
            {piece}
          </a>
        ) : (
          <Fragment key={i}>{piece}</Fragment>
        ),
      )}
    </>
  );
}
