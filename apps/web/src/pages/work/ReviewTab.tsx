import {
  SELECTION_VARIABLES,
  criterionMark,
  funnelMoments,
  markCounts,
  rankAtWork,
  type Block,
  type BlockOutcome,
  type Candidate,
  type EvaluationConfig,
  type EvaluationCriterion,
  tallyVotes,
  type EvaluationMethod,
  type EvaluationScale,
  type EvaluationScore,
  type PersonRef,
  type VoteRule,
  type SelectionConfig,
  type TrackWithPhases,
} from '@ceed/shared';
import { Fragment, useState } from 'react';
import { api } from '../../lib/api';
import { formatDate, shortNames } from '../../lib/format';
import { download, toWorkbook, type Cell } from '../../lib/xlsx';
import { useAsync } from '../../lib/useAsync';
import { useAnnouncing } from './TellThem';
import { Icon } from '../../ui/Icon';
import { Modal } from '../../ui/Overlays';
import { ExportDialog } from './ExportDialog';
import { ScoreEditor } from '../builder/panels/shared';

/* ------------------------------------------------------------------ */
/* What the two endpoints return                                       */
/* ------------------------------------------------------------------ */

interface ScoringRow {
  candidate: Candidate;
  scores: (EvaluationScore & { normalised: number | null })[];
  consensus: number | null;
  outcomeId: string | null;
  proposedOutcomeId: string | null;
  overridden: boolean;
}

interface ScoringGroup {
  sessionId: string | null;
  name: string;
  heldOn: string | null;
  /** People from the directory, resolved by the view. */
  evaluators: PersonRef[];
  rows: ScoringRow[];
}

interface ScoringPayload {
  criteria: EvaluationCriterion[];
  method: EvaluationMethod;
  scale: EvaluationScale;
  /** One scale for the whole grid. */
  markedOutOf: number;
  voteRule: VoteRule;
  requireComment: boolean;
  outcomes: BlockOutcome[];
  scope: { blockId: string; name: string; assign: boolean } | null;
  groups: ScoringGroup[];
}

interface DecisionRow {
  candidate: Candidate;
  score: number | null;
  outcomeId: string | null;
  computed: 'pass' | 'wait' | 'fail';
  outcome: 'pass' | 'wait' | 'fail';
  overridden: boolean;
  stale: boolean;
}

interface DecisionPayload {
  config: SelectionConfig;
  published: boolean;
  rows: DecisionRow[];
  passCount: number;
  waitCount: number;
  failCount: number;
}

/** One line of the merged table: what was measured, and what was decided. */
/** The columns you can order the table by. */
type SortKey = 'rank' | 'orgName' | 'score' | 'status' | 'decision';

interface Line {
  /**
   * Where this startup came in the day, counting from one.
   *
   * Not stored anywhere: the sittings hand their startups back in position
   * order, so it is simply the place in that list — taken before the table
   * sorts itself by score and loses it.
   */
  rank: number;
  candidate: Candidate;
  scoring: ScoringRow | null;
  decision: DecisionRow | null;
  sessionId: string | null;
  evaluators: PersonRef[];
}

/* ------------------------------------------------------------------ */

export function ReviewTab({
  track,
  currentId,
  onSelect,
  onOpenSetup,
  onChanged,
}: {
  track: TrackWithPhases;
  currentId: string | null;
  onSelect: (id: string) => void;
  onOpenSetup: (id: string) => void;
  onChanged: () => void;
}) {
  const moments = funnelMoments(track);
  const held = useAsync(
    () => api.get<Record<string, number>>(`/api/editions/${track.editionId}/populations?trackId=${track.id}`),
    track.id,
  );
  /* The furthest moment that still has somebody in it. A moment can be live
     and empty — a jury day set up before anybody reached it — and opening
     there shows an empty table while the work is two steps back.
     While the counts are on their way, and when every moment is empty, the
     older reading stands: judged by the brick that measures, because that is
     what startups wait on, with reading order breaking the ties. */
  const peopled = held.data
    ? moments.filter((m) => (held.data![(m.evaluation ?? m.selection!).id] ?? 0) > 0)
    : [];
  const openOn =
    peopled[peopled.length - 1] ??
    (moments.length > 0
      ? moments.reduce((best, m) => {
          const rank = (x: typeof m) => rankAtWork(x.evaluation ?? x.selection!);
          return rank(m) < rank(best) ? m : best;
        })
      : null);
  const moment =
    moments.find((m) => m.id === currentId || m.evaluation?.id === currentId) ?? openOn ?? null;

  if (!moment) {
    return (
      <div className="empty">
        <h3>Nothing to review yet</h3>
        <p>Add an evaluation or a selection in the builder and its moment of the funnel appears here.</p>
      </div>
    );
  }

  return (
    <>
      <div className="work-head">
        {moments.length > 1 ? (
          <div className="work-pick">
            {moments.map((m) => (
              <button key={m.id} className={m.id === moment.id ? 'track on' : 'track'} onClick={() => onSelect(m.id)}>
                {m.label}
              </button>
            ))}
          </div>
        ) : (
          <h2 className="work-title">{moment.label}</h2>
        )}
        <div className="spacer" />
        {moment.evaluation && (
          <button className="btn sm" onClick={() => onOpenSetup(moment.evaluation!.id)}>
            <Icon name="settings" size={13} />{' '}
            {moment.selection
              ? (moment.evaluation.config as EvaluationConfig).method === 'verdict'
                ? 'What to look at'
                : 'Grid'
              : 'Setup'}
          </button>
        )}
        {moment.selection && (
          <button className="btn sm" onClick={() => onOpenSetup(moment.selection!.id)}>
            <Icon name="settings" size={13} /> {moment.evaluation ? 'Rule' : 'Setup'}
          </button>
        )}
      </div>

      <Moment
        key={moment.id}
        evaluation={moment.evaluation}
        selection={moment.selection}
        onChanged={onChanged}
      />
    </>
  );
}

