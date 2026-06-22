'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Plus, Trash2 } from 'lucide-react'
import type { JurorAction, AdminUser } from '@/lib/types'

interface Props {
  jurorId: string
  actions: JurorAction[]
  adminUsers: AdminUser[]
  currentUserId: string
}

export default function JurorActionsBlock({ jurorId, actions, adminUsers, currentUserId }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [newActionText, setNewActionText] = useState('')
  const [adding, setAdding] = useState(false)
  const [draftLabels, setDraftLabels] = useState<Record<string, string>>({})

  const sorted = [...actions].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )

  const addAction = async (e: React.FormEvent) => {
    e.preventDefault()
    const text = newActionText.trim()
    if (!text) return
    setAdding(true)
    await supabase.from('juror_actions').insert({
      juror_id: jurorId,
      action_type: text,
      created_by: currentUserId,
    })
    setNewActionText('')
    setAdding(false)
    router.refresh()
  }

  const updateAction = async (action: JurorAction, patch: Partial<JurorAction>) => {
    await supabase
      .from('juror_actions')
      .update({
        ...patch,
        ...(patch.is_done !== undefined
          ? { completed_at: patch.is_done ? new Date().toISOString() : null }
          : {}),
      })
      .eq('id', action.id)
    router.refresh()
  }

  const saveLabel = (action: JurorAction) => {
    const draft = (draftLabels[action.id] ?? action.action_type).trim()
    if (!draft || draft === action.action_type) {
      setDraftLabels(prev => {
        const next = { ...prev }
        delete next[action.id]
        return next
      })
      return
    }
    updateAction(action, { action_type: draft })
    setDraftLabels(prev => {
      const next = { ...prev }
      delete next[action.id]
      return next
    })
  }

  const removeAction = async (action: JurorAction) => {
    await supabase.from('juror_actions').delete().eq('id', action.id)
    router.refresh()
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5">
      <h3 className="font-semibold text-sm text-gray-500 uppercase tracking-wide mb-3">Actions</h3>

      <form onSubmit={addAction} className="flex items-center gap-2 mb-3">
        <input
          type="text"
          value={newActionText}
          onChange={e => setNewActionText(e.target.value)}
          placeholder="Ajouter une action…"
          className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          disabled={adding || !newActionText.trim()}
          className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          <Plus size={14} />
        </button>
      </form>

      {sorted.length === 0 ? (
        <p className="text-sm text-gray-500">Aucune action pour le moment.</p>
      ) : (
        <div className="space-y-2">
          {sorted.map(action => {
            const draft = draftLabels[action.id] ?? action.action_type
            return (
              <div
                key={action.id}
                className={`border rounded-lg p-2 space-y-2 ${action.is_done ? 'bg-gray-50 border-gray-200' : 'border-gray-200'}`}
              >
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={action.is_done}
                    onChange={e => updateAction(action, { is_done: e.target.checked })}
                    className="w-4 h-4 rounded border-gray-300 cursor-pointer"
                    title={action.is_done ? 'Marquer comme à faire' : 'Marquer comme fait'}
                  />
                  <input
                    type="text"
                    value={draft}
                    onChange={e => setDraftLabels(prev => ({ ...prev, [action.id]: e.target.value }))}
                    onBlur={() => saveLabel(action)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        ;(e.target as HTMLInputElement).blur()
                      }
                    }}
                    className={`flex-1 text-sm border border-transparent hover:border-gray-200 focus:border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-transparent ${action.is_done ? 'line-through text-gray-500' : ''}`}
                  />
                  <button
                    onClick={() => removeAction(action)}
                    className="p-1 text-gray-400 hover:text-red-600"
                    title="Supprimer"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <select
                  value={action.assigned_admin_id || ''}
                  onChange={e => updateAction(action, { assigned_admin_id: e.target.value || null })}
                  className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Non assigné</option>
                  {adminUsers.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.first_name || u.last_name ? `${u.first_name || ''} ${u.last_name || ''}`.trim() : u.email}
                    </option>
                  ))}
                </select>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
