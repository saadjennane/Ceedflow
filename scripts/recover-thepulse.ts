/**
 * Auto-recover missing startups by enumerating gaps in our numeric ID range.
 * For each missing ID, fetch /startup/[id]:
 *  - HTTP 404 → silently skipped (deleted/private)
 *  - HTTP 200 → parse + upsert
 *  - other errors → retried with backoff
 *
 * Run: npx tsx scripts/recover-thepulse.ts
 *      npx tsx scripts/recover-thepulse.ts --delay-ms=1200 --max-id=2200
 */
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { resolve } from 'path'
import { BASE, SOURCE, parseDetailPage, upsertPayload, UA } from './parse-thepulse'

config({ path: resolve(process.cwd(), '.env.local') })

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const [k, v] = a.replace(/^--/, '').split('=')
  return [k, v ?? 'true']
}))
const DELAY_MS = args['delay-ms'] ? parseInt(String(args['delay-ms']), 10) : 1200
const MAX_ID = args['max-id'] ? parseInt(String(args['max-id']), 10) : null  // override max
const MIN_ID = args['min-id'] ? parseInt(String(args['min-id']), 10) : 1

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

async function fetchOnce(url: string): Promise<{ status: number; html: string | null }> {
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'text/html' } })
  return { status: res.status, html: res.status === 200 ? await res.text() : null }
}

async function fetchWithRetry(url: string, attempt = 1): Promise<{ status: number; html: string | null }> {
  try {
    return await fetchOnce(url)
  } catch (e) {
    if (attempt < 3) {
      await sleep(3000 * attempt)
      return fetchWithRetry(url, attempt + 1)
    }
    throw e
  }
}

async function main() {
  console.log('Loading existing IDs from DB...')
  const existing = new Set<string>()
  let from = 0
  const BATCH = 1000
  while (true) {
    const { data } = await supabase.from('external_startups').select('external_id').eq('source', SOURCE).range(from, from + BATCH - 1)
    if (!data || data.length === 0) break
    data.forEach(d => existing.add(d.external_id))
    if (data.length < BATCH) break
    from += BATCH
  }
  const numeric = Array.from(existing).map(id => parseInt(id, 10)).filter(n => !isNaN(n)).sort((a, b) => a - b)
  const dbMax = numeric[numeric.length - 1] || 0
  const max = MAX_ID || (dbMax + 50) // explore slightly beyond current max
  console.log(`DB has ${existing.size} startups. Scanning IDs ${MIN_ID}..${max}`)

  // Build list of missing IDs to try
  const missing: number[] = []
  for (let i = MIN_ID; i <= max; i++) {
    if (!existing.has(String(i))) missing.push(i)
  }
  console.log(`${missing.length} IDs to try.\n`)

  let inserted = 0
  let notFound = 0
  let errored = 0
  const erroredList: number[] = []

  for (let i = 0; i < missing.length; i++) {
    const id = missing[i]
    const url = `${BASE}/startup/${id}`
    try {
      const { status, html } = await fetchWithRetry(url)
      if (status === 404) {
        notFound++
        process.stdout.write('.') // dot per 404
      } else if (status === 200 && html) {
        const parsed = parseDetailPage(html, String(id), url)
        if (!parsed.name) parsed.name = `[ID ${id}]`
        const { error } = await supabase.from('external_startups').upsert(upsertPayload(parsed), { onConflict: 'source,external_id' })
        if (error) throw error
        inserted++
        console.log(`\n  [${i + 1}/${missing.length}] ${id} ✓ ${parsed.name}`)
      } else {
        console.log(`\n  [${i + 1}/${missing.length}] ${id} unexpected HTTP ${status}`)
        errored++
        erroredList.push(id)
      }
    } catch (e) {
      errored++
      erroredList.push(id)
      console.error(`\n  [${i + 1}/${missing.length}] ${id} error: ${(e as Error).message}`)
    }

    // Progress every 50
    if ((i + 1) % 50 === 0) {
      console.log(`\n  --- ${i + 1}/${missing.length} done · inserted=${inserted} notFound=${notFound} errored=${errored} ---`)
    }

    await sleep(DELAY_MS)
  }

  console.log(`\n\nRecovery complete.`)
  console.log(`  inserted: ${inserted}`)
  console.log(`  notFound (404): ${notFound}`)
  console.log(`  errored: ${errored}`)
  if (erroredList.length > 0) {
    console.log(`  errored IDs (retry later): ${erroredList.join(', ')}`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
