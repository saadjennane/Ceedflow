/**
 * Shared parsing utilities for thepulse.ma scraping.
 */
import * as cheerio from 'cheerio'

export const BASE = 'https://www.thepulse.ma'
export const LISTING_PATH = '/startups'
export const SOURCE = 'thepulse.ma'
export const UA = 'TheBridge-CEED-Internal-Bot/1.0 (contact: info@ceed-morocco.org)'

export interface ParsedStartup {
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

export async function fetchHtml(url: string, attempt = 1): Promise<string> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'text/html' } })
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
    return await res.text()
  } catch (e) {
    if (attempt < 3) {
      const wait = 3000 * attempt
      console.warn(`  retry ${attempt} for ${url} after ${wait}ms: ${(e as Error).message}`)
      await new Promise(r => setTimeout(r, wait))
      return fetchHtml(url, attempt + 1)
    }
    throw e
  }
}

export function parseListingPage(html: string): { id: string; href: string }[] {
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

export function parseDetailPage(html: string, id: string, url: string): ParsedStartup {
  const $ = cheerio.load(html)
  const cleanText = (s: string) => s.replace(/\s+/g, ' ').trim()

  const name = cleanText($('h1.hero-name').contents().filter((_, el) => el.type === 'text').text())
    || cleanText($('h1.hero-name').text())
    || cleanText($('title').text().replace(/\s*-\s*Startup Details.*$/, ''))
    || ''

  const logoSrc = $('.hero-logo').attr('src') || $('img[alt][class*="hero"]').first().attr('src') || null
  const logo_url = logoSrc ? (logoSrc.startsWith('http') ? logoSrc : `${BASE}${logoSrc}`) : null

  const stage = cleanText($('.hero-badges .pulse-badge-accent').first().text()) || null

  const sectors: string[] = []
  $('.hero-badges .pulse-badge-secondary').each((_, el) => {
    const t = cleanText($(el).text())
    if (!t) return
    t.split(/[,/]/).map(s => s.trim()).filter(Boolean).forEach(s => {
      if (!sectors.includes(s)) sectors.push(s)
    })
  })

  const locText = cleanText($('.hero-badges .pulse-badge-tertiary').first().text())
  let city: string | null = null
  let country: string | null = null
  if (locText) {
    const parts = locText.split(',').map(s => s.trim()).filter(Boolean)
    city = parts[0] || null
    country = parts[1] || null
  }

  const fundingText = cleanText($('.hero-badges .badge-funding').first().text())
  const fundingMatch = fundingText.match(/\$?[\d.,]+\s*[MKBmkb]?/i)
  const total_funding = fundingMatch ? fundingMatch[0].trim() : null

  const description = (
    cleanText($('.hero-description.lang-fr').first().text()) ||
    cleanText($('.hero-description').first().text()) ||
    cleanText($('meta[name="description"]').attr('content') || '')
  ) || null

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
      const en = cleanText($(el).find('.info-value.lang-en').first().text())
      status = en || value
    } else if (label.includes('site') || label.includes('website')) {
      const href = valueEl.find('a').attr('href')
      if (href) website = href
    }
  })

  let latest_round: string | null = null
  let latest_round_date: string | null = null
  let lead_investor: string | null = null
  const other_investors: string[] = []
  $('.funding-table tbody tr').each((idx, el) => {
    const tds = $(el).find('td').map((_, td) => cleanText($(td).text())).get()
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

  const founders: { name: string; role?: string }[] = []
  $('.founder-mini').each((_, el) => {
    const fname = cleanText($(el).find('.founder-mini-name').first().text())
    let role = cleanText($(el).find('.founder-mini-title').first().text())
    role = role.replace(/\s+(?:chez|at)\s+.+$/i, '').trim()
    if (fname) founders.push({ name: fname, role: role || undefined })
  })

  const linkedin = (
    $('.contact-icon-linkedin').closest('.contact-item').find('a').attr('href') ||
    $('a[href*="linkedin.com/company"], a[href*="linkedin.com/in"]').first().attr('href') ||
    null
  )

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

export function upsertPayload(s: ParsedStartup) {
  return {
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
}
