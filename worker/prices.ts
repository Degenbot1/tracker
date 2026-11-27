// Native coin USD prices (CoinGecko): hourly history + a fresh spot price every few minutes.
import { q } from '../lib/db.ts'
import { chain } from '../lib/chains.ts'

const cache = new Map<number, { t: number[]; p: number[]; loadedAt: number }>()

async function cg(path: string) {
  const key = process.env.COINGECKO_API_KEY
  const res = await fetch('https://api.coingecko.com/api/v3' + path, {
    headers: key ? { 'x-cg-demo-api-key': key } : {},
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) throw new Error(`CoinGecko ${res.status}`)
  return res.json()
}

export async function syncHistory(chainId: number) {
  const c = chain(chainId)
  const j = await cg(`/coins/${c.coingeckoId}/market_chart?vs_currency=usd&days=90`)
  const rows: [number, number][] = j.prices
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500)
    const params: unknown[] = []
    const values = chunk.map(([t, p], k) => {
      params.push(chainId, new Date(t), p)
      return `($${k * 3 + 1},$${k * 3 + 2},$${k * 3 + 3})`
    })
    await q(`insert into native_prices (chain_id, ts, usd) values ${values.join(',')} on conflict do nothing`, params)
  }
  cache.delete(chainId)
}

export async function syncSpot(chainId: number) {
  const c = chain(chainId)
  const j = await cg(`/simple/price?ids=${c.coingeckoId}&vs_currencies=usd`)
  const p = j?.[c.coingeckoId]?.usd
  if (typeof p === 'number') {
    await q('insert into native_prices (chain_id, ts, usd) values ($1, now(), $2) on conflict do nothing', [chainId, p])
    cache.delete(chainId)
  }
  return p as number | undefined
}

async function load(chainId: number) {
  let c = cache.get(chainId)
  if (c && Date.now() - c.loadedAt < 120_000) return c
  const rows = await q<{ t: string; usd: number }>(
    'select extract(epoch from ts)::bigint as t, usd from native_prices where chain_id=$1 order by ts', [chainId])
  c = { t: rows.map((r) => Number(r.t)), p: rows.map((r) => r.usd), loadedAt: Date.now() }
  cache.set(chainId, c)
  return c
}

// Last known price at or before ts (falls back to the first one).
export async function nativeUsdAt(chainId: number, ts: Date): Promise<number | null> {
  const c = await load(chainId)
  if (!c.t.length) return null
  const s = ts.getTime() / 1000
  let lo = 0
  let hi = c.t.length - 1
  if (s < c.t[0]) return c.p[0]
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (c.t[mid] <= s) lo = mid
    else hi = mid - 1
  }
  return c.p[lo]
}

export async function nativeUsdNow(chainId: number) {
  return nativeUsdAt(chainId, new Date())
}
