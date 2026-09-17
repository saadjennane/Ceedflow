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

## Where each block's result shows up

| Block | What it produces | Where you see it |
| --- | --- | --- |
| **Sourcing** | A recorded send | **Outreach** — the trace of what went out, to how many |
| **Application** | Candidates | **Candidates** — the table, and the first step of the funnel |
| **Evaluation** | A score out of 100 and a status | **Scoring** — and the status reappears as a column in Decisions and on each seat of a committee timetable |
| **Selection committee** | A timetable and the answers to it | **Committees** — who pitches when, who confirmed |
| **Selection** | A published verdict | **Decisions** — then it spreads: the Status column in Candidates, the funnel strip, the cohort count in the edition header, and the intake of every block downstream |

## Where things happen

**The builder composes; the tabs run.** A block's drawer holds its configuration and nothing else —
that is part of building the workflow. The work itself lives in the edition's own tabs, beside
Candidates:

| Tab | What you do there |
| --- | --- |
| **Startups** | The cohort first once it exists, then the candidates and the funnel counts |
| **Outreach** | Compose and send the prospecting message |
| **Committees** | Run the sittings: jury, timetable, who pitches when |
| **Review** | One moment of the funnel: what an evaluation measured, and what the selection after it made of that |

A **moment** pairs an evaluation with the selection that cuts on it, because the two showed the same
list twice — measured against the seeded edition, 34 rows against 34 and then 19 against 19, not a
candidate apart. One table now carries both halves: the per-evaluator marks and the score on the
left, the status and the decision on the right. A row with a score and no decision, or the reverse,
is a gap you see rather than something you find by comparing two screens. An evaluation nothing cuts
on, or a selection with nothing to measure, simply shows the half it has.

The cohort is not a screen either: it is the candidates a Selection marked *Selected*, so it is a
segment of the same tab — and the one that opens first once a cohort exists, because that is what
the team looks at from then on.

It is also the only view scoped to the **edition** rather than a track: a cohort is the edition's
promotion, and a startup stays in the track it was selected on. Its table carries what the program
knows rather than what the application said — track, mentor, progress, status — each editable in
place, with a **Columns** picker to bring in application answers or drop what is not useful.
Withdrawing marks the startup withdrawn without touching the selection that chose it.

Progress is deliberately blank: it will be computed from deliverables and sessions once those
blocks exist, never typed in.

A work tab appears only when the track holds a block of its kind, so the tab bar reads out what the
edition actually does: a blank edition shows none of them. Each tab follows one shape — pick which
block you are working on, then the plan of work — and every block links through to the other side,
so Setup is one click from the work and the work one click from Setup.

The committee is the most spatial of them: the sittings across the top, **the jury above** and
**the day below in one column per stretch of hours**, with the pool as a rail alongside. A startup
is dragged from the rail onto a time, from one time to another to swap two over, or back to the
rail to take it off; a free slot can also be filled with a click, so the timetable is not
drag-only.

## The model

**Program → Edition → Track → Phase → Block.**

- A **programme** is the parent: CEED Grow. It holds nothing that runs.
- An **edition** is one run of it: Grow 2026, its own dates, city, seats and candidates.
- A **track** is a parallel path inside an edition. Every edition has one from the start
  ("Main workflow"); extra tracks are added when a cohort splits by theme. Tracks are created,
  renamed and deleted in the builder only — the work tabs get a plain switcher, and nothing at all
  while there is a single track, since one track is not a choice.
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
| **Sourcing** | Send the prospecting message, and declare the channels the call runs on — which is what the application form asks candidates to pick from. |
| **Application** | Publish a form — one page, or split into named steps. Every submission creates a candidate in the track, which is what fills the pool. |
| **Evaluation** | Score startups on a weighted grid, and **put a status on each one**. That status is what the next block reads. |
| **Selection committee** | Run the sittings: create committees, seat startups on them, let those startups book a time. It organises; it does not score. |
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

### Getting onto a Selection's list

A Selection does not only see what the funnel sends it. Three things put a startup on its list,
and the table says which:

- **The funnel** — they passed the selection before this one.
- **By hand** — the team named them. This is the repêchage and the wildcard: a startup dropped two
  phases ago can be fished back without reopening anything upstream.
- **By status** — a standing rule pulls in everyone carrying a chosen status, from *any* block
  upstream that hands statuses out, not only the one the score comes from. Reaching back to the
  screening is what lets the *On hold* pile be reconsidered at the final cut. The rule keeps
  applying as that status is given to others later.

When adding, you choose how they land: passing, not passing, or left to the score rule — which is
what makes this an override of the points rather than a second run at them. A forced outcome only
touches the startups that call brings in; someone already on the list keeps their decision. Only a
hand-added startup can be taken back off.

### Statuses, and the difference with a Selection

An evaluation and a committee both **qualify** a startup with a configurable status
(Retained / On hold / Not retained by default). A status can be earned from the score — each
one carries a threshold — or set by hand, and a hand-made one is never overwritten when you
re-apply. A Selection is different: it **cuts**, writing the funnel decision and opening the gate
for everything downstream.

