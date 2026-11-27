import { q } from '@/lib/db.ts'
import { requireUser } from '@/lib/auth.ts'
import { tokenRow, TF } from '@/lib/queries.ts'

export const dynamic = 'force-dynamic'

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await requireUser()
  if (u instanceof Response) return u
  const t = await tokenRow(Number((await ctx.params).id))
  if (!t) return Response.json({ error: 'Token non trovato' }, { status: 404 })
  const url = new URL(req.url)
  const tf = TF[url.searchParams.get('tf') ?? '5m'] ?? 300
  const unit = url.searchParams.get('unit') === 'native' ? 'native' : 'usd'
  const before = Number(url.searchParams.get('before') ?? 0) || null
  const limit = 1500
  const priceCol = unit === 'native' ? 'price_hype' : 'price_usd'
  const valueExpr = unit === 'native' ? 'value_usd / nullif(price_usd,0) * price_hype' : 'value_usd'
  const rows = await q<any>(
    `with b as (
       select floor(extract(epoch from ts) / $2)::bigint * $2 as time, block, log_index, pool_id, ${priceCol} as p, ${valueExpr} as v
       from trades
       where token_id=$1 and ${priceCol} is not null
         and ts < coalesce(to_timestamp($4), now() + interval '1 minute')
         and ts >= coalesce(to_timestamp($4), now()) - make_interval(secs => $2 * $5)
     )
     select time,
       (array_agg(p order by block, log_index) filter (where pool_id = $3))[1] as open,
       max(p) filter (where pool_id = $3) as high,
       min(p) filter (where pool_id = $3) as low,
       (array_agg(p order by block desc, log_index desc) filter (where pool_id = $3))[1] as close,
       coalesce(sum(v), 0) as volume
     from b group by time order by time`,
    [t.id, tf, t.ref_pool_id, before, limit],
  )
  // Fill buckets with no ref-pool trade from the previous close.
  let prev: number | null = null
  const candles = []
  for (const r of rows) {
    if (r.open == null) {
      if (prev == null) continue
      candles.push({ time: Number(r.time), open: prev, high: prev, low: prev, close: prev, volume: Number(r.volume) })
      continue
    }
    const open = prev ?? r.open
    candles.push({ time: Number(r.time), open, high: Math.max(r.high, open), low: Math.min(r.low, open), close: r.close, volume: Number(r.volume) })
    prev = r.close
  }
  const more = rows.length > 0 && (await q('select 1 from trades where token_id=$1 and ts < to_timestamp($2) limit 1', [t.id, candles[0]?.time ?? 0])).length > 0
  return Response.json({ candles, more, tf })
}
