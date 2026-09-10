'use client'

import { useMemo, useState } from 'react'
import { Calendar, Clock, Loader2, Check, Lock, X } from 'lucide-react'
import type { BookingSlot } from '@/lib/types'

const DAY_LABEL: Record<string, string> = {
  '2026-09-28': 'Lundi 28 septembre',
  '2026-09-29': 'Mardi 29 septembre',
}

/**
 * Group slots by their range block. Ranges are inferred from a 30-min gap
 * between consecutive slots (matches the seed: 09:00–10:30, 10:45–12:15,
 * 13:45–15:30, 15:45–17:45).
 */
function groupByRange(daySlots: BookingSlot[]): BookingSlot[][] {
  const groups: BookingSlot[][] = []
  for (const slot of daySlots) {
    const prev = groups[groups.length - 1]?.slice(-1)[0]
    if (!prev || slot.start_time !== prev.end_time) {
      groups.push([slot])
    } else {
      groups[groups.length - 1].push(slot)
    }
  }
  return groups
}

interface Props {
  slots: BookingSlot[]
  takenSlotIds: string[]
  closed: boolean
}

export default function BookingClient({ slots, takenSlotIds, closed }: Props) {
  const [selected, setSelected] = useState<BookingSlot | null>(null)
  const [startupName, setStartupName] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [confirmed, setConfirmed] = useState<null | { day: string; dayLabel: string; start_time: string; end_time: string }>(null)

  const taken = useMemo(() => new Set(takenSlotIds), [takenSlotIds])

  const slotsByDay = useMemo(() => {
    const map = new Map<string, BookingSlot[]>()
    for (const s of slots) {
      if (!map.has(s.day)) map.set(s.day, [])
      map.get(s.day)!.push(s)
    }
    return map
  }, [slots])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selected) return
    setSubmitting(true)
    setError('')
    const res = await fetch('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slot_id: selected.id,
        startup_name: startupName,
        first_name: firstName,
        last_name: lastName,
        email,
      }),
    })
    const data = await res.json()
    setSubmitting(false)
    if (!res.ok) {
      setError(data.error || 'Erreur lors de la réservation.')
      return
    }
    setConfirmed(data.slot)
  }

  if (closed) {
    return (
      <div className="bg-white border border-gray-200 rounded-2xl p-10 text-center shadow-sm">
        <div className="w-14 h-14 rounded-full bg-gray-100 mx-auto mb-5 flex items-center justify-center">
          <Lock className="text-gray-500" size={22} />
        </div>
        <h1 className="text-2xl font-bold mb-3">Réservations clôturées</h1>
        <p className="text-gray-600 max-w-md mx-auto leading-relaxed">
          La période de réservation des créneaux est terminée. Pour toute question,
          contactez-nous à <a className="text-emerald-700 underline" href="mailto:info@ceed-morocco.org">info@ceed-morocco.org</a>.
        </p>
      </div>
    )
  }

  if (confirmed) {
    return (
      <div className="bg-white border border-emerald-200 rounded-2xl p-10 text-center shadow-sm">
        <div className="w-14 h-14 rounded-full bg-emerald-100 mx-auto mb-5 flex items-center justify-center">
          <Check className="text-emerald-600" size={26} strokeWidth={3} />
        </div>
        <h1 className="text-2xl font-bold mb-3">Créneau confirmé</h1>
        <p className="text-gray-600 mb-5 leading-relaxed">
          Votre rendez-vous est réservé. Un email de confirmation vient de vous être envoyé.
        </p>
        <div className="inline-flex flex-col items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-6 py-4">
          <div className="inline-flex items-center gap-2 text-emerald-800 font-semibold">
            <Calendar size={16} /> {confirmed.dayLabel}
          </div>
          <div className="inline-flex items-center gap-2 text-emerald-800 font-semibold text-lg">
            <Clock size={16} /> {confirmed.start_time} – {confirmed.end_time}
          </div>
          <div className="text-xs text-emerald-700 mt-1">Heure du Maroc</div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold mb-2">Réservez votre créneau</h1>
        <p className="text-gray-600">Créneaux de 15 minutes · heure du Maroc</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {Array.from(slotsByDay.entries()).map(([day, daySlots]) => (
          <div key={day} className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <Calendar size={16} className="text-emerald-600" />
              <h2 className="font-semibold">{DAY_LABEL[day] || day}</h2>
            </div>
            <div className="space-y-3">
              {groupByRange(daySlots).map((range, i) => (
                <div key={i}>
                  <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-1.5">
                    {range[0].start_time} – {range[range.length - 1].end_time}
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {range.map(slot => {
                      const isTaken = taken.has(slot.id)
                      const isSelected = selected?.id === slot.id
                      return (
                        <button
                          key={slot.id}
                          onClick={() => !isTaken && setSelected(slot)}
                          disabled={isTaken}
                          className={`px-2 py-1.5 rounded-lg text-xs font-medium border transition ${
                            isTaken
                              ? 'bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed line-through'
                              : isSelected
                              ? 'bg-emerald-500 border-emerald-500 text-white shadow-sm'
                              : 'bg-white border-gray-200 text-gray-700 hover:border-emerald-400 hover:text-emerald-700'
                          }`}
                        >
                          {slot.start_time}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {selected && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => !submitting && setSelected(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100">
              <div>
                <div className="text-xs text-gray-500 mb-1">Créneau sélectionné</div>
                <div className="font-semibold">
                  {DAY_LABEL[selected.day]} · {selected.start_time} – {selected.end_time}
                </div>
              </div>
              <button onClick={() => !submitting && setSelected(null)} disabled={submitting} className="text-gray-400 hover:text-gray-700">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={submit} className="p-6 space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1">Nom de la startup</label>
                <input
                  type="text"
                  value={startupName}
                  onChange={e => setStartupName(e.target.value)}
                  required
                  disabled={submitting}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1">Prénom</label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={e => setFirstName(e.target.value)}
                    required
                    disabled={submitting}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Nom</label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={e => setLastName(e.target.value)}
                    required
                    disabled={submitting}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  disabled={submitting}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <p className="text-[11px] text-gray-500 mt-1">
                  Un seul créneau par adresse email. Un email de confirmation sera envoyé.
                </p>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-2.5 text-sm">
                  {error}
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  disabled={submitting}
                  className="flex-1 border border-gray-300 rounded-lg px-4 py-2 text-sm hover:bg-gray-50"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 inline-flex items-center justify-center gap-2 bg-emerald-500 text-white rounded-lg px-4 py-2 text-sm font-semibold hover:bg-emerald-600 disabled:opacity-50"
                >
                  {submitting ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                  Confirmer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
