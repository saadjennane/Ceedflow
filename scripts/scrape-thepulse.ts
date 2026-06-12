/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Scrapes startup data from thepulse.ma into Supabase.
 *
 * Run locally with:
 *   npx tsx scripts/scrape-thepulse.ts
 *
 * Requires env vars (in .env.local at project root):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Options (CLI flags):
 *   --max-pages=N       only scan N listing pages (default: all)
 *   --start-page=N      start from page N (default: 1)
 *   --skip-details      skip per-startup detail fetch (listing only, faster)
 *   --delay-ms=N        delay between requests in ms (default: 1500)
 */

import { createClient } from '@supabase/supabase-js'
import * as cheerio from 'cheerio'
import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(process.cwd(), '.env.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

const BASE = 'https://www.thepulse.ma'
const LISTING_PATH = '/startups'
const SOURCE = 'thepulse.ma'

const UA = 'TheBridge-CEED-Internal-Bot/1.0 (contact: info@ceed-morocco.org)'

// CLI flags
const args = Object.fromEntries(
  process.argv.slice(2).map(a => {
    const [k, v] = a.replace(/^--/, '').split('=')
    return [k, v ?? 'true']
  })
)
const MAX_PAGES = args['max-pages'] ? parseInt(String(args['max-pages']), 10) : Infinity
const START_PAGE = args['start-page'] ? parseInt(String(args['start-page']), 10) : 1
const SKIP_DETAILS = args['skip-details'] === 'true'
const DELAY_MS = args['delay-ms'] ? parseInt(String(args['delay-ms']), 10) : 1500

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}

async function fetchHtml(url: string, attempt = 1): Promise<string> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'text/html' } })
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
    return await res.text()
  } catch (e) {
    if (attempt < 3) {
      console.warn(`  retry ${attempt} for ${url}: ${(e as Error).message}`)
      await sleep(3000 * attempt)
      return fetchHtml(url, attempt + 1)
    }
    throw e
  }
}

interface ParsedStartup {
  external_id: string
  source_url: string
  name: string
  logo_url?: string | null
  description?: string | null
  sectors: string[]
  stage?: string | null
  status?: string | null
  city?: string | null
  country?: string | null
  founding_year?: number | null
  employee_count?: string | null
  maturity_pct?: number | null
  total_funding?: string | null
  latest_round?: string | null
  latest_round_date?: string | null
  lead_investor?: string | null
  other_investors: string[]
  founders: { name: string; role?: string }[]
  website?: string | null
  linkedin?: string | null
  notable_clients: string[]
  raw_data: Record<string, unknown>
}

/**
 * Best-effort parsing of a startup listing card.
 * Looks for any anchor to /startup/[id] and extracts surrounding text.
 */
function parseListingPage(html: string): { id: string; href: string }[] {
  const $ = cheerio.load(html)
  const found = new Set<string>()
  const out: { id: string; href: string }[] = []
  $('a[href^="/startup/"], a[href*="thepulse.ma/startup/"]').each((_, el) => {
    const href = $(el).attr('href') || ''
    const m = href.match(/\/startup\/([\w-]+)/)
    if (m && !found.has(m[1])) {
      found.add(m[1])
      out.push({ id: m[1], href: href.startsWith('http') ? href : `${BASE}${href}` })
    }
  })
  return out
}

/**
 * Parse a startup detail page using thepulse.ma's actual HTML structure.
 * Selectors target known CSS classes (.hero-name, .pulse-badge-*, .info-item, .funding-table, .founder-mini, etc.).
 */
