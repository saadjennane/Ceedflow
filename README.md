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

## Who reviews, and with what

Two blocks, and the split is not a convenience: **people and time vary independently of criteria and
scores**. The same startups get read by three colleagues on one grid, then pitched to a jury on a
different one — that is one programme, two panels, two grids.

**The committee says who reviews, which startups they take, and — optionally — when.** It comes in
two formats. An **event** is situated: a date, hours, a slot per startup, invitations to answer.
**Spread over days** is asynchronous: people read, call and qualify from their desk, and there is no
timetable, no slot and nobody to invite. Assignment is a separate switch: every panel reviews the
whole intake, or you hand each one its own startups.

Those two switches cover what actually happens. Three colleagues reading every file is *async, no
assignment*. Splitting the calls to make is *async, assigned*. A jury day is *event, assigned*.

**The evaluation says with what grid, and what statuses come out of it.** It holds no list of
evaluators at all: who reviews is the committee's to say, always, so there are not two places to
look. An evaluation with no committee says plainly that nobody scores it rather than showing an
empty table.

That is also why the jury of a committee-scoped evaluation cannot be one list — it differs from one
panel to the next, and each panel's marks are its own.

## Applying

**You apply signed in, as one of your organisations.** That is what dissolved the identity block the
form used to carry: nobody retypes a company name the product already knows. A candidacy is
therefore a **link between an organisation and an edition** — `candidates.org_id` — and the four
identity fields are read through the directory rather than stored a second time. The payload kept
the shape it always had, so no screen had to learn about the join.

It falls out of that shape that a startup accumulates a history across editions, and that **one
application per organisation** is a rule the database can hold rather than a hope.

The block is configured over four tabs, the way the prototype had them:

| Tab | What it holds |
| --- | --- |
| **Overview** | The public link, the opening dates, the introduction and the message after sending |
| **Form** | One page or several named steps, each with its own description, and the questions |
| **Eligibility** | Conditions the applicant ticks — informative, or a gate |
| **Settings** | One application per organisation, edits after sending, and what would be emailed |

**Eligibility is informative or a gate.** Informative: the list is read, ticked, and the form carries
on either way. A gate: nothing opens until every box is ticked — there is no Continue button to
press, and the server refuses a submission that skipped it. Use it only where a criterion genuinely
disqualifies, so nobody spends twenty minutes on a form they cannot pass.

Questions can be a **file**. An attachment is uploaded as soon as it is chosen and claimed when the
form is sent, so anything never claimed is an abandoned draft. Files live in a table for now, capped
at 10 MB; a real object store replaces it without touching what points at it, since the answer holds
an upload id either way.

**Settings that wait on a mail provider say so.** The confirmation email and the notification list
are recorded as intent, and the tab states plainly that nothing leaves until one is connected.

## The directory

One internal directory behind two sidebar entries. **Organisations** and **Individuals** are the same
kind of row — `kind` is what separates them — and an **affiliation** joins one to the other. A person
belongs to zero or several organisations; an organisation is held by one or several people.

Roles are **statuses** for now: labels a record carries (Startup, Corporate, Investor, Institution,
Partner for an organisation; Mentor, Investor, Jury, CEED team for a person). Field sets per role
come later; the model leaves room and the screens do not ask for it.

### Signing in

An **account is a way into one directory record**: the profile a member fills in *is* that record,
not a second copy of the same person. Passwords are hashed with scrypt and a per-password salt, and
compared in constant time. A session is a random token whose **hash** is what the database keeps, so
reading that table is not enough to impersonate anybody; it travels in an `httpOnly` cookie, so no
script on the page can read it — the web app talks to the API through a dev proxy, which makes that
same-origin and therefore simple.

Signing in refuses an unknown email and a wrong password **with the same message**, because a
different one would tell anybody who has an account here.

`/signup` creates the account and the person. `/me` is the member space: the profile — first name,
last name, phone, city, country — and the organisation pages you look after. A person's `name` is
derived from the two halves on every write, so it stays the display form the rest of the model
already points at. Creating an organisation the team already typed in **attaches you to it** rather
than making a twin, and you may edit only the organisations you belong to.

**The CEED workspace itself is still open.** Authentication covers the member space; programs, the
builder and the directory admin have no sign-in yet.

**It starts empty, and fills two ways.** The team adds records itself — one at a time, or a fileful
at once — and people register themselves at `/join`. There is no claim: an invitation needs
somewhere to travel and a session to come back on, and neither exists yet, so a page-ownership state
machine would have been a state that never advances. What is kept is where a record came from.

