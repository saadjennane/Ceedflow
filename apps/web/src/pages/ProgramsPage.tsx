import type { Edition, ProgramWithEditions } from '@ceed/shared';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CreateEditionModal, CreateProgramModal } from '../pages/CreateModals';
import { api } from '../lib/api';
import { formatRange } from '../lib/format';
import { useAsync } from '../lib/useAsync';
import { Icon } from '../ui/Icon';
import { useToast } from '../ui/Overlays';
import '../ui/programs.css';

const STATUS_TONE: Record<string, string> = {
  Draft: 'badge',
  Published: 'badge info',
  Running: 'badge ok',
  Completed: 'badge',
};

export function ProgramsPage() {
  const programs = useAsync(() => api.get<ProgramWithEditions[]>('/api/programs'), 'programs');
  const [view, setView] = useState<'grid' | 'list'>(() => (localStorage.getItem('ceed.programView') as 'grid') ?? 'grid');
  const [newProgram, setNewProgram] = useState(false);
  const [newEditionFor, setNewEditionFor] = useState<ProgramWithEditions | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();

  const setViewMode = (next: 'grid' | 'list') => {
    setView(next);
    localStorage.setItem('ceed.programView', next);
  };

  const list = programs.data ?? [];
  const editionCount = list.reduce((n, p) => n + p.editions.length, 0);
  const liveCount = list.reduce((n, p) => n + p.editions.filter((e) => e.status === 'Live').length, 0);

  return (
    <>
      <header className="topbar">
        <h1>Programs</h1>
        <span className="badge">
          <span className="num">{list.length}</span> programs · <span className="num">{editionCount}</span> editions
        </span>
        <div className="spacer" />
        <div className="seg" role="group" aria-label="View">
          <button className={view === 'grid' ? 'on' : ''} onClick={() => setViewMode('grid')}>
            <Icon name="grid" size={13} /> Grid
          </button>
          <button className={view === 'list' ? 'on' : ''} onClick={() => setViewMode('list')}>
            <Icon name="list" size={13} /> List
          </button>
        </div>
        <div className="menu-anchor">
          <button className="btn primary" onClick={() => setMenuOpen((v) => !v)}>
            <Icon name="plus" /> New
            <Icon name="chevronDown" size={13} />
          </button>
          {menuOpen && (
            <>
              <div className="menu-catch" onClick={() => setMenuOpen(false)} />
              <div className="menu">
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    setNewProgram(true);
                  }}
                >
                  <Icon name="layers" />
                  <div>
                    <strong>New program</strong>
                    <span>Creates its first edition at the same time.</span>
                  </div>
                </button>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    setNewEditionFor(list[0] ?? null);
                  }}
                  disabled={!list.length}
                >
                  <Icon name="calendar" />
                  <div>
                    <strong>New edition</strong>
                    <span>Add a run to a program you already have.</span>
                  </div>
                </button>
              </div>
            </>
          )}
        </div>
      </header>

      <div className="page">
        {programs.loading && <div className="empty">Loading…</div>}
        {programs.error && <div className="empty">{programs.error}</div>}

        {!programs.loading && !list.length && (
          <div className="empty">
            <h3>No program yet</h3>
            <p>A program holds its editions. Create one and its first edition comes with it.</p>
            <button className="btn primary" onClick={() => setNewProgram(true)}>
              <Icon name="plus" /> New program
            </button>
          </div>
        )}

        {list.length > 0 && liveCount > 0 && (
          <p className="muted" style={{ margin: 0 }}>
            <span className="num">{liveCount}</span> edition{liveCount > 1 ? 's are' : ' is'} live right now.
          </p>
        )}

        {view === 'grid'
          ? list.map((program) => (
              <section key={program.id} className="prog-section">
                <div className="prog-head">
                  <span className="prog-chip" style={{ background: program.colour }} />
                  <Link to={`/programs/${program.id}`} className="prog-title">
                    {program.name}
                  </Link>
                  <span className="badge">{program.type}</span>
                  {program.partner && <span className="faint">with {program.partner}</span>}
                  <div className="spacer" />
                  <button className="btn sm ghost" onClick={() => setNewEditionFor(program)}>
                    <Icon name="plus" size={13} /> Add edition
                  </button>
                </div>
                <div className="edition-grid">
                  {program.editions.map((edition) => (
                    <EditionTile key={edition.id} edition={edition} program={program} />
                  ))}
                  {!program.editions.length && (
                    <button className="edition-tile add" onClick={() => setNewEditionFor(program)}>
                      <Icon name="plus" size={18} />
                      <span>First edition</span>
                    </button>
                  )}
                </div>
              </section>
            ))
          : (
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Program</th>
                      <th>Edition</th>
                      <th>Status</th>
                      <th>Dates</th>
                      <th>City</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.flatMap((program) =>
                      program.editions.length
                        ? program.editions.map((edition) => (
                            <tr key={edition.id} onClick={() => navigate(`/editions/${edition.id}`)} style={{ cursor: 'pointer' }}>
                              <td className="name">
                                <span className="prog-chip sm" style={{ background: program.colour }} /> {program.name}
                              </td>
                              <td>{edition.name}</td>
                              <td>
                                <span className={STATUS_TONE[edition.status]}>{edition.status}</span>
                              </td>
                              <td className="muted">{formatRange(edition.startsOn, edition.endsOn)}</td>
                              <td className="muted">{edition.city || '—'}</td>
                            </tr>
                          ))
                        : [
                            <tr key={program.id}>
                              <td className="name">
                                <span className="prog-chip sm" style={{ background: program.colour }} /> {program.name}
                              </td>
                              <td colSpan={4} className="faint">
                                No edition yet ·{' '}
                                <button className="linklike" onClick={() => setNewEditionFor(program)}>
                                  add one
                                </button>
                              </td>
                            </tr>,
                          ],
                    )}
                  </tbody>
                </table>
              </div>
            )}
      </div>

      {newProgram && (
        <CreateProgramModal
          onClose={() => setNewProgram(false)}
          onCreated={(program) => {
            toast(`${program.name} created.`);
            const edition = program.editions[0];
            if (edition) navigate(`/editions/${edition.id}`);
            else programs.reload();
          }}
        />
      )}

      {newEditionFor && (
        <CreateEditionModal
          programs={list}
          initialProgramId={newEditionFor.id}
          onClose={() => setNewEditionFor(null)}
          onCreated={(edition) => {
            toast(`${edition.name} created.`);
            navigate(`/editions/${edition.id}`);
          }}
        />
      )}
    </>
  );
}

function EditionTile({ edition, program }: { edition: Edition; program: ProgramWithEditions }) {
  return (
    <Link to={`/editions/${edition.id}`} className="edition-tile">
      <div className="edition-tile-top" style={{ background: `linear-gradient(135deg, ${program.colour}, ${program.colour}00)` }} />
      <div className="edition-tile-body">
        <div className="row">
          <span className={STATUS_TONE[edition.status]}>{edition.status}</span>
          <div className="spacer" />
        </div>
        <h3>{edition.name}</h3>
        <div className="muted" style={{ fontSize: 12.5 }}>
          {formatRange(edition.startsOn, edition.endsOn)}
        </div>
        {edition.city && (
          <div className="faint row" style={{ fontSize: 12.5, gap: 5 }}>
            <Icon name="pin" size={13} /> {edition.city}
          </div>
        )}
      </div>
    </Link>
  );
}
