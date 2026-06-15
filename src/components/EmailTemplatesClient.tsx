'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, ChevronRight, Mail, Send, Settings, Save, Eye, Loader2, Check } from 'lucide-react'
import type { EmailTemplate, EmailLanguage } from '@/lib/types'
import { applyVariables, markdownToHtml } from '@/lib/email-templates'

const TRIGGER_LABEL: Record<EmailTemplate['trigger_event'], string> = {
  on_application_submitted: 'Soumission du formulaire',
  manual: 'Envoi manuel',
}

const SAMPLE_CTX: Record<string, string> = {
  founder_first_name: 'Aïcha',
  founder_name: 'Aïcha El Idrissi',
  startup_name: 'Acme Startup',
  stage: 'MVP',
  sector: 'AI',
  review_url: 'https://ceedflow.com/admin/applications/123',
}

export default function EmailTemplatesClient({ templates }: { templates: EmailTemplate[] }) {
  const grouped = {
    on_application_submitted: templates.filter(t => t.trigger_event === 'on_application_submitted'),
    manual: templates.filter(t => t.trigger_event === 'manual'),
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Templates email</h1>
      <p className="text-sm text-gray-500 mb-6">
        Modifie les emails automatiques et manuels envoyés par la plateforme. Désactive un template pour suspendre son envoi.
      </p>

      {grouped.on_application_submitted.length > 0 && (
        <Section title="Envois automatiques" subtitle="Déclenchés à la soumission du formulaire de candidature">
          {grouped.on_application_submitted.map(t => <TemplateCard key={t.id} template={t} />)}
        </Section>
      )}

      {grouped.manual.length > 0 && (
        <Section title="Templates manuels" subtitle="Disponibles depuis la fiche d'une candidature">
          {grouped.manual.map(t => <TemplateCard key={t.id} template={t} />)}
        </Section>
      )}
    </div>
  )
}

