/**
 * Funding Intelligence, réservé à l'équipe CEED : un appel d'offres et son
 * analyse ne sont jamais montrés à un compte externe.
 */
import { dismissResultInput, funderProfilePatch, fundingActionPatch, fundingCreateTasksInput, fundingSaveInput, fundingTextInput, opportunityPatch, trackFunderInput } from '@ceed/shared';
import { dismissResult, foundResults, runFunderSearch, saveProfile, saveResult, startAllSearches, startFunderSearch } from '../services/funderSearch.js';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { one } from '../db/client.js';
import {
  addOrganization,
  changeAction,
  changeOpportunity,
  detectedFunders,
  detectedOpportunities,
  funderView,
  listFunders,
  trackFromAnalysis,
  trackFunder,
  untrackFunder,
  createFromPdf,
  createFromText,
  createTasksFromActions,
  deleteFunding,
  fundingView,
  listFunding,
  reanalyseFunding,
  runFundingAnalysis,
  runWebResearch,
  saveOpportunities,
  savedOpportunities,
  startWebResearch,
  type FundingActor,
} from '../services/funding.js';
import { workspaceGuard } from './guard.js';
import { HttpError, notFound, parse } from './util.js';

const actorOf = async (req: FastifyRequest): Promise<FundingActor> => {
  if (!req.staff) throw new HttpError(401, 'Sign in to the CEED workspace.');
  const who = await one<{ name: string }>('select name from records where id = $1', [req.staff.recordId]);
  return { recordId: req.staff.recordId, name: who?.name ?? '', role: req.staff.role };
};

/** Les traitements longs tournent à côté : la page répond, puis se met à jour. */
const later = (what: string, fn: () => Promise<void>) => {
  void fn().catch((err) => console.error(what, (err as Error).message));
};

export async function fundingRoutes(app: FastifyInstance) {
  app.addHook('preHandler', workspaceGuard());

  app.get('/api/funding/analyses', async () => listFunding());
  app.get('/api/funding/opportunities', async () => savedOpportunities());
  app.patch('/api/funding/opportunities/:id', async (req) => {
    const { id } = req.params as { id: string };
    await changeOpportunity(id, parse(opportunityPatch, req.body), await actorOf(req));
    return { ok: true };
  });

  /* Les bailleurs suivis : des organisations de l'annuaire, rôle « Funder ». */
  app.get('/api/funding/funders', async () => listFunders());
  app.get('/api/funding/detected/funders', async () => detectedFunders());
  app.get('/api/funding/detected/opportunities', async () => detectedOpportunities());
  app.get('/api/funding/funders/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    return (await funderView(id)) ?? notFound(reply, 'Funder not found.');
  });
  app.post('/api/funding/funders', async (req, reply) => {
    reply.code(201);
    return trackFunder(parse(trackFunderInput, req.body), await actorOf(req));
  });
  app.delete('/api/funding/funders/:id', async (req) => {
    const { id } = req.params as { id: string };
    await untrackFunder(id, await actorOf(req));
    return { ok: true };
  });
  /* La recherche d'opportunités, bailleur par bailleur. */
  app.patch('/api/funding/funders/:id/profile', async (req) => {
    const { id } = req.params as { id: string };
    return saveProfile(id, parse(funderProfilePatch, req.body), await actorOf(req));
  });
  app.post('/api/funding/funders/:id/search', async (req) => {
    const { id } = req.params as { id: string };
    await startFunderSearch(id, await actorOf(req));
    later('funder search', async () => void (await runFunderSearch(id)));
    return { ok: true };
  });
  app.post('/api/funding/funders/search', async (req) => {
    const ids = await startAllSearches(await actorOf(req));
    /* Un bailleur après l'autre : la recherche web est longue, et rien ne presse. */
    later('funder searches', async () => {
      for (const id of ids) await runFunderSearch(id);
    });
    return { started: ids.length };
  });
  app.get('/api/funding/found', async () => foundResults());
  app.post('/api/funding/found/:id/save', async (req) => {
    const { id } = req.params as { id: string };
    return saveResult(id, await actorOf(req));
  });
  app.post('/api/funding/found/:id/dismiss', async (req) => {
    const { id } = req.params as { id: string };
    await dismissResult(id, parse(dismissResultInput, req.body).reason, await actorOf(req));
    return { ok: true };
  });

  app.post('/api/funding/analyses/:id/organizations/:index/funder', async (req) => {
    const { id, index } = req.params as { id: string; index: string };
    return trackFromAnalysis(id, Number(index), await actorOf(req));
  });

  app.post('/api/funding/analyses', async (req, reply) => {
    const made = await createFromText(parse(fundingTextInput, req.body), await actorOf(req));
    later('funding analysis', () => runFundingAnalysis(made.id));
    reply.code(201);
    return made;
  });

  app.post('/api/funding/analyses/pdf', async (req, reply) => {
    const actor = await actorOf(req);
    const file = await req.file();
    if (!file) throw new HttpError(422, 'No file received.');
    const isPdf = file.mimetype === 'application/pdf' || file.filename.toLowerCase().endsWith('.pdf');
    if (!isPdf) throw new HttpError(422, 'Send a PDF — or paste the text.');
    const bytes = await file.toBuffer();
    if (!bytes.length) throw new HttpError(422, 'That file is empty.');
    const title = String((file.fields.title as { value?: string } | undefined)?.value ?? '').trim().slice(0, 200);
    const made = await createFromPdf({ title, filename: file.filename, mime: 'application/pdf', bytes }, actor);
    later('funding analysis', () => runFundingAnalysis(made.id));
    reply.code(201);
    return made;
  });

  app.get('/api/funding/analyses/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    return (await fundingView(id)) ?? notFound(reply, 'Analysis not found.');
  });

  app.delete('/api/funding/analyses/:id', async (req) => {
    const { id } = req.params as { id: string };
    await deleteFunding(id, await actorOf(req));
    return { ok: true };
  });

  app.post('/api/funding/analyses/:id/analyse', async (req) => {
    const { id } = req.params as { id: string };
    await reanalyseFunding(id, await actorOf(req));
    later('funding analysis', () => runFundingAnalysis(id));
    return { ok: true };
  });

  app.post('/api/funding/analyses/:id/enrich', async (req) => {
    const { id } = req.params as { id: string };
    await startWebResearch(id, await actorOf(req));
    later('funding web research', () => runWebResearch(id));
    return { ok: true };
  });

  app.post('/api/funding/analyses/:id/organizations/:index', async (req) => {
    const { id, index } = req.params as { id: string; index: string };
    return addOrganization(id, Number(index), await actorOf(req));
  });

  app.post('/api/funding/analyses/:id/opportunities', async (req) => {
    const { id } = req.params as { id: string };
    return saveOpportunities(id, parse(fundingSaveInput, req.body).opportunities, await actorOf(req));
  });

  app.patch('/api/funding/actions/:id', async (req) => {
    const { id } = req.params as { id: string };
    await changeAction(id, parse(fundingActionPatch, req.body), await actorOf(req));
    return { ok: true };
  });

  app.post('/api/funding/analyses/:id/tasks', async (req) => {
    const { id } = req.params as { id: string };
    return createTasksFromActions(id, parse(fundingCreateTasksInput, req.body), await actorOf(req));
  });
}
