'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Plus, Loader2, FolderKanban } from 'lucide-react'
import type { Committee, CommitteeApplication, CommitteeJuror, CommitteeStatus } from '@/lib/types'

const STATUS_LABELS: Record<CommitteeStatus, string> = {
  draft: 'Brouillon',
  active: 'Actif',
  closed: 'Clôturé',
}
const STATUS_COLORS: Record<CommitteeStatus, string> = {
  draft: 'bg-gray-100 text-gray-700',
  active: 'bg-blue-100 text-blue-800',
  closed: 'bg-gray-200 text-gray-700',
}

export default function CommitteesClient({
  committees,
  committeeApps,
  committeeJurors,
}: {
  committees: Committee[]
  committeeApps: CommitteeApplication[]
  committeeJurors: CommitteeJuror[]
}) {
  const router = useRouter()
  const supabase = createClient()
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    const { data, error: err } = await supabase
      .from('committees')
      .insert({ name: name.trim(), description: description.trim() || null })
      .select()
      .single()
    if (err) {
      setError(err.message)
      setSubmitting(false)
      return
    }
    setName('')
    setDescription('')
    setShowForm(false)
    setSubmitting(false)
    if (data) router.push(`/admin/committees/${data.id}`)
    else router.refresh()
  }

  const appsByCommittee = new Map<string, number>()
  for (const a of committeeApps) appsByCommittee.set(a.committee_id, (appsByCommittee.get(a.committee_id) || 0) + 1)
  const jurorsByCommittee = new Map<string, number>()
  for (const j of committeeJurors) jurorsByCommittee.set(j.committee_id, (jurorsByCommittee.get(j.committee_id) || 0) + 1)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Comités</h1>
        <button
          onClick={() => setShowForm(s => !s)}
          className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Plus size={16} />
          Nouveau comité
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white border border-gray-200 rounded-lg p-5 mb-6 space-y-3 max-w-2xl">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm">{error}</div>
          )}
          <div>
            <label className="block text-sm font-medium mb-1">Nom</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              placeholder="Ex: Comité de sélection — Mars 2026"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Description (optionnel)</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>
          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting && <Loader2 size={14} className="animate-spin" />}
              Créer
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Annuler
            </button>
          </div>
        </form>
      )}

      {committees.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
          <FolderKanban size={48} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500 mb-4">Aucun comité pour le moment.</p>
          <button
            onClick={() => setShowForm(true)}
            className="text-sm text-blue-600 hover:underline"
          >
            Créer le premier comité
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {committees.map(c => (
            <Link
              key={c.id}
              href={`/admin/committees/${c.id}`}
              className="bg-white border border-gray-200 rounded-lg p-5 hover:shadow-md transition"
            >
              <div className="flex items-start justify-between mb-2">
                <h2 className="font-semibold text-base">{c.name}</h2>
                <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[c.status]}`}>
                  {STATUS_LABELS[c.status]}
                </span>
              </div>
              {c.description && (
                <p className="text-sm text-gray-600 line-clamp-2 mb-3">{c.description}</p>
              )}
              <div className="flex items-center gap-4 text-xs text-gray-500">
                <span>{appsByCommittee.get(c.id) || 0} dossiers</span>
                <span>{jurorsByCommittee.get(c.id) || 0} jurys</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
