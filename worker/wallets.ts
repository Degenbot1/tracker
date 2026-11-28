// Wallet side: auto tags (KOL, linked), address kinds, native balances, exit value of our wallets.
import { q, one } from '../lib/db.ts'
import { chain, ZERO } from '../lib/chains.ts'
import { rpcBatch } from '../lib/rpc.ts'
import { nativeBalances } from '../lib/multicall.ts'
import { nativeUsdNow } from './prices.ts'

export async function ensureKinds(chainId: number, addrs: string[]) {
  if (!addrs.length) return
  const known = await q<{ address: string }>('select address from addresses where chain_id=$1 and address = any($2) and kind is not null', [chainId, addrs])
  const k = new Set(known.map((r) => r.address))
  const todo = addrs.filter((a) => !k.has(a))
  if (!todo.length) return
  const codes = await rpcBatch<string>(chainId, todo.map((a) => ({ method: 'eth_getCode', params: [a, 'latest'] })))
  for (let i = 0; i < todo.length; i++) {
    const code = codes[i]
    if (code == null) continue
    const kind = code === '0x' ? 'eoa' : code.startsWith('0xef0100') ? 'delegated' : 'contract'
    await q(`insert into addresses (chain_id, address, kind) values ($1,$2,$3)
             on conflict (chain_id, address) do update set kind=excluded.kind`, [chainId, todo[i], kind])
  }
}

async function excluded(tokenId: number, chainId: number) {
  const pools = await q<{ manager: string }>('select distinct manager from pools where token_id=$1', [tokenId])
  const tok = await one<{ address: string }>('select address from tokens where id=$1', [tokenId])
  return [ZERO, ...chain(chainId).burnAddresses, ...pools.map((p) => p.manager), tok!.address]
}

// KOL = wallet that received tokens directly from one of our wallets. Linked = wallet that received from a KOL.
export async function autoTag(tokenId: number, chainId: number) {
  const skip = await excluded(tokenId, chainId)
  const kolCandidates = await q<{ address: string }>(
    `select distinct t."to" as address from transfers t
     join wallets o on o.token_id=t.token_id and o.address=t."from" and o.category='owned' and not o.hidden
     where t.token_id=$1 and not (t."to" = any($2))
       and not exists (select 1 from wallets w where w.token_id=t.token_id and w.address=t."to")`,
    [tokenId, skip],
  )
  await ensureKinds(chainId, kolCandidates.map((r) => r.address))
  await q(
    `insert into wallets (token_id, address, category, auto)
     select $1, a.address, 'kol', true from addresses a
     where a.chain_id=$2 and a.address = any($3) and a.kind in ('eoa','delegated') on conflict do nothing`,
    [tokenId, chainId, kolCandidates.map((r) => r.address)],
  )

  const linkCandidates = await q<{ address: string; kol: string }>(
    `select distinct on (t."to") t."to" as address, t."from" as kol from transfers t
     join wallets k on k.token_id=t.token_id and k.address=t."from" and k.category='kol' and not k.hidden
     where t.token_id=$1 and not (t."to" = any($2))
       and not exists (select 1 from wallets w where w.token_id=t.token_id and w.address=t."to")
     order by t."to", t.block`,
    [tokenId, skip],
  )
  await ensureKinds(chainId, linkCandidates.map((r) => r.address))
  const eoa = await q<{ address: string }>(
    `select address from addresses where chain_id=$1 and address = any($2) and kind in ('eoa','delegated')`,
    [chainId, linkCandidates.map((r) => r.address)],
  )
  const ok = new Set(eoa.map((r) => r.address))
  for (const r of linkCandidates) {
    if (!ok.has(r.address)) continue
    await q(`insert into wallets (token_id, address, category, linked_to, auto) values ($1,$2,'linked',$3,true) on conflict do nothing`, [tokenId, r.address, r.kol])
  }
}

export async function refreshNative(chainId: number) {
  const rows = await q<{ address: string }>(
    `select distinct w.address from wallets w join tokens t on t.id=w.token_id
     where t.chain_id=$1 and not w.hidden and w.category in ('owned','kol','watched')`, [chainId])
  const addrs = rows.map((r) => r.address)
  const bals = await nativeBalances(chainId, addrs)
  for (let i = 0; i < addrs.length; i++) {
    if (bals[i] == null) continue
    await q(`insert into addresses (chain_id, address, native_balance, native_updated_at) values ($1,$2,$3,now())
             on conflict (chain_id, address) do update set native_balance=excluded.native_balance, native_updated_at=now()`,
      [chainId, addrs[i], bals[i]!.toString()])
  }
}

