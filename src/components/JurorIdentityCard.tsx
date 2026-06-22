'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Mail, Phone, Briefcase, Building2, Pencil, Save, X, Loader2, Check } from 'lucide-react'
import type { Juror } from '@/lib/types'

interface Props {
  juror: Juror
  /** Actions to render in the top-right (e.g. <JurorSendEmailButton/>). */
  actions?: React.ReactNode
}

export default function JurorIdentityCard({ juror, actions }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [editing, setEditing] = useState(false)
  const [firstName, setFirstName] = useState(juror.first_name)
  const [lastName, setLastName] = useState(juror.last_name)
  const [email, setEmail] = useState(juror.email || '')
  const [phone, setPhone] = useState(juror.phone || '')
  const [role, setRole] = useState(juror.role || '')
  const [company, setCompany] = useState(juror.company || '')
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [error, setError] = useState('')

  const cancel = () => {
    setFirstName(juror.first_name)
    setLastName(juror.last_name)
    setEmail(juror.email || '')
    setPhone(juror.phone || '')
    setRole(juror.role || '')
    setCompany(juror.company || '')
    setError('')
    setEditing(false)
  }

  const save = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      setError('Prénom et nom sont obligatoires.')
      return
    }
    setSaving(true)
    setError('')
    const trimmedEmail = email.trim().toLowerCase()
    const { error: err } = await supabase
      .from('jurors')
      .update({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: trimmedEmail || null,
        phone: phone.trim() || null,
        role: role.trim() || null,
        company: company.trim() || null,
      })
      .eq('id', juror.id)
    setSaving(false)
    if (err) {
      setError(err.message)
      return
    }
    setSavedAt(Date.now())
    setEditing(false)
    setTimeout(() => setSavedAt(null), 2500)
    router.refresh()
  }

  if (!editing) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
        <div className="flex items-start justify-between gap-4 mb-2">
          <h1 className="text-2xl font-bold">{juror.first_name} {juror.last_name}</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setEditing(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700"
              title="Modifier la fiche"
            >
              <Pencil size={14} /> Modifier
            </button>
            {actions}
          </div>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-gray-600">
          {juror.email ? (
            <a href={`mailto:${juror.email}`} className="flex items-center gap-1 hover:text-blue-700">
              <Mail size={14} />
              {juror.email}
            </a>
          ) : (
            <span className="flex items-center gap-1 italic text-gray-400">
              <Mail size={14} /> To add
            </span>
          )}
          {juror.phone && (
            <span className="flex items-center gap-1">
              <Phone size={14} />
              {juror.phone}
            </span>
          )}
          {juror.role && (
            <span className="flex items-center gap-1">
              <Briefcase size={14} />
              {juror.role}
            </span>
          )}
          {juror.company && (
            <span className="flex items-center gap-1">
              <Building2 size={14} />
              {juror.company}
            </span>
          )}
        </div>
        {savedAt && (
          <p className="mt-2 text-xs text-emerald-700 inline-flex items-center gap-1">
            <Check size={12} /> Modifications sauvegardées
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="bg-white border border-emerald-300 rounded-lg p-6 mb-6">
      <div className="flex items-start justify-between gap-4 mb-4">
        <h2 className="text-lg font-semibold">Modifier la fiche</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={cancel}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700"
          >
            <X size={14} /> Annuler
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 disabled:opacity-50"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Sauvegarder
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm mb-3">{error}</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium mb-1">Prénom *</label>
          <input
            type="text"
            value={firstName}
            onChange={e => setFirstName(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Nom *</label>
          <input
            type="text"
            value={lastName}
            onChange={e => setLastName(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        <div className="md:col-span-2">
          <label className="block text-xs font-medium mb-1">Email <span className="text-gray-400">(laisser vide pour « To add »)</span></label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Téléphone</label>
          <input
            type="tel"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Fonction</label>
          <input
            type="text"
            value={role}
            onChange={e => setRole(e.target.value)}
            placeholder="Ex: VC, CEO, Mentor…"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        <div className="md:col-span-2">
          <label className="block text-xs font-medium mb-1">Entreprise / Organisation</label>
          <input
            type="text"
            value={company}
            onChange={e => setCompany(e.target.value)}
            placeholder="Ex: Acme Ventures, CEED Maroc…"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
      </div>
    </div>
  )
}