function Section({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <h2 className="font-semibold text-lg">{title}</h2>
      <p className="text-xs text-gray-500 mb-3">{subtitle}</p>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

function TemplateCard({ template }: { template: EmailTemplate }) {
  const router = useRouter()
  const [expanded, setExpanded] = useState(false)
  const [enabled, setEnabled] = useState(template.enabled)
  const [subjectFr, setSubjectFr] = useState(template.subject_fr)
  const [bodyFr, setBodyFr] = useState(template.body_fr)
  const [subjectEn, setSubjectEn] = useState(template.subject_en)
  const [bodyEn, setBodyEn] = useState(template.body_en)
  const [previewLang, setPreviewLang] = useState<EmailLanguage>('fr')
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [error, setError] = useState('')

  const dirty =
    enabled !== template.enabled ||
    subjectFr !== template.subject_fr ||
    bodyFr !== template.body_fr ||
    subjectEn !== template.subject_en ||
    bodyEn !== template.body_en

  const save = async (overrides?: Partial<{ enabled: boolean }>) => {
    setSaving(true)
    setError('')
    const payload: Record<string, unknown> = {
      enabled: overrides?.enabled ?? enabled,
      subject_fr: subjectFr,
      body_fr: bodyFr,
      subject_en: subjectEn,
      body_en: bodyEn,
    }
    const res = await fetch(`/api/admin/email-templates/${template.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) {
      setError(data.error || 'Échec de la sauvegarde')
      return
    }
    setSavedAt(Date.now())
    setTimeout(() => setSavedAt(null), 2500)
    router.refresh()
  }

  const toggleEnabled = async (next: boolean) => {
    setEnabled(next)
    await save({ enabled: next })
  }

  const ctx = SAMPLE_CTX
  const previewSubject = applyVariables(previewLang === 'fr' ? subjectFr : subjectEn, ctx)
  const previewBody = markdownToHtml(applyVariables(previewLang === 'fr' ? bodyFr : bodyEn, ctx))

  return (
    <div className={`bg-white border rounded-lg overflow-hidden transition ${enabled ? 'border-gray-200' : 'border-gray-200 opacity-60'}`}>
      <button onClick={() => setExpanded(e => !e)} className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 text-left">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {expanded ? <ChevronDown size={16} className="text-gray-400 flex-shrink-0" /> : <ChevronRight size={16} className="text-gray-400 flex-shrink-0" />}
          {template.is_internal ? <Settings size={16} className="text-gray-500 flex-shrink-0" /> : <Mail size={16} className="text-emerald-600 flex-shrink-0" />}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-gray-900">{template.name}</span>
              {template.is_internal && <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">interne</span>}
            </div>
            {template.description && <div className="text-xs text-gray-500 truncate">{template.description}</div>}
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="text-[10px] text-gray-400">{TRIGGER_LABEL[template.trigger_event]}</span>
          <label className="inline-flex items-center cursor-pointer" onClick={e => e.stopPropagation()}>
            <input
              type="checkbox"
              checked={enabled}
              onChange={e => toggleEnabled(e.target.checked)}
              className="sr-only peer"
            />
            <div className="relative w-10 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
          </label>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-100 p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* FR */}
            <div>
              <h4 className="text-xs uppercase tracking-wide text-gray-500 font-semibold mb-2">Français</h4>
              <label className="block text-xs font-medium mb-1">Sujet</label>
              <input
                type="text"
                value={subjectFr}
                onChange={e => setSubjectFr(e.target.value)}
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 mb-3"
              />
              <label className="block text-xs font-medium mb-1">Corps</label>
              <textarea
                value={bodyFr}
                onChange={e => setBodyFr(e.target.value)}
                rows={10}
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-y"
              />
            </div>

            {/* EN */}
            <div>
              <h4 className="text-xs uppercase tracking-wide text-gray-500 font-semibold mb-2">English</h4>
              <label className="block text-xs font-medium mb-1">Subject</label>
              <input
                type="text"
                value={subjectEn}
                onChange={e => setSubjectEn(e.target.value)}
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 mb-3"
              />
              <label className="block text-xs font-medium mb-1">Body</label>
              <textarea
                value={bodyEn}
                onChange={e => setBodyEn(e.target.value)}
                rows={10}
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-y"
              />
            </div>
          </div>

          {/* Variables */}
          {template.available_variables.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-1">Variables disponibles (clic pour copier) :</p>
              <div className="flex flex-wrap gap-1.5">
                {template.available_variables.map(v => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => navigator.clipboard.writeText(`{{${v}}}`)}
                    className="text-xs px-2 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded hover:bg-emerald-100"
                    title={`Exemple : ${SAMPLE_CTX[v] || ''}`}
                  >
                    {`{{${v}}}`}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Preview */}
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-200">
              <span className="text-xs text-gray-500 inline-flex items-center gap-1"><Eye size={12} /> Aperçu (valeurs d&apos;exemple)</span>
              <div className="flex items-center gap-0.5 bg-white border border-gray-200 rounded-full p-0.5">
                <button onClick={() => setPreviewLang('fr')} className={`px-2 py-0.5 text-xs rounded-full ${previewLang === 'fr' ? 'bg-emerald-500 text-white' : 'text-gray-600'}`}>FR</button>
                <button onClick={() => setPreviewLang('en')} className={`px-2 py-0.5 text-xs rounded-full ${previewLang === 'en' ? 'bg-emerald-500 text-white' : 'text-gray-600'}`}>EN</button>
              </div>
            </div>
            <div className="p-4 bg-white">
              <div className="text-[11px] text-gray-500 mb-1">Sujet</div>
              <div className="text-sm font-medium mb-3">{previewSubject || <em className="text-gray-400">vide</em>}</div>
              <div className="text-[11px] text-gray-500 mb-1">Corps</div>
              <div className="text-sm border border-gray-100 rounded p-3 bg-gray-50" dangerouslySetInnerHTML={{ __html: previewBody || '<em>vide</em>' }} />
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-2 border-t border-gray-100">
            <div className="text-xs">
              {error && <span className="text-red-600">{error}</span>}
              {savedAt && !error && <span className="text-emerald-700 inline-flex items-center gap-1"><Check size={12} /> Sauvegardé</span>}
            </div>
            <button
              onClick={() => save()}
              disabled={!dirty || saving}
              className="inline-flex items-center gap-2 bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-emerald-600 disabled:opacity-50"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Enregistrer
            </button>
          </div>

          {/* Hidden Send icon ref to keep tree-shaking happy if user removes preview later */}
          <Send size={0} className="hidden" />
        </div>
      )}
    </div>
  )
}
