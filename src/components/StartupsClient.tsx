'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Search, Globe, Linkedin, MapPin, Calendar, Users, ExternalLink } from 'lucide-react'
import type { ExternalStartup, ExternalStartupSyncRun, ExternalStartupStatus } from '@/lib/types'

const STATUS_OPTIONS: { value: ExternalStartupStatus | 'all'; label: string; color: string }[] = [
  { value: 'all', label: 'Tous', color: 'bg-gray-100 text-gray-700' },
  { value: 'new', label: 'Nouveau', color: 'bg-blue-100 text-blue-800' },
  { value: 'reviewed', label: 'Évalué', color: 'bg-gray-100 text-gray-700' },
  { value: 'interested', label: 'Intéressant', color: 'bg-amber-100 text-amber-800' },
  { value: 'contacted', label: 'Contacté', color: 'bg-emerald-100 text-emerald-800' },
  { value: 'not_relevant', label: 'Non pertinent', color: 'bg-gray-100 text-gray-500' },
]

const STATUS_COLOR: Record<ExternalStartupStatus, string> = {
  new: 'bg-blue-100 text-blue-800',
  reviewed: 'bg-gray-100 text-gray-700',
  interested: 'bg-amber-100 text-amber-800',
  contacted: 'bg-emerald-100 text-emerald-800',
  not_relevant: 'bg-gray-100 text-gray-500',
}
const STATUS_LABEL: Record<ExternalStartupStatus, string> = {
  new: 'Nouveau',
  reviewed: 'Évalué',
  interested: 'Intéressant',
  contacted: 'Contacté',
  not_relevant: 'Non pertinent',
}