Registering is a **form, not an account** — there is no password and nothing to log back into, and
the page says so rather than implying a login. The person always exists, since they are who fills it
in; the organisation only when they name one, because a mentor arrives without a startup behind them.

The duplicate is the real problem a claim was solving, and it does not go away with it. A person
registering an organisation the team already typed in **joins that record** instead of creating a
twin — verified, including that its city survives and only the empty fields are filled.

The import follows the same rule: a record already in the directory is **completed, never
overwritten**, matching on names stripped of case, accents and punctuation, and a preview says what
each row would do before anything is written. When the file carries a contact column, the
organisation arrives with the person who holds it, created and linked in the same pass.

## The committee and the evaluation are people

A jury and an evaluation panel both hold **ids of directory records**, never names. That was a real
bug, not a tidiness point: scores used to be keyed by `ev_sarah_benali`, derived from the name, so
renaming a juror silently cut them off from every mark they had given. Now a rename follows
everywhere and the marks stay put.

`evaluator_name` survives on a score as a **snapshot of who marked that day**, used only if the
record is gone. The link is the id; the name is history.

Picking people is one control shared by both, with the directory behind it and *not in the directory
yet* creating the person on the spot. **Anyone can be picked** — a real jury often includes a partner
nobody thought to tag — and those already carrying Jury or Mentor are simply offered first. Naming
somebody gives them the **Jury** role, so the role fills itself in by use instead of having to be set
before a committee can be composed.

Removing a person who still sits somewhere is refused, and the refusal says where: *sits on Jury day,
evaluates on First review, 50 scores given*. The jury lives in JSONB, so no foreign key protects a
published ranking from a hole — the check does.

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
so Setup is one click from the work and the work one click from Setup. A block's Setup opens as a
drawer **over whatever screen you are on**, so closing it never moves you; the URL carries the open
tab, the block being worked on and the block being configured as three separate things.

Marks are entered on behalf of an evaluator, since evaluators have no login yet: whose marks they
are is chosen inside the score editor, where it belongs, not above the table where it would read as
a filter. That control disappears the day evaluators sign in for themselves.

The committee is the most spatial of them: the sittings across the top, **the jury above** and
**the day below in one column per stretch of hours**, with the pool as a rail alongside. A startup
is dragged from the rail onto a time, from one time to another to swap two over, or back to the
rail to take it off; a free slot can also be filled with a click, so the timetable is not
drag-only.

## The model

**Program → Edition → Track → Phase → Block.**

- A **programme** is the parent: CEED Grow. It holds nothing that runs.
- An **edition** is one run of it: Grow 2026, its own dates, city and candidates. How many startups it takes is
  whatever its selection decides, not a number set in advance.
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

An evaluation comes in two methods, chosen in its Overview tab.

**A score** is marks on a grid, weighted into a number out of 100. A criterion is marked directly,
or it is a **section** whose children are — one level only, and the share each leaf really carries
is shown as a percentage rather than left to be worked out. *Team (30) → Complementarity (2),
Commitment (1)* is worth 20 and 10. Marks are entered out of a number, or as **stars** out of five;
a single criterion marked that way is simply an overall rating, which is why stars are a scale and
not a third method.

**A verdict** is the status itself. The panel votes in the same words the block produces — Retained,
Waitlist, Not retained — and a rule settles it: a **strict majority of the votes cast**, more than
half rather than merely the most, or **unanimity**. Anything else lands on the status marked *when
the panel does not agree*, which is what a waitlist is for. That fallback is **designated, never
inferred**: a score grid's fallback is its worst band, and "we did not agree" must not mean
"rejected". The grid stays as what to look at, shown beside the status picker so a verdict is not a
shrug.

A verdict produces no number, so a **Selection can cut on a status**: everyone carrying Retained
passes. Without that the method would lead nowhere.

An evaluation **qualifies** a startup with a configurable status (Retained / On hold / Not retained
by default). The status **follows from the score** — each one carries a threshold, and that is the
whole point of configuring them — so nothing is stored and there is no step to run: change a mark
and the status follows. Choosing another status stores that choice instead, and choosing what the
score said anyway clears it back to derived. There is no way for a score and a status to drift
apart.

A Selection is different: it **cuts**, writing the funnel decision and opening the gate for
everything downstream.

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
**34 applicants → 19 shortlisted → a cohort of 12**.

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
the ranking keeps one, and the team put the other back by hand, which shows as **Changed by hand**
and makes the cohort twelve. Withdraw the publication from the Decisions tab to replay the last step
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