function parseDetailPage(html: string, id: string, url: string): ParsedStartup {
  const $ = cheerio.load(html)

  const cleanText = (s: string) => s.replace(/\s+/g, ' ').trim()

  // Name — h1.hero-name, but it may contain trailing buttons; grab the first text node.
  const name = cleanText($('h1.hero-name').contents().filter((_, el) => el.type === 'text').text())
    || cleanText($('h1.hero-name').text())
    || cleanText($('title').text().replace(/\s*-\s*Startup Details.*$/, ''))
    || ''

  // Logo
  const logoSrc = $('.hero-logo').attr('src') || $('img[alt][class*="hero"]').first().attr('src') || null
  const logo_url = logoSrc ? (logoSrc.startsWith('http') ? logoSrc : `${BASE}${logoSrc}`) : null

  // Stage — first .pulse-badge-accent
  const stage = cleanText($('.hero-badges .pulse-badge-accent').first().text()) || null

  // Sectors — every .pulse-badge-secondary (each badge may contain comma-separated sectors)
  const sectors: string[] = []
  $('.hero-badges .pulse-badge-secondary').each((_, el) => {
    const t = cleanText($(el).text())
    if (!t) return
    t.split(/[,/]/).map(s => s.trim()).filter(Boolean).forEach(s => {
      if (!sectors.includes(s)) sectors.push(s)
    })
  })

  // Location — .pulse-badge-tertiary (strip leading icon text)
  const locText = cleanText($('.hero-badges .pulse-badge-tertiary').first().text())
  let city: string | null = null
  let country: string | null = null
  if (locText) {
    const parts = locText.split(',').map(s => s.trim()).filter(Boolean)
    city = parts[0] || null
    country = parts[1] || null
  }

  // Total funding — .badge-funding (e.g., "$48.0M levés")
  const fundingText = cleanText($('.hero-badges .badge-funding').first().text())
  const fundingMatch = fundingText.match(/\$?[\d.,]+\s*[MKBmkb]?/i)
  const total_funding = fundingMatch ? fundingMatch[0].trim() : null

  // Description — prefer French
  const description = (
    cleanText($('.hero-description.lang-fr').first().text()) ||
    cleanText($('.hero-description').first().text()) ||
    cleanText($('meta[name="description"]').attr('content') || '')
  ) || null

  // Info items: pair .info-label → .info-value
  let founding_year: number | null = null
  let employee_count: string | null = null
  let status: string | null = null
  let website: string | null = null
  $('.info-item').each((_, el) => {
    const label = cleanText($(el).find('.info-label').first().text()).toLowerCase()
    const valueEl = $(el).find('.info-value').first()
    const value = cleanText(valueEl.text())
    if (!label) return
    if (label.includes('fond') && /\d{4}/.test(value)) {
      const m = value.match(/\d{4}/)
      if (m) founding_year = parseInt(m[0], 10)
    } else if (label.includes('employ')) {
      employee_count = value
    } else if (label.includes('statut') || label.includes('status')) {
      // prefer English version if multiple
      const en = cleanText($(el).find('.info-value.lang-en').first().text())
      status = en || value
    } else if (label.includes('site') || label.includes('website')) {
      const href = valueEl.find('a').attr('href')
      if (href) website = href
    }
  })

  // Funding rounds table → most recent row is first
  let latest_round: string | null = null
  let latest_round_date: string | null = null
  let lead_investor: string | null = null
  const other_investors: string[] = []
  $('.funding-table tbody tr').each((idx, el) => {
    const tds = $(el).find('td').map((_, td) => cleanText($(td).text())).get()
    // Columns: round, city, date, deal_type, lead, status_en, status_fr, amount, vc_round
    // (status has 2 cells: lang-en and lang-fr)
    if (tds.length < 5) return
    const round = tds[0]
    const date = tds[2]
    const deal_type = tds[3]
    const lead = tds[4]
    if (idx === 0) {
      latest_round = deal_type || round
      latest_round_date = date
      lead_investor = lead
    } else if (lead && !other_investors.includes(lead) && lead !== lead_investor) {
      other_investors.push(lead)
    }
  })

  // Founders — .founder-mini blocks
  const founders: { name: string; role?: string }[] = []
  $('.founder-mini').each((_, el) => {
    const name = cleanText($(el).find('.founder-mini-name').first().text())
    let role = cleanText($(el).find('.founder-mini-title').first().text())
    // Strip " chez X" / " at X" suffix
    role = role.replace(/\s+(?:chez|at)\s+.+$/i, '').trim()
    if (name) founders.push({ name, role: role || undefined })
  })

  // LinkedIn — look in contact card first
  const linkedin = (
    $('.contact-icon-linkedin').closest('.contact-item').find('a').attr('href') ||
    $('a[href*="linkedin.com/company"], a[href*="linkedin.com/in"]').first().attr('href') ||
    null
  )

  // Website fallback
  if (!website) {
    website = $('.contact-icon-web').closest('.contact-item').find('a').attr('href') || null
  }

  return {
    external_id: id,
    source_url: url,
    name,
    logo_url,
    description,
    sectors,
    stage,
    status,
    city,
    country,
    founding_year,
    employee_count,
    maturity_pct: null,
    total_funding,
    latest_round,
    latest_round_date,
    lead_investor,
    other_investors,
    founders,
    website,
    linkedin,
    notable_clients: [],
    raw_data: {},
  }
}

async function startSyncRun() {
  const { data, error } = await supabase
    .from('external_startups_sync_runs')
    .insert({ source: SOURCE, status: 'running' })
    .select()
    .single()
  if (error) throw error
  return data.id as string
}

async function finishSyncRun(
  runId: string,
  stats: { pages_scanned: number; startups_seen: number; startups_inserted: number; startups_updated: number; errors: number },
  status: 'completed' | 'failed',
  errorLog?: string | null,
) {
  await supabase
    .from('external_startups_sync_runs')
    .update({ ...stats, finished_at: new Date().toISOString(), status, error_log: errorLog })
    .eq('id', runId)
}

