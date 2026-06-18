'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, ChevronRight, Mail, Send, Settings, Save, Eye, Loader2, Check, Plus, Trash2, Users, X } from 'lucide-react'
import type { EmailTemplate, EmailTemplateRecipientType, EmailLanguage } from '@/lib/types'
import { applyVariables, markdownToHtml } from '@/lib/email-templates'

const TRIGGER_LABEL: Record<EmailTemplate['trigger_event'], string> = {
  on_application_submitted: 'Soumission du formulaire',
  manual: 'Envoi manuel',
}

const RECIPIENT_LABEL: Record<EmailTemplateRecipientType, string> = {
  application: 'Candidat',
  juror: 'Jury',
}

const VARS_BY_RECIPIENT: Record<EmailTemplateRecipientType, string[]> = {
  application: ['founder_first_name', 'founder_name', 'startup_name', 'stage', 'sector', 'review_url'],
  juror: ['juror_first_name', 'juror_name', 'juror_role'],
}

const SAMPLE_CTX: Record<string, string> = {
  founder_first_name: 'Aïcha',
  founder_name: 'Aïcha El Idrissi',
  startup_name: 'Acme Startup',
  stage: 'MVP',
  sector: 'AI',
  review_url: 'https://ceedflow.com/admin/applications/123',
  juror_first_name: 'Mehdi',
  juror_name: 'Mehdi Bennani',
  juror_role: 'Investisseur',
}

