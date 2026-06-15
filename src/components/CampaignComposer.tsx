'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Send, Mail, AlertTriangle, Eye, Loader2, Check } from 'lucide-react'
import { applyVariables, markdownToHtml } from '@/lib/email-templates'

interface Candidate {
  id: string
  startup_name: string
  status: string
  priority: string
  sector: string
  founder_email: string
  founder_name: string
  do_not_contact: boolean
}

const STATUSES = ['New', 'Very interesting', 'Interesting', 'Average', 'Not interesting']
const PRIORITIES = ['High', 'Normal', 'Low']

const VARIABLES = [
  { key: 'founder_name', label: 'Nom du fondateur', sample: 'Aïcha El Idrissi' },
  { key: 'founder_first_name', label: 'Prénom du fondateur', sample: 'Aïcha' },
  { key: 'startup_name', label: 'Nom de la startup', sample: 'Acme Startup' },
]

function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] || ''
}

export default function CampaignComposer({ candidates, currentUserEmail }: { candidates: Candidate[]; currentUserEmail: string }) {
  const router = useRouter()
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [filterPriority, setFilterPriority] = useState<string>('')
  const [filterSector, setFilterSector] = useState<string>('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showPreview, setShowPreview] = useState(false)
  const [testEmail, setTestEmail] = useState(currentUserEmail)
  const [testStatus, setTestStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [testError, setTestError] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendProgress, setSendProgress] = useState({ sent: 0, total: 0, failed: 0 })
  const [sendDone, setSendDone] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const sectors = useMemo(() => Array.from(new Set(candidates.map(c => c.sector))).sort(), [candidates])

  const filtered = useMemo(() => candidates.filter(c => {
    if (filterStatus && c.status !== filterStatus) return false
    if (filterPriority && c.priority !== filterPriority) return false
    if (filterSector && c.sector !== filterSector) return false
    return true
  }), [candidates, filterStatus, filterPriority, filterSector])

  const selectedRecipients = useMemo(() => candidates.filter(c => selectedIds.has(c.id)), [candidates, selectedIds])
  const previewRecipient = selectedRecipients[0] || candidates[0]

  const toggleOne = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const selectAllFiltered = () => {
    setSelectedIds(new Set(filtered.map(c => c.id)))
  }
  const clearSelection = () => setSelectedIds(new Set())

  const previewCtx = previewRecipient
    ? {
        founder_name: previewRecipient.founder_name,
        founder_first_name: firstName(previewRecipient.founder_name),
        startup_name: previewRecipient.startup_name,
      }
    : { founder_name: 'Aïcha El Idrissi', founder_first_name: 'Aïcha', startup_name: 'Acme Startup' }

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
      body: JSON.stringify({ subject, body, testEmail }),
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

  const send = async () => {
    if (selectedIds.size === 0) return
    setSending(true)
    setShowConfirm(false)
    setErrorMsg('')
    setSendDone(false)

    // 1. Create campaign
    const createRes = await fetch('/api/admin/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject, body, applicationIds: Array.from(selectedIds) }),
    })
    const createData = await createRes.json()
    if (!createRes.ok) {
      setErrorMsg(createData.error || 'Échec de la création de la campagne')
      setSending(false)
      return
    }
    const campaignId = createData.campaign.id
    const total = createData.recipientsCount
    setSendProgress({ sent: 0, total, failed: 0 })

    // 2. Loop send batches until done
    let sentTotal = 0
    let failedTotal = 0
    let safetyGuard = 0
    while (safetyGuard < 200) {
      safetyGuard++
      const sendRes = await fetch(`/api/admin/campaigns/${campaignId}/send`, { method: 'POST' })
      const sendData = await sendRes.json()
      if (!sendRes.ok) {
        setErrorMsg(sendData.error || 'Échec de l\'envoi')
        break
      }
      sentTotal += sendData.sent || 0
      failedTotal += sendData.failed || 0
      setSendProgress({ sent: sentTotal, total, failed: failedTotal })
      if (sendData.done) {
        setSendDone(true)
        break
      }
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LEFT: Compose */}
        <div className="space-y-5">
          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <h2 className="font-semibold mb-3">Contenu</h2>
            <label className="block text-sm font-medium mb-1">Sujet</label>
            <input
              type="text"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="Ex: Mise à jour sur votre candidature {{startup_name}}"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 mb-4"
            />
            <label className="block text-sm font-medium mb-1">Corps</label>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              rows={14}
              placeholder={`Bonjour {{founder_first_name}},\n\nNous vous écrivons concernant {{startup_name}}…\n\nFormat: **gras**, *italique*, [lien](https://…)`}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-y"
            />
            <p className="text-xs text-gray-500 mt-2">Format markdown léger : <code className="bg-gray-100 px-1 rounded">**gras**</code>, <code className="bg-gray-100 px-1 rounded">*italique*</code>, <code className="bg-gray-100 px-1 rounded">[lien](url)</code>, double saut de ligne = paragraphe.</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {VARIABLES.map(v => (
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

          {/* Test send */}
          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <h2 className="font-semibold mb-3">Envoyer un test</h2>
            <div className="flex gap-2">
              <input
                type="email"
                value={testEmail}
                onChange={e => setTestEmail(e.target.value)}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <button
                onClick={sendTest}
                disabled={testStatus === 'sending' || !subject || !body}
                className="inline-flex items-center gap-2 bg-gray-900 text-white px-4 py-2 rounded-lg text-sm hover:bg-black disabled:opacity-50"
              >
                {testStatus === 'sending' ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                Test
              </button>
            </div>
            {testStatus === 'sent' && <p className="text-xs text-emerald-700 mt-2 inline-flex items-center gap-1"><Check size={12} /> Email de test envoyé.</p>}
            {testStatus === 'error' && <p className="text-xs text-red-600 mt-2">Erreur : {testError}</p>}
          </div>
        </div>

        {/* RIGHT: Recipients + Preview */}
        <div className="space-y-5">
          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold">Destinataires</h2>
              <span className="text-sm text-gray-600"><strong className="text-gray-900">{selectedIds.size}</strong> / {filtered.length}</span>
            </div>
            <div className="grid grid-cols-3 gap-2 mb-3">
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="text-xs border border-gray-300 rounded px-2 py-1.5">
                <option value="">Tous statuts</option>
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)} className="text-xs border border-gray-300 rounded px-2 py-1.5">
                <option value="">Toutes priorités</option>
                {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <select value={filterSector} onChange={e => setFilterSector(e.target.value)} className="text-xs border border-gray-300 rounded px-2 py-1.5">
                <option value="">Tous secteurs</option>
                {sectors.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="flex gap-2 mb-2">
              <button onClick={selectAllFiltered} className="text-xs text-emerald-700 hover:underline">Tout sélectionner ({filtered.length})</button>
              <span className="text-gray-300">·</span>
              <button onClick={clearSelection} className="text-xs text-gray-500 hover:underline">Effacer la sélection</button>
            </div>
            <div className="max-h-80 overflow-y-auto border border-gray-100 rounded">
              {filtered.length === 0 ? (
                <p className="text-sm text-gray-500 p-4 text-center">Aucun candidat avec ces filtres.</p>
              ) : (
                filtered.map(c => (
                  <label key={c.id} className="flex items-center gap-2 px-3 py-2 border-b border-gray-50 last:border-0 hover:bg-gray-50 cursor-pointer">
                    <input type="checkbox" checked={selectedIds.has(c.id)} onChange={() => toggleOne(c.id)} className="h-4 w-4 rounded border-gray-300" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{c.startup_name}</div>
                      <div className="text-xs text-gray-500 truncate">{c.founder_name} · {c.founder_email}</div>
                    </div>
                    <span className="text-[10px] text-gray-400">{c.status}</span>
                  </label>
                ))
              )}
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold flex items-center gap-2"><Eye size={16} /> Aperçu</h2>
              <button onClick={() => setShowPreview(p => !p)} className="text-xs text-gray-500 hover:text-gray-700">{showPreview ? 'Masquer' : 'Afficher'}</button>
            </div>
            {showPreview && (
              <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                <div className="text-xs text-gray-500 mb-1">Sujet</div>
                <div className="text-sm font-medium mb-3">{previewSubject || <em className="text-gray-400">vide</em>}</div>
                <div className="text-xs text-gray-500 mb-1">Corps (rendu pour {previewRecipient ? previewRecipient.startup_name : 'exemple'})</div>
                <div
                  className="bg-white border border-gray-100 rounded p-4 text-sm"
                  dangerouslySetInnerHTML={{ __html: previewHtml || '<em>vide</em>' }}
                />
              </div>
            )}
          </div>

          <button
            onClick={() => setShowConfirm(true)}
            disabled={selectedIds.size === 0 || !subject || !body || sending}
            className="w-full inline-flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-3 rounded-lg text-sm font-semibold disabled:opacity-50"
          >
            <Mail size={16} />
            Envoyer à {selectedIds.size} destinataire{selectedIds.size > 1 ? 's' : ''}
          </button>
          {errorMsg && <p className="text-xs text-red-600 mt-2">{errorMsg}</p>}
        </div>
      </div>

      {/* Confirmation modal */}
      {showConfirm && !sending && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowConfirm(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle size={20} className="text-amber-500" />
              <h3 className="font-semibold">Confirmer l&apos;envoi</h3>
            </div>
            <p className="text-sm text-gray-600 mb-2">
              Envoyer cet email à <strong>{selectedIds.size}</strong> destinataire{selectedIds.size > 1 ? 's' : ''} ?
            </p>
            <p className="text-xs text-gray-500 mb-5">
              L&apos;envoi se fait à ~40 emails/min (rate limit). Pour {selectedIds.size} envois, compter environ {Math.max(1, Math.ceil(selectedIds.size * 1.5 / 60))} min.
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowConfirm(false)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Annuler</button>
              <button onClick={send} className="px-4 py-2 text-sm bg-emerald-500 text-white rounded-lg hover:bg-emerald-600">Envoyer maintenant</button>
            </div>
          </div>
        </div>
      )}

      {/* Send progress modal */}
      {sending && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="font-semibold mb-2">Envoi en cours…</h3>
            <p className="text-sm text-gray-600 mb-4">{sendProgress.sent} / {sendProgress.total} envoyé{sendProgress.sent > 1 ? 's' : ''}{sendProgress.failed > 0 && <span className="text-red-600"> · {sendProgress.failed} échec{sendProgress.failed > 1 ? 's' : ''}</span>}</p>
            <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
              <div
                className="bg-emerald-500 h-full transition-all"
                style={{ width: sendProgress.total > 0 ? `${((sendProgress.sent + sendProgress.failed) / sendProgress.total) * 100}%` : '0%' }}
              />
            </div>
            <p className="text-xs text-gray-500 mt-3 text-center">Ne ferme pas cette page</p>
          </div>
        </div>
      )}
    </div>
  )
}