const Q96 = 1n << 96n

// Selling `amount` (raw) of the token into a pool with virtual reserves from L and sqrtP (full range assumption).
export function simulateSell(p: { sqrt_price: string; liquidity: string; token_is0: boolean; lp_fee: number | null }, amount: bigint) {
  const sp = BigInt(p.sqrt_price || '0')
  const L = BigInt(p.liquidity || '0')
  if (sp === 0n || L === 0n || amount === 0n) return { out: 0n, impact: 0 }
  const r0 = (L * Q96) / sp
  const r1 = (L * sp) / Q96
  const [rt, rq] = p.token_is0 ? [r0, r1] : [r1, r0]
  const fee = BigInt(Math.min(p.lp_fee ?? 0, 999_999))
  const inAfterFee = (amount * (1_000_000n - fee)) / 1_000_000n
  const out = (rq * inAfterFee) / (rt + inAfterFee)
  const spot = Number(rq) / Number(rt)
  const avg = Number(out) / Number(amount)
  return { out, impact: spot > 0 ? 1 - avg / spot : 0 }
}

export async function computeExit(tokenId: number) {
  const t = await one<any>('select * from tokens where id=$1', [tokenId])
  if (!t) return
  const ref = await one<any>('select * from pools where token_id=$1 and pool_id=$2', [tokenId, t.ref_pool_id])
  const nUsd = (await nativeUsdNow(t.chain_id)) ?? 0
  const owned = await q<{ address: string; group_id: number | null; balance: string | null; native: string | null }>(
    `select w.address, w.group_id, b.balance, a.native_balance as native from wallets w
     left join balances b on b.token_id=w.token_id and b.address=w.address
     left join addresses a on a.chain_id=$2 and a.address=w.address
     where w.token_id=$1 and w.category='owned' and not w.hidden`, [tokenId, t.chain_id])
  const groups = await q<{ id: number; name: string; color: string }>('select id, name, color from groups where token_id=$1 order by id', [tokenId])

  const quoteToNative = (raw: bigint) => {
    if (!ref) return 0
    const v = Number(raw) / 10 ** ref.quote_decimals
    if (ref.quote_kind === 'stable') return nUsd ? v / nUsd : 0
    return v
  }
  const sim = (amount: bigint) => {
    if (!ref || amount <= 0n) return { out: 0, impact: 0 }
    const s = simulateSell(ref, amount)
    return { out: quoteToNative(s.out), impact: s.impact }
  }
  const sum = (rows: typeof owned) => {
    let bal = 0n
    let native = 0n
    for (const r of rows) {
      bal += BigInt(r.balance ?? '0') > 0n ? BigInt(r.balance ?? '0') : 0n
      native += BigInt(r.native ?? '0')
    }
    return { bal, native }
  }
  const all = sum(owned)
  const allSim = sim(all.bal)
  const perGroup = [...groups, { id: null as unknown as number, name: 'Senza gruppo', color: '#66666f' }].map((g) => {
    const rows = owned.filter((r) => (r.group_id ?? null) === (g.id ?? null))
    const s = sum(rows)
    const x = sim(s.bal)
    return { id: g.id, name: g.name, color: g.color, members: rows.length, balance: s.bal.toString(), native: Number(s.native) / 1e18, exit_native: x.out, exit_impact: x.impact }
  }).filter((g) => g.members > 0 || g.id != null)

  const exit = {
    members: owned.length,
    balance: all.bal.toString(),
    exit_native: allSim.out,
    exit_impact: allSim.impact,
    native_total: Number(all.native) / 1e18,
    native_usd: nUsd,
    groups: perGroup,
    ref_pool: ref?.pool_id ?? null,
  }
  await q(`insert into token_state (token_id, exit, exit_updated_at) values ($1,$2,now())
           on conflict (token_id) do update set exit=excluded.exit, exit_updated_at=now()`, [tokenId, exit])
  return exit
}