export default function EmailTemplatesClient({ templates }: { templates: EmailTemplate[] }) {
  const [showNew, setShowNew] = useState(false)
  const router = useRouter()

  const auto = templates.filter(t => t.trigger_event === 'on_application_submitted')
  const manualApp = templates.filter(t => t.trigger_event === 'manual' && t.recipient_type === 'application')
  const manualJury = templates.filter(t => t.trigger_event === 'manual' && t.recipient_type === 'juror')

  return (
    <div>
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold mb-1">Templates email</h1>
          <p className="text-sm text-gray-500">
            Modifie les emails automatiques et manuels envoyés par la plateforme. Désactive un template pour suspendre son envoi.
          </p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="inline-flex items-center gap-2 bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-emerald-600 flex-shrink-0"
        >
          <Plus size={16} /> Nouveau template
        </button>
      </div>

      {auto.length > 0 && (
        <Section title="Envois automatiques" subtitle="Déclenchés à la soumission du formulaire de candidature">
          {auto.map(t => <TemplateCard key={t.id} template={t} />)}
        </Section>
      )}

      {manualApp.length > 0 && (
        <Section title="Templates candidats" subtitle="Disponibles depuis la fiche d'une candidature">
          {manualApp.map(t => <TemplateCard key={t.id} template={t} />)}
        </Section>
      )}

      {manualJury.length > 0 && (
        <Section title="Templates jurys" subtitle="Disponibles depuis la fiche d'un membre du jury">
          {manualJury.map(t => <TemplateCard key={t.id} template={t} />)}
        </Section>
      )}

      {showNew && (
        <NewTemplateModal
          onClose={() => setShowNew(false)}
          onCreated={() => {
            setShowNew(false)
            router.refresh()
          }}
        />
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
  const [deleting, setDeleting] = useState(false)

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

  const remove = async () => {
    if (!confirm(`Supprimer définitivement le template « ${template.name} » ?`)) return
    setDeleting(true)
    const res = await fetch(`/api/admin/email-templates/${template.id}`, { method: 'DELETE' })
    setDeleting(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      alert(data.error || 'Échec de la suppression')
      return
    }
    router.refresh()
  }

  const ctx = SAMPLE_CTX
  const previewSubject = applyVariables(previewLang === 'fr' ? subjectFr : subjectEn, ctx)
  const previewBody = markdownToHtml(applyVariables(previewLang === 'fr' ? bodyFr : bodyEn, ctx))
  const isCustom = template.trigger_event === 'manual'

  return (
    <div className={`bg-white border rounded-lg overflow-hidden transition ${enabled ? 'border-gray-200' : 'border-gray-200 opacity-60'}`}>
      <button onClick={() => setExpanded(e => !e)} className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 text-left">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {expanded ? <ChevronDown size={16} className="text-gray-400 flex-shrink-0" /> : <ChevronRight size={16} className="text-gray-400 flex-shrink-0" />}
          {template.is_internal ? <Settings size={16} className="text-gray-500 flex-shrink-0" /> : template.recipient_type === 'juror' ? <Users size={16} className="text-indigo-600 flex-shrink-0" /> : <Mail size={16} className="text-emerald-600 flex-shrink-0" />}
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-gray-900">{template.name}</span>
              {template.is_internal && <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">interne</span>}
              <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-gray-50 text-gray-500 border border-gray-200">{RECIPIENT_LABEL[template.recipient_type]}</span>
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

          <div className="flex items-center justify-between pt-2 border-t border-gray-100">
            <div className="text-xs flex items-center gap-3">
              {error && <span className="text-red-600">{error}</span>}
              {savedAt && !error && <span className="text-emerald-700 inline-flex items-center gap-1"><Check size={12} /> Sauvegardé</span>}
              {isCustom && (
                <button
                  onClick={remove}
                  disabled={deleting}
                  className="text-xs text-red-600 hover:text-red-800 inline-flex items-center gap-1"
                >
                  <Trash2 size={12} /> Supprimer
                </button>
              )}
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

          <Send size={0} className="hidden" />
        </div>
      )}
    </div>
  )
}

function NewTemplateModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('')
  const [key, setKey] = useState('')
  const [description, setDescription] = useState('')
  const [recipientType, setRecipientType] = useState<EmailTemplateRecipientType>('application')
  const [subjectFr, setSubjectFr] = useState('')
  const [bodyFr, setBodyFr] = useState('')
  const [subjectEn, setSubjectEn] = useState('')
  const [bodyEn, setBodyEn] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const vars = VARS_BY_RECIPIENT[recipientType]
  const autoKey = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
  const effectiveKey = key.trim() || autoKey

  const submit = async () => {
    setError('')
    if (!name.trim() || !subjectFr.trim() || !bodyFr.trim() || !subjectEn.trim() || !bodyEn.trim()) {
      setError('Tous les champs sont requis (FR + EN).')
      return
    }
    setSaving(true)
    const res = await fetch('/api/admin/email-templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        key: effectiveKey,
        description: description || null,
        recipient_type: recipientType,
        is_internal: false,
        enabled: true,
        subject_fr: subjectFr,
        body_fr: bodyFr,
        subject_en: subjectEn,
        body_en: bodyEn,
        available_variables: vars,
      }),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) {
      setError(data.error || 'Échec de la création')
      return
    }
    onCreated()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-3xl rounded-lg shadow-xl my-8">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="font-semibold">Nouveau template</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="p-6 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1">Nom du template *</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="ex: Relance pré-jury"
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Destinataire *</label>
              <select
                value={recipientType}
                onChange={e => setRecipientType(e.target.value as EmailTemplateRecipientType)}
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="application">Candidat (depuis une fiche candidature)</option>
                <option value="juror">Jury (depuis une fiche jury)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1">Description (optionnelle)</label>
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1">Clé technique (auto si vide)</label>
            <input
              type="text"
              value={key}
              onChange={e => setKey(e.target.value)}
              placeholder={autoKey || 'auto'}
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
            <p className="text-[10px] text-gray-500 mt-1">Identifiant unique. Auto-généré à partir du nom si vide.</p>
          </div>

          <div>
            <p className="text-xs text-gray-500 mb-1">Variables disponibles pour ce destinataire :</p>
            <div className="flex flex-wrap gap-1.5">
              {vars.map(v => (
                <button
                  key={v}
                  type="button"
                  onClick={() => navigator.clipboard.writeText(`{{${v}}}`)}
                  className="text-xs px-2 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded hover:bg-emerald-100"
                >
                  {`{{${v}}}`}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h4 className="text-xs uppercase tracking-wide text-gray-500 font-semibold mb-2">Français</h4>
              <label className="block text-xs font-medium mb-1">Sujet</label>
              <input
                type="text"
                value={subjectFr}
                onChange={e => setSubjectFr(e.target.value)}
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 mb-2"
              />
              <label className="block text-xs font-medium mb-1">Corps</label>
              <textarea
                value={bodyFr}
                onChange={e => setBodyFr(e.target.value)}
                rows={8}
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-y"
              />
            </div>
            <div>
              <h4 className="text-xs uppercase tracking-wide text-gray-500 font-semibold mb-2">English</h4>
              <label className="block text-xs font-medium mb-1">Subject</label>
              <input
                type="text"
                value={subjectEn}
                onChange={e => setSubjectEn(e.target.value)}
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 mb-2"
              />
              <label className="block text-xs font-medium mb-1">Body</label>
              <textarea
                value={bodyEn}
                onChange={e => setBodyEn(e.target.value)}
                rows={8}
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-y"
              />
            </div>
          </div>

          {error && <div className="text-sm text-red-600">{error}</div>}
        </div>
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-2">
          <button onClick={onClose} className="text-sm text-gray-600 hover:text-gray-800 px-4 py-2">Annuler</button>
          <button
            onClick={submit}
            disabled={saving}
            className="inline-flex items-center gap-2 bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-emerald-600 disabled:opacity-50"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Créer
          </button>
        </div>
      </div>
    </div>
  )
}
