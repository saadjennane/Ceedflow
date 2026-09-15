# CEED — Program Builder

Production build of the prototype in `../ceed-program-builder`. This first slice covers the
programme builder and the selection funnel: **sourcing, application, evaluation, selection
committee, selection**. Everything else the prototype showed — community, campaigns, calendar,
tasks, deliverables, member space — is deliberately out of scope for now, and appears in the
sidebar and the block library as visibly unbuilt.

## Running it

```bash
npm install
npm run seed --workspace=@ceed/api   # realistic starting data; safe to re-run, it wipes first
npm run dev                          # API on :4000, web on :5173
```

Open http://localhost:5173.

No database to install: locally the API runs **PGlite** — Postgres compiled to WASM — against the
same SQL and the same migrations a server would run. Data lives in `.pgdata/`. Pointing at a real
Postgres is one environment variable:

```bash
DATABASE_URL=postgres://user:pass@host/ceed npm run dev:api
```

## Layout

```
packages/shared   domain types and zod schemas, shared by both sides
apps/api          Fastify + raw SQL, migrations in src/db/migrations
apps/web          React + TypeScript + Vite
```

## The model

**Program → Edition → Track → Phase → Block.**

- A **programme** is the parent: CEED Grow. It holds nothing that runs.
- An **edition** is one run of it: Grow 2026, its own dates, city, seats and candidates.
- A **track** is a parallel path inside an edition. Every edition has one from the start
  ("Main workflow"); extra tracks are added when a cohort splits by theme.
- A **phase** is a stage in time. Phases run in order and can be dragged to reorder.
- A **block** is a thing that happens. Blocks live in a phase and can be dragged within it or
  into another phase.

Block configuration is polymorphic and stored as JSONB, typed per block type by a zod schema in
`packages/shared/src/blocks.ts`. Adding a block type is one entry in `BLOCK_TYPES`, one schema, one
setup panel — no migration.

### The five blocks in this slice

| Block | What it holds |
| --- | --- |
| **Sourcing** | The call: dates, target, channels, who can apply. Channels feed the source list. |
| **Application** | A form the public fills in. Publishing it gives a link at `/apply/:token`; every submission creates a candidate in that track. |
| **Evaluation** | Weighted criteria and a set of evaluators. Marks become a score out of 100; a candidate's score is the average across evaluators who submitted. |
| **Selection committee** | The sitting: date, place, jury, and which candidates are reviewed. It records the meeting, not the decision. |
| **Selection** | The cut. Reads scores from an evaluation upstream, applies a rule (threshold, top N, or by hand), and publishes who moves on. |

### One Selection concept, two outputs

There is no separate "preselection". A selection either produces a **shortlist** — the funnel stays
open, and whoever passes carries on to the blocks after it — or **the cohort**, the last cut, whose
passing candidates are the startups of the edition.

Publishing writes the result onto each candidate's status and opens the gate for every block
downstream. Each decision stays reversible afterwards: change one row and that candidate updates
straight away, which is how a withdrawal or a repêchage is handled. A decision changed away from
what the rule produced is marked as changed by hand.

### Derived, not stored

The funnel counts, a block's intake, a candidate's consensus score and the completeness summaries
are all computed on read from phases, blocks, scores and outcomes. The only things stored are what
a human or a form actually entered.

## API

| Method | Path | |
| --- | --- | --- |
| GET/POST | `/api/programs` | list, create (with its first edition) |
| GET/PATCH/DELETE | `/api/programs/:id` | |
| POST | `/api/programs/:id/editions` | from a template, or copying another edition's structure |
| GET/PATCH/DELETE | `/api/editions/:id` | `GET` returns tracks, phases and blocks in one payload |
| POST | `/api/editions/:id/tracks` · PATCH/DELETE `/api/tracks/:id` | |
| POST | `/api/phases` · PATCH/DELETE `/api/phases/:id` · POST `/api/tracks/:id/phase-order` | |
| POST | `/api/blocks` · PATCH/DELETE `/api/blocks/:id` · POST `/api/blocks/:id/move` | |
| GET/POST | `/api/editions/:id/candidates` · PATCH/DELETE `/api/candidates/:id` | |
| GET | `/api/editions/:id/funnel` | counts at each funnel node |
| GET/POST | `/api/public/forms/:token` | the public application form and its submissions |
| GET | `/api/blocks/:id/evaluation` · POST `/api/blocks/:id/scores` | |
| GET | `/api/blocks/:id/committee` | |
| GET | `/api/blocks/:id/selection` · POST `.../publish`, `.../unpublish`, `.../outcome` | |

## What the seed gives you

**CEED Grow → Grow 2026**, running, with a three-phase workflow and 12 candidates who have been
scored by three evaluators. The shortlist is published (12 → 9); the final selection is configured
as top 6 but **not** published, so the last step of the funnel is there to walk through. The
application form is live — copy its link from the Application block to submit as a candidate would.

Plus **SheLeads** (a draft 2027 edition on the standard template and a completed 2025 one) and
**Impact Booster** with no edition yet.

## Design

Voltage Blue, the direction chosen from the four artefacts. Tokens in
`apps/web/src/ui/tokens.css`, light by default with a matching dark set for both the OS preference
and the explicit toggle. Archivo for display and figures, Public Sans for body, IBM Plex Mono for
anything countable. Cyan appears only in the primary gradient and on progress; semantic colour
(good / warning / critical) is separate from the accent.

## Next

1. Deliverables and RSVP as capabilities attached to blocks, not as block types.
2. Workshop and mentoring, with the block-versus-instance rule (one block, N sessions).
3. The community directory, which turns today's free-text evaluators and jury members into real
   profiles.
4. The member space: the same data read through a startup's, a mentor's and a juror's eyes.
