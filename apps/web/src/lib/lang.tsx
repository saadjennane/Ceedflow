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
  'tab.meetings': { fr: 'Rendez-vous', en: 'Meetings' },
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
  'home.upcoming': { fr: 'À venir', en: 'Coming up' },
  'home.noUpcoming': { fr: 'Rien de prévu pour le moment.', en: 'Nothing planned right now.' },
  'home.all': { fr: 'Tout', en: 'All' },
  'home.loading': { fr: 'Chargement…', en: 'Loading…' },
  'home.error': { fr: 'Impossible de charger ce que vous avez à faire. Rechargez la page.', en: 'Could not load what you have to do. Reload the page.' },
  'status.late': { fr: 'En retard', en: 'Late' },
  'status.in_progress': { fr: 'En cours', en: 'In progress' },
  'status.pending': { fr: 'À faire', en: 'To do' },
  'role.startup': { fr: 'Startup', en: 'Startup' },
  'role.jury': { fr: 'Jury', en: 'Jury' },
  'role.mentor': { fr: 'Mentor', en: 'Mentor' },
  'role.member': { fr: 'Tâche', en: 'Task' },
  'act.deliverable': { fr: 'Pièces à déposer', en: 'Items to send' },
  'act.deliverableBack': { fr: 'Pièce à reprendre', en: 'Item to send again' },
  'act.profile': { fr: 'Compléter la fiche de', en: 'Complete the page of' },
  'act.review': { fr: 'Évaluer', en: 'Evaluate' },
  'act.startups': { fr: 'startup(s)', en: 'startup(s)' },
  'act.report': { fr: 'Compte rendu à écrire', en: 'Report to write' },
  'act.bookCommittee': { fr: 'Choisir l’heure de votre passage', en: 'Pick your time in front of the jury' },
  'act.confirmCommittee': { fr: 'Confirmer votre passage devant le jury', en: 'Confirm your time in front of the jury' },
  'act.bookMeeting': { fr: 'Choisir un créneau avec', en: 'Pick a time with' },
  'prog.videoLink': { fr: 'Rejoindre la visio', en: 'Join the video call' },
  'act.prepare': { fr: 'Préparer la séance avec', en: 'Prepare the session with' },
  'cta.prepare': { fr: 'Préparer', en: 'Prepare' },
  'act.bookMeetingAny': { fr: 'Choisir un créneau de rendez-vous', en: 'Pick a meeting time' },
  'act.confirmMeeting': { fr: 'Confirmer le rendez-vous avec', en: 'Confirm the meeting with' },
  'act.left': { fr: 'restant(s) sur', en: 'left of' },
  'act.missing': { fr: 'élément(s) à compléter', en: 'item(s) to complete' },
  'cta.deliverable': { fr: 'Déposer', en: 'Send' },
  'cta.profile': { fr: 'Compléter', en: 'Complete' },
  'cta.review': { fr: 'Évaluer', en: 'Evaluate' },
  'cta.report': { fr: 'Écrire le CR', en: 'Write the report' },
  'cta.book': { fr: 'Choisir', en: 'Pick a time' },
  'cta.confirm': { fr: 'Répondre', en: 'Answer' },
  'up.committee': { fr: 'Passage devant le jury', en: 'In front of the jury' },
  'up.meeting': { fr: 'Rendez-vous avec', en: 'Meeting with' },
  'up.sitting': { fr: 'Vous siégez au jury', en: 'You sit on the jury' },

  /* ---- a programme ---- */
  'prog.todo': { fr: 'À faire', en: 'To do' },
  'prog.agenda': { fr: 'Activités', en: 'Activities' },
  'prog.back': { fr: 'Vos programmes', en: 'Your programmes' },
  'prog.meeting': { fr: 'Rendez-vous avec', en: 'Meeting with' },
  'prog.meetBook': { fr: 'Choisir un créneau', en: 'Pick a time' },
  'prog.meetConfirm': { fr: 'Confirmer', en: 'Confirm' },
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
  'field.missing': { fr: 'À remplir.', en: 'Still to fill in.' },
  'bad.email': { fr: 'Une adresse s’écrit nom@domaine.ma.', en: 'An address is written name@domain.ma.' },
  'email.add': { fr: 'Ajouter une adresse', en: 'Add an address' },
  'phone.add': { fr: 'Ajouter un numéro', en: 'Add a number' },
  'place.add': { fr: 'Ajouter un lieu', en: 'Add a place' },
  'bad.phone': {
    fr: 'Un numéro, ce sont des chiffres — 06 12 34 56 78, ou +212 6 12 34 56 78.',
    en: 'A number is digits — 06 12 34 56 78, or +212 6 12 34 56 78.',
  },

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
  'prof.ask.pitch': { fr: 'la description courte', en: 'the short description' },
  'prof.ask.sector': { fr: 'le secteur', en: 'the sector' },
  'prof.ask.stage': { fr: 'le stade', en: 'the stage' },
  'prof.ask.founded': { fr: 'la date de création', en: 'the date it was founded' },
  'prof.ask.team': { fr: 'l’effectif', en: 'the headcount' },
  'prof.ask.city': { fr: 'la ville du siège', en: 'the head office’s city' },
  'prof.ask.website': { fr: 'le site web', en: 'the website' },
  'prof.ask.linkedin': { fr: 'le LinkedIn', en: 'the LinkedIn page' },
  'prof.ask.bio': { fr: 'la description de l’activité', en: 'the description of the business' },
  'prof.ask.orgType': { fr: 'le type d’organisation', en: 'the type of organisation' },
  'prof.ask.legalStatus': { fr: 'le statut juridique', en: 'the legal status' },
  'prof.ask.legalForm': { fr: 'la forme juridique', en: 'the legal form' },
  'prof.ask.capital': { fr: 'le capital social', en: 'the share capital' },
  'prof.ask.email': { fr: 'l’email', en: 'the email' },
  'prof.ask.phone': { fr: 'le téléphone', en: 'the phone number' },
  'prof.ask.address': { fr: 'l’adresse du siège', en: 'the head office’s address' },
  'prof.ask.maturity': { fr: 'le niveau de maturité', en: 'the maturity level' },
  'prof.ask.mvpUsers': { fr: 'les premiers utilisateurs', en: 'whether it has users yet' },
  'prof.ask.revenues': { fr: 'le chiffre d’affaires', en: 'the turnover' },
  'prof.ask.clients': { fr: 'le nombre de clients', en: 'the number of clients' },
  'prof.ask.patent': { fr: 'les brevets', en: 'patents' },
  'prof.ask.patentDetails': { fr: 'le détail du brevet', en: 'the patent’s details' },
  'prof.ask.contracts': { fr: 'les marchés signés', en: 'signed contracts' },
  'prof.ask.contractsDetail': { fr: 'le détail des marchés', en: 'the contracts’ details' },
  'prof.ask.activityNature': { fr: 'la nature de l’activité', en: 'the nature of the business' },
  'prof.ask.targetMarkets': { fr: 'le marché cible', en: 'the target market' },
  'prof.ask.offering': { fr: 'les produits et services principaux', en: 'the main products and services' },
  'prof.ask.salesZone': { fr: 'la zone de commercialisation', en: 'where it sells' },
  'prof.ask.salesCountries': { fr: 'les pays de commercialisation', en: 'the countries it sells in' },
  'prof.ask.products': { fr: 'au moins un produit ou service', en: 'at least one product or service' },
  'prof.ask.foundersCount': { fr: 'le nombre de fondateurs', en: 'the number of founders' },
  'prof.ask.womenCount': { fr: 'le nombre de femmes', en: 'the number of women' },
  'prof.ask.hasFunding': { fr: 'les financements obtenus', en: 'funding received' },
  'prof.ask.fundings': { fr: 'les opérations de financement', en: 'the funding rounds' },
  'prof.ask.pastPrograms': { fr: 'les programmes passés', en: 'past programmes' },
  'prof.ask.currentPrograms': { fr: 'les programmes en cours', en: 'current programmes' },
  'prof.ask.programs': { fr: 'les programmes suivis', en: 'the programmes followed' },
  'prof.ask.needs': { fr: 'vos besoins', en: 'what you need' },
  'prof.ask.needsDetail': { fr: 'le détail de vos besoins', en: 'the details of what you need' },
  'prof.ask.docStatutes': { fr: 'les statuts', en: 'the articles of association' },
  'prof.ask.docRc': { fr: 'le registre de commerce', en: 'the commercial register' },
  'prof.ask.docPitch': { fr: 'le pitch deck', en: 'the pitch deck' },
  'prof.ask.docFinancials': { fr: 'le dernier bilan', en: 'the latest financial statements' },
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

  /* ---- la fiche en sections ---- */
  'sheet.s.identity': { fr: 'Identité & coordonnées', en: 'Identity & contact' },
  'sheet.s.activity': { fr: 'Activité', en: 'Business' },
  'sheet.s.team': { fr: 'Équipe', en: 'Team' },
  'sheet.s.maturity': { fr: 'Maturité & performances', en: 'Maturity & performance' },
  'sheet.s.funding': { fr: 'Financement & accompagnement', en: 'Funding & support' },
  'sheet.s.needs': { fr: 'Besoins & opportunités', en: 'Needs & opportunities' },
  'sheet.s.documents': { fr: 'Documents', en: 'Documents' },
  'sheet.title': { fr: 'La fiche de', en: 'The profile of' },
  'sheet.why': {
    fr: 'Remplie une fois, elle vous suit d’un programme à l’autre. Chaque champ s’enregistre tout seul.',
    en: 'Filled in once, it follows you from one programme to the next. Every field saves itself.',
  },
  'sheet.saving': { fr: 'Enregistrement…', en: 'Saving…' },
  'sheet.saved': { fr: 'Enregistré', en: 'Saved' },
  'sheet.next': { fr: 'Enregistrer et continuer', en: 'Save and continue' },
  'sheet.later': { fr: 'Compléter plus tard', en: 'Finish later' },
  'sheet.finish': { fr: 'Terminer', en: 'Done' },
  'sheet.choose': { fr: 'Choisir…', en: 'Choose…' },
  'sheet.asTyped': { fr: 'tel que saisi', en: 'as typed' },
  'sheet.optional': { fr: 'facultatif', en: 'optional' },
  'sheet.name': { fr: 'Dénomination', en: 'Name' },
  'sheet.pitch': { fr: 'Description courte', en: 'Short description' },
  'sheet.pitchHelp': {
    fr: 'Ce que vous faites, pour qui. C’est la première ligne qu’un jury lit.',
    en: 'What you do, and for whom. It is the first line a jury reads.',
  },
  'sheet.orgType': { fr: 'Type d’organisation', en: 'Type of organisation' },
  'sheet.legalStatus': { fr: 'Statut juridique', en: 'Legal status' },
  'sheet.inCreation': {
    fr: 'Les informations juridiques s’ajouteront une fois la société immatriculée.',
    en: 'The legal details come once the company is registered.',
  },
  'sheet.founded': { fr: 'Date de création', en: 'Date founded' },
  'sheet.legalForm': { fr: 'Forme juridique', en: 'Legal form' },
  'sheet.capital': { fr: 'Capital social', en: 'Share capital' },
  'sheet.sector': { fr: 'Secteur principal', en: 'Main sector' },
  'sheet.sectors2': { fr: 'Secteurs secondaires', en: 'Other sectors' },
  'sheet.website': { fr: 'Site web', en: 'Website' },
  'sheet.linkedin': { fr: 'LinkedIn', en: 'LinkedIn' },
  'sheet.socials': { fr: 'Autres réseaux sociaux', en: 'Other social networks' },
  'sheet.socialsAdd': { fr: 'Ajouter un réseau', en: 'Add a network' },
  'sheet.email': { fr: 'Email professionnel', en: 'Work email' },
  'sheet.phone': { fr: 'Téléphone', en: 'Phone' },
  'sheet.hq': { fr: 'Siège', en: 'Head office' },
  'sheet.address': { fr: 'Adresse complète', en: 'Full address' },
  'sheet.otherPlaces': { fr: 'Autres villes d’implantation', en: 'Other locations' },
  'sheet.otherPlacesAdd': { fr: 'Ajouter une ville', en: 'Add a city' },
  'sheet.bio': { fr: 'Description détaillée de l’activité', en: 'What the business does, in detail' },
  'sheet.team': { fr: 'Nombre total de collaborateurs', en: 'Total headcount' },
  'sheet.maturity': { fr: 'Niveau de maturité', en: 'Maturity level' },
  'sheet.early': {
    fr: 'Pas de chiffres à ce stade : ils viendront avec la commercialisation.',
    en: 'No figures at this stage: they come with commercialisation.',
  },
  'sheet.mvpUsers': {
    fr: 'Le produit a-t-il déjà des utilisateurs ou des clients ?',
    en: 'Does the product have users or clients yet?',
  },
  'sheet.revenues': { fr: 'Chiffre d’affaires', en: 'Turnover' },
  'sheet.revenuesHelp': {
    fr: 'Les trois derniers exercices clos. Zéro est une réponse.',
    en: 'The last three closed financial years. Zero is an answer.',
  },
  'sheet.unavailable': { fr: 'Non disponible', en: 'Not available' },
  'sheet.clients': { fr: 'Nombre de clients actifs', en: 'Active clients' },
  'sheet.patent': { fr: 'Brevet', en: 'Patent' },
  'sheet.patentNumber': { fr: 'Numéro', en: 'Number' },
  'sheet.patentDate': { fr: 'Date', en: 'Date' },
  'sheet.patentCountry': { fr: 'Pays', en: 'Country' },
  'sheet.patentOffice': { fr: 'Organisme', en: 'Office' },
  'sheet.patentProcedure': { fr: 'Où en est la procédure ?', en: 'Where is the procedure?' },
  'sheet.contracts': { fr: 'Marchés ou bons de commande signés', en: 'Signed contracts or purchase orders' },
  'sheet.contractsCount': { fr: 'Nombre', en: 'How many' },
  'sheet.contractsAmount': { fr: 'Montant cumulé', en: 'Total amount' },
  'sheet.missing': { fr: 'Pour compléter cette section :', en: 'To complete this section:' },
  'sheet.nature': { fr: 'Nature de l’activité', en: 'Nature of the business' },
  'sheet.markets': { fr: 'Marché cible actuel', en: 'Current target market' },
  'sheet.offering': { fr: 'Produits et services principaux', en: 'Main products and services' },
  'sheet.catalogue': { fr: 'Catalogue produits (lien)', en: 'Product catalogue (link)' },
  'sheet.zone': { fr: 'Zone de commercialisation', en: 'Where it sells' },
  'sheet.countries': { fr: 'Pays de commercialisation', en: 'Countries it sells in' },
  'sheet.countryAdd': { fr: 'Ajouter un pays…', en: 'Add a country…' },
  'sheet.demo': { fr: 'Lien de démonstration', en: 'Demo link' },
  'sheet.products': { fr: 'Produits et services', en: 'Products and services' },
  'sheet.productAdd': { fr: 'Ajouter un produit ou service', en: 'Add a product or service' },
  'sheet.productName': { fr: 'Nom', en: 'Name' },
  'sheet.productDesc': { fr: 'Description', en: 'Description' },
  'sheet.productStatus': { fr: 'Statut', en: 'Status' },
  'sheet.productPrice': { fr: 'Prix', en: 'Price' },
  'sheet.productImage': { fr: 'Image', en: 'Image' },
  'sheet.remove': { fr: 'Retirer', en: 'Remove' },
  'sheet.removeSure': { fr: 'Retirer définitivement ?', en: 'Remove for good?' },
  'sheet.add': { fr: 'Ajouter', en: 'Add' },
  'sheet.cancel': { fr: 'Annuler', en: 'Cancel' },
  'sheet.founders': { fr: 'Nombre de fondateurs', en: 'Number of founders' },
  'sheet.women': { fr: 'Dont femmes', en: 'Of whom women' },
  'sheet.foundersGap': {
    fr: 'Fondateurs déclarés et fondateurs liés à la page ne correspondent pas :',
    en: 'Declared founders and founders on the page do not match:',
  },
  'sheet.foundersLinked': { fr: 'liés', en: 'linked' },
  'sheet.people': { fr: 'Les personnes de l’organisation', en: 'The people in the organisation' },
  'sheet.peopleHelp': {
    fr: 'Elles sont dans l’annuaire, et peuvent appartenir à plusieurs organisations.',
    en: 'They are in the directory, and may belong to several organisations.',
  },
  'sheet.role': { fr: 'Rôle', en: 'Role' },
  'sheet.primary': { fr: 'Contact principal', en: 'Main contact' },
  'sheet.personAdd': { fr: 'Associer quelqu’un', en: 'Add someone' },
  'sheet.personName': { fr: 'Nom complet', en: 'Full name' },
  'sheet.personEmail': { fr: 'Email', en: 'Email' },
  'sheet.personFound': {
    fr: 'Une personne déjà connue avec cette adresse est rattachée, pas recréée.',
    en: 'Somebody already known by this address is linked, not created again.',
  },
  'sheet.onlyAdmin': {
    fr: 'Seul un administrateur de la page peut modifier l’équipe.',
    en: 'Only an administrator of the page can change the team.',
  },
  'sheet.hasFunding': {
    fr: 'Avez-vous déjà obtenu des financements externes ?',
    en: 'Have you received external funding?',
  },
  'sheet.fundings': { fr: 'Opérations de financement', en: 'Funding rounds' },
  'sheet.fundingAdd': { fr: 'Ajouter une opération', en: 'Add a round' },
  'sheet.fundingDate': { fr: 'Date', en: 'Date' },
  'sheet.fundingAmount': { fr: 'Montant', en: 'Amount' },
  'sheet.fundingNature': { fr: 'Nature', en: 'Type' },
  'sheet.funder': { fr: 'Investisseur ou organisme', en: 'Investor or funder' },
  'sheet.totals': { fr: 'Totaux déclarés', en: 'Declared totals' },
  'sheet.totalEquity': { fr: 'Capital', en: 'Equity' },
  'sheet.totalGrant': { fr: 'Subventions', en: 'Grants' },
  'sheet.totalOther': { fr: 'Autres', en: 'Other' },
  'sheet.totalAll': { fr: 'Total', en: 'Total' },
  'sheet.pastPrograms': {
    fr: 'Avez-vous déjà participé à un programme d’accompagnement ?',
    en: 'Have you taken part in a support programme before?',
  },
  'sheet.currentPrograms': {
    fr: 'Participez-vous actuellement à un programme ?',
    en: 'Are you in a programme right now?',
  },
  'sheet.ceedPrograms': { fr: 'Sur CeedFlow', en: 'On CeedFlow' },
  'sheet.ceedProgramsHelp': {
    fr: 'Repris automatiquement de vos candidatures retenues.',
    en: 'Taken from your applications that were selected.',
  },
  'sheet.programs': { fr: 'Ailleurs', en: 'Elsewhere' },
  'sheet.programAdd': { fr: 'Ajouter un programme', en: 'Add a programme' },
  'sheet.programName': { fr: 'Nom du programme', en: 'Programme' },
  'sheet.programOrg': { fr: 'Organisme', en: 'Organisation' },
  'sheet.programStart': { fr: 'Début', en: 'Start' },
  'sheet.programEnd': { fr: 'Fin', en: 'End' },
  'sheet.programStatus': { fr: 'Statut', en: 'Status' },
  'sheet.needsTitle': { fr: 'Comment pouvons-nous vous accompagner ?', en: 'How can we help you?' },
  'sheet.needsHelp': {
    fr: 'Choisissez autant de besoins que vous voulez. Chacun garde ses réponses, et se met à jour seul.',
    en: 'Pick as many as you like. Each keeps its own answers, and is updated on its own.',
  },
  'sheet.needKept': { fr: 'Désélectionné — réponses conservées', en: 'Deselected — answers kept' },
  'sheet.needDelete': { fr: 'Supprimer définitivement', en: 'Delete for good' },
  'sheet.needDeleteSure': {
    fr: 'Les réponses de ce besoin seront effacées. Continuer ?',
    en: 'This need’s answers will be erased. Go ahead?',
  },
  'sheet.updated': { fr: 'Mis à jour le', en: 'Updated' },
  'sheet.raiseAmount': { fr: 'Montant recherché', en: 'Amount sought' },
  'sheet.raiseTypes': { fr: 'Type de financement', en: 'Type of funding' },
  'sheet.horizon': { fr: 'Horizon', en: 'When' },
  'sheet.raiseUse': { fr: 'Utilisation prévue des fonds', en: 'What the funds are for' },
  'sheet.mClients': { fr: 'Clients ciblés', en: 'Clients sought' },
  'sheet.mZones': { fr: 'Zones géographiques visées', en: 'Regions sought' },
  'sheet.mZoneAdd': { fr: 'Ajouter une zone…', en: 'Add a region…' },
  'sheet.mGoals': { fr: 'Objectif', en: 'Goal' },
  'sheet.mSectors': { fr: 'Secteurs clients recherchés', en: 'Client sectors sought' },
  'sheet.mentorDomains': { fr: 'Domaines recherchés', en: 'Areas sought' },
  'sheet.productAreas': { fr: 'Ce qu’il faut développer', en: 'What needs building' },
  'sheet.partnerKinds': { fr: 'Partenaires recherchés', en: 'Partners sought' },
  'sheet.hireProfiles': { fr: 'Profils recherchés', en: 'Profiles sought' },
  'sheet.hireCount': { fr: 'Nombre de recrutements envisagés', en: 'How many hires' },
  'sheet.supportKinds': { fr: 'Type d’accompagnement', en: 'Kind of support' },
  'sheet.otherDetail': { fr: 'Précisez', en: 'Tell us more' },
  'sheet.docsHelp': {
    fr: 'Privés : seuls votre organisation et l’équipe CEED les voient. 10 Mo au plus par fichier.',
    en: 'Private: only your organisation and the CEED team see them. 10 MB at most per file.',
  },
  'sheet.docUpload': { fr: 'Déposer', en: 'Upload' },
  'sheet.docReplace': { fr: 'Remplacer', en: 'Replace' },
  'sheet.docOpen': { fr: 'Ouvrir', en: 'Open' },
  'sheet.docAdded': { fr: 'ajouté le', en: 'added' },
  'sheet.docYear': { fr: 'Exercice', en: 'Year' },
  'sheet.docOthers': { fr: 'Autres documents', en: 'Other documents' },
  'sheet.docOtherLabel': { fr: 'Nom du document', en: 'Document name' },
  'sheet.docSending': { fr: 'Envoi…', en: 'Sending…' },
  'sheet.docTooBig': { fr: 'Fichier trop lourd : 10 Mo au plus.', en: 'File too large: 10 MB at most.' },
  'sheet.docOptional': {
    fr: 'Facultatif tant que la société est en cours de création.',
    en: 'Optional while the company is being registered.',
  },

  /* ---- la fiche telle qu'on la lit ---- */
  'view.figures': { fr: 'En chiffres', en: 'In figures' },
  'view.turnover': { fr: 'Chiffre d’affaires', en: 'Turnover' },
  'view.team': { fr: 'Collaborateurs', en: 'Headcount' },
  'view.clients': { fr: 'Clients actifs', en: 'Active clients' },
  'view.contracts': { fr: 'Marchés signés', en: 'Signed contracts' },
  'view.capital': { fr: 'Capital social', en: 'Share capital' },
  'view.about': { fr: 'Activité', en: 'Business' },
  'view.legal': { fr: 'Juridique', en: 'Legal' },
  'view.performance': { fr: 'Performances', en: 'Performance' },
  'view.contact': { fr: 'Coordonnées', en: 'Contact' },
  'view.founded': { fr: 'Créée le', en: 'Founded' },
  'view.foundedIn': { fr: 'Créée en', en: 'Founded in' },
  'view.places': { fr: 'Implantations', en: 'Locations' },
  'view.byYear': { fr: 'Chiffre d’affaires par exercice', en: 'Turnover by financial year' },
  'view.na': { fr: 'non disponible', en: 'not available' },
  'view.users': { fr: 'A déjà des utilisateurs ou des clients', en: 'Already has users or clients' },
  'view.noUsers': { fr: 'Pas encore d’utilisateurs', en: 'No users yet' },
  'view.patentPending': { fr: 'Brevet en cours', en: 'Patent pending' },
  'view.patentGranted': { fr: 'Brevet', en: 'Patent' },
  'view.contractsOf': { fr: 'marchés pour', en: 'contracts worth' },
  'view.offer': { fr: 'Produits et services', en: 'Products and services' },
  'view.sells': { fr: 'Vend', en: 'Sells' },
  'view.demo': { fr: 'Démo', en: 'Demo' },
  'view.catalogue': { fr: 'Catalogue', en: 'Catalogue' },
  'view.women': { fr: 'dont', en: 'of whom' },
  'view.womenWord': { fr: 'femmes', en: 'women' },
  'view.founders': { fr: 'fondateurs', en: 'founders' },
  'view.funding': { fr: 'Financements', en: 'Funding' },
  'view.raised': { fr: 'Levé en capital', en: 'Equity raised' },
  'view.grants': { fr: 'Subventions', en: 'Grants' },
  'view.otherFunding': { fr: 'Autres financements', en: 'Other funding' },
  'view.programs': { fr: 'Accompagnement', en: 'Support programmes' },
  'view.needs': { fr: 'Ce qu’elle recherche', en: 'What it is looking for' },
  'view.documents': { fr: 'Documents', en: 'Documents' },
  'view.private': { fr: 'privés — l’organisation et CEED', en: 'private — the organisation and CEED' },

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
  'org.joined': { fr: 'Vous faites déjà partie de cette organisation.', en: 'You are already on this organisation’s page.' },
  'org.pending': {
    fr: 'Cette organisation existe déjà : votre demande pour la rejoindre est envoyée à ses administrateurs (ou à CEED). Vous la verrez ici dès qu’elle sera acceptée.',
    en: 'This organisation already exists: your request to join was sent to its administrators (or to CEED). It will appear here once accepted.',
  },
  'org.created': { fr: 'Page créée.', en: 'Page created.' },
  'test.banner': { fr: 'Compte de test.', en: 'Test account.' },
  'test.bannerMore': {
    fr: 'Vous ne voyez que les programmes de test, et rien de ce que vous faites ici n’atteint une vraie startup.',
    en: 'You only see test programmes, and nothing you do here reaches a real startup.',
  },
  'org.requestWaiting': { fr: 'Demande envoyée — en attente d’acceptation', en: 'Request sent — waiting to be accepted' },
  'org.requestWithdraw': { fr: 'Retirer', en: 'Withdraw' },

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
  t: (word) => WORDS[word]?.en ?? String(word),
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
  const value = useMemo<Speaking>(() => ({ lang, setLang, t: (word) => WORDS[word]?.[lang] ?? String(word) }), [lang]);
  return <Spoken.Provider value={value}>{children}</Spoken.Provider>;
}

/** For the few places that are given the language rather than reading it. */
/* Un mot qui manquerait au dictionnaire se lit tel quel plutôt que de faire
   tomber la page : une étiquette brute vaut mieux qu'un écran blanc. */
export const say = (word: Word, lang: Lang): string => WORDS[word]?.[lang] ?? String(word);
