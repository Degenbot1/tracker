import { q } from '@/lib/db.ts'
import { requireUser } from '@/lib/auth.ts'
import { tokenRow, supply, priceNow, nativeUsd } from '@/lib/queries.ts'
import { chain, ZERO } from '@/lib/chains.ts'

export const dynamic = 'force-dynamic'

// KOL view: what we sent, what they still hold (with linked wallets), what they sold or moved.
export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await requireUser()
  if (u instanceof Response) return u
  const t = await tokenRow(Number((await ctx.params).id))
  if (!t) return Response.json({ error: 'Token non trovato' }, { status: 404 })
  const nUsd = await nativeUsd(t.chain_id)
  const p = await priceNow(t, nUsd)
  const sup = await supply(t.id, t.chain_id, t.total_supply)
  const special = (await q<any>('select manager as a from pools where token_id=$1 union select hooks from pools where token_id=$1', [t.id])).map((r) => r.a)
  const skip = [ZERO, ...chain(t.chain_id).burnAddresses, ...special]

  const kols = await q<any>(
    `with k as (select address, name, color, notes, auto, added_at from wallets where token_id=$1 and category='kol' and not hidden),
     sent as (
       select f."to" as kol, sum(f.amount) as amount, min(f.ts) as first_ts,
              sum(f.amount * coalesce((select tr.price_usd from trades tr where tr.token_id=f.token_id and tr.pool_id=$3 and tr.ts <= f.ts order by tr.ts desc limit 1), 0)) as usd_raw
       from transfers f join wallets o on o.token_id=f.token_id and o.address=f."from" and o.category='owned' and not o.hidden
       where f.token_id=$1 and f."to" in (select address from k) group by 1),
     sold as (select wallet, sum(token_amount) as amount, coalesce(sum(value_usd),0) as usd, min(ts) as first_sell
              from trades where token_id=$1 and side='sell' and wallet in (select address from k) group by 1),
     bought as (select wallet, sum(token_amount) as amount from trades where token_id=$1 and side='buy' and wallet in (select address from k) group by 1),
     moved as (select f."from" as kol, sum(f.amount) as amount from transfers f
               join addresses a on a.chain_id=$4 and a.address=f."to" and a.kind in ('eoa','delegated')
               where f.token_id=$1 and f."from" in (select address from k) and not (f."to" = any($2)) group by 1),
     linked as (select w.linked_to as kol, count(*) as n, coalesce(sum(b.balance),0) as balance,
                  coalesce((select sum(value_usd) from trades tr where tr.token_id=$1 and tr.side='sell' and tr.wallet = any(array_agg(w.address))),0) as sold_usd
                from wallets w left join balances b on b.token_id=w.token_id and b.address=w.address
                where w.token_id=$1 and w.category='linked' and not w.hidden group by 1)
     select k.*, b.balance, b.peak, b.received, b.last_ts,
            s.amount as sent, s.usd_raw as sent_usd_raw, s.first_ts, so.amount as sold, so.usd as sold_usd, so.first_sell,
            bo.amount as bought, m.amount as moved, l.n as linked_n, l.balance as linked_balance, l.sold_usd as linked_sold_usd
     from k left join balances b on b.token_id=$1 and b.address=k.address
     left join sent s on s.kol=k.address left join sold so on so.wallet=k.address left join bought bo on bo.wallet=k.address
     left join moved m on m.kol=k.address left join linked l on l.kol=k.address
     order by s.amount desc nulls last`,
    [t.id, skip, t.ref_pool_id, t.chain_id])

  const dec = 10 ** t.decimals
  const minted = Number(sup.minted) / dec || Number(sup.total) / dec
  const rows = kols.map((k) => {
    const bal = Number(k.balance ?? 0) / dec
    const peak = Number(k.peak ?? 0) / dec
    const linkedBal = Number(k.linked_balance ?? 0) / dec
    const sold = Number(k.sold ?? 0) / dec
    const remaining = peak > 0 ? bal / peak : 0
    const status = peak > 0 && remaining < 0.05 && linkedBal < peak * 0.05 ? 'exited' : sold > 0 ? 'selling' : 'holding'
    return {
      address: k.address, name: k.name, color: k.color, notes: k.notes, auto: k.auto,
      sent: Number(k.sent ?? 0) / dec, sent_pct: minted ? Number(k.sent ?? 0) / dec / minted : 0, sent_usd: Number(k.sent_usd_raw ?? 0) / dec,
      held: bal, peak, remaining, held_usd: p.usd != null ? bal * p.usd : null,
      sold, sold_usd: Number(k.sold_usd ?? 0), bought: Number(k.bought ?? 0) / dec,
      moved: Number(k.moved ?? 0) / dec, linked: Number(k.linked_n ?? 0), linked_balance: linkedBal,
      linked_sold_usd: Number(k.linked_sold_usd ?? 0), status, first_sell: k.first_sell, last_ts: k.last_ts,
    }
  })
  const sent = rows.reduce((a, r) => a + r.sent, 0)
  const held = rows.reduce((a, r) => a + r.held + r.linked_balance, 0)
  return Response.json({
    kols: rows,
    totals: {
      sent, sent_pct: minted ? sent / minted : 0, sent_usd: rows.reduce((a, r) => a + r.sent_usd, 0),
      held, held_usd: p.usd != null ? held * p.usd : null,
      sold_usd: rows.reduce((a, r) => a + r.sold_usd + r.linked_sold_usd, 0),
      exited: rows.filter((r) => r.status === 'exited').length, count: rows.length,
    },
  })
}
