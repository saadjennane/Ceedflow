import {
  affiliationInput,
  createRecordInput,
  importInput,
  matchKey,
  parseRoles,
  signupInput,
  updateRecordInput,
  type DirectoryRecord,
  type ImportOutcome,
  type ImportReport,
  type RecordKind,
} from '@ceed/shared';
import type { FastifyInstance } from 'fastify';
import * as dir from '../db/directory.js';
import { HttpError, notFound, parse } from './util.js';

export async function directoryRoutes(app: FastifyInstance) {
  /* ---- The two lists are one query ---- */

  app.get('/api/records', async (req) => {
    const { kind, role, q } = req.query as Record<string, string | undefined>;
    const records = await dir.listRecords({ kind: kind as RecordKind, role, q });
    // An organisation with nobody attached cannot be invited, so the list says so.
    const counts = await dir.linkCounts();
    return records.map((r) => ({ ...r, contacts: counts.get(r.id) ?? 0 }));
  });

  app.get('/api/records/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    return (await dir.recordDetail(id)) ?? notFound(reply, 'Record not found.');
  });

  app.post('/api/records', async (req, reply) => {
    const input = parse(createRecordInput, req.body);
    const existing = await dir.findByName(input.kind, input.name);
    if (existing) {
      throw new HttpError(422, `${existing.name} is already in the directory.`, { name: 'Already in the directory.' });
    }
    const record = await dir.createRecord(input);
    if (input.affiliateTo) {
      const org = await dir.getRecord(input.affiliateTo);
      if (org) {
        await dir.linkRecords(
          record.kind === 'person'
            ? { personId: record.id, orgId: org.id, role: input.affiliationRole }
            : { personId: org.id, orgId: record.id, role: input.affiliationRole },
        );
      }
    }
    reply.code(201);
    return record;
  });

  app.patch('/api/records/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const patch = parse(updateRecordInput, req.body);
    return (await dir.updateRecord(id, patch)) ?? notFound(reply, 'Record not found.');
  });

  app.delete('/api/records/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    await dir.deleteRecord(id);
    reply.code(204);
  });

  /* ---- Affiliations ---- */

  app.post('/api/affiliations', async (req, reply) => {
    const input = parse(affiliationInput, req.body);
    const [person, org] = await Promise.all([dir.getRecord(input.personId), dir.getRecord(input.orgId)]);
    if (!person || person.kind !== 'person') throw new HttpError(422, 'That is not a person.');
    if (!org || org.kind !== 'org') throw new HttpError(422, 'That is not an organisation.');
    reply.code(201);
    return dir.linkRecords(input);
  });

  app.delete('/api/affiliations/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    await dir.unlinkRecords(id);
    reply.code(204);
  });

  /* ---- Import ---- */

  app.post('/api/records/import', async (req) => {
    const input = parse(importInput, req.body);
    return runImport(input.kind, input.rows, input.dryRun);
  });

  /* ---- Registering yourself ---- */

  app.post('/api/public/join', async (req) => {
    const input = parse(signupInput, req.body);

    // The person is who is filling this in, so they always exist. Joining a
    // record CEED already typed in beats creating a twin of it.
    const person =
      (await dir.findByName('person', input.contactName)) ??
      (await dir.createRecord({
        kind: 'person',
        name: input.contactName,
        origin: 'signup',
        email: input.contactEmail,
        city: input.contactCity,
        country: 'Morocco',
        bio: input.contactBio,
      }));

    if (!input.name.trim()) return { contact: person, record: null, joined: false };

    const found = await dir.findByName('org', input.name);
    const org = found
      ? await dir.updateRecord(found.id, {
          email: found.email || input.email,
          website: found.website || input.website,
          city: found.city || input.city,
          bio: found.bio || input.bio,
        })
      : await dir.createRecord({
          kind: 'org',
          name: input.name,
          roles: ['Startup'],
          origin: 'signup',
          email: input.email,
          website: input.website,
          city: input.city,
          country: 'Morocco',
          bio: input.bio,
        });

    await dir.linkRecords({ personId: person.id, orgId: org!.id, role: input.contactRole || 'Contact' });
    return { contact: person, record: org, joined: Boolean(found) };
  });

  app.get('/api/public/join/check', async (req) => {
    const { name } = req.query as { name?: string };
    if (!name?.trim()) return { found: null };
    const org = await dir.findByName('org', name);
    return { found: org ? { name: org.name, origin: org.origin } : null };
  });
}

