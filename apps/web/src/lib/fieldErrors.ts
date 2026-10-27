/**
 * Montrer le champ à corriger, pas seulement dire qu'il y en a un.
 *
 * Every refusal of a form comes back as a 422 listing its fields. Screens
 * that wire those fields mark their inputs themselves (`input bad`,
 * `aria-invalid`); this does the rest, for every screen at once: any input
 * named after a refused field is marked, and the first marked field on the
 * page is brought into view and given the cursor — so a red toast is never
 * the only clue.
 */

const MARKED = '.input.bad, .select.bad, .textarea.bad, .bad-group, [aria-invalid="true"]';

function mark(el: HTMLElement, message: string) {
  el.setAttribute('aria-invalid', 'true');
  if (message) el.setAttribute('title', message);
  const clear = () => {
    el.removeAttribute('aria-invalid');
    el.removeAttribute('title');
  };
  el.addEventListener('input', clear, { once: true });
  el.addEventListener('change', clear, { once: true });
}

const visible = (el: Element) => (el as HTMLElement).offsetParent !== null || (el as HTMLElement).getClientRects().length > 0;

export function pointAtFields(fields: Record<string, string>) {
  if (typeof document === 'undefined') return;
  // Après que l'écran a dessiné ses propres erreurs.
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      for (const [key, message] of Object.entries(fields)) {
        const name = CSS.escape(key);
        const tail = CSS.escape(key.split('.').pop() ?? key);
        document
          .querySelectorAll<HTMLElement>(`[name="${name}"], [data-field="${name}"], [name="${tail}"], [data-field="${tail}"]`)
          .forEach((el) => mark(el, message));
      }
      /* Le curseur ne bouge que si l'on vient de cliquer un bouton : une
         sauvegarde en cours de frappe qui serait refusée ne doit pas arracher
         la personne au champ où elle écrit. */
      const active = document.activeElement;
      const typing = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement;
      if (typing && active.matches(MARKED)) return;
      if (typing) return;
      const first = [...document.querySelectorAll<HTMLElement>(MARKED)].find(visible);
      if (!first) return;
      first.scrollIntoView({ block: 'center', behavior: 'smooth' });
      first.focus({ preventScroll: true });
    }),
  );
}
