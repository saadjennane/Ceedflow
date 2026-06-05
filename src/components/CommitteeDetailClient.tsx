'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft, Plus, Trash2, Copy, Check, ExternalLink, Loader2, X } from 'lucide-react'
import type {
  Committee, CommitteeApplication, CommitteeJuror, JurorDecision, JurorRating, Application, Juror, CommitteeStatus, CommitteeDecision,
} from '@/lib/types'
import { computeFinalDecision, generateAccessToken } from '@/lib/committees'

const STATUS_OPTIONS: { value: CommitteeStatus; label: string }[] = [
  { value: 'draft', label: 'Brouillon' },
  { value: 'active', label: 'Actif' },
  { value: 'closed', label: 'Clôturé' },
]

type AppLite = Pick<Application, 'id' | 'startup_name' | 'sector' | 'stage' | 'status' | 'logo_url'>

export default function CommitteeDetailClient({
  committee,
  committeeApps,
  committeeJurors,
  decisions,
  ratings,
  allApps,
  allJurors,
  currentUserId,
}: {
  committee: Committee
  committeeApps: CommitteeApplication[]
  committeeJurors: CommitteeJuror[]
  decisions: JurorDecision[]
  ratings: JurorRating[]
  allApps: AppLite[]
  allJurors: Juror[]
  currentUserId: string
}) {
  const router = useRouter()
  const supabase = createClient()
  const [name, setName] = useState(committee.name)
  const [description, setDescription] = useState(committee.description || '')
  const [status, setStatus] = useState<CommitteeStatus>(committee.status)
  const [savingMeta, setSavingMeta] = useState(false)

  const [appPickerOpen, setAppPickerOpen] = useState(false)
  const [jurorPickerOpen, setJurorPickerOpen] = useState(false)
  const [copiedToken, setCopiedToken] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const appsById = useMemo(() => new Map(allApps.map(a => [a.id, a])), [allApps])
  const jurorsById = useMemo(() => new Map(allJurors.map(j => [j.id, j])), [allJurors])

  const presentAppIds = new Set(committeeApps.map(ca => ca.application_id))
  const presentJurorIds = new Set(committeeJurors.map(cj => cj.juror_id))

  const availableApps = allApps.filter(a => !presentAppIds.has(a.id))
  const availableJurors = allJurors.filter(j => !presentJurorIds.has(j.id))

  const updateMeta = async (patch: { name?: string; description?: string | null; status?: CommitteeStatus }) => {
    setSavingMeta(true)
    await supabase.from('committees').update(patch).eq('id', committee.id)
    setSavingMeta(false)
    router.refresh()
  }

  const addAppToCommittee = async (applicationId: string) => {
    await supabase.from('committee_applications').insert({
      committee_id: committee.id,
      application_id: applicationId,
    })
    setAppPickerOpen(false)
    router.refresh()
  }

  const removeAppFromCommittee = async (ca: CommitteeApplication) => {
    await supabase.from('committee_applications').delete().eq('id', ca.id)
    router.refresh()
  }

  const addJurorToCommittee = async (jurorId: string) => {
    const token = generateAccessToken()
    await supabase.from('committee_jurors').insert({
      committee_id: committee.id,
      juror_id: jurorId,
      access_token: token,
    })
    setJurorPickerOpen(false)
    router.refresh()
  }

  const removeJurorFromCommittee = async (cj: CommitteeJuror) => {
    await supabase.from('committee_jurors').delete().eq('id', cj.id)
    router.refresh()
  }

  const setAdminOverride = async (ca: CommitteeApplication, decision: CommitteeDecision | null) => {
    await supabase.from('committee_applications').update({
      admin_override_decision: decision,
      admin_override_by: decision ? currentUserId : null,
      admin_override_at: decision ? new Date().toISOString() : null,
    }).eq('id', ca.id)
    router.refresh()
  }

  const deleteCommittee = async () => {
    setDeleting(true)
    await supabase.from('committees').delete().eq('id', committee.id)
    setDeleting(false)
    router.push('/admin/committees')
  }

  const copyLink = async (token: string) => {
    const url = `${window.location.origin}/jury/${token}`
    await navigator.clipboard.writeText(url)
    setCopiedToken(token)
    setTimeout(() => setCopiedToken(null), 1500)
  }

  // Per-app stats: avg juror rating, decisions, final
  const appStats = useMemo(() => {
    const map = new Map<string, {
      avgScore: number | null
      scoreCount: number
      jurorDecisionsForApp: JurorDecision[]
    }>()
    for (const ca of committeeApps) {
      const scores = ratings.filter(r => r.application_id === ca.application_id).map(r => r.score)
      const avg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null
      const decisionsForApp = decisions.filter(d => d.application_id === ca.application_id)
      map.set(ca.application_id, { avgScore: avg, scoreCount: scores.length, jurorDecisionsForApp: decisionsForApp })
    }
    return map
  }, [committeeApps, ratings, decisions])

  return (
    <div>
      <Link href="/admin/committees" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-blue-700 mb-4">
        <ArrowLeft size={16} /> Retour aux comités
      </Link>

      {/* Header / meta */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 mb-6">
        <div className="flex items-start justify-between gap-4 mb-3">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => { if (name.trim() && name !== committee.name) updateMeta({ name: name.trim() }) }}
            className="text-2xl font-bold flex-1 border border-transparent hover:border-gray-200 rounded px-2 py-1 focus:border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <select
            value={status}
            onChange={(e) => { const v = e.target.value as CommitteeStatus; setStatus(v); updateMeta({ status: v }) }}
            className="text-sm border border-gray-300 rounded-lg px-3 py-2"
          >
            {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <button
            onClick={() => setConfirmDelete(true)}
            className="p-2 text-gray-400 hover:text-red-600 border border-gray-200 rounded-lg"
            title="Supprimer le comité"
          >
            <Trash2 size={16} />
          </button>
        </div>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => { if (description.trim() !== (committee.description || '')) updateMeta({ description: description.trim() || null }) }}
          placeholder="Description (optionnel)…"
          rows={2}
          className="w-full text-sm text-gray-600 border border-transparent hover:border-gray-200 rounded px-2 py-1 focus:border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />
        {savingMeta && <div className="text-xs text-gray-400 mt-1">Enregistrement…</div>}
      </div>

      {/* Jurors */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Jurys ({committeeJurors.length})</h2>
          <button
            onClick={() => setJurorPickerOpen(o => !o)}
            className="flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus size={14} />
            Ajouter un jury
          </button>
        </div>

        {jurorPickerOpen && (
          <div className="border border-gray-200 rounded-lg p-3 mb-3 bg-gray-50">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-600">Sélectionne un jury à ajouter</span>
              <button onClick={() => setJurorPickerOpen(false)} className="text-gray-400 hover:text-gray-700">
                <X size={14} />
              </button>
            </div>
            {availableJurors.length === 0 ? (
              <p className="text-sm text-gray-500">
                Tous les jurys ont été ajoutés. <Link href="/admin/jurors" className="text-blue-600 hover:underline">Créer un jury</Link>
              </p>
            ) : (
              <div className="max-h-48 overflow-y-auto space-y-1">
                {availableJurors.map(j => (
                  <button
                    key={j.id}
                    onClick={() => addJurorToCommittee(j.id)}
                    className="w-full text-left px-3 py-2 hover:bg-white rounded text-sm"
                  >
                    <span className="font-medium">{j.first_name} {j.last_name}</span>
                    <span className="text-gray-500 text-xs ml-2">{j.email}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {committeeJurors.length === 0 ? (
          <p className="text-sm text-gray-500">Aucun jury assigné.</p>
        ) : (
          <div className="space-y-2">
            {committeeJurors.map(cj => {
              const j = jurorsById.get(cj.juror_id)
              if (!j) return null
              const ratedAppIds = new Set(ratings.filter(r => r.juror_id === cj.juror_id).map(r => r.application_id))
              const decidedAppIds = new Set(decisions.filter(d => d.juror_id === cj.juror_id).map(d => d.application_id))
              return (
                <div key={cj.id} className="flex items-center justify-between border border-gray-200 rounded-lg px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <Link href={`/admin/jurors/${j.id}`} className="font-medium text-sm hover:underline">
                      {j.first_name} {j.last_name}
                    </Link>
                    <div className="text-xs text-gray-500">
                      {j.email} · {ratedAppIds.size}/{committeeApps.length} notés · {decidedAppIds.size}/{committeeApps.length} décisions
                    </div>
                  </div>
                  <div className="flex items-center gap-1 ml-3 shrink-0">
                    <button
                      onClick={() => copyLink(cj.access_token)}
                      className="flex items-center gap-1 px-2 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50"
                      title="Copier le lien"
                    >
                      {copiedToken === cj.access_token ? <Check size={12} className="text-green-600" /> : <Copy size={12} />}
                      <span>{copiedToken === cj.access_token ? 'Copié' : 'Lien'}</span>
                    </button>
                    <Link
                      href={`/jury/${cj.access_token}`}
                      target="_blank"
                      className="p-1.5 text-gray-400 hover:text-blue-600"
                      title="Ouvrir l'accès jury"
                    >
                      <ExternalLink size={14} />
                    </Link>
                    <button
                      onClick={() => removeJurorFromCommittee(cj)}
                      className="p-1.5 text-gray-400 hover:text-red-600"
                      title="Retirer du comité"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Applications */}
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Dossiers ({committeeApps.length})</h2>
          <button
            onClick={() => setAppPickerOpen(o => !o)}
            className="flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus size={14} />
            Ajouter un dossier
          </button>
        </div>

        {appPickerOpen && (
          <div className="border border-gray-200 rounded-lg p-3 mb-3 bg-gray-50">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-600">Sélectionne un dossier à ajouter</span>
              <button onClick={() => setAppPickerOpen(false)} className="text-gray-400 hover:text-gray-700">
                <X size={14} />
              </button>
            </div>
            {availableApps.length === 0 ? (
              <p className="text-sm text-gray-500">Tous les dossiers sont déjà dans ce comité.</p>
            ) : (
              <div className="max-h-64 overflow-y-auto space-y-1">
                {availableApps.map(a => (
                  <button
                    key={a.id}
                    onClick={() => addAppToCommittee(a.id)}
                    className="w-full text-left px-3 py-2 hover:bg-white rounded text-sm"
                  >
                    <span className="font-medium">{a.startup_name}</span>
                    <span className="text-gray-500 text-xs ml-2">{a.sector} · {a.stage}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {committeeApps.length === 0 ? (
          <p className="text-sm text-gray-500">Aucun dossier ajouté.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-y border-gray-200">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Startup</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Sect. / Stade</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Note jurys</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Votes</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Décision finale</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Action</th>
                  <th className="text-left px-3 py-2 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {committeeApps.map(ca => {
                  const a = appsById.get(ca.application_id)
                  const stats = appStats.get(ca.application_id)
                  const final = computeFinalDecision(
                    stats?.jurorDecisionsForApp || [],
                    committeeJurors.length,
                    ca.admin_override_decision || null,
                  )
                  return (
                    <tr key={ca.id} className="border-b border-gray-100">
                      <td className="px-3 py-2">
                        <Link href={`/admin/applications/${ca.application_id}`} className="font-medium hover:underline">
                          {a?.startup_name || '—'}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-gray-600 text-xs">
                        {a?.sector || '—'} · {a?.stage || '—'}
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        {stats?.avgScore !== null && stats?.avgScore !== undefined ? (
                          <span className="text-amber-700 font-medium">{stats.avgScore.toFixed(1)}/5</span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        <span className="text-green-700">{final.retenuVotes}</span>
                        <span className="text-gray-400 mx-0.5">/</span>
                        <span className="text-red-700">{final.rejeteVotes}</span>
                        <span className="text-gray-400 mx-0.5">/</span>
                        <span className="text-gray-500">{final.totalJurors - final.retenuVotes - final.rejeteVotes}</span>
                        <div className="text-[10px] text-gray-400">Ret./Rej./En attente</div>
                      </td>
                      <td className="px-3 py-2">
                        <FinalBadge final={final.final} overridden={final.overridden} />
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setAdminOverride(ca, ca.admin_override_decision === 'retenu' ? null : 'retenu')}
                            className={`px-2 py-1 text-xs rounded border ${ca.admin_override_decision === 'retenu' ? 'bg-green-600 text-white border-green-600' : 'border-green-300 text-green-700 hover:bg-green-50'}`}
                            title={ca.admin_override_decision === 'retenu' ? 'Annuler l\'override' : 'Forcer Retenu'}
                          >
                            Retenu
                          </button>
                          <button
                            onClick={() => setAdminOverride(ca, ca.admin_override_decision === 'rejete' ? null : 'rejete')}
                            className={`px-2 py-1 text-xs rounded border ${ca.admin_override_decision === 'rejete' ? 'bg-red-600 text-white border-red-600' : 'border-red-300 text-red-700 hover:bg-red-50'}`}
                            title={ca.admin_override_decision === 'rejete' ? 'Annuler l\'override' : 'Forcer Rejeté'}
                          >
                            Rejeté
                          </button>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <button
                          onClick={() => removeAppFromCommittee(ca)}
                          className="p-1 text-gray-400 hover:text-red-600"
                          title="Retirer du comité"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setConfirmDelete(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-semibold text-lg mb-2">Supprimer ce comité ?</h2>
            <p className="text-sm text-gray-600 mb-5">
              Le comité, ses jurys assignés, leurs notes et décisions seront supprimés. Les dossiers (applications) ne sont pas affectés.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmDelete(false)}
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Annuler
              </button>
              <button
                onClick={deleteCommittee}
                disabled={deleting}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {deleting && <Loader2 size={14} className="animate-spin" />}
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function FinalBadge({ final, overridden }: { final: 'retenu' | 'rejete' | 'pending'; overridden: boolean }) {
  if (final === 'retenu') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
        Retenu{overridden && <span className="text-[10px] text-green-600">(admin)</span>}
      </span>
    )
  }
  if (final === 'rejete') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
        Rejeté{overridden && <span className="text-[10px] text-red-600">(admin)</span>}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
      En attente
    </span>
  )
}
