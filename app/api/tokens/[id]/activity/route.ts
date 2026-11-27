import { q } from '@/lib/db.ts'
import { requireUser } from '@/lib/auth.ts'
import { tokenRow } from '@/lib/queries.ts'
import { chain, ZERO } from '@/lib/chains.ts'

export const dynamic = 'force-dynamic'

// Unified feed: trades, burns, liquidity. ?types=buy,sell,burn,add,remove&who=all|owned|kol|tagged&before=<block>&wallet=0x..
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await requireUser()
  if (u instanceof Response) return u
  const t = await tokenRow(Number((await ctx.params).id))
  if (!t) return Response.json({ error: 'Token non trovato' }, { status: 404 })
  const sp = new URL(req.url).searchParams
  const types = (sp.get('types') || 'buy,sell,burn,add,remove').split(',')
  const who = sp.get('who') || 'all'
  const before = sp.get('before')
  const wallet = sp.get('wallet')?.toLowerCase() || null
  const limit = Math.min(Number(sp.get('limit') || 100), 500)
  const whoFilter =
    who === 'owned' ? "w.category = 'owned'" : who === 'kol' ? "w.category in ('kol','linked')" : who === 'tagged' ? 'w.address is not null' : 'true'
  const dead = [ZERO, ...chain(t.chain_id).burnAddresses]
  const rows = await q<any>(
    `select * from (
       select tr.block, tr.log_index, tr.ts, tr.tx, tr.side as type, tr.wallet, tr.token_amount as amount, tr.quote_amount, tr.pool_id,
              tr.price_usd, tr.price_hype, tr.value_usd, p.quote_symbol, p.quote_decimals, w.category, w.name
       from trades tr join pools p on p.token_id=tr.token_id and p.pool_id=tr.pool_id
       left join wallets w on w.token_id=tr.token_id and w.address=tr.wallet and not w.hidden
       where tr.token_id=$1 and tr.side = any($2) and ($3::bigint is null or tr.block < $3) and ($5::text is null or tr.wallet=$5) and ${whoFilter}
       union all
       select f.block, f.log_index, f.ts, f.tx, 'burn', f."from", f.amount, null, null, null, null, null, null, null, w.category, w.name
       from transfers f left join wallets w on w.token_id=f.token_id and w.address=f."from" and not w.hidden
       where f.token_id=$1 and 'burn' = any($2) and f."to" = any($4) and f."from" <> '${ZERO}' and ($3::bigint is null or f.block < $3) and ($5::text is null or f."from"=$5) and ${whoFilter}
       union all
       select l.block, l.log_index, l.ts, l.tx, case when l.delta::numeric >= 0 then 'add' else 'remove' end, l.sender, null, null, l.pool_id, null, null, null, null, null, w.category, w.name
       from liquidity l left join wallets w on w.token_id=l.token_id and w.address=l.sender and not w.hidden
       where l.token_id=$1 and (case when l.delta::numeric >= 0 then 'add' else 'remove' end) = any($2) and ($3::bigint is null or l.block < $3) and ($5::text is null or l.sender=$5) and ${whoFilter}
     ) x order by block desc, log_index desc limit ${limit}`,
    [t.id, types, before, dead, wallet],
  )
  const dec = 10 ** t.decimals
  return Response.json(rows.map((r) => ({
    block: r.block, ts: r.ts, tx: r.tx, type: r.type, wallet: r.wallet, category: r.category, name: r.name, pool_id: r.pool_id,
    amount: r.amount != null ? Number(r.amount) / dec : null,
    quote: r.quote_amount != null ? Number(r.quote_amount) / 10 ** r.quote_decimals : null,
    quote_symbol: r.quote_symbol, price_usd: r.price_usd, price_native: r.price_hype, value_usd: r.value_usd,
  })))
}
