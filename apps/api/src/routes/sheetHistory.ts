/**
 * Le journal d'une fiche, tenu à la porte des routes qui l'écrivent.
 *
 * A snapshot before the handler runs, another once it has answered, and the
 * difference written down with who did it. Hooked on the route groups rather
 * than called from each handler: a route added next month is in the journal
 * without anybody remembering to put it there.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { DirectoryRecord } from '@ceed/shared';
import * as dir from '../db/directory.js';
import { recordChanges, sheetDiff, type Changer } from '../db/attributes.js';
import { followSheetChange } from '../services/kpis.js';

const before = new WeakMap<FastifyRequest, DirectoryRecord>();

/**
 * @param match The route patterns that write on a sheet, `:id` being the organisation.
 * @param changer Who is asking — read once the route's own guard has run.
 */
export function keepSheetHistory(
  app: FastifyInstance,
  match: RegExp,
  changer: (req: FastifyRequest) => Promise<Changer | null>,
) {
  app.addHook('preHandler', async (req) => {
    if (req.method === 'GET' || req.method === 'HEAD') return;
    if (!match.test(req.routeOptions?.url ?? '')) return;
    const id = (req.params as { id?: string }).id;
    if (!id) return;
    const record = await dir.getRecord(id);
    if (record?.kind === 'org') before.set(req, record);
  });

  app.addHook('onSend', async (req, reply, payload) => {
    const was = before.get(req);
    if (!was) return payload;
    before.delete(req);
    if (reply.statusCode >= 400) return payload;
    /* Le journal ne doit jamais faire échouer ce qu'il raconte. */
    try {
      const now = await dir.getRecord(was.id);
      if (!now) return payload;
      const changes = sheetDiff(was, now);
      const by = changes.length ? await changer(req) : null;
      if (changes.length) await recordChanges(was.id, changes, by ?? { kind: 'system', id: null, name: '' });
      /* Un attribut suivi comme KPI : sa nouvelle valeur est celle de la période en cours. */
      await followSheetChange(was.id, changes);
    } catch (err) {
      req.log.error(err, 'sheet history');
    }
    return payload;
  });
}