/**
 * Who is behind. The count beside the tab says how many startups are covered,
 * which never tells you whose reviews are missing — this does, one figure per
 * person on the panel.
 */
/**
 * One column head per juror. The names are shortened together rather than one
 * by one, because whether "Nawal" is enough depends on who else is on the
 * panel — and the full name is always a hover away.
 */
function JurorHeads({ evaluators }: { evaluators: PersonRef[] }) {
  const shown = shortNames(evaluators.map((e) => e.name));
  return (
    <>
      {evaluators.map((person, i) => (
        <th key={person.id} style={{ textAlign: 'right' }} title={person.name}>
          {shown[i]}
        </th>
      ))}
    </>
  );
}

/**
 * Where a panel has got to.
 *
 * Twelve jurors and their tallies ran over two lines and answered the wrong
 * question: what you want first is how many have finished, not which. So the
 * summary leads, and the names follow it — shortened the way the table heads
 * are, which roughly halves the line and tells two Nawals apart in passing.
 */
function Progress({ section }: { section: { evaluators: PersonRef[]; lines: Line[] } }) {
  const total = section.lines.length;
  const shown = shortNames(section.evaluators.map((e) => e.name));
  const each = section.evaluators.map((person) => ({
    person,
    done: section.lines.filter((line) =>
      line.scoring?.scores.some((s) => s.evaluatorId === person.id && markCounts(s)),
    ).length,
  }));
  const finished = each.filter((e) => e.done === total).length;
  const all = finished === each.length;

  return (
    <span className="faint row wrap" style={{ fontSize: 12, gap: 8 }}>
      <strong style={{ color: all ? 'var(--ok)' : 'var(--ink-2)' }}>
        {all ? 'Every juror has finished' : `${finished} of ${each.length} jurors finished`}
      </strong>
      {each.map(({ person, done }, i) => (
        <span key={person.id} style={{ color: done === total ? 'var(--ok)' : undefined }} title={person.name}>
          <span className="faint">· </span>
          {shown[i]} <span className="num">{done}</span>
          <span className="num">/{total}</span>
        </span>
      ))}
    </span>
  );
}

