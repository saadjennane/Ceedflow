'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Send, Mail, AlertTriangle, Eye, Loader2, Check, Users, Filter } from 'lucide-react'
import { applyVariables, markdownToHtml } from '@/lib/email-templates'
import type {
  ApplicationTag, EmailCampaignAudience,
  ApplicationCampaignFilters, JurorCampaignFilters, CommitteeDecisionFilter,
} from '@/lib/types'

interface FilterOptions {
  statuses: string[]
  priorities: string[]
  sectors: string[]
  stages: string[]
  sources: string[]
}

interface Recipient {
  id: string
  email: string
  name: string
  subtitle: string
  do_not_contact: boolean
}

const APP_VARIABLES = [
  { key: 'founder_name', sample: 'Aïcha El Idrissi' },
  { key: 'founder_first_name', sample: 'Aïcha' },
  { key: 'startup_name', sample: 'Acme Startup' },
]

const JURY_VARIABLES = [
  { key: 'juror_name', sample: 'Mehdi Bennani' },
  { key: 'juror_first_name', sample: 'Mehdi' },
  { key: 'juror_role', sample: 'Investisseur' },
]

const DECISION_OPTIONS: { value: CommitteeDecisionFilter; label: string }[] = [
  { value: 'any', label: 'Toutes' },
  { value: 'retenu', label: 'Retenu' },
  { value: 'rejete', label: 'Rejeté' },
  { value: 'pending', label: 'En attente' },
  { value: 'none', label: 'Hors de tout comité' },
]

function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] || ''
}

