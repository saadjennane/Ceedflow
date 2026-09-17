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

Every block carries an **action**. Anything purely descriptive belongs in the program
description and the edition's own fields, not in a block.

| Block | Its action |
| --- | --- |
| **Sourcing** | Send the prospecting message and hold the channels the call runs on. Channels feed the source list on the form. |
| **Application** | Publish a form — one page, or split into named steps. Every submission creates a candidate in the track, which is what fills the pool. |
| **Evaluation** | Score startups on a weighted grid, and **put a status on each one**. That status is what the next block reads. |
| **Selection committee** | Run the sittings: create committees, fill them, let the startups book a time, let the jury score them on its own grid. Out comes a scored list with a status. |
| **Selection** | Cut the funnel: who moves to the next phase, or who forms the cohort. |

### The form: one page or several

A form is either a single scroll or a sequence of named pages. Pages hold no questions of their
own — each question carries the page it sits on, so switching layout, renaming a page or removing
one never loses a question: removing a page moves its questions to the one before it, and a
question whose page has gone still appears on the first.

The applicant always starts on *About you* (organisation, contact, email), then walks the
configured pages. A page will not let them move on until its required answers are filled, and the
server still checks every required answer across every page on submit — so a crafted request
cannot skip one. If it rejects, the applicant lands back on the first page that needs something.

### Statuses, and the difference with a Selection

An evaluation and a committee both **qualify** a startup with a configurable status
(Retained / On hold / Not retained by default). A status can be earned from the score — each
one carries a threshold — or set by hand, and a hand-made one is never overwritten when you
re-apply. A Selection is different: it **cuts**, writing the funnel decision and opening the gate
for everything downstream.

### The committee: one block, N sittings

This is the first application of the block-versus-instance rule. The grid, the statuses and the
invitation settings live on the block, so scores compare across sittings; each sitting carries its
own date, window, minutes per startup, place and jury. **Slots are never stored** — the window and
the time per startup are the truth, so moving a sitting from 25 to 20 minutes re-cuts the day.

Startups are assigned to a sitting in one go from a status the evaluation gave them, or picked by
hand from the pool. Each assigned startup gets a personal link at `/book/:token` where it confirms,
declines, or picks its time; two startups cannot take the same slot.

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
| GET | `/api/blocks/:id/committee` | sittings, slots, assignments, scores, statuses, and the pool |
| POST | `/api/blocks/:id/sessions` · PATCH/DELETE `/api/sessions/:id` | the sittings |
| POST | `/api/sessions/:id/assign` · DELETE `/api/assignments/:id` | by hand, or in one go from a status |
| GET/POST | `/api/public/book/:token` | the startup's own invitation |
| POST | `/api/blocks/:id/outcomes` · `.../outcomes/apply` | a status by hand, or every status the scores earn |
| GET/POST | `/api/blocks/:id/outreach` · `.../outreach/send` | the prospecting message and its trace |
| GET | `/api/blocks/:id/selection` · POST `.../publish`, `.../unpublish`, `.../outcome` | |

## What the seed gives you

**CEED Grow → Grow 2026**, running, with a three-phase workflow and 12 candidates.

The call went out to six partner addresses. Three evaluators scored every applicant, and the
statuses that earned (8 retained, 2 on hold, 2 not retained) are written. The shortlist is
published (12 → 9). The jury day holds two sittings — a morning panel of nine slots and an
afternoon one — filled from those statuses; the startups have booked their times except one, left
pending so the invitation screen has something to show. The jury has scored on its own grid, and
the **final selection reads the jury's scores, not the screening's**. It is configured as top 6 and
**not** published, so the last step of the funnel is there to walk through.

The application form is live and runs over three named pages — copy its link from the Application
block to submit as a candidate would, and copy an invitation link from the Jury day to book as a
startup would.

Plus **SheLeads** (a draft 2027 edition on the standard template and a completed 2025 one) and
**Impact Booster** with no edition yet.

## Design

Voltage Blue, the direction chosen from the four artefacts. Tokens in
`apps/web/src/ui/tokens.css`, light by default with a matching dark set for both the OS preference
and the explicit toggle. Archivo for display and figures, Public Sans for body, IBM Plex Mono for
anything countable. Cyan appears only in the primary gradient and on progress; semantic colour
(good / warning / critical) is separate from the accent.

## Next

1. A mail provider behind the Sourcing action — today a send is composed, addressed and recorded,
   but nothing is delivered.
2. The community directory, which turns today's free-text evaluators, jury members and pasted
   prospect addresses into real profiles and an audience query.
3. Deliverables as a capability attached to blocks, not as a block type.
4. Workshop and mentoring, reusing the sittings pattern the committee established.
5. The member space: the same data read through a startup's, a mentor's and a juror's eyes.
