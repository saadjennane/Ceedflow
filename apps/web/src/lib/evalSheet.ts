/**
 * La fiche d'évaluation, remise au navigateur.
 *
 * The document itself is built in `@ceed/shared` — it is the grid on paper,
 * and the grid is domain vocabulary. What is left here is the one thing only a
 * browser can do, which is turn it into a PDF.
 */
/**
 * Hands it to the browser, which is what turns it into a PDF.
 *
 * An iframe rather than a new window: a popup blocker stops the second, and a
 * blocked export looks exactly like a broken one. It is taken off the page
 * once the dialog closes — printing is synchronous, so afterwards is safe.
 */
export function printSheets(html: string): void {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  /* Hors écran plutôt que de taille nulle : un cadre de 0 × 0 n'est pas mis
     en page, et ce qui n'est pas mis en page s'imprime parfois vide. */
  frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:794px;height:1123px;border:0';
  document.body.appendChild(frame);

  const win = frame.contentWindow;
  const doc = frame.contentDocument;
  if (!win || !doc) {
    frame.remove();
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();

  /* Pas d'attente de `load`.
     A document written in one go is parsed by the time `close()` returns, and
     its load event may well have fired already — hanging the print on it is
     how a button does nothing at all, on some browsers and not others. One
     frame is enough for layout, and layout is the only thing printing waits
     for: without it the dialog gets a first page and nothing after it. */
  requestAnimationFrame(() => {
    win.focus();
    win.print();
    setTimeout(() => frame.remove(), 2000);
  });
}
