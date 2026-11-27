import { q } from '@/lib/db.ts'
import { requireUser } from '@/lib/auth.ts'
import { tokenRow, supply, priceNow, nativeUsd } from '@/lib/queries.ts'
import { chain, ZERO } from '@/lib/chains.ts'

export const dynamic = 'force-dynamic'

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await requireUser()
  if (u instanceof Response) return u
  const t = await tokenRow(Number((await ctx.params).id))
  if (!t) return Response.json({ error: 'Token non trovato' }, { status: 404 })
  const limit = Math.min(Number(new URL(req.url).searchParams.get('limit') || 100), 1000)
  const [sup, p] = [await supply(t.id, t.chain_id, t.total_supply), await priceNow(t, await nativeUsd(t.chain_id))]
  const special = await q<any>('select manager as a from pools where token_id=$1 union select hooks from pools where token_id=$1', [t.id])
  const poolAddrs = special.map((r) => r.a)
  const rows = await q<any>(
    `select b.address, b.balance, b.peak, b.last_ts, w.category, w.name, w.color, a.kind,
            (select count(*) from trades tr where tr.token_id=b.token_id and tr.wallet=b.address) as trades
     from balances b
     left join wallets w on w.token_id=b.token_id and w.address=b.address and not w.hidden
     left join addresses a on a.chain_id=$3 and a.address=b.address
     where b.token_id=$1 and b.balance > 0 and not (b.address = any($2))
     order by b.balance desc limit ${limit}`,
    [t.id, [ZERO, ...chain(t.chain_id).burnAddresses], t.chain_id])
  const dec = 10 ** t.decimals
  const circ = Number(sup.circulating) / dec
  return Response.json(rows.map((r, i) => {
    const bal = Number(r.balance) / dec
    return {
      rank: i + 1, address: r.address, balance: bal, pct: circ ? bal / circ : 0, value_usd: p.usd != null ? bal * p.usd : null,
      trades: Number(r.trades), last_ts: r.last_ts, category: r.category, name: r.name, color: r.color,
      is_pool: poolAddrs.includes(r.address), kind: r.kind,
    }
  }))
}
