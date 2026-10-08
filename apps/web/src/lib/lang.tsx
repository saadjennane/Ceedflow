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

/**
 * Every word the member space says, in both.
 *
 * Écrit sans accord de genre. Les promotions mêlent hommes et femmes, et une
 * phrase comme « vous serez prévenue » désigne la moitié de la salle. La
 * parade n'est pas de choisir l'autre moitié : c'est de tourner la phrase
 * autrement — « vous recevrez un mail » ne demande d'accord à personne.
 */
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
    fr: 'Vous recevrez un mail dès qu’il y aura quelque chose.',
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
  'owed.saving': { fr: 'Enregistrement…', en: 'Saving…' },
  'owed.back.unsent': {
    fr: 'Une réponse tapée ici n’était pas partie — elle est de retour dans le champ, et elle s’enregistre.',
    en: 'Something typed here never left — it is back in the field, and it is being saved.',
  },
  'owed.accepted': { fr: 'Reçu', en: 'Accepted' },
  'owed.waiting': { fr: 'Envoyé le', en: 'Sent' },
  'owed.unread': { fr: '— en attente de lecture', en: '— waiting to be read' },
  'owed.again': { fr: 'À renvoyer.', en: 'To send again.' },
  'owed.oneBack': {
    fr: 'Un élément est à renvoyer — ce qu’il faut corriger est écrit sous chacun.',
    en: 'One thing has to be sent again — what to fix is written under each one.',
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

  /* ---- la fiche de la startup ---- */
  'prof.title': { fr: 'La fiche de votre startup', en: 'Your startup’s profile' },
  'prof.why': {
    fr: 'C’est ce qu’un jury lit avant de vous rencontrer. Elle vous suit d’un programme à l’autre.',
    en: 'This is what a jury reads before meeting you. It follows you from one programme to the next.',
  },
  'prof.done': { fr: 'Fiche complète', en: 'Profile complete' },
  'prof.left': { fr: 'Il reste', en: 'Still missing' },
  'prof.fill': { fr: 'Compléter', en: 'Fill it in' },
  'prof.empty': { fr: 'Rien n’est encore renseigné.', en: 'Nothing filled in yet.' },
  'prof.ask.logo': { fr: 'le logo', en: 'the logo' },
  'prof.ask.pitch': { fr: 'la phrase d’accroche', en: 'the one-sentence pitch' },
  'prof.ask.sector': { fr: 'le secteur', en: 'the sector' },
  'prof.ask.stage': { fr: 'le stade', en: 'the stage' },
  'prof.ask.founded': { fr: 'l’année de création', en: 'the year it started' },
  'prof.ask.team': { fr: 'la taille de l’équipe', en: 'the size of the team' },
  'prof.ask.city': { fr: 'la ville', en: 'the city' },
  'prof.ask.website': { fr: 'le site web', en: 'the website' },
  'prof.ask.linkedin': { fr: 'le LinkedIn', en: 'the LinkedIn page' },
  'prof.ask.bio': { fr: 'la description', en: 'the description' },
  'prof.logo': { fr: 'Logo', en: 'Logo' },
  'prof.pitch': { fr: 'En une phrase', en: 'In one sentence' },
  'prof.pitchHelp': {
    fr: 'Ce que vous faites, pour qui. 160 caractères au plus.',
    en: 'What you do, and for whom. 160 characters at most.',
  },
  'prof.sector': { fr: 'Secteur', en: 'Sector' },
  'prof.stage': { fr: 'Stade', en: 'Stage' },
  'prof.founded': { fr: 'Année de création', en: 'Year founded' },
  'prof.team': { fr: 'Taille de l’équipe', en: 'Team size' },
  'prof.people': { fr: 'personnes', en: 'people' },
  'prof.linkedin': { fr: 'LinkedIn', en: 'LinkedIn' },
  'prof.city': { fr: 'Ville', en: 'City' },
  'prof.website': { fr: 'Site web', en: 'Website' },
  'prof.bio': { fr: 'Ce que vous faites', en: 'What it does' },
  'stage.idea': { fr: 'Idée', en: 'Idea' },
  'stage.prototype': { fr: 'Prototype', en: 'Prototype' },
  'stage.mvp': { fr: 'MVP', en: 'MVP' },
  'stage.customers': { fr: 'Premiers clients', en: 'First customers' },
  'stage.growing': { fr: 'En croissance', en: 'Growing' },

  /* ---- qui je suis, et les pages que je tiens ---- */
  'my.title': { fr: 'Votre profil', en: 'Your profile' },
  'my.noName': { fr: 'Votre nom', en: 'Your name' },
  'my.edit': { fr: 'Modifier', en: 'Edit' },
  'my.about': { fr: 'À propos de vous', en: 'About you' },
  'my.aboutHelp': {
    fr: 'Ce qu’un jury gagnerait à savoir de vous.',
    en: 'What a jury would gain from knowing about you.',
  },
  'my.aboutEmpty': {
    fr: 'Ajoutez une ligne sur vous — c’est ce qu’un jury lit en premier.',
    en: 'Add a line about yourself — it is what a jury reads first.',
  },
  'my.firstName': { fr: 'Prénom', en: 'First name' },
  'my.lastName': { fr: 'Nom', en: 'Last name' },
  'my.phone': { fr: 'Téléphone', en: 'Phone' },
  'my.emailFixed': {
    fr: 'Votre adresse est ce avec quoi vous vous connectez : elle se change depuis le compte, pas ici.',
    en: 'Your email is what you sign in with, so it is changed from the account rather than here.',
  },
  'my.saved': { fr: 'Profil enregistré.', en: 'Profile saved.' },
  'my.where': { fr: 'Là où vous intervenez', en: 'Where you are involved' },
  'my.onJury': { fr: 'Dans le jury', en: 'On the jury' },
  'my.panels': { fr: 'séances', en: 'panels' },
  'my.panel': { fr: 'séance', en: 'panel' },
  'my.waitingOnYou': { fr: 'en attente de vous', en: 'still waiting on you' },

  /* ---- la page d'une organisation ---- */
  'org.yours': { fr: 'Vos pages', en: 'Your organisations' },
  'org.yoursMore': {
    fr: 'Les pages dont vous avez la charge. Vous pouvez en tenir plusieurs, ou aucune.',
    en: 'The pages you look after. You can hold several, or none at all.',
  },
  'org.create': { fr: 'Créer une page', en: 'Create a page' },
  'org.createTitle': { fr: 'Créer la page d’une organisation', en: 'Create an organisation page' },
  'org.createMore': {
    fr: 'Si CEED la connaît déjà, vous rejoindrez cette page plutôt qu’une seconde.',
    en: 'If CEED already knows it, you will be attached to that page rather than a second one.',
  },
  'org.noneTitle': { fr: 'Vous n’en avez pas besoin.', en: 'You do not need one.' },
  'org.noneHead': { fr: 'Rien sur cette page ne l’attend.', en: 'Nothing on this page waits for it.' },
  'org.noneMore': {
    fr: 'Une page est ce avec quoi vous candidatez, et ce qu’un jury lit de votre société. Créez-la quand vous aurez quelque chose à y mettre.',
    en: 'A page is what you apply to a programme with, and what a jury reads about your company. Create one when you have something to put on it.',
  },
  'org.team': { fr: 'Équipe', en: 'Team' },
  'org.name': { fr: 'Nom', en: 'Name' },
  'org.what': { fr: 'Ce que c’est', en: 'What it is' },
  'org.myRole': { fr: 'Votre rôle', en: 'Your role there' },
  'org.email': { fr: 'Adresse', en: 'Email' },
  'org.city': { fr: 'Ville', en: 'City' },
  'org.country': { fr: 'Pays', en: 'Country' },
  'org.website': { fr: 'Site web', en: 'Website' },
  'org.saved': { fr: 'Enregistré.', en: 'Saved.' },
  'org.joined': { fr: 'CEED connaissait déjà cette organisation : vous rejoignez sa page.', en: 'CEED already knew it — you are attached to that page.' },
  'org.created': { fr: 'Page créée.', en: 'Page created.' },

  /* ---- les boutons d'une fenêtre ---- */
  'do.cancel': { fr: 'Annuler', en: 'Cancel' },
  'do.save': { fr: 'Enregistrer', en: 'Save' },
  'do.saving': { fr: 'Enregistrement…', en: 'Saving…' },
  'do.create': { fr: 'Créer', en: 'Create' },

  /* ---- ce qu'on peut faire sur la page d'une organisation ---- */
  'access.member': { fr: 'Membre', en: 'Member' },
  'access.editor': { fr: 'Éditeur', en: 'Editor' },
  'access.admin': { fr: 'Administrateur', en: 'Administrator' },
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
