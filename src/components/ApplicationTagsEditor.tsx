'use client'

import { useEffect, useState } from 'react'
import { Tag, Plus, X, Check } from 'lucide-react'
import type { ApplicationTag } from '@/lib/types'

interface Props {
  applicationId: string
  initialTags: ApplicationTag[]
  allTags: ApplicationTag[]
}

const PRESET_COLORS = ['#6b7280', '#10b981', '#3b82f6', '#a855f7', '#ec4899', '#f97316', '#eab308', '#ef4444']

export default function ApplicationTagsEditor({ applicationId, initialTags, allTags: initialAll }: Props) {
  const [tags, setTags] = useState<ApplicationTag[]>(initialTags)
  const [allTags, setAllTags] = useState<ApplicationTag[]>(initialAll)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [newColor, setNewColor] = useState(PRESET_COLORS[0])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!pickerOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPickerOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pickerOpen])

  const persist = async (nextIds: string[]) => {
    await fetch(`/api/admin/applications/${applicationId}/tags`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tagIds: nextIds }),
    })
  }

  const toggleTag = async (tag: ApplicationTag) => {
    const exists = tags.find(t => t.id === tag.id)
    const next = exists ? tags.filter(t => t.id !== tag.id) : [...tags, tag]
    setTags(next)
    await persist(next.map(t => t.id))
  }

  const removeTag = async (tagId: string) => {
    const next = tags.filter(t => t.id !== tagId)
    setTags(next)
    await persist(next.map(t => t.id))
  }

  const createTag = async () => {
    if (!newLabel.trim()) return
    setSaving(true)
    setError('')
    const res = await fetch('/api/admin/tags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: newLabel.trim(), color: newColor }),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) {
      setError(data.error || 'Échec')
      return
    }
    const tag: ApplicationTag = data.tag
    setAllTags(prev => [...prev, tag].sort((a, b) => a.label.localeCompare(b.label)))
    setNewLabel('')
    await toggleTag(tag)
  }

  return (
    <div className="relative inline-block">
      <div className="flex items-center flex-wrap gap-1.5">
        {tags.map(t => (
          <span
            key={t.id}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-white"
            style={{ backgroundColor: t.color }}
          >
            {t.label}
            <button onClick={() => removeTag(t.id)} className="hover:opacity-70" title="Retirer">
              <X size={10} strokeWidth={3} />
            </button>
          </span>
        ))}
        <button
          onClick={() => setPickerOpen(o => !o)}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border border-dashed border-gray-300 text-gray-600 hover:border-gray-400 hover:text-gray-800"
        >
          <Plus size={10} /> {tags.length === 0 ? 'Ajouter un statut' : 'Ajouter'}
        </button>
      </div>

      {pickerOpen && (
        <div className="absolute z-30 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-3 w-72 left-0">
          <div className="flex items-center gap-2 mb-2">
            <Tag size={14} className="text-gray-400" />
            <span className="text-xs font-semibold text-gray-600">Statuts personnalisés</span>
            <button onClick={() => setPickerOpen(false)} className="ml-auto text-gray-400 hover:text-gray-700"><X size={14} /></button>
          </div>
          <div className="max-h-44 overflow-y-auto space-y-1 mb-3">
            {allTags.length === 0 ? (
              <p className="text-xs text-gray-500 italic">Aucun statut. Crée le premier ci-dessous.</p>
            ) : (
              allTags.map(t => {
                const active = !!tags.find(a => a.id === t.id)
                return (
                  <button
                    key={t.id}
                    onClick={() => toggleTag(t)}
                    className="w-full flex items-center gap-2 text-left px-2 py-1 rounded hover:bg-gray-50"
                  >
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: t.color }} />
                    <span className="text-sm flex-1">{t.label}</span>
                    {active && <Check size={12} className="text-emerald-600" />}
                  </button>
                )
              })
            )}
          </div>
          <div className="border-t border-gray-100 pt-2">
            <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">Nouveau statut</p>
            <div className="flex items-center gap-1.5 mb-2">
              {PRESET_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setNewColor(c)}
                  className={`w-5 h-5 rounded-full ${newColor === c ? 'ring-2 ring-offset-1 ring-gray-400' : ''}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
            <div className="flex gap-1">
              <input
                type="text"
                value={newLabel}
                onChange={e => setNewLabel(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && createTag()}
                placeholder="ex: Présélectionné cohorte 2"
                className="flex-1 border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
              <button
                onClick={createTag}
                disabled={saving || !newLabel.trim()}
                className="bg-emerald-500 text-white text-xs px-2 py-1 rounded hover:bg-emerald-600 disabled:opacity-50"
              >
                Créer
              </button>
            </div>
            {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
          </div>
        </div>
      )}
    </div>
  )
}
