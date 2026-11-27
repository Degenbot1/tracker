// Read-side queries shared by the API routes.
import { q, one } from './db.ts'
import { chain, ZERO } from './chains.ts'

export async function nativeUsd(chainId: number): Promise<number> {
  const r = await one<{ usd: number }>('select usd from native_prices where chain_id=$1 order by ts desc limit 1', [chainId])
  return r?.usd ?? 0
}

export function spotFromSqrt(p: { sqrt_price: string | null; token_is0: boolean; quote_decimals: number }, tokenDecimals: number): number | null {
  if (!p.sqrt_price || p.sqrt_price === '0') return null
  const s = Number(BigInt(p.sqrt_price)) / 2 ** 96
  const raw = s * s // currency1 per currency0, raw units
  const quotePerTokenRaw = p.token_is0 ? raw : 1 / raw
  return quotePerTokenRaw * 10 ** (tokenDecimals - p.quote_decimals)
}

const dead = (chainId: number) => [ZERO, ...chain(chainId).burnAddresses]

export async function supply(tokenId: number, chainId: number, totalSupply: string | null) {
  const s = await one<{ minted: string; burned_zero: string; burned_dead: string; burns: string }>(
    `select
       coalesce(sum(amount) filter (where "from"=$2),0) as minted,
       coalesce(sum(amount) filter (where "to"=$2),0) as burned_zero,
       coalesce(sum(amount) filter (where "to" = any($3)),0) - coalesce(sum(amount) filter (where "from" = any($3)),0) as burned_dead,
       count(*) filter (where "to" = any($4)) as burns
     from transfers where token_id=$1`,
    [tokenId, ZERO, chain(chainId).burnAddresses, dead(chainId)],
  )
  const total = BigInt(totalSupply ?? '0')
  const burnedDead = BigInt(s?.burned_dead ?? '0')
  return {
    minted: s?.minted ?? '0',
    burned_zero: s?.burned_zero ?? '0',
    burned_dead: burnedDead.toString(),
    total: total.toString(),
    circulating: (total - burnedDead).toString(),
    burns: Number(s?.burns ?? 0),
  }
}

// Current price: ref pool spot, else last trade.
export async function priceNow(t: any, nUsd: number) {
  const ref = t.ref_pool_id ? await one<any>('select * from pools where token_id=$1 and pool_id=$2', [t.id, t.ref_pool_id]) : null
  let quote: number | null = ref ? spotFromSqrt(ref, t.decimals) : null
  let hype: number | null = null
  let usd: number | null = null
  if (quote != null && ref) {
    if (ref.quote_kind === 'stable') { usd = quote; hype = nUsd ? quote / nUsd : null }
    else if (ref.quote_kind === 'native' || ref.quote_kind === 'wrapped') { hype = quote; usd = quote * nUsd }
  }
  if (usd == null) {
    const last = await one<{ price_usd: number; price_hype: number }>(
      'select price_usd, price_hype from trades where token_id=$1 and price_usd is not null order by block desc, log_index desc limit 1', [t.id])
    usd = last?.price_usd ?? null
    hype = last?.price_hype ?? null
    quote = hype
  }
  return { usd, hype, ref }
}

export async function price24h(tokenId: number, refPool: string | null) {
  const r = await one<{ price_usd: number; price_hype: number }>(
    `select price_usd, price_hype from trades where token_id=$1 and ($2::text is null or pool_id=$2) and ts <= now() - interval '24 hours'
     order by ts desc limit 1`, [tokenId, refPool])
  return r
}

export async function tokenSummary(t: any) {
  const nUsd = await nativeUsd(t.chain_id)
  const [p, p24, sup, stats, st, kols] = await Promise.all([
    priceNow(t, nUsd),
    price24h(t.id, t.ref_pool_id),
    supply(t.id, t.chain_id, t.total_supply),
    one<any>(
      `select count(*) as trades,
         count(*) filter (where ts > now() - interval '24 hours') as trades_24h,
         coalesce(sum(value_usd) filter (where ts > now() - interval '24 hours'),0) as volume_24h,
         coalesce(sum(value_usd),0) as volume,
         count(*) filter (where side='buy') as buys, count(*) filter (where side='sell') as sells,
         count(*) filter (where side='buy' and ts > now() - interval '24 hours') as buys_24h,
         count(*) filter (where side='sell' and ts > now() - interval '24 hours') as sells_24h,
         count(distinct wallet) as traders, max(ts) as last_trade_at,
         max(price_usd) filter (where $2::text is null or pool_id=$2) as ath_usd
       from trades where token_id=$1`, [t.id, t.ref_pool_id]),
    one<any>('select exit, exit_updated_at from token_state where token_id=$1', [t.id]),
    one<any>(`select count(*) as n from wallets where token_id=$1 and category='kol' and not hidden`, [t.id]),
  ])
  const holders = await one<any>(
    `select count(*) as n from balances where token_id=$1 and balance > 0 and not (address = any($2))`, [t.id, [ZERO, ...chain(t.chain_id).burnAddresses]])
  const pools = await one<any>('select count(*) as n from pools where token_id=$1', [t.id])
  const dec = 10 ** t.decimals
  const circ = Number(sup.circulating) / dec
  const total = Number(sup.total) / dec
  const athUsd = stats?.ath_usd ?? null
  const exit = st?.exit ?? null
  return {
    id: t.id,
    chain_id: t.chain_id,
    chain: chain(t.chain_id).key,
    native: chain(t.chain_id).nativeSymbol,
    address: t.address,
    name: t.name,
    symbol: t.symbol,
    decimals: t.decimals,
    logo: t.logo,
    status: t.status,
    error: t.error,
    deploy_block: t.deploy_block,
    scanned_to: t.scanned_to,
    ref_pool_id: t.ref_pool_id,
    ref_pool_pinned: t.ref_pool_pinned,
    ref_quote: p.ref?.quote_symbol ?? null,
    native_usd: nUsd,
    price_usd: p.usd,
    price_native: p.hype,
    price_24h_usd: p24?.price_usd ?? null,
    change_24h: p.usd && p24?.price_usd ? p.usd / p24.price_usd - 1 : null,
    mcap: p.usd != null ? p.usd * circ : null,
    fdv: p.usd != null ? p.usd * total : null,
    ath_usd: athUsd,
    ath_mcap: athUsd != null ? athUsd * circ : null,
    supply: sup,
    trades: Number(stats?.trades ?? 0),
    trades_24h: Number(stats?.trades_24h ?? 0),
    buys: Number(stats?.buys ?? 0),
    sells: Number(stats?.sells ?? 0),
    buys_24h: Number(stats?.buys_24h ?? 0),
    sells_24h: Number(stats?.sells_24h ?? 0),
    volume_usd: Number(stats?.volume ?? 0),
    volume_24h: Number(stats?.volume_24h ?? 0),
    traders: Number(stats?.traders ?? 0),
    holders: Number(holders?.n ?? 0),
    pools: Number(pools?.n ?? 0),
    last_trade_at: stats?.last_trade_at ?? null,
    kols: Number(kols?.n ?? 0),
    owned: exit,
    owned_updated_at: st?.exit_updated_at ?? null,
  }
}

export async function tokenRow(id: number) {
  return one<any>('select * from tokens where id=$1', [id])
}

export const TF: Record<string, number> = { '1s': 1, '15s': 15, '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '4h': 14400, '1d': 86400 }