async function upsertStartup(s: ParsedStartup, existingIds: Set<string>) {
  const payload = {
    source: SOURCE,
    external_id: s.external_id,
    source_url: s.source_url,
    name: s.name,
    logo_url: s.logo_url,
    description: s.description,
    sectors: s.sectors,
    stage: s.stage,
    status: s.status,
    city: s.city,
    country: s.country,
    founding_year: s.founding_year,
    employee_count: s.employee_count,
    maturity_pct: s.maturity_pct,
    total_funding: s.total_funding,
    latest_round: s.latest_round,
    latest_round_date: s.latest_round_date,
    lead_investor: s.lead_investor,
    other_investors: s.other_investors,
    founders: s.founders,
    website: s.website,
    linkedin: s.linkedin,
    notable_clients: s.notable_clients,
    raw_data: s.raw_data,
    last_scraped_at: new Date().toISOString(),
  }
  const { error } = await supabase
    .from('external_startups')
    .upsert(payload, { onConflict: 'source,external_id' })
  if (error) throw error
  return existingIds.has(s.external_id) ? 'updated' : 'inserted'
}

async function fetchExistingIds(): Promise<Set<string>> {
  const ids = new Set<string>()
  let page = 0
  const PAGE_SIZE = 1000
  while (true) {
    const { data, error } = await supabase
      .from('external_startups')
      .select('external_id')
      .eq('source', SOURCE)
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    data.forEach((d: any) => ids.add(d.external_id))
    if (data.length < PAGE_SIZE) break
    page++
  }
  return ids
}

async function main() {
  console.log(`Starting scrape of ${SOURCE}`)
  console.log(`  start-page=${START_PAGE} max-pages=${MAX_PAGES === Infinity ? 'all' : MAX_PAGES} skip-details=${SKIP_DETAILS} delay=${DELAY_MS}ms`)

  const runId = await startSyncRun()
  const existingIds = await fetchExistingIds()
  console.log(`  ${existingIds.size} startups already in DB`)

  let pagesScanned = 0
  let startupsSeen = 0
  let startupsInserted = 0
  let startupsUpdated = 0
  let errors = 0
  const errorLines: string[] = []

  try {
    for (let page = START_PAGE; ; page++) {
      if (pagesScanned >= MAX_PAGES) break

      const url = page === 1 ? `${BASE}${LISTING_PATH}` : `${BASE}${LISTING_PATH}?page=${page}`
      console.log(`\n[page ${page}] ${url}`)

      let html: string
      try {
        html = await fetchHtml(url)
      } catch (e) {
        errors++
        errorLines.push(`page ${page}: ${(e as Error).message}`)
        console.error(`  fetch failed: ${(e as Error).message}`)
        await sleep(DELAY_MS)
        continue
      }

      const items = parseListingPage(html)
      if (items.length === 0) {
        console.log(`  no startups on this page, stopping`)
        break
      }
      console.log(`  found ${items.length} startups on page`)
      pagesScanned++

      for (const item of items) {
        startupsSeen++
        try {
          let parsed: ParsedStartup
          if (SKIP_DETAILS) {
            parsed = {
              external_id: item.id,
              source_url: item.href,
              name: `[ID ${item.id}]`,
              sectors: [],
              other_investors: [],
              founders: [],
              notable_clients: [],
              raw_data: {},
            }
          } else {
            await sleep(DELAY_MS)
            const detailHtml = await fetchHtml(item.href)
            parsed = parseDetailPage(detailHtml, item.id, item.href)
            if (!parsed.name) {
              parsed.name = `[ID ${item.id}]`
            }
          }
          const op = await upsertStartup(parsed, existingIds)
          if (op === 'inserted') {
            startupsInserted++
            existingIds.add(parsed.external_id)
          } else {
            startupsUpdated++
          }
          process.stdout.write(`    [${startupsSeen}] ${op} — ${parsed.name}\n`)
        } catch (e) {
          errors++
          errorLines.push(`startup ${item.id}: ${(e as Error).message}`)
          console.error(`    error on ${item.id}: ${(e as Error).message}`)
        }
      }

      await sleep(DELAY_MS)
    }

    console.log(`\nDone. seen=${startupsSeen} inserted=${startupsInserted} updated=${startupsUpdated} errors=${errors}`)
    await finishSyncRun(runId, { pages_scanned: pagesScanned, startups_seen: startupsSeen, startups_inserted: startupsInserted, startups_updated: startupsUpdated, errors }, 'completed', errorLines.length > 0 ? errorLines.slice(0, 50).join('\n') : null)
  } catch (e) {
    console.error('fatal:', e)
    await finishSyncRun(runId, { pages_scanned: pagesScanned, startups_seen: startupsSeen, startups_inserted: startupsInserted, startups_updated: startupsUpdated, errors: errors + 1 }, 'failed', (e as Error).message)
    process.exit(1)
  }
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
