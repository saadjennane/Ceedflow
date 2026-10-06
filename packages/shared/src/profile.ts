/**
 * La fiche d'une startup : ce qui reste vrai d'un programme à l'autre.
 *
 * An application form is a snapshot of one call: what that year asked, in the
 * words it asked it. The company itself outlives the form — the sector, the
 * stage, the year it started, the size of the team — and a jury reading a
 * candidacy wants exactly those, which were nowhere to be found.
 *
 * Hence this: a short, fixed set of facts, held on the organisation's record
 * rather than in an answer. A founder fills it once; every programme they apply
 * to shows it; and because the set is fixed, "where are they up to" is a
 * question with an answer — which is what the progress bar is for.
 *
 * Ten asks, weighed the same. Weighting them would be a judgement about which
 * half of a company matters, and the honest reason for the bar is encouragement,
 * not scoring.
 */

/**
 * Où en est une startup, en cinq mots.
 *
 * A closed list rather than free text, because the question it answers is
 * "show me everything at MVP" — and free text answers that with six spellings
 * of the same word.
 */
export const ORG_STAGES = ['idea', 'prototype', 'mvp', 'customers', 'growing'] as const;
export type OrgStage = (typeof ORG_STAGES)[number];

/** Les dix choses demandées, dans l'ordre où la fiche les demande. */
export const PROFILE_ASKS = [
  'logo', 'pitch', 'sector', 'stage', 'founded', 'team', 'city', 'website', 'linkedin', 'bio',
] as const;
export type ProfileAsk = (typeof PROFILE_ASKS)[number];

/** The profile as every screen reads it — a jury's pane included. */
export interface OrgProfile {
  logoUploadId: string | null;
  /** One sentence: what the company does, in the founder's own words. */
  pitch: string;
  sector: string;
  stage: string;
  foundedYear: number | null;
  teamSize: number | null;
  city: string;
  country: string;
  website: string;
  linkedin: string;
  /** The longer description, which the record has always had. */
  bio: string;
}

/**
 * Anything with these fields on it — which is the directory record, without
 * this module having to know what else a record carries.
 */
export type ProfileSource = OrgProfile;

export const profileOf = (record: ProfileSource): OrgProfile => ({
  logoUploadId: record.logoUploadId ?? null,
  pitch: record.pitch ?? '',
  sector: record.sector ?? '',
  stage: record.stage ?? '',
  foundedYear: record.foundedYear ?? null,
  teamSize: record.teamSize ?? null,
  city: record.city ?? '',
  country: record.country ?? '',
  website: record.website ?? '',
  linkedin: record.linkedin ?? '',
  bio: record.bio ?? '',
});

/** Is this one ask answered? */
const given = (profile: OrgProfile, ask: ProfileAsk): boolean => {
  switch (ask) {
    case 'logo': return Boolean(profile.logoUploadId);
    case 'pitch': return profile.pitch.trim().length > 0;
    case 'sector': return profile.sector.trim().length > 0;
    case 'stage': return profile.stage.trim().length > 0;
    /* Zéro n'est pas vide, et c'est pour ça que c'est écrit comme ça : une
       équipe de zéro salarié est une réponse, et `!profile.teamSize` l'aurait
       comptée comme une case non remplie. */
    case 'founded': return typeof profile.foundedYear === 'number';
    case 'team': return typeof profile.teamSize === 'number';
    case 'city': return profile.city.trim().length > 0;
    case 'website': return profile.website.trim().length > 0;
    case 'linkedin': return profile.linkedin.trim().length > 0;
    case 'bio': return profile.bio.trim().length > 0;
  }
};

/** What is still missing, in the order the form asks it. */
export const profileMissing = (profile: OrgProfile): ProfileAsk[] =>
  PROFILE_ASKS.filter((ask) => !given(profile, ask));

/** How far along, out of a hundred — what the bar fills to. */
export const profileDone = (profile: OrgProfile): number =>
  Math.round(((PROFILE_ASKS.length - profileMissing(profile).length) / PROFILE_ASKS.length) * 100);

/**
 * Est-ce qu'il y a quelque chose dessus ?
 *
 * A jury is shown the profile "if it exists" — and a record nobody has touched
 * does exist as a row while being an empty sheet. Showing that sheet would put
 * ten dashes in front of a juror and read as a fault of the startup's.
 */
export const profileStarted = (profile: OrgProfile): boolean =>
  profileMissing(profile).length < PROFILE_ASKS.length;
