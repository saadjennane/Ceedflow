/**
 * L'accusé de réception d'une candidature.
 *
 * Not an act somebody launches: it answers one question — "did you get it?" —
 * and that question is asked the minute after submitting, not at the end of
 * the week. On four hundred and forty files, it is the single piece of
 * correspondence that removes the most support work.
 *
 * It is also the only letter here with no list to look at before it goes,
 * which is sound: there is exactly one recipient, they are signed in, and they
 * just pressed the button themselves. The form is not anonymous — applying
 * requires an account and membership of the organisation — so this is not a
 * way to make the platform write to a stranger.
 */
import { APPLICATION_VARIABLES, fillTemplate, firstNameOf, type ApplicationConfig } from '@ceed/shared';
import * as repo from '../db/repo.js';
import { appLink } from './deliverables.js';
import { accessFor } from './invitations.js';
import { post } from './mail.js';

export { APPLICATION_VARIABLES };

export async function acknowledge(blockId: string, candidateId: string): Promise<void> {
  const context = await repo.blockContext(blockId);
  const candidate = await repo.getCandidate(candidateId);
  if (!context || context.block.type !== 'application' || !candidate) return;

  const config = context.block.config as ApplicationConfig;
  const edition = await repo.getEditionDetail(context.editionId);
  const values = {
    prenom: firstNameOf(candidate.contactName, candidate.contactFirstName),
    // They are signed in to have applied, so this is all but always empty.
    acces: await accessFor(candidate.personId, config.access),
    startup: candidate.orgName,
    /* The programme, then the edition: "The Builders — Cohorte 1" is what an
       applicant recognises. The edition's name alone means nothing outside. */
    programme: edition ? `${edition.program.name} — ${edition.name}` : '',
    appel: context.block.name,
    lien: await appLink(),
  };

  if (config.confirmationEmail && candidate.email) {
    await post({
      kind: 'application_received',
      to: candidate.email,
      toName: candidate.contactName,
      blockId,
      candidateId,
      subject: `${values.programme} — candidature de ${candidate.orgName}`,
      body: fillTemplate(config.receivedMessage, values),
    });
  }

  /* And whoever asked to hear about each one. Addressed to CEED, so it says
     what somebody there needs — who applied, and where to read it — rather
     than being a copy of the applicant's receipt. */
  for (const address of config.notifyOnSubmit) {
    await post({
      kind: 'application_submitted',
      to: address,
      blockId,
      candidateId,
      subject: `${candidate.orgName} a candidaté — ${values.appel}`,
      body: [
        `${candidate.orgName} vient de déposer sa candidature à ${values.programme}.`,
        candidate.contactName ? `Contact : ${candidate.contactName}${candidate.email ? ` · ${candidate.email}` : ''}` : '',
        '',
        values.lien ? `Le dossier : ${values.lien}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    });
  }
}