/* ------------------------------------------------------------------ */
/* The import itself                                                   */
/* ------------------------------------------------------------------ */

const text = (row: Record<string, string>, key: string) => (row[key] ?? '').trim();

/**
 * Rows already mapped onto the model's columns. An existing record is completed
 * rather than overwritten — an import never destroys what someone typed.
 */
async function runImport(kind: RecordKind, rows: Record<string, string>[], dryRun: boolean): Promise<ImportReport> {
  const existing = await dir.listRecords({ kind });
  const known = new Map(existing.map((r) => [matchKey(r.name), r] as const));
  const people = new Map((await dir.listRecords({ kind: 'person' })).map((r) => [matchKey(r.name), r] as const));

  const outcomes: ImportOutcome[] = [];
  let created = 0;
  let merged = 0;
  let skipped = 0;
  let contacts = 0;

  for (const [index, row] of rows.entries()) {
    const name = text(row, 'name');
    const at = index + 1;
    if (!name) {
      skipped++;
      outcomes.push({ row: at, name: '', action: 'skipped', reason: 'No name in this row.', contact: null });
      continue;
    }

    const key = matchKey(name);
    const hit = known.get(key);
    const contactName = kind === 'org' ? text(row, 'contactName') : '';
    const patch = {
      email: text(row, 'email'),
      phone: text(row, 'phone'),
      city: text(row, 'city'),
      country: text(row, 'country'),
      website: text(row, 'website'),
      bio: text(row, 'bio'),
    };
    const roles = parseRoles(text(row, 'roles'), kind);
    const tags = text(row, 'tags')
      .split(/[,;|]/)
      .map((t) => t.trim())
      .filter(Boolean);

    let record: DirectoryRecord | null = hit ?? null;

    if (hit) {
      // Only fill what is empty, and add roles and tags rather than replacing them.
      const fill: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(patch)) if (v && !hit[k as keyof DirectoryRecord]) fill[k] = v;
      const nextRoles = [...new Set([...hit.roles, ...roles])];
      const nextTags = [...new Set([...hit.tags, ...tags])];
      if (nextRoles.length !== hit.roles.length) fill.roles = nextRoles;
      if (nextTags.length !== hit.tags.length) fill.tags = nextTags;

      if (!Object.keys(fill).length && !contactName) {
        skipped++;
        outcomes.push({ row: at, name, action: 'skipped', reason: 'Already in the directory, nothing to add.', contact: null });
        continue;
      }
      merged++;
      outcomes.push({
        row: at,
        name,
        action: 'merged',
        reason: Object.keys(fill).length ? `Completed: ${Object.keys(fill).join(', ')}.` : 'Contact added.',
        contact: contactName || null,
      });
      if (!dryRun) record = await dir.updateRecord(hit.id, fill);
    } else {
      created++;
      outcomes.push({
        row: at,
        name,
        action: 'created',
        reason: roles.length ? `New, as ${roles.join(' and ')}.` : 'New record.',
        contact: contactName || null,
      });
      if (!dryRun) {
        record = await dir.createRecord({ kind, name, roles, tags, origin: 'import', ...patch });
        known.set(key, record);
      } else {
        known.set(key, { id: 'preview', name } as DirectoryRecord);
      }
    }

    /* An organisation arrives with the person who holds it, in the same row. */
    if (kind === 'org' && contactName) {
      contacts++;
      if (!dryRun && record) {
        const pKey = matchKey(contactName);
        let person = people.get(pKey) ?? null;
        if (!person) {
          person = await dir.createRecord({
            kind: 'person',
            name: contactName,
            origin: 'import',
            email: text(row, 'contactEmail'),
            city: patch.city,
            country: patch.country,
          });
          people.set(pKey, person);
        }
        await dir.linkRecords({ personId: person.id, orgId: record.id, role: text(row, 'contactRole') || 'Contact' });
      }
    }
  }

  return { created, merged, skipped, contacts, outcomes };
}
