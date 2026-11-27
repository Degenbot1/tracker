import { q } from '@/lib/db.ts'
import { requireUser } from '@/lib/auth.ts'
import { tokenRow, TF } from '@/lib/queries.ts'
import { chain, ZERO } from '@/lib/chains.ts'

export const dynamic = 'force-dynamic'

// Chart markers aggregated per candle: our wallets, KOL and other tagged wallets, burns.
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await requireUser()
  if (u instanceof Response) return u
  const t = await tokenRow(Number((await ctx.params).id))
  if (!t) return Response.json({ error: 'Token non trovato' }, { status: 404 })
  const tf = TF[new URL(req.url).searchParams.get('tf') ?? '5m'] ?? 300
  const trades = await q<any>(
    `select floor(extract(epoch from tr.ts) / $2)::bigint * $2 as t, tr.side as kind,
            case when w.category='owned' then 'owned' else 'kol' end as who,
            count(*) as n, coalesce(sum(tr.value_usd),0) as value_usd,
            (array_agg(coalesce(w.name, '') order by tr.value_usd desc nulls last))[1] as name
     from trades tr join wallets w on w.token_id=tr.token_id and w.address=tr.wallet and not w.hidden
     where tr.token_id=$1 and tr.ts > now() - make_interval(secs => $2 * 1500)
     group by 1, 2, 3 order by 1`, [t.id, tf])
  const burns = await q<any>(
    `select floor(extract(epoch from ts) / $2)::bigint * $2 as t, 'burn' as kind, 'burn' as who, count(*) as n, sum(amount) as amount
     from transfers where token_id=$1 and "to" = any($3) and "from" <> $4 and ts > now() - make_interval(secs => $2 * 1500)
     group by 1 order by 1`, [t.id, tf, [ZERO, ...chain(t.chain_id).burnAddresses], ZERO])
  const dec = 10 ** t.decimals
  return Response.json([
    ...trades.map((r) => ({ t: Number(r.t), kind: r.kind, who: r.who, n: Number(r.n), value_usd: Number(r.value_usd), name: r.name || null })),
    ...burns.map((r) => ({ t: Number(r.t), kind: 'burn', who: 'burn', n: Number(r.n), amount: Number(r.amount) / dec })),
  ].sort((a, b) => a.t - b.t))
}
