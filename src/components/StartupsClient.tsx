'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Search, Globe, Linkedin, MapPin, Calendar, Users, ExternalLink, ChevronLeft, ChevronRight } from 'lucide-react'
import type { ExternalStartup, ExternalStartupSyncRun, ExternalStartupStatus } from '@/lib/types'

const PAGE_SIZE_OPTIONS = [25, 50, 100, 250]

type SortBy = 'funding-desc' | 'funding-asc' | 'name' | 'founded-desc' | 'recent'

const SORT_OPTIONS: { value: SortBy; label: string }[] = [
  { value: 'funding-desc', label: 'Levée ↓' },
  { value: 'funding-asc', label: 'Levée ↑' },
  { value: 'founded-desc', label: 'Année (récente)' },
  { value: 'name', label: 'Nom (A-Z)' },
  { value: 'recent', label: 'Récemment ajoutée' },
]

/** Parse "$48.0M", "$1.5B", "$200K", "48000000" → number (USD). Null/empty → -1 so they sort last in desc. */
function parseFunding(s?: string | null): number {
  if (!s) return -1
  const t = s.replace(/[\s,]/g, '').replace(/\$/g, '')
  const m = t.match(/^([\d.]+)\s*([MKB])?/i)
  if (!m) return -1
  const num = parseFloat(m[1])
  if (isNaN(num)) return -1
  const suffix = (m[2] || '').toUpperCase()
  if (suffix === 'B') return num * 1_000_000_000
  if (suffix === 'M') return num * 1_000_000
  if (suffix === 'K') return num * 1_000
  return num
}

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
  const [pageSize, setPageSize] = useState(50)
  const [page, setPage] = useState(1)
  const [sortBy, setSortBy] = useState<SortBy>('funding-desc')

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
    const list = startups.filter(s => {
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
    // Sort
    list.sort((a, b) => {
      if (sortBy === 'funding-desc') return parseFunding(b.total_funding) - parseFunding(a.total_funding)
      if (sortBy === 'funding-asc') {
        const ax = parseFunding(a.total_funding)
        const bx = parseFunding(b.total_funding)
        // push unknowns to the end
        if (ax < 0 && bx >= 0) return 1
        if (bx < 0 && ax >= 0) return -1
        return ax - bx
      }
      if (sortBy === 'founded-desc') return (b.founding_year || 0) - (a.founding_year || 0)
      if (sortBy === 'recent') return new Date(b.first_scraped_at).getTime() - new Date(a.first_scraped_at).getTime()
      // name
      return a.name.localeCompare(b.name, 'fr')
    })
    return list
  }, [startups, search, filterStatus, filterSector, filterStage, filterCity, sortBy])

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: startups.length, new: 0, reviewed: 0, interested: 0, contacted: 0, not_relevant: 0 }
    startups.forEach(s => { c[s.status_internal] = (c[s.status_internal] || 0) + 1 })
    return c
  }, [startups])

  // Reset page to 1 whenever filters change
  useEffect(() => {
    setPage(1)
  }, [search, filterStatus, filterSector, filterStage, filterCity, pageSize])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const startIdx = (currentPage - 1) * pageSize
  const endIdx = Math.min(startIdx + pageSize, filtered.length)
  const paginated = filtered.slice(startIdx, endIdx)

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold">Startups</h1>
          <p className="text-sm text-gray-500">{startups.length} startups</p>
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

      {/* Results count + page size selector */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="text-sm text-gray-500">
          {filtered.length === 0 ? '0 résultat' : (
            <>
              <strong className="text-gray-700">{startIdx + 1}</strong>
              {' – '}
              <strong className="text-gray-700">{endIdx}</strong>
              {' sur '}
              <strong className="text-gray-700">{filtered.length}</strong>
              {filtered.length !== startups.length && (
                <span className="text-gray-400"> (filtrés sur {startups.length})</span>
              )}
            </>
          )}
        </div>
        <div className="flex items-center gap-3 text-sm">
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500">Trier par</label>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as SortBy)}
              className="text-sm border border-gray-300 rounded-lg px-2 py-1"
            >
              {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500">Par page</label>
            <select
              value={pageSize}
              onChange={e => setPageSize(parseInt(e.target.value, 10))}
              className="text-sm border border-gray-300 rounded-lg px-2 py-1"
            >
              {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </div>
      </div>

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
              paginated.map(s => (
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
      {/* Pagination controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4 flex-wrap">
          <button
            onClick={() => setPage(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
            className="flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronLeft size={14} />
            Précédent
          </button>
          <PageNumbers current={currentPage} total={totalPages} onChange={setPage} />
          <button
            onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages}
            className="flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Suivant
            <ChevronRight size={14} />
          </button>
        </div>
      )}

      {/* Hidden imports for icons used in detail page so they're tree-shaken sanely */}
      <div className="hidden">
        <MapPin /> <Calendar /> <Users /> <ExternalLink />
      </div>
    </div>
  )
}

function PageNumbers({ current, total, onChange }: { current: number; total: number; onChange: (n: number) => void }) {
  // Show a sliding window of page numbers with ellipses
  const pages: (number | 'ellipsis-left' | 'ellipsis-right')[] = []
  const window = 1
  if (total <= 7) {
    for (let i = 1; i <= total; i++) pages.push(i)
  } else {
    pages.push(1)
    if (current - window > 2) pages.push('ellipsis-left')
    for (let i = Math.max(2, current - window); i <= Math.min(total - 1, current + window); i++) {
      pages.push(i)
    }
    if (current + window < total - 1) pages.push('ellipsis-right')
    pages.push(total)
  }
  return (
    <div className="flex items-center gap-1">
      {pages.map((p, idx) => {
        if (typeof p === 'string') {
          return <span key={p + idx} className="px-2 text-gray-400">…</span>
        }
        const active = p === current
        return (
          <button
            key={p}
            onClick={() => onChange(p)}
            className={`min-w-[34px] px-2.5 py-1.5 text-sm rounded-lg border transition ${
              active
                ? 'border-blue-600 bg-blue-600 text-white'
                : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            {p}
          </button>
        )
      })}
    </div>
  )
}