export default function CampaignComposer({ currentUserEmail, filterOptions, tags }: {
  currentUserEmail: string
  filterOptions: FilterOptions
  tags: ApplicationTag[]
}) {
  const router = useRouter()

  // --- Audience ---
  const [audience, setAudience] = useState<EmailCampaignAudience>('application')

  // --- Filters ---
  const [appFilters, setAppFilters] = useState<ApplicationCampaignFilters>({ committeeDecision: 'any', minAvgRating: 0, tagIds: [] })
  const [juryFilters, setJuryFilters] = useState<JurorCampaignFilters>({})

  // --- Recipients (resolved server-side) ---
  const [recipients, setRecipients] = useState<Recipient[]>([])
  const [resolving, setResolving] = useState(false)
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set())

  // --- Content ---
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [includeUnsubscribe, setIncludeUnsubscribe] = useState(false)
  const [includeTrackingPixel, setIncludeTrackingPixel] = useState(true)

  // --- Test send ---
  const [testEmail, setTestEmail] = useState(currentUserEmail)
  const [testStatus, setTestStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [testError, setTestError] = useState('')

  // --- Send ---
  const [showConfirm, setShowConfirm] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendProgress, setSendProgress] = useState({ sent: 0, total: 0, failed: 0 })
  const [sendDone, setSendDone] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const variables = audience === 'application' ? APP_VARIABLES : JURY_VARIABLES

  // Re-resolve audience whenever audience or filters change
  useEffect(() => {
    let cancelled = false
    setResolving(true)
    const filters = audience === 'application' ? appFilters : juryFilters
    fetch('/api/admin/campaigns/audience', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audience_type: audience, filters }),
    })
      .then(r => r.json())
      .then(data => {
        if (cancelled) return
        setRecipients(data.recipients || [])
        setResolving(false)
        setExcludedIds(new Set())
      })
      .catch(() => { if (!cancelled) setResolving(false) })
    return () => { cancelled = true }
  }, [audience, appFilters, juryFilters])

  // Auto-toggle unsubscribe default per audience switch
  useEffect(() => {
    setIncludeUnsubscribe(false) // off by default per user preference (overridable)
  }, [audience])

  const eligibleRecipients = useMemo(() => recipients.filter(r => !excludedIds.has(r.id)), [recipients, excludedIds])
  const previewRecipient = eligibleRecipients[0] || recipients[0]
  const previewCtx = useMemo(() => {
    if (!previewRecipient) return audience === 'application'
      ? { founder_name: 'Aïcha El Idrissi', founder_first_name: 'Aïcha', startup_name: 'Acme Startup' }
      : { juror_name: 'Mehdi Bennani', juror_first_name: 'Mehdi', juror_role: 'Investisseur' }
    if (audience === 'application') return {
      founder_name: previewRecipient.name,
      founder_first_name: firstName(previewRecipient.name),
      startup_name: previewRecipient.subtitle,
    }
    return {
      juror_name: previewRecipient.name,
      juror_first_name: firstName(previewRecipient.name),
      juror_role: previewRecipient.subtitle,
    }
  }, [audience, previewRecipient])
  const previewSubject = applyVariables(subject, previewCtx)
  const previewHtml = markdownToHtml(applyVariables(body, previewCtx))

  const sendTest = async () => {
    if (!subject.trim() || !body.trim()) {
      setTestError('Sujet et corps requis')
      setTestStatus('error')
      return
    }
    setTestStatus('sending')
    setTestError('')
    const res = await fetch('/api/admin/campaigns/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject, body, testEmail, audience_type: audience, includeUnsubscribe }),
    })
    const data = await res.json()
    if (!res.ok) {
      setTestError(data.error || 'Échec')
      setTestStatus('error')
    } else {
      setTestStatus('sent')
      setTimeout(() => setTestStatus('idle'), 4000)
    }
  }

  const toggleExclude = (id: string) => {
    setExcludedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const send = async () => {
    if (eligibleRecipients.length === 0) return
    setSending(true)
    setShowConfirm(false)
    setErrorMsg('')
    setSendDone(false)

    const recipientIds = eligibleRecipients.map(r => r.id)
    const filters = audience === 'application' ? appFilters : juryFilters

    const createRes = await fetch('/api/admin/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject, body,
        audience_type: audience,
        recipientIds,
        include_unsubscribe: includeUnsubscribe,
        include_tracking_pixel: includeTrackingPixel,
        filters_json: filters,
      }),
    })
    const createData = await createRes.json()
    if (!createRes.ok) {
      setErrorMsg(createData.error || 'Échec de la création')
      setSending(false)
      return
    }
    const campaignId = createData.campaign.id
    const total = createData.recipientsCount
    setSendProgress({ sent: 0, total, failed: 0 })

    let sentTotal = 0, failedTotal = 0, safety = 0
    while (safety < 200) {
      safety++
      const sendRes = await fetch(`/api/admin/campaigns/${campaignId}/send`, { method: 'POST' })
      const sendData = await sendRes.json()
      if (!sendRes.ok) { setErrorMsg(sendData.error || 'Échec'); break }
      sentTotal += sendData.sent || 0
      failedTotal += sendData.failed || 0
      setSendProgress({ sent: sentTotal, total, failed: failedTotal })
      if (sendData.done) { setSendDone(true); break }
    }

    setSending(false)
    if (sendDone || sentTotal + failedTotal >= total) {
      setTimeout(() => router.push(`/admin/campaigns/${campaignId}`), 1500)
    }
  }

  return (
    <div>
      <Link href="/admin/campaigns" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-blue-700 mb-4">
        <ArrowLeft size={16} /> Retour aux campagnes
      </Link>
      <h1 className="text-2xl font-bold mb-6">Nouvelle campagne email</h1>

      <div className="bg-white border border-gray-200 rounded-lg p-5 mb-6">
        <h2 className="font-semibold mb-3 inline-flex items-center gap-2"><Users size={16} /> Audience</h2>
        <div className="flex gap-2">
          <AudienceCard active={audience === 'application'} onClick={() => setAudience('application')} title="Candidats" subtitle="Startups ayant candidaté via le formulaire" />
          <AudienceCard active={audience === 'juror'} onClick={() => setAudience('juror')} title="Jurys" subtitle="Membres du jury (comités, évaluateurs)" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-5">
          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <h2 className="font-semibold mb-3 inline-flex items-center gap-2"><Filter size={16} /> Filtres</h2>
            {audience === 'application' ? (
              <ApplicationFilters filters={appFilters} onChange={setAppFilters} options={filterOptions} tags={tags} />
            ) : (
              <JurorFilters filters={juryFilters} onChange={setJuryFilters} />
            )}
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <h2 className="font-semibold mb-3">Contenu</h2>
            <label className="block text-sm font-medium mb-1">Sujet</label>
            <input
              type="text"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder={audience === 'application' ? 'Ex: Mise à jour {{startup_name}}' : 'Ex: Invitation comité {{juror_first_name}}'}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 mb-4"
            />
            <label className="block text-sm font-medium mb-1">Corps</label>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              rows={12}
              placeholder={audience === 'application'
                ? `Bonjour {{founder_first_name}},\n\nNous vous écrivons concernant {{startup_name}}…`
                : `Bonjour {{juror_first_name}},\n\nNous vous écrivons concernant…`}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-y"
            />
            <p className="text-xs text-gray-500 mt-2">Format markdown léger : <code className="bg-gray-100 px-1 rounded">**gras**</code>, <code className="bg-gray-100 px-1 rounded">*italique*</code>, <code className="bg-gray-100 px-1 rounded">[lien](url)</code>.</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {variables.map(v => (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => setBody(b => b + `{{${v.key}}}`)}
                  className="text-xs px-2 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded hover:bg-emerald-100"
                  title={`Exemple : ${v.sample}`}
                >
                  {`{{${v.key}}}`}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <h2 className="font-semibold mb-3">Options d&apos;envoi</h2>
            <label className="flex items-start gap-3 cursor-pointer mb-3">
              <input
                type="checkbox"
                checked={includeUnsubscribe}
                onChange={e => setIncludeUnsubscribe(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-gray-300"
              />
              <div>
                <div className="text-sm font-medium">Inclure le lien de désabonnement</div>
                <div className="text-xs text-gray-500">Recommandé pour la conformité RGPD/CAN-SPAM sur les envois marketing.</div>
              </div>
            </label>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={includeTrackingPixel}
                onChange={e => setIncludeTrackingPixel(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-gray-300"
              />
              <div>
                <div className="text-sm font-medium">Activer le tracking d&apos;ouverture</div>
                <div className="text-xs text-gray-500">Pixel 1×1 inséré en bas de l&apos;email.</div>
              </div>
            </label>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <h2 className="font-semibold mb-3">Envoyer un test</h2>
            <div className="flex gap-2">
              <input
                type="email"
                value={testEmail}
                onChange={e => setTestEmail(e.target.value)}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <button onClick={sendTest} disabled={testStatus === 'sending' || !subject || !body} className="inline-flex items-center gap-2 bg-gray-900 text-white px-4 py-2 rounded-lg text-sm hover:bg-black disabled:opacity-50">
                {testStatus === 'sending' ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                Test
              </button>
            </div>
            {testStatus === 'sent' && <p className="text-xs text-emerald-700 mt-2 inline-flex items-center gap-1"><Check size={12} /> Envoyé.</p>}
            {testStatus === 'error' && <p className="text-xs text-red-600 mt-2">Erreur : {testError}</p>}
          </div>
        </div>

        <div className="space-y-5">
          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold">Destinataires éligibles</h2>
              <span className="text-sm text-gray-600">
                <strong className="text-gray-900">{eligibleRecipients.length}</strong> / {recipients.length}
                {resolving && <Loader2 size={12} className="inline-block ml-2 animate-spin text-gray-400" />}
              </span>
            </div>
            <p className="text-xs text-gray-500 mb-2">
              Décochez ponctuellement quelqu&apos;un pour l&apos;exclure de cet envoi sans toucher au filtre.
              Les contacts marqués « ne plus contacter » sont déjà exclus.
            </p>
            <div className="max-h-80 overflow-y-auto border border-gray-100 rounded">
              {recipients.length === 0 ? (
                <p className="text-sm text-gray-500 p-4 text-center">{resolving ? 'Chargement…' : 'Aucun destinataire avec ces filtres.'}</p>
              ) : (
                recipients.map(r => {
                  const excluded = excludedIds.has(r.id)
                  return (
                    <label key={r.id} className={`flex items-center gap-2 px-3 py-2 border-b border-gray-50 last:border-0 hover:bg-gray-50 cursor-pointer ${excluded ? 'opacity-50' : ''}`}>
                      <input type="checkbox" checked={!excluded} onChange={() => toggleExclude(r.id)} className="h-4 w-4 rounded border-gray-300" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{r.name || '—'}</div>
                        <div className="text-xs text-gray-500 truncate">{r.subtitle} · {r.email}</div>
                      </div>
                    </label>
                  )
                })
              )}
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <h2 className="font-semibold mb-3 flex items-center gap-2"><Eye size={16} /> Aperçu</h2>
            <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
              <div className="text-xs text-gray-500 mb-1">Sujet</div>
              <div className="text-sm font-medium mb-3">{previewSubject || <em className="text-gray-400">vide</em>}</div>
              <div className="text-xs text-gray-500 mb-1">Corps (rendu pour {previewRecipient ? previewRecipient.name || previewRecipient.subtitle : 'exemple'})</div>
              <div className="bg-white border border-gray-100 rounded p-4 text-sm" dangerouslySetInnerHTML={{ __html: previewHtml || '<em>vide</em>' }} />
            </div>
          </div>

          <button
            onClick={() => setShowConfirm(true)}
            disabled={eligibleRecipients.length === 0 || !subject || !body || sending}
            className="w-full inline-flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-3 rounded-lg text-sm font-semibold disabled:opacity-50"
          >
            <Mail size={16} />
            Envoyer à {eligibleRecipients.length} destinataire{eligibleRecipients.length > 1 ? 's' : ''}
          </button>
          {errorMsg && <p className="text-xs text-red-600 mt-2">{errorMsg}</p>}
        </div>
      </div>

      {showConfirm && !sending && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowConfirm(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle size={20} className="text-amber-500" />
              <h3 className="font-semibold">Confirmer l&apos;envoi</h3>
            </div>
            <p className="text-sm text-gray-600 mb-2">
              Envoyer à <strong>{eligibleRecipients.length}</strong> {audience === 'application' ? 'candidat' : 'jury'}{eligibleRecipients.length > 1 ? 's' : ''} ?
            </p>
            {!includeUnsubscribe && audience === 'application' && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 mb-3">
                ⚠️ Lien de désabonnement désactivé. Pour des envois marketing, c&apos;est légalement obligatoire (RGPD/CAN-SPAM).
              </p>
            )}
            <p className="text-xs text-gray-500 mb-5">
              ~40 emails/min. Compter {Math.max(1, Math.ceil(eligibleRecipients.length * 1.5 / 60))} min.
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowConfirm(false)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Annuler</button>
              <button onClick={send} className="px-4 py-2 text-sm bg-emerald-500 text-white rounded-lg hover:bg-emerald-600">Envoyer maintenant</button>
            </div>
          </div>
        </div>
      )}

      {sending && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="font-semibold mb-2">Envoi en cours…</h3>
            <p className="text-sm text-gray-600 mb-4">{sendProgress.sent} / {sendProgress.total} envoyé{sendProgress.sent > 1 ? 's' : ''}{sendProgress.failed > 0 && <span className="text-red-600"> · {sendProgress.failed} échec{sendProgress.failed > 1 ? 's' : ''}</span>}</p>
            <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
              <div className="bg-emerald-500 h-full transition-all" style={{ width: sendProgress.total > 0 ? `${((sendProgress.sent + sendProgress.failed) / sendProgress.total) * 100}%` : '0%' }} />
            </div>
            <p className="text-xs text-gray-500 mt-3 text-center">Ne ferme pas cette page</p>
          </div>
        </div>
      )}
    </div>
  )
}

function AudienceCard({ active, onClick, title, subtitle }: { active: boolean; onClick: () => void; title: string; subtitle: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 text-left p-3 rounded-lg border transition ${active ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200 hover:border-gray-300'}`}
    >
      <div className={`font-semibold text-sm ${active ? 'text-emerald-700' : 'text-gray-900'}`}>{title}</div>
      <div className="text-xs text-gray-500 mt-0.5">{subtitle}</div>
    </button>
  )
}

function ApplicationFilters({ filters, onChange, options, tags }: {
  filters: ApplicationCampaignFilters
  onChange: (f: ApplicationCampaignFilters) => void
  options: FilterOptions
  tags: ApplicationTag[]
}) {
  const set = (patch: Partial<ApplicationCampaignFilters>) => onChange({ ...filters, ...patch })
  const tagIds = filters.tagIds || []
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <FilterSelect label="Statut" value={filters.status || ''} options={options.statuses} onChange={v => set({ status: v || undefined })} />
        <FilterSelect label="Priorité" value={filters.priority || ''} options={options.priorities} onChange={v => set({ priority: v || undefined })} />
        <FilterSelect label="Secteur" value={filters.sector || ''} options={options.sectors} onChange={v => set({ sector: v || undefined })} />
        <FilterSelect label="Stade" value={filters.stage || ''} options={options.stages} onChange={v => set({ stage: v || undefined })} />
        <FilterSelect label="Source" value={filters.source || ''} options={options.sources} onChange={v => set({ source: v || undefined })} />
        <div>
          <label className="block text-xs font-medium mb-1">Décision comité</label>
          <select value={filters.committeeDecision || 'any'} onChange={e => set({ committeeDecision: e.target.value as CommitteeDecisionFilter })} className="w-full text-xs border border-gray-300 rounded px-2 py-1.5">
            {DECISION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium mb-1">Note moyenne admin minimum : <strong>{(filters.minAvgRating || 0).toFixed(1)}</strong> / 5</label>
        <input type="range" min={0} max={5} step={0.5} value={filters.minAvgRating || 0} onChange={e => set({ minAvgRating: Number(e.target.value) })} className="w-full" />
        <p className="text-[10px] text-gray-500">0 = pas de filtre. Sinon n&apos;inclut que les candidats ayant au moins une note et dont la moyenne ≥ seuil.</p>
      </div>
      {tags.length > 0 && (
        <div>
          <label className="block text-xs font-medium mb-1">Statuts personnalisés (doit avoir TOUS les sélectionnés)</label>
          <div className="flex flex-wrap gap-1.5">
            {tags.map(t => {
              const active = tagIds.includes(t.id)
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => set({ tagIds: active ? tagIds.filter(id => id !== t.id) : [...tagIds, t.id] })}
                  className={`text-xs px-2 py-0.5 rounded-full border ${active ? 'border-transparent text-white' : 'border-gray-300 text-gray-600 hover:border-gray-400'}`}
                  style={active ? { backgroundColor: t.color } : undefined}
                >
                  {t.label}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function JurorFilters({ filters, onChange }: {
  filters: JurorCampaignFilters
  onChange: (f: JurorCampaignFilters) => void
}) {
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium mb-1">Rôle (recherche partielle)</label>
        <input
          type="text"
          value={filters.roleQuery || ''}
          onChange={e => onChange({ ...filters, roleQuery: e.target.value })}
          placeholder="ex: investisseur, mentor…"
          className="w-full border border-gray-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={!!filters.onlyInActiveCommittee}
          onChange={e => onChange({ ...filters, onlyInActiveCommittee: e.target.checked })}
          className="h-4 w-4 rounded border-gray-300"
        />
        <span className="text-xs text-gray-700">Uniquement membres d&apos;un comité <strong>actif</strong></span>
      </label>
    </div>
  )
}

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1">{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)} className="w-full text-xs border border-gray-300 rounded px-2 py-1.5">
        <option value="">Tous</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  )
}
