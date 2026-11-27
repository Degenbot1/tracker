import { q } from '@/lib/db.ts'
import { requireUser, audit } from '@/lib/auth.ts'
import { tokenRow, supply, priceNow, nativeUsd } from '@/lib/queries.ts'
import { simulateSell, ensureKinds } from '@/worker/wallets.ts'

export const dynamic = 'force-dynamic'
const CATS = ['owned', 'kol', 'watched', 'linked']

export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await requireUser()
  if (u instanceof Response) return u
  const t = await tokenRow(Number((await ctx.params).id))
  if (!t) return Response.json({ error: 'Token non trovato' }, { status: 404 })
  const nUsd = await nativeUsd(t.chain_id)
  const p = await priceNow(t, nUsd)
  const sup = await supply(t.id, t.chain_id, t.total_supply)
  const rows = await q<any>(
    `select w.*, b.balance, b.received, b.sent, b.peak, b.last_ts, a.native_balance, a.kind,
            (select count(*) from trades tr where tr.token_id=w.token_id and tr.wallet=w.address) as trades
     from wallets w
     left join balances b on b.token_id=w.token_id and b.address=w.address
     left join addresses a on a.chain_id=$2 and a.address=w.address
     where w.token_id=$1 and not w.hidden order by w.category, w.group_id nulls last, b.balance desc nulls last`, [t.id, t.chain_id])
  const dec = 10 ** t.decimals
  const circ = Number(sup.circulating) / dec
  const ref = p.ref
  const wallets = rows.map((r) => {
    const raw = BigInt(r.balance ?? '0')
    const bal = Number(raw) / dec
    let exit: number | null = null
    let impact: number | null = null
    if (ref && raw > 0n && r.category === 'owned') {
      const s = simulateSell(ref, raw)
      const out = Number(s.out) / 10 ** ref.quote_decimals
      exit = ref.quote_kind === 'stable' ? (nUsd ? out / nUsd : null) : out
      impact = s.impact
    }
    return {
      address: r.address, category: r.category, name: r.name, color: r.color, notes: r.notes, group_id: r.group_id,
      linked_to: r.linked_to, auto: r.auto, kind: r.kind, added_at: r.added_at,
      balance: bal, pct: circ ? bal / circ : 0, received: Number(r.received ?? 0) / dec, sent: Number(r.sent ?? 0) / dec,
      peak: Number(r.peak ?? 0) / dec, remaining: Number(r.peak ?? 0) > 0 ? bal / (Number(r.peak) / dec) : 0,
      value_usd: p.usd != null ? bal * p.usd : null, exit_native: exit, exit_impact: impact,
      native: r.native_balance != null ? Number(r.native_balance) / 1e18 : null, trades: Number(r.trades), last_ts: r.last_ts,
    }
  })
  // Group exit = all wallets of the group sold together (one sell, so the impact compounds).
  const group_exits: Record<string, { exit: number | null; impact: number }> = {}
  if (ref) {
    const byGroup = new Map<string, bigint>()
    for (const r of rows) if (r.category === 'owned' && r.balance) {
      const k = String(r.group_id ?? null)
      byGroup.set(k, (byGroup.get(k) ?? 0n) + BigInt(r.balance))
    }
    for (const [k, raw] of byGroup) if (raw > 0n) {
      const s = simulateSell(ref, raw)
      const out = Number(s.out) / 10 ** ref.quote_decimals
      group_exits[k] = { exit: ref.quote_kind === 'stable' ? (nUsd ? out / nUsd : null) : out, impact: s.impact }
    }
  }
  const counts = Object.fromEntries(CATS.map((c) => [c, wallets.filter((w) => w.category === c).length]))
  return Response.json({ wallets, counts, group_exits, price_usd: p.usd, native_usd: nUsd })
}

// Tag one or more wallets: { addresses: string | string[], category, name?, group_id?, notes? }
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await requireUser()
  if (u instanceof Response) return u
  const t = await tokenRow(Number((await ctx.params).id))
  if (!t) return Response.json({ error: 'Token non trovato' }, { status: 404 })
  const body = await req.json().catch(() => ({}))
  const category = String(body.category ?? '')
  if (!CATS.includes(category)) return Response.json({ error: 'Categoria non valida' }, { status: 400 })
  const list: string[] = (Array.isArray(body.addresses) ? body.addresses : String(body.addresses ?? '').split(/[\s,;]+/))
    .map((a: string) => a.trim().toLowerCase()).filter((a: string) => /^0x[0-9a-f]{40}$/.test(a))
  if (!list.length) return Response.json({ error: 'Nessun indirizzo valido' }, { status: 400 })
  const single = list.length === 1
  for (const a of [...new Set(list)]) {
    await q(
      `insert into wallets (token_id, address, category, name, group_id, notes, auto, hidden) values ($1,$2,$3,$4,$5,$6,false,false)
       on conflict (token_id, address) do update set category=excluded.category, hidden=false, auto=false,
         name=coalesce(excluded.name, wallets.name), group_id=coalesce(excluded.group_id, wallets.group_id), notes=coalesce(excluded.notes, wallets.notes)`,
      [t.id, a, category, single ? body.name || null : null, body.group_id || null, single ? body.notes || null : null])
  }
  await ensureKinds(t.chain_id, list).catch(() => {})
  await audit(u.id, 'wallets.tag', { token: t.id, category, n: list.length })
  return Response.json({ added: list.length })
}
