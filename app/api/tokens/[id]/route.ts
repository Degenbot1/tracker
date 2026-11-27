import { q } from '@/lib/db.ts'
import { requireUser, audit } from '@/lib/auth.ts'
import { tokenSummary, tokenRow, spotFromSqrt } from '@/lib/queries.ts'
import { chain } from '@/lib/chains.ts'

export const dynamic = 'force-dynamic'

export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await requireUser()
  if (u instanceof Response) return u
  const t = await tokenRow(Number((await ctx.params).id))
  if (!t) return Response.json({ error: 'Token non trovato' }, { status: 404 })
  const summary = await tokenSummary(t)
  const pools = await q<any>(
    `select p.*, (select count(*) from trades tr where tr.token_id=p.token_id and tr.pool_id=p.pool_id) as swaps,
            (select max(ts) from trades tr where tr.token_id=p.token_id and tr.pool_id=p.pool_id) as last_trade_at
     from pools p where p.token_id=$1 order by swaps desc`, [t.id])
  const groups = await q('select id, name, color from groups where token_id=$1 order by id', [t.id])
  const liq = await q<any>(`select count(*) as n from liquidity where token_id=$1`, [t.id])
  return Response.json({
    ...summary,
    explorer: chain(t.chain_id).explorer,
    liquidity_events: Number(liq[0]?.n ?? 0),
    groups,
    pool_list: pools.map((p) => ({
      pool_id: p.pool_id, manager: p.manager, quote: p.quote_symbol, quote_kind: p.quote_kind, fee: p.fee, lp_fee: p.lp_fee,
      dynamic: (p.fee & 0x800000) !== 0, hooks: p.hooks, created_block: p.created_block, created_at: p.created_at,
      swaps: Number(p.swaps), last_trade_at: p.last_trade_at, is_ref: p.pool_id === t.ref_pool_id,
      price_quote: spotFromSqrt(p, t.decimals),
    })),
  })
}

// Owner only: stop tracking a token (data is deleted).
export async function DELETE(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await requireUser('owner')
  if (u instanceof Response) return u
  const id = Number((await ctx.params).id)
  await q('delete from tokens where id=$1', [id])
  await audit(u.id, 'token.remove', { id })
  return Response.json({ ok: true })
}
