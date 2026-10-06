/**
 * La page d'une startup, ouverte par CEED dans sa propre fenêtre.
 *
 * A window rather than a panel inside the workspace, because the thing being
 * checked is a whole page: its tabs, where it opens, what is above the fold.
 * Seen through a porthole it would be a different page, and the one question
 * this answers is whether the real one reads right.
 */
import { useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAsync } from '../../lib/useAsync';
import { MemberPage, type MemberPreview } from './MemberPage';
import { type Owed } from './OwedItems';

interface AsMember {
  candidate: { id: string; orgName: string };
  who: { name: string; email: string } | null;
  programs: MemberPreview['programs'];
  panels: MemberPreview['panels'];
  owed: Owed[];
  agenda: MemberPreview['agenda'][string];
}

export function AsStartupPage() {
  const { candidateId = '' } = useParams();
  const seen = useAsync(() => api.get<AsMember>(`/api/candidates/${candidateId}/as-member`), candidateId);

  if (seen.error) return <div className="member-shell"><div className="empty">{seen.error}</div></div>;
  if (!seen.data) return <div className="member-shell" />;

  const { candidate, who, programs, panels, owed, agenda } = seen.data;
  return (
    <MemberPage
      preview={{
        who,
        orgName: candidate.orgName,
        programs,
        panels,
        owed: { [candidate.id]: owed },
        agenda: { [candidate.id]: agenda },
      }}
    />
  );
}