### The committee: one block, N sittings

This is the first application of the block-versus-instance rule. The block holds only how startups
are invited; each sitting carries its own date, jury, place, time per startup, and **the stretches
of the day it runs** — a jury day is 09:00–12:30 and 14:00–17:00, with the lunch break simply not
being a stretch.

**Slots are never stored.** The stretches and the time per startup are the truth: 09:00–10:30 at
fifteen minutes is six slots, and changing either re-cuts the day. The timetable shows them in
order with the breaks drawn in; dragging a startup onto another time trades the two over, and
dragging one out of the timetable leaves it seated but unplaced.

The pool is whatever the selection before the phase sent through. Seat startups from it, then give
each one its personal link at `/book/:token`. How that link behaves is the committee's choice:

- **The startup picks its own time.** Its link shows what is free and it takes a slot, Calendly-
  style. Seating leaves it unplaced so the choice is genuinely its own, and two startups cannot
  hold the same slot — whoever asks second is told to pick another.
- **You give it a time, it confirms.** You build the timetable; the link shows the time you set and
  asks it to confirm or decline. Declining frees the slot and drops the startup back to *Not
  placed*, where it is obvious it still needs one.
- **No invitation.** The team arranges everything off-platform and the links stop working.

### An Evaluation in a committee's phase scores that committee

The grid stays in the Evaluation block — one block, one action. Dropping an Evaluation into a
committee's phase is what links them: its candidates become the ones seated on each sitting, and
**each sitting is marked by its own jury** rather than by a global evaluator list. The link is
resolved automatically but shown on both blocks, and can be pinned elsewhere or turned off, so the
convenience of position never becomes a hidden rule.

That is also the division of labour between the two containers: **a phase is where blocks compose,
a track is where the funnel flows.** A Selection still looks back across the whole track for the
scores it cuts on.

### One Selection concept, two outputs

There is no separate "preselection". A selection either produces a **shortlist** — the funnel stays
open, and whoever passes carries on to the blocks after it — or **the cohort**, the last cut, whose
passing candidates are the startups of the edition.

Publishing applies the rule as it stands, keeps the calls made by hand, writes the result onto each
candidate's status, and opens the gate for every block downstream.

Each decision stays reversible afterwards, and that is the ordinary way to change one: flip a row
and the candidate's status is rewritten and the blocks downstream see the change immediately — no
unpublishing, no intermediate state. A decision moved away from what the rule produced is marked as
changed by hand, and nothing ever overwrites it.

Publishing can simply be run again. When a late score or a startup added since has left a row out of
line, the screen says how many and what was announced still stands until you say otherwise. There is
no withdraw: taking a publication back reopened the gate downstream and left the cohort showing
startups the funnel no longer had, which is worse than the problem it solved.

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
| GET | `/api/blocks/:id/committee` | sittings, slots, who is seated, and the pool |
| POST | `/api/blocks/:id/sessions` · PATCH/DELETE `/api/sessions/:id` | the sittings and their hours |
| POST | `/api/sessions/:id/assign` · `/api/assignments/:id/slot` · DELETE `/api/assignments/:id` | seat, move between slots, remove |
| GET/POST | `/api/public/book/:token` | the startup's own invitation |
| POST | `/api/blocks/:id/outcomes` · `.../outcomes/apply` | a status by hand, or every status the scores earn |
| GET/POST | `/api/blocks/:id/outreach` · `.../outreach/send` | the prospecting message and its trace |
| GET | `/api/blocks/:id/selection` · POST `.../publish`, `.../unpublish`, `.../outcome` | |
| POST | `/api/blocks/:id/selection/add` · `.../remove` | put startups on the list by hand or by status |

## What the seed gives you

**CEED Grow → Grow 2026**, running, with a three-phase workflow and a funnel played out to the end:
**34 applicants → 19 shortlisted → a cohort of 12**, matching the edition's 12 seats.

The call went out to six partner addresses, and applications arrived across the whole window through
the five channels the sourcing block declared — so the Source column actually compares. Three
evaluators scored every applicant and the statuses that earned are written (Retained / On hold /
Not retained).

The jury day runs two sittings: a full day of 09:00–12:30 and 14:00–17:00 at 25 minutes (15 slots,
full), and a catch-up panel of 09:00–10:30 at 15 minutes. Sixteen startups confirmed their time,
two never answered and one pulled out — so every RSVP state is on screen, and the three who did not
pitch carry no jury score, which is exactly why they are not in the cohort.

The jury judges a pitch, not a file, so its marks are **independent of the screening**: a strong
application can land badly in the room and a modest one can shine. SportIQ goes 84 on paper to 60
after its pitch, Terra Nova 76 to 89. That is the point of giving the jury its own grid.

The final selection takes the top 11 on the jury's marks. Two startups tie at 60 on the cut line;
the ranking keeps one, and the team put the other back by hand for the twelfth seat, which shows as
**Changed by hand**. Withdraw the publication from the Decisions tab to replay the last step
yourself.

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
