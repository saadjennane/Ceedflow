-- Les rappels d'un One to One : la veille de la séance, et le compte rendu
-- qui tarde. Chacun part une fois — noté ici au moment d'être réclamé, pour
-- que deux passages du même travail n'écrivent pas deux fois.
alter table one_to_one_meetings add column if not exists eve_reminded_at timestamptz;
alter table one_to_one_meetings add column if not exists report_reminded_at timestamptz;
