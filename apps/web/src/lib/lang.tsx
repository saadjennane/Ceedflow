/**
 * Deux langues, pour l'espace des membres.
 *
 * CEED writes to Moroccan founders in French, and the pages those founders
 * read were in English. The two had to meet: the letters say "Veuillez
 * remplir", so the screen cannot answer "Nothing was sent".
 *
 * French is the default because it is who reads it. English stays, offered
 * from the page itself, because a jury is not always francophone and a
 * programme is not always Moroccan.
 *
 * No library: a dictionary and a lookup. What a translation framework buys —
 * plurals by locale, dates, lazy bundles — is either already here or not
 * needed for two languages and one audience.
 */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type Lang = 'fr' | 'en';

/** Every word the member space says, in both. */
const WORDS = {
  /* ---- the shell ---- */
  'tab.home': { fr: 'Accueil', en: 'Home' },
  'tab.profile': { fr: 'Profil', en: 'Profile' },
  'tab.programs': { fr: 'Programmes', en: 'Programs' },
  'tab.jury': { fr: 'Jury', en: 'Jury' },
  'tab.settings': { fr: 'Réglages', en: 'Settings' },
  'bar.signOut': { fr: 'Se déconnecter', en: 'Sign out' },
  'bar.workspace': { fr: 'Espace CEED', en: 'CEED workspace' },
  'bar.lang': { fr: 'Langue', en: 'Language' },

  /* ---- the home ---- */
  'home.todo': { fr: 'À faire', en: 'To do' },
  'home.nothing': { fr: 'Rien à faire pour le moment.', en: 'Nothing to do right now.' },
  'home.nothingMore': {
    fr: 'Vous serez prévenue par mail dès qu’il y aura quelque chose.',
    en: 'You will hear by email as soon as there is something.',
  },
  'home.programmes': { fr: 'Vos programmes', en: 'Your programmes' },
  'home.open': { fr: 'Ouvrir', en: 'Open' },

  /* ---- a programme ---- */
  'prog.todo': { fr: 'À faire', en: 'To do' },
  'prog.agenda': { fr: 'Activités', en: 'Activities' },
  'prog.back': { fr: 'Vos programmes', en: 'Your programmes' },
  'prog.noTodo': { fr: 'Rien ne vous est demandé pour l’instant.', en: 'Nothing is asked of you right now.' },
  'prog.noAgenda': {
    fr: 'Aucune date pour l’instant. Les séances et les ateliers apparaîtront ici.',
    en: 'No dates yet. Sittings and workshops will appear here.',
  },
  'prog.jury': { fr: 'Votre passage devant le jury', en: 'Your time in front of the jury' },
  'prog.at': { fr: 'à', en: 'at' },
  'prog.applied': { fr: 'a candidaté', en: 'applied' },
  'prog.apply': { fr: 'Candidater', en: 'Apply' },
  'prog.none': { fr: 'Rien d’ouvert pour l’instant', en: 'Nothing open yet' },
  'prog.noneMore': {
    fr: 'Les programmes de CEED apparaissent ici dès qu’ils sont publiés.',
    en: 'CEED’s programmes appear here as soon as they are published.',
  },

  /* ---- what is asked of a startup ---- */
  'owed.fill': { fr: 'Veuillez remplir ces informations', en: 'Please fill these in' },
  'owed.back': { fr: 'Un élément est à renvoyer', en: 'One thing has to be sent again' },
  'owed.done': { fr: 'Tout est transmis', en: 'Everything is in' },
  'owed.reading': { fr: 'Tout est transmis — CEED en prend connaissance', en: 'Everything is in — CEED is reading it' },
  'owed.before': { fr: 'avant le', en: 'before' },
  'owed.closed': {
    fr: 'Cette liste est close. Ce que vous avez envoyé est ci-dessous — parlez-en à CEED s’il faut encore changer quelque chose.',
    en: 'This list is closed. What you sent is below — talk to CEED if something still has to change.',
  },
  'owed.kept': {
    fr: 'Chaque réponse est conservée au fur et à mesure — il n’y a rien à envoyer à la fin.',
    en: 'Each answer is kept as you give it — there is nothing to send at the end.',
  },
  'owed.accepted': { fr: 'Reçu', en: 'Accepted' },
  'owed.waiting': { fr: 'Envoyé le', en: 'Sent' },
  'owed.unread': { fr: '— en attente de lecture', en: '— waiting to be read' },
  'owed.again': { fr: 'À renvoyer.', en: 'To send again.' },
  'owed.oneBack': {
    fr: 'Un élément est à renvoyer. Ce qu’il faut corriger est écrit sous chacun.',
    en: 'One thing has to be sent again. What to fix is written under each one.',
  },

  /* ---- a list of things, and files ---- */
  'item.add': { fr: 'Ajouter', en: 'Add another' },
  'item.min': { fr: 'minimum', en: 'at least one' },
  'item.remove': { fr: 'Retirer', en: 'Remove' },
  'file.choose': { fr: 'Choisir un fichier — 10 Mo au plus', en: 'Choose a file — 10 MB at most' },
  'file.sending': { fr: 'Envoi…', en: 'Sending…' },
  'file.open': { fr: 'Ouvrir', en: 'Open' },
  'file.replace': { fr: 'Remplacer', en: 'Replace' },
  'field.choose': { fr: 'Choisir', en: 'Choose one' },
} as const;

export type Word = keyof typeof WORDS;

const read = (): Lang => {
  const saved = localStorage.getItem('ceed.lang');
  return saved === 'en' || saved === 'fr' ? saved : 'fr';
};

interface Speaking {
  lang: Lang;
  setLang: (next: Lang) => void;
  t: (word: Word) => string;
}

/**
 * English where nobody said otherwise.
 *
 * FormField and the deliverable inputs are shared with the CEED workspace,
 * which is in English and stays there. The member shell is the one place that
 * declares a language, so a component outside it keeps the words it had.
 */
const Spoken = createContext<Speaking>({
  lang: 'en',
  setLang: () => {},
  t: (word) => WORDS[word].en,
});

export const useLang = (): Speaking => useContext(Spoken);

/**
 * The language of the member space, kept per browser rather than per account —
 * like the theme. It answers "what do I read on this screen", not "who am I",
 * and somebody opening a shared laptop should not have to sign in to be
 * understood.
 */
export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(read);
  useEffect(() => {
    localStorage.setItem('ceed.lang', lang);
    document.documentElement.setAttribute('lang', lang);
  }, [lang]);
  const value = useMemo<Speaking>(() => ({ lang, setLang, t: (word) => WORDS[word][lang] }), [lang]);
  return <Spoken.Provider value={value}>{children}</Spoken.Provider>;
}

/** For the few places that are given the language rather than reading it. */
export const say = (word: Word, lang: Lang): string => WORDS[word][lang];
