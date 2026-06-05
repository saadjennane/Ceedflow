import type { CommitteeDecision, JurorDecision } from './types'

export interface FinalDecisionResult {
  final: CommitteeDecision | 'pending'
  overridden: boolean
  retenuVotes: number
  rejeteVotes: number
  totalJurors: number
}

export function computeFinalDecision(
  jurorDecisionsForApp: JurorDecision[],
  totalJurorsInCommittee: number,
  adminOverride: CommitteeDecision | null | undefined,
): FinalDecisionResult {
  const retenuVotes = jurorDecisionsForApp.filter(d => d.decision === 'retenu').length
  const rejeteVotes = jurorDecisionsForApp.filter(d => d.decision === 'rejete').length

  if (adminOverride) {
    return {
      final: adminOverride,
      overridden: true,
      retenuVotes,
      rejeteVotes,
      totalJurors: totalJurorsInCommittee,
    }
  }

  if (rejeteVotes > 0) {
    return { final: 'rejete', overridden: false, retenuVotes, rejeteVotes, totalJurors: totalJurorsInCommittee }
  }

  if (totalJurorsInCommittee > 0 && retenuVotes === totalJurorsInCommittee) {
    return { final: 'retenu', overridden: false, retenuVotes, rejeteVotes, totalJurors: totalJurorsInCommittee }
  }

  return { final: 'pending', overridden: false, retenuVotes, rejeteVotes, totalJurors: totalJurorsInCommittee }
}

export function generateAccessToken(): string {
  // 32-char URL-safe random token
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}
