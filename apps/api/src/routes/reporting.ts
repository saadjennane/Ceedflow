/**
 * Le reporting d'une édition, côté CEED : son réglage, ce qu'il a relevé, et
 * l'envoi d'un moment à la cohorte.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { editionReportingSchema, programReportingSchema } from '@ceed/shared';
import { launchMoment, reportingView, saveEditionSetup, saveProgramSetup } from '../services/reporting.js';
import { workspaceGuard } from './guard.js';
import { parse } from './util.js';

export async function reportingRoutes(app: FastifyInstance) {
  app.addHook('preHandler', workspaceGuard());

  app.get('/api/editions/:id/reporting', async (req) => {
    const { id } = req.params as { id: string };
    return reportingView(id);
  });

  /** Ce que l'édition règle elle-même : ses indicateurs, ses moments, ses lettres. */
  app.put('/api/editions/:id/reporting', async (req) => {
    const { id } = req.params as { id: string };
    await saveEditionSetup(id, parse(editionReportingSchema.partial(), req.body));
    return reportingView(id);
  });

  /** Les indicateurs du programme, que toutes ses éditions partagent. */
  app.put('/api/programs/:id/reporting', async (req) => {
    const { id } = req.params as { id: string };
    return saveProgramSetup(id, parse(programReportingSchema.partial(), req.body));
  });

  /** Envoyer un moment à la cohorte — ou relancer celles qui n'ont pas répondu. */
  app.post('/api/editions/:id/reporting/moments/:momentId/launch', async (req) => {
    const { id, momentId } = req.params as { id: string; momentId: string };
    const { reminder } = parse(z.object({ reminder: z.boolean().default(false) }), req.body ?? {});
    return launchMoment(id, momentId, reminder);
  });
}
