-- Deux formats de connaissance : une information à lire, ou une checklist —
-- une procédure dont les points se posent dans le backlog à chaque lancement.
alter table kb_versions add column if not exists format text not null default 'info';
alter table kb_versions drop constraint if exists kb_versions_format_check;
alter table kb_versions add constraint kb_versions_format_check check (format in ('info', 'checklist'));
alter table kb_versions add column if not exists items jsonb not null default '[]'::jsonb;

-- Un lancement de checklist : un groupe du backlog à son nom, qui garde la version lancée.
alter table meeting_analyses drop constraint if exists meeting_analyses_kind_check;
alter table meeting_analyses add constraint meeting_analyses_kind_check check (kind in ('meeting', 'manual', 'checklist'));
alter table meeting_analyses add column if not exists kb_version_id text references kb_versions(id) on delete set null;