function Moment({
  evaluation,
  selection,
  onChanged,
}: {
  evaluation: Block | null;
  selection: Block | null;
  onChanged: () => void;
}) {
  const key = `${evaluation?.id ?? ''}:${selection?.id ?? ''}`;
  const view = useAsync(
    async () => ({
      scoring: evaluation ? await api.get<ScoringPayload>(`/api/blocks/${evaluation.id}/evaluation`) : null,
      decision: selection ? await api.get<DecisionPayload>(`/api/blocks/${selection.id}/selection`) : null,
    }),
    key,
  );
  const [as, setAs] = useState<Record<string, string>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  /* Which sitting is on screen. Stacked, two panels of twenty-five startups
     made a page you scroll past to reach the second — and the jury's names sit
     at the top of each one, so reaching them meant scrolling back. */
  const [panel, setPanel] = useState<string | null>(null);
  /* Best first, because that is the question this screen answers. Clicking a
     header picks another, and clicking it again turns it round. */
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'score', dir: -1 });
  const [busy, setBusy] = useState(false);
  /* Export asks what, now that there are two of them. */
  const [exporting, setExporting] = useState(false);

  /* Telling them, one audience at a time. Never all three at once: a waiting
     list exists because the decision is not closed, and a refusal sent to
     somebody who may be fished out next week is worse than the leak that
     sending everybody together would avoid. */
  const announcing = useAnnouncing({
    block: selection ?? ({ id: '', config: {} } as Block),
    at: 'selection',
    label: 'Announce',
    bodyOf: (kind) => {
      const c = (selection?.config ?? {}) as SelectionConfig;
      return kind === 'selection_pass' ? c.messages.pass : kind === 'selection_wait' ? c.messages.wait : c.messages.fail;
    },
    variablesOf: () => SELECTION_VARIABLES,
    /* Writing to an audience settles it: the funnel, the statuses and the
       badges all move, and the screen has to say so. */
    onSent: () => {
      view.reload();
      onChanged();
    },
  });

  if (view.error) return <div className="empty">{view.error}</div>;
  if (!view.data) return <div className="empty">Loading…</div>;

  const { scoring, decision } = view.data;
  const criteria = scoring?.criteria ?? [];
  const outcomes = scoring?.outcomes ?? [];
  /** A panel that votes shows what each member said, not a number. */
  const voting = scoring?.method === 'verdict';

  // The two sides list the same people; the join is what makes one table.
  const byCandidate = new Map<string, Line>();
  for (const group of scoring?.groups ?? []) {
    for (const row of group.rows) {
      byCandidate.set(row.candidate.id, {
        rank: 0,
        candidate: row.candidate,
        scoring: row,
        decision: null,
        sessionId: group.sessionId,
        evaluators: group.evaluators,
      });
    }
  }
  for (const row of decision?.rows ?? []) {
    const line = byCandidate.get(row.candidate.id);
    if (line) line.decision = row;
    else
      byCandidate.set(row.candidate.id, {
        rank: 0,
        candidate: row.candidate,
        scoring: null,
        decision: row,
        sessionId: null,
        evaluators: [],
      });
  }

  /* The table has always been ordered by score, best first — it simply never
     said so, and there was no way to ask for anything else. The score stays the
     default, because that is what you open this screen to read. */
  const scoreOf = (l: Line) => l.scoring?.consensus ?? l.decision?.score ?? null;
  const statusOf = (l: Line) =>
    outcomes.find((o) => o.id === (l.scoring?.outcomeId ?? l.decision?.outcomeId))?.label ?? '';

  /** Null where there is nothing yet — which is not the same as a low value. */
  const cellOf = (l: Line, key: SortKey): string | number | null => {
    if (key === 'rank') return l.rank;
    if (key === 'orgName') return l.candidate.orgName;
    if (key === 'status') return statusOf(l) || null;
    // Passed above held above refused, so sorting by the decision reads down
    // the funnel rather than alphabetically by whatever it is called.
    if (key === 'decision') {
      return l.decision ? (l.decision.outcome === 'pass' ? 2 : l.decision.outcome === 'wait' ? 1 : 0) : null;
    }
    return scoreOf(l);
  };

  const ordered = (rows: Line[]) =>
    [...rows].sort((a, b) => {
      const av = cellOf(a, sort.key);
      const bv = cellOf(b, sort.key);
      const byName = a.candidate.orgName.localeCompare(b.candidate.orgName);
      /* A startup nobody has judged sinks to the bottom whichever way the
         column points. Treating "no score" as the lowest score put them at the
         top the moment you asked for the weakest first, which is the one place
         they have nothing to say. */
      if (av === null || bv === null) {
        if (av === null && bv === null) return byName;
        return av === null ? 1 : -1;
      }
      const cmp =
        typeof av === 'number' && typeof bv === 'number'
          ? av - bv
          : String(av).localeCompare(String(bv), undefined, { numeric: true });
      return (cmp * sort.dir) || byName;
    });

  const lines = ordered([...byCandidate.values()]);

  /** A header that says which way the table is ordered, and changes it. */
  const sortable = (key: SortKey, label: string, align?: 'right', style?: React.CSSProperties) => (
    <th style={{ ...style, textAlign: align, cursor: 'pointer' }}>
      <button
        className="th-sort"
        style={{ justifyContent: align === 'right' ? 'flex-end' : 'flex-start' }}
        onClick={() => setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: -1 }))}
        aria-label={`Order by ${label.toLowerCase()}`}
      >
        {label}
        {sort.key === key && <Icon name={sort.dir === 1 ? 'chevronUp' : 'chevronDown'} size={11} />}
      </button>
    </th>
  );
  /* There is a running order only when the sittings were given their startups
     by hand. Without that, the rows are the whole intake in no order anybody
     chose, and a number in front of them would claim something untrue. */
  const running = Boolean(scoring?.scope?.assign);

  /** No panel means nobody applies the grid — that is a committee's to say. */
  const noPanel = Boolean(evaluation) && (scoring?.groups.length ?? 0) === 0;

  /**
   * One table per sitting, each showing only the jury that sat on it. Pooling
   * them would give every row a column of dashes for the panels it never saw.
   */
  const sections: {
    key: string;
    name: string;
    heldOn: string | null;
    evaluators: PersonRef[];
    lines: Line[];
    /** The two days read as one list. It has no jury and no day of its own. */
    ranking?: boolean;
  }[] = (
    scoring?.groups ?? []
  ).map((group) => ({
    key: group.sessionId ?? 'all',
    name: group.name,
    heldOn: group.heldOn,
    evaluators: group.evaluators,
    // The rank is read here, off the order the server sent, because `ordered`
    // is about to replace that order with the one the table is sorted by.
    lines: ordered(
      group.rows
        .map((r, i) => {
          const line = byCandidate.get(r.candidate.id);
          return line ? { ...line, rank: i + 1 } : null;
        })
        .filter((l): l is Line => Boolean(l)),
    ),
  }));

  // Anyone on the selection's list that no sitting scored still has to be decided.
  const scored = new Set(sections.flatMap((s) => s.lines.map((l) => l.candidate.id)));
  const unscored = lines.filter((l) => !scored.has(l.candidate.id));
  if (unscored.length) {
    sections.push({
      key: 'unscored',
      name: sections.length ? 'Not scored' : '',
      heldOn: null,
      evaluators: [],
      lines: unscored,
    });
  }

  /** Which morning a startup pitched on — lost the moment the days are pooled. */
  const dayOf = new Map((scoring?.groups ?? []).map((g) => [g.sessionId ?? 'all', g.name]));

  /**
   * Les deux journées en une seule liste, classée.
   *
   * The sittings are how the work is done — each has its own jury and its own
   * morning — but the decision is taken across them: twenty-five out of fifty,
   * not twelve out of twenty-four and thirteen out of twenty-six. That list
   * exists nowhere until something builds it, and rebuilding it in a
   * spreadsheet every time is how a programme ends up deciding from a file
   * nobody can trace back.
   *
   * No juror columns: the two panels are not the same people, so pooling them
   * would give every row a column of dashes for the panel it never sat in
   * front of. The day each pitched on travels with the name instead, because
   * that is the one thing the unified list would otherwise lose.
   */
  if ((scoring?.groups.length ?? 0) > 1) {
    const byScore = [...byCandidate.values()].sort((a, b) => {
      const av = scoreOf(a);
      const bv = scoreOf(b);
      if (av === null || bv === null) {
        if (av === null && bv === null) return a.candidate.orgName.localeCompare(b.candidate.orgName);
        return av === null ? 1 : -1;
      }
      return bv - av || a.candidate.orgName.localeCompare(b.candidate.orgName);
    });
    sections.push({
      key: 'ranking',
      name: 'Final ranking',
      heldOn: null,
      evaluators: [],
      ranking: true,
      /* The place is read here, off the order by score, so re-sorting the
         table by name or by decision moves the rows without ever changing
         what each one is ranked. A startup nobody scored is not ranked at
         all — it is below the list, not last in it. */
      lines: ordered(byScore.map((line, i) => ({ ...line, rank: scoreOf(line) === null ? 0 : i + 1 }))),
    });
  }

  /* The asked-for panel, or the first — a sitting can disappear while the tab
     is open (a committee edited in another window), and falling back beats
     showing nothing with no way to say why. */
  const current = sections.some((x) => x.key === panel) ? panel : (sections[0]?.key ?? null);
  const shown = sections.length > 1 ? sections.filter((x) => x.key === current) : sections;


  /**
   * The table on the screen, as a spreadsheet: one row per startup, one column
   * per juror carrying the mark they gave out of a hundred, and the average
   * beside them.
   *
   * The juror columns are every juror of every sitting, in alphabetical order.
   * A startup only has marks from the panel it sat on, so the rest of its row
   * is empty — and finding a name among eighteen columns is what alphabetical
   * order is for, where the order they were added to a panel says nothing.
   */
  const summarySheet = (): Cell[][] => {
    const byId = new Map<string, PersonRef>();
    for (const section of sections) for (const person of section.evaluators) byId.set(person.id, person);
    const jurors = [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));

    const head: Cell[] = ['Séance'];
    if (running) head.push('Ordre');
    head.push('Startup', 'Contact');
    for (const juror of jurors) head.push(juror.name);
    head.push(voting ? 'Votes' : 'Moyenne (/100)', 'Statut');
    if (selection) head.push('Décision');

    const rows: Cell[][] = [head];
    for (const section of sections) {
      for (const line of section.lines) {
        const row: Cell[] = [section.name || '—'];
        if (running) row.push(line.rank || null);
        row.push(line.candidate.orgName, line.candidate.contactName || '');
        for (const juror of jurors) {
          const sheet = line.scoring?.scores.find((x) => x.evaluatorId === juror.id);
          // Only a mark that counts: a draft is not a reading, and a withdrawn
          // one is one the average no longer hears either.
          row.push(sheet && markCounts(sheet) ? (voting ? (outcomes.find((o) => o.id === sheet.verdict)?.label ?? '') : sheet.normalised) : null);
        }
        row.push(
          voting ? '' : (line.scoring?.consensus ?? null),
          outcomes.find((o) => o.id === line.scoring?.outcomeId)?.label ?? '',
        );
        if (selection) {
          row.push(
            line.decision
              ? line.decision.outcome === 'pass'
                ? passLabel
                : line.decision.outcome === 'wait'
                  ? waitLabel
                  : failLabel
              : '',
          );
        }
        rows.push(row);
      }
    }
    return rows;
  };

  /**
   * Every sheet the panels hold, one row per juror per startup — including the
   * ones nobody has filled in. A table that only carries what exists answers
   * "what did they say" and not "who is missing", and on a jury day the second
   * question is the one being asked.
   */
  const detailSheet = (): Cell[][] => {
    const marked = criteria;
    const outOf = scoring!.scale === 'stars' ? 5 : scoring!.markedOutOf;

    const head: Cell[] = ['Séance', 'Date'];
    if (running) head.push('Ordre');
    head.push('Startup', 'Contact', 'Juré', 'Statut de la fiche');
    for (const criterion of marked) {
      head.push(`${criterion.label} (/${outOf})`);
      for (const child of criterion.children) head.push(`${criterion.label} · ${child.label}`);
    }
    head.push(voting ? 'Verdict' : `Note (/100)`, 'Commentaire', 'Envoyée le');

    const rows: Cell[][] = [head];
    for (const section of sections) {
      for (const line of section.lines) {
        // Every juror of the sitting, not only those who answered.
        for (const juror of section.evaluators.length ? section.evaluators : [null]) {
          const sheet = juror ? line.scoring?.scores.find((x) => x.evaluatorId === juror.id) : undefined;
          const state = !sheet ? 'Pas encore' : sheet.withdrawnAt ? 'Retirée' : sheet.submittedAt ? 'Envoyée' : 'Brouillon';
          const row: Cell[] = [section.name || '—', section.heldOn ? formatDate(section.heldOn) : ''];
          if (running) row.push(line.rank || null);
          row.push(line.candidate.orgName, line.candidate.contactName || '', juror?.name ?? '—', state);
          for (const criterion of marked) {
            row.push(sheet ? criterionMark(criterion, sheet.marks) : null);
            for (const child of criterion.children) row.push(sheet?.marks[child.id] ?? null);
          }
          row.push(
            voting
              ? (outcomes.find((o) => o.id === sheet?.verdict)?.label ?? '')
              : (sheet?.normalised ?? null),
            sheet?.comment ?? '',
            sheet?.submittedAt ? formatDate(sheet.submittedAt.slice(0, 10)) : '',
          );
          rows.push(row);
        }
      }
    }

    return rows;
  };

  /* Everything in both sheets is already on the screen, so the button asks the
     server for nothing. */
  const exportSheets = () => {
    if (!scoring) return;
    const name = `${evaluation?.name ?? 'Evaluation'} — ${new Date().toISOString().slice(0, 10)}.xlsx`;
    download(
      toWorkbook([
        { name: 'Synthèse', rows: summarySheet() },
        { name: 'Fiches', rows: detailSheet() },
      ]),
      name.replace(/[/\\:*?"<>|]/g, '-'),
    );
  };

  const reload = () => {
    view.reload();
    onChanged();
  };

  const setStatus = async (candidateId: string, outcomeId: string) => {
    if (!evaluation) return;
    await api.post(`/api/blocks/${evaluation.id}/outcomes`, { candidateId, outcomeId });
    reload();
  };

  const setDecision = async (candidateId: string, outcome: 'pass' | 'wait' | 'fail') => {
    if (!selection) return;
    setBusy(true);
    try {
      await api.post(`/api/blocks/${selection.id}/selection/outcome`, { candidateId, outcome });
      reload();
    } finally {
      setBusy(false);
    }
  };


  /* Ce qui a été dit, puis démenti.
     Not "never told": an audience you have not written to yet is the ordinary
     state of this screen for days at a time, and counting it as a discrepancy
     would put a warning on the wall permanently. Who is still owed a letter is
     a question the sending panel answers, audience by audience, with names. */
  const outOfLine = (decision?.rows ?? []).filter((r) => r.stale).length;

  const cfg = decision?.config;
  // The rule in the words the jury used, rather than a number nobody set here.
  const passing = (cfg?.passOutcomeIds ?? [])
    .map((id) => outcomes.find((o) => o.id === id)?.label)
    .filter((label): label is string => Boolean(label));
  const passLabel = cfg?.passLabel ?? 'Passed';
  const failLabel = cfg?.failLabel ?? 'Not selected';
  const waitLabel = cfg?.waitLabel ?? 'Waiting list';
  /* Le compteur, pas le bouton.
     The funnel shows a third figure only where there is one to show — a column
     reading nought beside two real counts says nothing. The decision itself is
     another matter: holding a startup back is a thing somebody does by hand,
     most often because the deliberation is not closed, and a rule naming a
     holding outcome is not a condition for it. */
  const waits = Boolean(cfg?.waitOutcomeIds?.length) || (decision?.waitCount ?? 0) > 0;

  return (
    <>
      <p className="blurb faint" style={{ margin: 0, fontSize: 12.5 }}>
        {evaluation && selection ? (
          <>
            On the left, what <strong>{evaluation.name}</strong> measured. On the right, what{' '}
            <strong>{selection.name}</strong> made of it —{' '}
            {passing.length ? passing.join(' and ') + ' move on' : 'nothing moves on yet'}.
          </>
        ) : evaluation ? (
          <>Nothing cuts on this evaluation yet — it measures and gives a status, and stops there.</>
        ) : (
          <>Nothing measures for this selection, so the cut is yours to make row by row.</>
        )}
      </p>

      {decision && (
        <div className="funnel">
          <div className="funnel-step">
            <div className="eyebrow">Reviewed</div>
            <div className="n">{decision.rows.length}</div>
          </div>
          <div className="funnel-arrow">
            <Icon name="arrowRight" size={16} />
          </div>
          <div className="funnel-step" style={{ borderColor: 'var(--ok)' }}>
            <div className="eyebrow">{passLabel}</div>
            <div className="n" style={{ color: 'var(--ok)' }}>
              {decision.passCount}
            </div>
          </div>
          {waits && (
            <div className="funnel-step" style={{ borderColor: 'var(--warn)' }}>
              <div className="eyebrow">{waitLabel}</div>
              <div className="n" style={{ color: 'var(--warn)' }}>
                {decision.waitCount}
              </div>
            </div>
          )}
          <div className="funnel-step">
            <div className="eyebrow">{failLabel}</div>
            <div className="n faint">{decision.failCount}</div>
          </div>
        </div>
      )}

      {decision?.published && cfg?.publishedAt && (
        <div className="callout ok">
          <Icon name="check" size={15} />
          <div style={{ flex: 1 }}>
            <strong>First told on {formatDate(cfg.publishedAt)}.</strong> Each audience is settled as you write to it;
            the blocks downstream follow the rule as it stands, not what was said that day.
          </div>
        </div>
      )}

      {announcing.warning}

      {decision?.published && outOfLine > 0 && (
        <div className="callout warn">
          <Icon name="alert" size={15} />
          <div>
            <strong>
              {outOfLine} row{outOfLine === 1 ? '' : 's'} moved since they were told.
            </strong>{' '}
            A late score, or a startup added since. The blocks downstream already follow the new reading; writing to
            that audience again is what brings the record and their own statuses back in line with it.
          </div>
        </div>
      )}

      <div className="row wrap">
        <span className="badge num">{lines.length} candidates</span>
        {scoring && (
          <span className="badge">
            <span className="num">{lines.filter((l) => l.scoring?.consensus !== null && l.scoring).length}</span> scored
          </span>
        )}
        <div className="spacer" />
        {scoring && sections.length > 0 && (
          <button className="btn sm" onClick={() => setExporting(true)} title="A spreadsheet, or one sheet per juror">
            <Icon name="file" size={13} /> Export
          </button>
        )}
        {announcing.button}
      </div>

      {noPanel ? (
        <div className="empty">
          <h3>Nobody scores {evaluation!.name}</h3>
          <p>
            Who reviews is a committee&apos;s to say — an event with a date, or work spread over days. Add one in this
            phase and its panels appear here.
          </p>
        </div>
      ) : !lines.length ? (
        <div className="empty">
          <h3>Nobody has reached this step</h3>
          <p>Candidates arrive once they pass the selection before it.</p>
        </div>
      ) : (
        <>
        {/* One tab per sitting. Each panel has its own jury and its own
            startups, so they were never one table — only one page, which is
            what made the second one a scroll away. */}
        {sections.length > 1 && (
          <div className="drawer-tabs" style={{ padding: 0 }} role="tablist">
            {sections.map((section) => (
              <button
                key={section.key}
                role="tab"
                aria-selected={section.key === current}
                className={section.key === current ? 'tab on' : 'tab'}
                onClick={() => setPanel(section.key)}
              >
                {section.name || 'All'}
                <span className="badge num" style={{ marginLeft: 6 }}>
                  {section.lines.length}
                </span>
              </button>
            ))}
          </div>
        )}

        {shown.map((section) => {
          /* A sitting numbers the order they pitched in; the final ranking
             numbers the ranking. Either way there is a number in front. */
          const numbered = running || Boolean(section.ranking);
          return (
          <section key={section.key} className="stack" style={{ gap: 8 }}>
            {section.name && (
              <div className="row wrap">
                <strong style={{ fontFamily: 'var(--display)', fontSize: 13.5 }}>{section.name}</strong>
                {section.heldOn && (
                  <span className="faint" style={{ fontSize: 12 }}>
                    {formatDate(section.heldOn)}
                  </span>
                )}
                <span className="badge num">
                  {section.lines.length} startup{section.lines.length === 1 ? '' : 's'}
                </span>
                {section.evaluators.length > 0 ? (
                  <Progress section={section} />
                ) : section.ranking ? (
                  <span className="faint" style={{ fontSize: 12 }}>
                    Both days together, best first. The marks stay on each day’s own tab.
                  </span>
                ) : (
                  <span className="badge warn">No jury scored these</span>
                )}
              </div>
            )}

            <div className="table-wrap tall">
              <table className="data score-table">
                <thead>
                  {evaluation && selection && (
                    <tr>
                      <th style={{ borderBottom: 0 }} colSpan={numbered ? 2 : 1} />
                      <th style={{ borderBottom: 0, textAlign: 'center', color: 'var(--blue)' }}>
                        {selection.name}
                      </th>
                      {/* Everything the evaluation owns now sits together: its
                          score, the status it earned, the way in to the marks,
                          and the marks themselves. */}
                      <th
                        colSpan={section.evaluators.length + 3}
                        style={{
                          borderBottom: 0,
                          textAlign: 'center',
                          color: 'var(--blue)',
                          borderLeft: '1px solid var(--line-strong)',
                        }}
                      >
                        {evaluation.name}
                      </th>
                    </tr>
                  )}
                  <tr>
                    {/* The running order of the day, as a line number rather
                        than a column of its own weight. It is here for one
                        job: a pile of paper sheets comes back in the order the
                        startups pitched, and finding each one in a table
                        sorted by score is what makes copying them out slow. */}
                    {numbered && (
                      <th style={{ width: 34, textAlign: 'right', cursor: 'pointer' }}>
                        <button
                          className="th-sort"
                          style={{ justifyContent: 'flex-end' }}
                          onClick={() =>
                            setSort((x) => (x.key === 'rank' ? { key: 'rank', dir: x.dir === 1 ? -1 : 1 } : { key: 'rank', dir: 1 }))
                          }
                          title={section.ranking ? 'Their place across both days' : 'The order they pitched in'}
                          aria-label={
                            section.ranking ? 'Order by their place' : 'Order by the order they pitched in'
                          }
                        >
                          #
                          {sort.key === 'rank' && <Icon name={sort.dir === 1 ? 'chevronUp' : 'chevronDown'} size={11} />}
                        </button>
                      </th>
                    )}
                    {sortable('orgName', 'Candidate')}
                    {/* The decision first, then what it was made on. Reading a
                        row means starting at the verdict and going right for
                        the reasons — which is the order the work happens in,
                        and it spares a scroll past twenty jurors to reach the
                        one control you came for. */}
                    {selection && sortable('decision', 'Decision')}
                    {scoring &&
                      sortable('score', voting ? 'Votes' : 'Score', 'right', {
                        borderLeft: selection ? '1px solid var(--line-strong)' : undefined,
                      })}
                    {evaluation && sortable('status', 'Status')}
                    <th />
                    {/* A juror's own column is not sortable: their marks are one
                        panel's reading, not an order the table is kept in. */}
                    <JurorHeads evaluators={section.evaluators} />
                  </tr>
                </thead>
                <tbody>
                  {section.lines.map((line) => {
                    const me =
                      section.evaluators.find((e) => e.id === as[section.key]) ?? section.evaluators[0] ?? null;
                    const open = openId === `${section.key}:${line.candidate.id}`;
                    return (
                      <Fragment key={line.candidate.id}>
                        <tr>
                          {numbered && (
                            <td className="score muted" style={{ textAlign: 'right' }}>
                              {line.rank || '—'}
                            </td>
                          )}
                          <td className="name">
                            {line.candidate.orgName}
                            {/* Which morning this was, since the pooled list is
                                the one place that cannot be read off the tab. */}
                            {section.ranking && dayOf.get(line.sessionId ?? 'all') && (
                              <span className="faint" style={{ marginLeft: 7, fontSize: 11.5, fontWeight: 400 }}>
                                {dayOf.get(line.sessionId ?? 'all')}
                              </span>
                            )}
                            {line.decision?.stale && (
                              <span className="badge warn" style={{ marginLeft: 7 }} title="The rule now says otherwise">
                                Rule moved on
                              </span>
                            )}
                          </td>

                          {selection && (
                            <td style={{ width: 280 }}>
                              {line.decision ? (
                                <div className="seg" role="group">
                                  <button
                                    className={line.decision.outcome === 'pass' ? 'on' : ''}
                                    disabled={busy}
                                    onClick={() => setDecision(line.candidate.id, 'pass')}
                                  >
                                    {passLabel}
                                  </button>
                                  {/* Always offered: this is the answer you
                                      reach for when the room has not finished
                                      deciding, and it cannot wait on a setting
                                      made in another screen. */}
                                  <button
                                    className={line.decision.outcome === 'wait' ? 'on' : ''}
                                    disabled={busy}
                                    onClick={() => setDecision(line.candidate.id, 'wait')}
                                  >
                                    {waitLabel}
                                  </button>
                                  <button
                                    className={line.decision.outcome === 'fail' ? 'on' : ''}
                                    disabled={busy}
                                    onClick={() => setDecision(line.candidate.id, 'fail')}
                                  >
                                    {failLabel}
                                  </button>
                                </div>
                              ) : (
                                <span className="faint">not on this list</span>
                              )}
                            </td>
                          )}

                          {scoring && (
                            <td
                              className="score"
                              style={{
                                textAlign: 'right',
                                borderLeft: selection ? '1px solid var(--line-strong)' : undefined,
                              }}
                            >
                              {voting ? (
                                (() => {
                                  const tally = tallyVotes(
                                    (line.scoring?.scores ?? [])
                                      .filter(markCounts)
                                      .map((s) => s.verdict),
                                    outcomes,
                                    scoring.voteRule,
                                  );
                                  if (!tally.cast) return <span className="faint">no vote</span>;
                                  return (
                                    <span
                                      className="faint num"
                                      title={
                                        tally.split
                                          ? `The panel did not agree — ${scoring.voteRule === 'unanimous' ? 'unanimity' : 'a majority'} was needed`
                                          : undefined
                                      }
                                    >
                                      {tally.votes}/{tally.cast}
                                      {tally.split ? ' · split' : ''}
                                    </span>
                                  );
                                })()
                              ) : (
                                (line.scoring?.consensus ?? '—')
                              )}
                            </td>
                          )}

                          {evaluation && (
                            <td>
                              <select
                                className="status-select"
                                value={line.scoring?.outcomeId ?? ''}
                                disabled={!line.scoring || !outcomes.length}
                                onChange={(e) => setStatus(line.candidate.id, e.target.value)}
                              >
                                <option value="" disabled>
                                  —
                                </option>
                                {outcomes.map((o) => (
                                  <option key={o.id} value={o.id}>
                                    {o.label}
                                  </option>
                                ))}
                              </select>
                            </td>
                          )}

                          {/* No bar beside it. The table is sorted by score,
                              so the ranking already draws the comparison a bar
                              was there to draw — and since Decision moved to
                              the front, the bar sat two columns away from the
                              number it stood for. */}
                          <td style={{ width: 44 }}>
                            {line.scoring && criteria.length > 0 && (
                              <div className="row" style={{ gap: 7 }}>
                                <button
                                  className="btn ghost icon sm"
                                  disabled={!me}
                                  title={me ? 'Enter marks' : 'No jury on this sitting'}
                                  aria-label="Score"
                                  onClick={() => setOpenId(open ? null : `${section.key}:${line.candidate.id}`)}
                                >
                                  <Icon name={open ? 'chevronDown' : 'edit'} size={13} />
                                </button>
                              </div>
                            )}
                          </td>

                          {section.evaluators.map((person, i) => {
                            const score = line.scoring?.scores.find((s) => s.evaluatorId === person.id);
                            const voted = score && markCounts(score) ? outcomes.find((o) => o.id === score.verdict) : null;
                            return (
                              <td key={person.id} className="score muted" style={{ textAlign: 'right' }}>
                                {voting ? (
                                  voted ? (
                                    <span className={voted.tone === 'neutral' ? 'badge' : `badge ${voted.tone}`}>
                                      {voted.label}
                                    </span>
                                  ) : (
                                    '—'
                                  )
                                ) : score && markCounts(score) ? (
                                  score.normalised
                                ) : (
                                  '—'
                                )}
                              </td>
                            );
                          })}
                        </tr>

                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Outside the table on purpose. A div inside a tbody is invalid,
                and in a cell it inherited the horizontal scroll twenty jurors
                force — you scrolled right to read a column and the sheet you
                were filling went with it. Entering marks is a task of its own:
                six criteria, a comment, and a name that must not be the wrong
                one. */}
            {(() => {
              const line = section.lines.find((l) => openId === `${section.key}:${l.candidate.id}`);
              const me = section.evaluators.find((e) => e.id === as[section.key]) ?? section.evaluators[0] ?? null;
              if (!line || !evaluation || !me) return null;
              return (
                <Modal
                  wide
                  title={line.candidate.orgName}
                  subtitle={`${evaluation.name}${section.name ? ` · ${section.name}` : ''}`}
                  onClose={() => setOpenId(null)}
                >
                  <ScoreEditor
                    key={me?.id}
                    blockId={evaluation.id}
                    sessionId={line.sessionId ?? undefined}
                    candidate={line.candidate}
                    criteria={criteria}
                    evaluator={me!}
                    method={scoring?.method}
                    scale={scoring?.scale}
                    markedOutOf={scoring?.markedOutOf}
                    outcomes={outcomes}
                    evaluators={section.evaluators}
                    onEvaluator={(id) => setAs((a) => ({ ...a, [section.key]: id }))}
                    requireComment={scoring?.requireComment}
                    existing={line.scoring?.scores.find((s) => s.evaluatorId === me!.id)}
                    onSaved={() => {
                      setOpenId(null);
                      view.reload();
                    }}
                  />
                </Modal>
              );
            })()}
          </section>
          );
        })}
        </>
      )}

      {announcing.windows}

      {exporting && scoring && (
        <ExportDialog
          blockName={evaluation?.name ?? ''}
          criteria={scoring.criteria}
          scale={scoring.scale}
          markedOutOf={scoring.markedOutOf}
          /* Every juror of every sitting: a sheet is one person's paper, and
             which morning they sat on is not a reason to leave them out. */
          evaluators={[...new Map(sections.flatMap((x) => x.evaluators).map((e) => [e.id, e])).values()]}
          /* Par séance, parce qu'une fiche porte le jour où la startup est
             passée — et que ce jour-là n'est connu que de la séance. Le
             classement unifié est écarté : il reprend tout le monde. */
          rows={sections
            .filter((x) => !x.ranking && x.key !== 'unscored')
            .flatMap((x) =>
              x.lines
                .filter((l) => l.scoring)
                .map((l) => ({
                  id: l.candidate.id,
                  orgName: l.candidate.orgName,
                  heldOn: x.heldOn,
                  scores: l.scoring!.scores,
                })),
            )}
          onSpreadsheet={exportSheets}
          onClose={() => setExporting(false)}
        />
      )}

      <p className="faint" style={{ margin: 0, fontSize: 12 }}>
        A status follows from the score on its own; choose another and it sticks. A decision can always be changed by
        hand, whatever the rule says — every block downstream follows immediately, with no second step. The startup's
        own status follows when you write to the audience it belongs to.
      </p>

    </>
  );
}