function formatRelative(dateStr: string) {
  const d = new Date(dateStr)
  const diffMs = Date.now() - d.getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'à l\'instant'
  if (mins < 60) return `il y a ${mins} min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `il y a ${hours} h`
  const days = Math.floor(hours / 24)
  if (days < 30) return `il y a ${days} j`
  return d.toLocaleDateString('fr-FR')
}

export default function StartupsClient({
  startups,
  lastRun,
}: {
  startups: ExternalStartup[]
  lastRun: ExternalStartupSyncRun | null
}) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<ExternalStartupStatus | 'all'>('all')
  const [filterSector, setFilterSector] = useState('')
  const [filterStage, setFilterStage] = useState('')
  const [filterCity, setFilterCity] = useState('')

  const allSectors = useMemo(() => {
    const s = new Set<string>()
    startups.forEach(x => x.sectors.forEach(sec => s.add(sec)))
    return Array.from(s).sort()
  }, [startups])

  const allStages = useMemo(() => {
    const s = new Set<string>()
    startups.forEach(x => { if (x.stage) s.add(x.stage) })
    return Array.from(s).sort()
  }, [startups])

  const allCities = useMemo(() => {
    const s = new Set<string>()
    startups.forEach(x => { if (x.city) s.add(x.city) })
    return Array.from(s).sort()
  }, [startups])

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return startups.filter(s => {
      if (filterStatus !== 'all' && s.status_internal !== filterStatus) return false
      if (filterSector && !s.sectors.includes(filterSector)) return false
      if (filterStage && s.stage !== filterStage) return false
      if (filterCity && s.city !== filterCity) return false
      if (q) {
        const hay = [
          s.name,
          s.description || '',
          s.city || '',
          (s.sectors || []).join(' '),
          s.lead_investor || '',
          (s.founders || []).map(f => f.name).join(' '),
        ].join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [startups, search, filterStatus, filterSector, filterStage, filterCity])

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: startups.length, new: 0, reviewed: 0, interested: 0, contacted: 0, not_relevant: 0 }
    startups.forEach(s => { c[s.status_internal] = (c[s.status_internal] || 0) + 1 })
    return c
  }, [startups])

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold">Startups</h1>
          <p className="text-sm text-gray-500">
            {startups.length} startups · source : thepulse.ma
            {lastRun && (
              <span className="ml-2 text-xs">
                — dernière sync {formatRelative(lastRun.started_at)} ({lastRun.status})
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Status filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        {STATUS_OPTIONS.map(o => (
          <button
            key={o.value}
            onClick={() => setFilterStatus(o.value)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
              filterStatus === o.value
                ? 'border-blue-600 bg-blue-600 text-white'
                : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            {o.label}
            <span className="ml-2 text-[10px] opacity-70">({counts[o.value] ?? 0})</span>
          </button>
        ))}
      </div>

      {/* Search + filters */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mb-4">
        <div className="relative md:col-span-2">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher (nom, description, fondateur, investisseur…)"
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select
          value={filterSector}
          onChange={e => setFilterSector(e.target.value)}
          className="text-sm border border-gray-300 rounded-lg px-3 py-2"
        >
          <option value="">Tous secteurs</option>
          {allSectors.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select
          value={filterStage}
          onChange={e => setFilterStage(e.target.value)}
          className="text-sm border border-gray-300 rounded-lg px-3 py-2"
        >
          <option value="">Tous stades</option>
          {allStages.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select
          value={filterCity}
          onChange={e => setFilterCity(e.target.value)}
          className="text-sm border border-gray-300 rounded-lg px-3 py-2"
        >
          <option value="">Toutes villes</option>
          {allCities.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        {(filterSector || filterStage || filterCity || search) && (
          <button
            onClick={() => { setSearch(''); setFilterSector(''); setFilterStage(''); setFilterCity('') }}
            className="text-sm text-gray-500 hover:text-blue-700 underline self-center"
          >
            Effacer les filtres
          </button>
        )}
      </div>

      {/* Results count */}
      <div className="text-sm text-gray-500 mb-3">{filtered.length} résultats</div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Startup</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Secteurs</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Stade</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Ville</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Levée</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Statut</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-12 text-gray-500">
                  {startups.length === 0
                    ? "Aucune startup en base. Lance le scraper en local : npx tsx scripts/scrape-thepulse.ts"
                    : 'Aucun résultat pour ces filtres.'}
                </td>
              </tr>
            ) : (
              filtered.slice(0, 500).map(s => (
                <tr
                  key={s.id}
                  className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                  onClick={() => router.push(`/admin/startups/${s.id}`)}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {s.logo_url && (
                        <img src={s.logo_url} alt="" className="w-8 h-8 rounded-full object-cover border border-gray-200 bg-white" />
                      )}
                      <div>
                        <Link href={`/admin/startups/${s.id}`} className="font-medium text-gray-900 hover:underline">
                          {s.name}
                        </Link>
                        {s.founding_year && (
                          <span className="ml-2 text-xs text-gray-400">{s.founding_year}</span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    <div className="flex flex-wrap gap-1">
                      {s.sectors.slice(0, 2).map(sec => (
                        <span key={sec} className="px-2 py-0.5 rounded-full bg-gray-100 text-xs">{sec}</span>
                      ))}
                      {s.sectors.length > 2 && <span className="text-xs text-gray-400">+{s.sectors.length - 2}</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{s.stage || '—'}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{s.city || '—'}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{s.total_funding || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[s.status_internal]}`}>
                      {STATUS_LABEL[s.status_internal]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {s.website && (
                        <a
                          href={s.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                          className="p-1 text-gray-400 hover:text-blue-600"
                          title="Site web"
                        >
                          <Globe size={14} />
                        </a>
                      )}
                      {s.linkedin && (
                        <a
                          href={s.linkedin}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                          className="p-1 text-gray-400 hover:text-blue-600"
                          title="LinkedIn"
                        >
                          <Linkedin size={14} />
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {filtered.length > 500 && (
        <p className="text-xs text-gray-400 text-center mt-3">
          Affichage limité à 500 lignes — affine les filtres pour réduire la liste.
        </p>
      )}

      {/* Hidden imports for icons used in detail page so they're tree-shaken sanely */}
      <div className="hidden">
        <MapPin /> <Calendar /> <Users /> <ExternalLink />
      </div>
    </div>
  )
}
