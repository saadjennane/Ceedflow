/**
 * Inviter la base à candidater.
 *
 * The one letter in the product that goes to people who are not in a programme
 * yet. It carries the channel's own link, which is what lets a candidacy that
 * arrives three weeks later be traced back to the call that brought it — so
 * sending through the wrong channel, or through none, quietly loses the only
 * question this brick exists to answer.
 */
import { ACCESS_SAMPLE, applyLink, fillTemplate, firstNameOf, longDate, type SourcingConfig } from '@ceed/shared';
import * as dir from '../db/directory.js';
import * as repo from '../db/repo.js';
import { accessFor, wouldAccess } from './invitations.js';
import { suppressedAmong } from './mail.js';
import { publicOrigin } from './platform.js';
import { reachFor } from './people.js';
import { outreachView, resolveAudience } from './sourcing.js';
import type { Gate, NoticeSource, NoticeTargetRow } from './notices.js';

export const SOURCING_KIND = 'sourcing_invite';

/**
 * Everybody the filter catches, with what stands in the way of writing.
 *
 * Resolved from the directory rather than read off the view's `audience`,
 * which has already dropped the people with no address: the window promises to
 * name everybody it cannot write to, and for this one brick it was quietly
 * counting them instead — a number where every other brick gives a name to go
 * and fix.
 */
async function audienceRows(blockId: string): Promise<NoticeTargetRow[]> {
  const view = await outreachView(blockId);
  if (!view) return [];
  const records = await resolveAudience((view.block.config as SourcingConfig).audience);
  /* La même adresse que celle montrée à l'écran, par le même résolveur : une
     fenêtre qui annonce 427 destinataires et un envoi qui en trouve 13 serait
     une vérification pour rien. */
  const reach = await reachFor(records.map((r) => ({ id: r.id, kind: r.kind, name: r.name, email: r.email })));
  const held = await suppressedAmong([...reach.values()].map((r) => r.email));

  return records.map((person) => {
    const at = reach.get(person.id)!;
    return {
      subjectId: person.id,
      as: 'person' as const,
      email: at.email,
      /* À qui la lettre est adressée : la personne dont c'est la boîte. */
      toName: at.toName,
      orgName: person.name,
      blocked: !at.email.trim()
        ? 'no_email'
        : held.has(at.email.trim().toLowerCase())
          ? 'suppressed'
          : '',
    };
  });
}

/** Everybody this call has already written to. */
async function toldAbout(blockId: string): Promise<Set<string>> {
  const out = new Set<string>();
  for (const t of await repo.listNoticeTargets(blockId)) {
    if (t.kind === SOURCING_KIND && t.sentAt && !t.skipped) out.add(t.subjectId);
  }
  return out;
}

export async function sourcingRoster(blockId: string, _kind: string, only?: string): Promise<NoticeTargetRow[]> {
  const all = await audienceRows(blockId);
  if (only) return all.filter((r) => r.subjectId === only);
  const told = await toldAbout(blockId);
  return all.filter((r) => !told.has(r.subjectId));
}

/** One audience, read the same way as every other brick's. */
export async function sourcingAudiences(blockId: string): Promise<{
  audiences: { kind: string; label: string; count: number; reachable: number; told: number }[];
  ready: boolean;
}> {
  const view = await outreachView(blockId);
  if (!view) return { audiences: [], ready: false };
  const all = await audienceRows(blockId);
  const left = await sourcingRoster(blockId, SOURCING_KIND);
  const told = await toldAbout(blockId);
  return {
    audiences: [
      {
        kind: SOURCING_KIND,
        label: 'the list',
        count: all.length,
        reachable: left.filter((r) => !r.blocked).length,
        told: all.filter((r) => told.has(r.subjectId)).length,
      },
    ],
    ready: Boolean(view.form?.published),
  };
}

/** What this person's letter will actually say, filled in. */
export async function sourcingValues(
  blockId: string,
  subjectId: string,
  /** A preview asks for the words only: it must never open an account. */
  preview = false,
): Promise<Record<string, string> | null> {
  const view = await outreachView(blockId);
  if (!view) return null;
  const person = view.audience.find((p) => p.id === subjectId);
  if (!person) return null;

  const config = view.block.config as SourcingConfig;
  /* The channel's own link, or the first one. A letter sent through no channel
     still has to point somewhere — but it loses the attribution, which the
     screen says out loud rather than leaving to be discovered in the counts. */
  const channel =
    view.channels.find((c) => c.id === config.outreach.channelId) ?? view.channels[0] ?? null;
  const closes = (await repo.getBlock(view.form?.blockId ?? ''))?.config as { closesAt?: string | null } | undefined;

  /* Absolute, always. The screen's own channel links are relative because a
     browser is already somewhere; a letter is not, and "/apply/xyz" in an
     inbox is a dead string. */
  const origin = await publicOrigin();
  const form = view.form;
  const link = form && origin ? applyLink(form.token, channel?.id ?? null, origin) : '';

  /* Quand l'adresse est empruntée à qui tient la page, la lettre arrive chez
     cette personne : c'est son prénom qu'elle lit, et c'est à elle qu'une
     première connexion doit s'ouvrir — en ouvrir une au nom d'une société
     serait un compte que personne ne tient. Le nom invité, lui, reste celui
     de la société : c'est elle qu'on appelle à candidater. */
  const who = person.viaId ?? subjectId;
  const record = await dir.getRecord(who);
  return {
    prenom: firstNameOf(record?.name ?? person.name, record?.firstName),
    acces: preview ? '' : await accessFor(who, config.outreach.access),
    nom: person.name,
    lien: link,
    canal: channel?.label ?? '',
    cloture: longDate(closes?.closesAt ?? null),
  };
}

export const sourcingNotices: NoticeSource = {
  async preview(blockId, _kind, subjectId): Promise<Record<string, string>> {
    const values = await sourcingValues(blockId, subjectId, true);
    const rows = await sourcingRoster(blockId, SOURCING_KIND, subjectId);
    const config = (await repo.getBlock(blockId))?.config as SourcingConfig | undefined;
    const sample = (await wouldAccess(subjectId))
      ? ACCESS_SAMPLE(rows[0]?.email ?? '', config?.outreach.access)
      : '';
    return { ...(values ?? {}), acces: sample };
  },

  roster: sourcingRoster,

  async filter(blockId, _kind, subjectIds) {
    const here = new Map((await audienceRows(blockId)).map((r) => [r.subjectId, r]));
    return new Map(subjectIds.map((id) => [id, here.has(id) ? here.get(id)!.blocked : 'out of the audience']));
  },

  async gate(blockId): Promise<Gate> {
    const view = await outreachView(blockId);
    if (!view) return { go: false, wait: false, why: 'The block no longer exists.' };
    /* Inviting people to a form nobody can open wastes the one impression this
       call gets. Waited for rather than abandoned: publishing the form after
       scheduling the invitations is an ordinary order to do things in. */
    if (!view.form?.published) return { go: false, wait: true, why: 'The form was never published.' };
    return { go: true };
  },

  async letter(blockId, kind, subjectId, body) {
    const view = await outreachView(blockId);
    const values = await sourcingValues(blockId, subjectId);
    const person = view?.audience.find((p) => p.id === subjectId);
    if (!view || !values || !person) return null;
    const config = view.block.config as SourcingConfig;
    return {
      kind,
      to: person.email,
      toName: person.name,
      subject: fillTemplate(config.outreach.subject || view.block.name, values),
      body: fillTemplate(body, values),
    };
  },
};
