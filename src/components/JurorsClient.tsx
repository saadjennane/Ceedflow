'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { UserPlus, Mail, Search, Loader2 } from 'lucide-react'
import type { Juror, Committee, CommitteeJuror, JurorRating } from '@/lib/types'

export default function JurorsClient({
  jurors,
  committeeJurors,
  committees,
  ratings,
}: {
  jurors: Juror[]
  committeeJurors: CommitteeJuror[]
  committees: Committee[]
  ratings: JurorRating[]
}) {
  const router = useRouter()
  const supabase = createClient()
  const [showForm, setShowForm] = useState(false)
  const [search, setSearch] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [role, setRole] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    const { error: err } = await supabase.from('jurors').insert({
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim() || null,
      role: role.trim() || null,
    })
    if (err) {
      setError(err.message)
      setSubmitting(false)
      return
    }
    setFirstName('')
    setLastName('')
    setEmail('')
    setPhone('')
    setRole('')
    setShowForm(false)
    setSubmitting(false)
    router.refresh()
  }

  const filtered = jurors.filter(j => {
    if (!search) return true
    const s = search.toLowerCase()
    return (
      j.first_name.toLowerCase().includes(s) ||
      j.last_name.toLowerCase().includes(s) ||
      j.email.toLowerCase().includes(s) ||
      (j.role || '').toLowerCase().includes(s)
    )
  })

  const committeeCountByJuror = new Map<string, number>()
  for (const cj of committeeJurors) {
    committeeCountByJuror.set(cj.juror_id, (committeeCountByJuror.get(cj.juror_id) || 0) + 1)
  }

  const ratingsByJuror = new Map<string, Set<string>>()
  for (const r of ratings) {
    if (!ratingsByJuror.has(r.juror_id)) ratingsByJuror.set(r.juror_id, new Set())
    ratingsByJuror.get(r.juror_id)!.add(r.application_id)
  }

  // (committees variable kept for future use in stats but not displayed here)
  void committees

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Jury</h1>
        <button
          onClick={() => setShowForm(s => !s)}
          className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <UserPlus size={16} />
          Ajouter un jury
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className="bg-white border border-gray-200 rounded-lg p-5 mb-6 space-y-3 max-w-2xl">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm">{error}</div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">Prénom</label>
              <input
                type="text"
                value={firstName}
                onChange={e => setFirstName(e.target.value)}
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Nom</label>
              <input
                type="text"
                value={lastName}
                onChange={e => setLastName(e.target.value)}
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">Téléphone (optionnel)</label>
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Rôle / Fonction (optionnel)</label>
              <input
                type="text"
                value={role}
                onChange={e => setRole(e.target.value)}
                placeholder="Ex: VC chez X, CEO de Y…"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting && <Loader2 size={14} className="animate-spin" />}
              Ajouter
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

      <div className="mb-4 relative max-w-md">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher un jury…"
          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Nom</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Email</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Rôle</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Comités</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Startups notées</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-12 text-gray-500">
                  {jurors.length === 0 ? 'Aucun jury pour le moment.' : 'Aucun résultat.'}
                </td>
              </tr>
            ) : (
              filtered.map(j => (
                <tr key={j.id} className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer" onClick={() => router.push(`/admin/jurors/${j.id}`)}>
                  <td className="px-4 py-3 font-medium">
                    <Link href={`/admin/jurors/${j.id}`} className="hover:underline">
                      {j.first_name} {j.last_name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    <a href={`mailto:${j.email}`} onClick={e => e.stopPropagation()} className="flex items-center gap-1 hover:text-blue-700">
                      <Mail size={12} />
                      {j.email}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{j.role || '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{committeeCountByJuror.get(j.id) || 0}</td>
                  <td className="px-4 py-3 text-gray-600">{ratingsByJuror.get(j.id)?.size || 0}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
