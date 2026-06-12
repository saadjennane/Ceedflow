import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(process.cwd(), '.env.local') })

async function main() {
  const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  // Get all IDs
  const all: string[] = []
  let from = 0
  const BATCH = 1000
  while (true) {
    const { data } = await supa.from('external_startups').select('external_id').range(from, from + BATCH - 1)
    if (!data || data.length === 0) break
    data.forEach(d => all.push(d.external_id))
    if (data.length < BATCH) break
    from += BATCH
  }

  const numeric = all.map(id => parseInt(id, 10)).filter(n => !isNaN(n)).sort((a, b) => a - b)
  console.log(`Total IDs in DB: ${all.length} (${numeric.length} numeric)`)
  console.log(`Min ID: ${numeric[0]}`)
  console.log(`Max ID: ${numeric[numeric.length - 1]}`)

  // Find gaps
  const set = new Set(numeric)
  const gaps: number[] = []
  for (let i = numeric[0]; i <= numeric[numeric.length - 1]; i++) {
    if (!set.has(i)) gaps.push(i)
  }
  console.log(`Missing IDs in range [${numeric[0]}, ${numeric[numeric.length - 1]}]: ${gaps.length}`)
  console.log(`First 50 missing: ${gaps.slice(0, 50).join(', ')}`)
  console.log(`Last 50 missing: ${gaps.slice(-50).join(', ')}`)
}

main()
