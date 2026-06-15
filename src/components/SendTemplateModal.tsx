'use client'

import { useEffect, useMemo, useState } from 'react'
import { X, Mail, ArrowLeft, Send, Loader2, Check } from 'lucide-react'
import type { EmailTemplate, EmailLanguage } from '@/lib/types'
import { applyVariables, markdownToHtml, type TemplateContext } from '@/lib/email-templates'

interface Props {
  applicationId: string
  founderName: string
  founderEmail: string
  startupName: string
  stage: string
  sector: string
  templates: EmailTemplate[]
  onClose: () => void
}

export default function SendTemplateModal({
  applicationId, founderName, founderEmail, startupName, stage, sector, templates, onClose,
}: Props) {
  const [step, setStep] = useState<'pick' | 'compose'>('pick')
  const [selected, setSelected] = useState<EmailTemplate | null>(null)
  const [language, setLanguage] = useState<EmailLanguage>('fr')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const ctx: TemplateContext = useMemo(() => ({
    founder_name: founderName,
    founder_first_name: founderName.trim().split(/\s+/)[0] || '',
    startup_name: startupName,
    stage,
    sector,
  }), [founderName, startupName, stage, sector])

  const pickTemplate = (t: EmailTemplate) => {
    setSelected(t)
    setLanguage('fr')
    setSubject(applyVariables(t.subject_fr, ctx))
    setBody(applyVariables(t.body_fr, ctx))
    setStep('compose')
  }

  const switchLanguage = (lang: EmailLanguage) => {
    if (!selected) return
    setLanguage(lang)
    setSubject(applyVariables(lang === 'fr' ? selected.subject_fr : selected.subject_en, ctx))
    setBody(applyVariables(lang === 'fr' ? selected.body_fr : selected.body_en, ctx))
  }

  const send = async () => {
    if (!selected) return
    setSending(true)
    setError('')
    const res = await fetch(`/api/admin/email-templates/${selected.id}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ applicationId, language, subjectOverride: subject, bodyOverride: body }),
    })
    const data = await res.json()
    setSending(false)
    if (!res.ok) {
      setError(data.error || 'Échec de l\'envoi')
      return
    }
    setSentTo(data.sentTo)
    setTimeout(() => onClose(), 1800)
  }

  const previewHtml = markdownToHtml(body)

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            {step === 'compose' && (
              <button onClick={() => { setStep('pick'); setSelected(null) }} className="text-gray-400 hover:text-gray-700" disabled={sending}>
                <ArrowLeft size={18} />
              </button>
            )}
            <Mail size={18} className="text-emerald-600" />
            <div>
              <h2 className="font-semibold">{step === 'pick' ? 'Envoyer un email' : selected?.name}</h2>
              <p className="text-xs text-gray-500">{founderName} · {founderEmail}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700" disabled={sending}>
            <X size={20} />
          </button>
        </div>

        {/* Step: pick */}
        {step === 'pick' && (
          <div className="flex-1 overflow-y-auto p-5">
            {templates.length === 0 ? (
              <div className="text-center py-12 text-sm text-gray-500">
                Aucun template manuel actif.<br />
                <a href="/admin/email-templates" className="text-emerald-600 hover:underline">Gérer les templates</a>
              </div>
            ) : (
              <div className="space-y-2">
                {templates.map(t => (
                  <button
                    key={t.id}
                    onClick={() => pickTemplate(t)}
                    className="w-full text-left p-4 border border-gray-200 rounded-lg hover:border-emerald-400 hover:bg-emerald-50/50 transition group"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-medium text-gray-900 group-hover:text-emerald-700">{t.name}</div>
                        {t.description && <div className="text-xs text-gray-500 mt-0.5">{t.description}</div>}
                        <div className="text-xs text-gray-600 mt-1.5 truncate font-mono">{applyVariables(t.subject_fr, ctx)}</div>
                      </div>
                      <Send size={16} className="text-gray-400 group-hover:text-emerald-600 flex-shrink-0 mt-1" />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step: compose */}
        {step === 'compose' && selected && (
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {/* Language toggle */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Langue :</span>
              <div className="flex items-center gap-0.5 bg-gray-100 border border-gray-200 rounded-full p-0.5">
                <button
                  onClick={() => switchLanguage('fr')}
                  className={`px-3 py-0.5 text-xs rounded-full ${language === 'fr' ? 'bg-emerald-500 text-white' : 'text-gray-600'}`}
                  disabled={sending}
                >
                  FR
                </button>
                <button
                  onClick={() => switchLanguage('en')}
                  className={`px-3 py-0.5 text-xs rounded-full ${language === 'en' ? 'bg-emerald-500 text-white' : 'text-gray-600'}`}
                  disabled={sending}
                >
                  EN
                </button>
              </div>
              <span className="text-[11px] text-gray-400 ml-2">Tu peux modifier le sujet et le corps avant d&apos;envoyer.</span>
            </div>

            {/* Subject */}
            <div>
              <label className="block text-xs font-medium mb-1">Sujet</label>
              <input
                type="text"
                value={subject}
                onChange={e => setSubject(e.target.value)}
                disabled={sending}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            {/* Body */}
            <div>
              <label className="block text-xs font-medium mb-1">Corps (markdown léger)</label>
              <textarea
                value={body}
                onChange={e => setBody(e.target.value)}
                rows={10}
                disabled={sending}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-y"
              />
            </div>

            {/* Preview */}
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-200 text-xs text-gray-500">Aperçu</div>
              <div className="p-4 bg-white">
                <div className="text-xs text-gray-500 mb-1">Sujet</div>
                <div className="text-sm font-medium mb-3">{subject}</div>
                <div className="text-xs text-gray-500 mb-1">Corps</div>
                <div className="text-sm border border-gray-100 rounded p-3 bg-gray-50" dangerouslySetInnerHTML={{ __html: previewHtml }} />
              </div>
            </div>

            {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-3">{error}</div>}
            {sentTo && (
              <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded p-3 inline-flex items-center gap-2">
                <Check size={14} /> Email envoyé à {sentTo}
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        {step === 'compose' && selected && (
          <div className="px-5 py-3 border-t border-gray-200 flex items-center justify-between">
            <p className="text-xs text-gray-500">Sera envoyé à <strong>{founderEmail}</strong></p>
            <div className="flex gap-2">
              <button onClick={onClose} disabled={sending} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50">Annuler</button>
              <button
                onClick={send}
                disabled={sending || !subject.trim() || !body.trim() || !!sentTo}
                className="inline-flex items-center gap-2 bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-emerald-600 disabled:opacity-50"
              >
                {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                Envoyer
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
