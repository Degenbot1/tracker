// Indexes one token: Uniswap v4 pool discovery, swaps, liquidity, transfers, balances.
import { decodeAbiParameters, encodeFunctionData, decodeFunctionResult, parseAbi, pad, keccak256, encodeAbiParameters } from 'viem'
import { q, one, tx } from '../lib/db.ts'
import { chain, ZERO } from '../lib/chains.ts'
import { rpc, getLogs, rpcBatch, type RawLog } from '../lib/rpc.ts'
import { nativeUsdAt } from './prices.ts'

export const TOPIC = {
  initialize: '0xdd466e674ea557f56295e2d0218a125ea4b4f0f6f3307b95f85e6110838d6438',
  swap: '0x40e9cecb9f5f1f1c5b9c97dec2917b7ee92e57ba5563708daca94dd84ad7112f',
  modifyLiquidity: '0xf208f4912782fd25c7f114ca3723a2d5dd6f3bcc3ac8db5af63baa85f711d5ec',
  transfer: '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
  // Emitted by custom-curve hooks: the PoolManager Swap event then carries zero amounts.
  hookSwap: '0x365f10e9e7ce45d7acfd986c42e0b666f8af282e440e6dafc78c1f2b2f786760',
}

const erc20 = parseAbi([
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
])
const managerAbi = parseAbi(['function extsload(bytes32 slot) view returns (bytes32)'])

const addrOf = (topic: string) => ('0x' + topic.slice(26)).toLowerCase()
const num = (h: string) => BigInt(h)

export type TokenRow = {
  id: number
  chain_id: number
  address: string
  decimals: number
  deploy_block: string | null
  scanned_to: string | null
  ref_pool_id: string | null
  ref_pool_pinned: boolean
  status: string
}

export type PoolRow = {
  pool_id: string
  manager: string
  token_is0: boolean
  quote_address: string
  quote_symbol: string
  quote_decimals: number
  quote_kind: string
}

async function call(chainId: number, to: string, data: string): Promise<string> {
  return rpc<string>(chainId, 'eth_call', [{ to, data }, 'latest'])
}

export async function readErc20(chainId: number, address: string) {
  const out: Record<string, unknown> = {}
  for (const fn of ['name', 'symbol', 'decimals', 'totalSupply'] as const) {
    try {
      const raw = await call(chainId, address, encodeFunctionData({ abi: erc20, functionName: fn }))
      out[fn] = decodeFunctionResult({ abi: erc20, functionName: fn, data: raw as `0x${string}` })
    } catch {
      out[fn] = null
    }
  }
  return {
    name: (out.name as string) ?? null,
    symbol: (out.symbol as string) ?? null,
    decimals: out.decimals == null ? 18 : Number(out.decimals),
    totalSupply: out.totalSupply == null ? null : (out.totalSupply as bigint).toString(),
  }
}

// Creates the token row; history is rebuilt by the worker from the first mint.
export async function addToken(chainId: number, address: string): Promise<number> {
  address = address.toLowerCase()
  const existing = await one<{ id: number }>('select id from tokens where chain_id=$1 and address=$2', [chainId, address])
  if (existing) return existing.id
  const meta = await readErc20(chainId, address)
  if (meta.symbol == null && meta.totalSupply == null) throw new Error('Not an ERC-20 token on this chain')
  const head = num(await rpc<string>(chainId, 'eth_blockNumber'))
  const mints = await getLogs(chainId, { address, topics: [TOPIC.transfer, pad(ZERO)] }, 0n, head)
  const deploy = mints.length ? num(mints[0].blockNumber) : head
  const row = await one<{ id: number }>(
    `insert into tokens (chain_id, address, name, symbol, decimals, total_supply, deploy_block, scanned_to, status)
     values ($1,$2,$3,$4,$5,$6,$7,$8,'backfill') returning id`,
    [chainId, address, meta.name, meta.symbol, meta.decimals, meta.totalSupply, deploy.toString(), (deploy - 1n).toString()],
  )
  return row!.id
}

function classifyQuote(chainId: number, quote: string) {
  const c = chain(chainId)
  if (quote === ZERO) return { symbol: c.nativeSymbol, decimals: 18, kind: 'native' }
  if (c.wrappedNative.includes(quote)) return { symbol: 'W' + c.nativeSymbol, decimals: 18, kind: 'wrapped' }
  const s = c.stables[quote]
  if (s) return { symbol: s.symbol, decimals: s.decimals, kind: 'stable' }
  return null
}

async function discoverPools(t: TokenRow, from: bigint, to: bigint, ts: Map<bigint, Date>): Promise<number> {
  let added = 0
  for (const pos of [2, 3]) {
    const topics: (string | null)[] = [TOPIC.initialize, null, null, null]
    topics[pos] = pad(t.address as `0x${string}`)
    const logs = await getLogs(t.chain_id, { topics }, from, to)
    for (const l of logs) {
      const currency0 = addrOf(l.topics[2])
      const currency1 = addrOf(l.topics[3])
      const [fee, tickSpacing, hooks] = decodeAbiParameters(
        [{ type: 'uint24' }, { type: 'int24' }, { type: 'address' }, { type: 'uint160' }, { type: 'int24' }],
        l.data as `0x${string}`,
      )
      const tokenIs0 = currency0 === t.address
      const quote = tokenIs0 ? currency1 : currency0
      let qc = classifyQuote(t.chain_id, quote)
      if (!qc) {
        const m = await readErc20(t.chain_id, quote)
        qc = { symbol: m.symbol || quote.slice(0, 8), decimals: m.decimals, kind: 'other' }
      }
      const block = num(l.blockNumber)
      const created = l.blockTimestamp ? new Date(Number(num(l.blockTimestamp)) * 1000) : ts.get(block) ?? null
      const r = await q(
        `insert into pools (token_id, pool_id, manager, currency0, currency1, fee, tick_spacing, hooks, created_block, created_at,
           token_is0, quote_address, quote_symbol, quote_decimals, quote_kind)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) on conflict do nothing returning pool_id`,
        [t.id, l.topics[1].toLowerCase(), l.address.toLowerCase(), currency0, currency1, Number(fee), Number(tickSpacing),
         (hooks as string).toLowerCase(), block.toString(), created, tokenIs0, quote, qc.symbol, qc.decimals, qc.kind],
      )
      added += r.length
    }
  }
  return added
}

const tsOf = (l: RawLog) => new Date(Number(num(l.blockTimestamp ?? '0x0')) * 1000)

// Fills missing blockTimestamp fields (nodes that don't return them).
async function fillTimestamps(chainId: number, logs: RawLog[]) {
  const missing = [...new Set(logs.filter((l) => !l.blockTimestamp).map((l) => l.blockNumber))]
  if (!missing.length) return
  const blocks = await rpcBatch<any>(chainId, missing.map((b) => ({ method: 'eth_getBlockByNumber', params: [b, false] })))
  const map = new Map(missing.map((b, i) => [b, blocks[i]?.timestamp]))
  for (const l of logs) if (!l.blockTimestamp) l.blockTimestamp = map.get(l.blockNumber)
}

const int128 = (h: string) => {
  const v = BigInt('0x' + h)
  return v >= 1n << 127n ? v - (1n << 128n) : v
}

// Index [from, to] for one token. Returns counts of new rows.
export async function indexRange(t: TokenRow, from: bigint, to: bigint) {
  const chainId = t.chain_id
  const c = chain(chainId)
  await discoverPools(t, from, to, new Map())
  const pools = await q<PoolRow>(
    'select pool_id, manager, token_is0, quote_address, quote_symbol, quote_decimals, quote_kind from pools where token_id=$1',
    [t.id],
  )
  const managers = [...new Set(pools.map((p) => p.manager))]
  const poolMap = new Map(pools.map((p) => [p.pool_id, p]))

  const transfers = await getLogs(chainId, { address: t.address, topics: [TOPIC.transfer] }, from, to)
  const swaps: RawLog[] = []
  const liqs: RawLog[] = []
  for (const m of managers) {
    const ids = pools.filter((p) => p.manager === m).map((p) => p.pool_id)
    swaps.push(...(await getLogs(chainId, { address: m, topics: [TOPIC.swap, ids] }, from, to)))
    liqs.push(...(await getLogs(chainId, { address: m, topics: [TOPIC.modifyLiquidity, ids] }, from, to)))
  }
  const hooked = await q<{ pool_id: string; hooks: string }>(`select pool_id, hooks from pools where token_id=$1 and hooks <> $2`, [t.id, ZERO])
  const hookSwaps = new Map<string, RawLog[]>()
  if (hooked.length) {
    const logs = await getLogs(chainId, { address: [...new Set(hooked.map((h) => h.hooks))], topics: [TOPIC.hookSwap, hooked.map((h) => h.pool_id)] }, from, to)
    for (const l of logs) {
      const k = l.transactionHash + l.topics[1].toLowerCase()
      hookSwaps.set(k, [...(hookSwaps.get(k) ?? []), l])
    }
  }
  await fillTimestamps(chainId, [...transfers, ...swaps, ...liqs])

  // Net token movement per tx, to attribute each swap to the real wallet (works for routers and relayers).
  const managerSet = new Set(managers)
  const allHooks = await q<{ hooks: string }>('select distinct hooks from pools where token_id=$1', [t.id])
  for (const h of allHooks) managerSet.add(h.hooks)
  managerSet.add(t.address)
  const perTx = new Map<string, Map<string, bigint>>()
  for (const l of transfers) {
    const h = l.transactionHash
    const f = addrOf(l.topics[1])
    const to_ = addrOf(l.topics[2])
    const v = num(l.data === '0x' ? '0x0' : l.data)
    let m = perTx.get(h)
    if (!m) perTx.set(h, (m = new Map()))
    m.set(f, (m.get(f) ?? 0n) - v)
    m.set(to_, (m.get(to_) ?? 0n) + v)
  }

  const tradeRows: unknown[][] = []
  const needFrom = new Set<string>()
  for (const l of swaps) {
    const p = poolMap.get(l.topics[1].toLowerCase())
    if (!p) continue
    const d = l.data.slice(2)
    let a0 = int128(d.slice(32, 64))
    let a1 = int128(d.slice(96, 128))
    if (a0 === 0n && a1 === 0n) {
      // Custom curve: take the amounts from the hook's HookSwap event in the same tx (in order).
      const k = l.transactionHash + l.topics[1].toLowerCase()
      const h = hookSwaps.get(k)?.shift()
      if (h) {
        const hd = h.data.slice(2)
        a0 = int128(hd.slice(32, 64))
        a1 = int128(hd.slice(96, 128))
      }
    }
    const tokenDelta = p.token_is0 ? a0 : a1
    const quoteDelta = p.token_is0 ? a1 : a0
    if (tokenDelta === 0n) continue
    const side = tokenDelta > 0n ? 'buy' : 'sell'
    const tokenAmt = tokenDelta < 0n ? -tokenDelta : tokenDelta
    const quoteAmt = quoteDelta < 0n ? -quoteDelta : quoteDelta
    let wallet: string | null = null
    const net = perTx.get(l.transactionHash)
    if (net) {
      let best: string | null = null
      let bestV = 0n
      for (const [a, v] of net) {
        if (managerSet.has(a) || a === ZERO) continue
        if (side === 'buy' ? v > bestV : v < bestV) {
          best = a
          bestV = v
        }
      }
      if (best) wallet = best
    }
    if (!wallet) needFrom.add(l.transactionHash)
    const ts = tsOf(l)
    const priceQuote = Number(quoteAmt) / 10 ** p.quote_decimals / (Number(tokenAmt) / 10 ** t.decimals)
    const nUsd = await nativeUsdAt(chainId, ts)
    let priceHype: number | null = null
    let priceUsd: number | null = null
    if (p.quote_kind === 'native' || p.quote_kind === 'wrapped') {
      priceHype = priceQuote
      priceUsd = nUsd ? priceQuote * nUsd : null
    } else if (p.quote_kind === 'stable') {
      priceUsd = priceQuote
      priceHype = nUsd ? priceQuote / nUsd : null
    }
    const valueUsd = priceUsd == null ? null : priceUsd * (Number(tokenAmt) / 10 ** t.decimals)
    tradeRows.push([t.id, p.pool_id, num(l.blockNumber).toString(), l.transactionHash, Number(num(l.logIndex)), ts, wallet, side,
      tokenAmt.toString(), quoteAmt.toString(), priceQuote, priceHype, priceUsd, valueUsd])
  }

  // Swaps settled inside the PoolManager (arbitrage, routers): attribute to the tx signer.
  if (needFrom.size) {
    const hashes = [...needFrom]
    const txs = await rpcBatch<any>(chainId, hashes.map((h) => ({ method: 'eth_getTransactionByHash', params: [h] })))
    const fromMap = new Map(hashes.map((h, i) => [h, (txs[i]?.from ?? ZERO).toLowerCase()]))
    for (const r of tradeRows) if (r[6] == null) r[6] = fromMap.get(r[3] as string) ?? ZERO
  }

  const liqRows = liqs.map((l) => {
    const [, , delta] = decodeAbiParameters([{ type: 'int24' }, { type: 'int24' }, { type: 'int256' }, { type: 'bytes32' }], l.data as `0x${string}`)
    return [t.id, l.topics[1].toLowerCase(), num(l.blockNumber).toString(), l.transactionHash, Number(num(l.logIndex)), tsOf(l), addrOf(l.topics[2]), (delta as bigint).toString()]
  })

  const transferRows = transfers.map((l) => [t.id, num(l.blockNumber).toString(), l.transactionHash, Number(num(l.logIndex)), tsOf(l),
    addrOf(l.topics[1]), addrOf(l.topics[2]), num(l.data === '0x' ? '0x0' : l.data).toString()])

  // Balance deltas for this range, with the running peak (starting from the stored balance).
  const touched = [...new Set(transfers.flatMap((l) => [addrOf(l.topics[1]), addrOf(l.topics[2])]))]
  const prior = new Map<string, bigint>()
  for (let i = 0; i < touched.length; i += 5000) {
    const rows = await q<{ address: string; balance: string }>('select address, balance from balances where token_id=$1 and address = any($2)', [t.id, touched.slice(i, i + 5000)])
    for (const r of rows) prior.set(r.address, BigInt(r.balance))
  }
  const bal = new Map<string, { d: bigint; r: bigint; s: bigint; ts: Date; run: bigint; peak: bigint }>()
  const entry = (addr: string, ts: Date) => {
    let x = bal.get(addr)
    if (!x) {
      const p0 = prior.get(addr) ?? 0n
      x = { d: 0n, r: 0n, s: 0n, ts, run: p0, peak: p0 }
      bal.set(addr, x)
    }
    return x
  }
  const ordered = transfers.slice().sort((x, y) => Number(num(x.blockNumber) - num(y.blockNumber)) || Number(num(x.logIndex) - num(y.logIndex)))
  for (const l of ordered) {
    const v = num(l.data === '0x' ? '0x0' : l.data)
    const ts = tsOf(l)
    const a = entry(addrOf(l.topics[1]), ts)
    a.d = a.d - v
    a.s = a.s + v
    a.run = a.run - v
    a.ts = ts
    const b = entry(addrOf(l.topics[2]), ts)
    b.d = b.d + v
    b.r = b.r + v
    b.run = b.run + v
    b.ts = ts
    if (b.run > b.peak) b.peak = b.run
  }

  await tx(async (cl) => {
    await bulkInsert(cl, 'trades', ['token_id', 'pool_id', 'block', 'tx', 'log_index', 'ts', 'wallet', 'side', 'token_amount', 'quote_amount', 'price_quote', 'price_hype', 'price_usd', 'value_usd'], tradeRows)
    await bulkInsert(cl, 'liquidity', ['token_id', 'pool_id', 'block', 'tx', 'log_index', 'ts', 'sender', 'delta'], liqRows)
    await bulkInsert(cl, 'transfers', ['token_id', 'block', 'tx', 'log_index', 'ts', '"from"', '"to"', 'amount'], transferRows)
    const balRows = [...bal.entries()].map(([a, v]) => [t.id, a, v.d.toString(), v.r.toString(), v.s.toString(), v.ts, v.peak.toString()])
    for (let i = 0; i < balRows.length; i += 1000) {
      const chunk = balRows.slice(i, i + 1000)
      const params: unknown[] = []
      const values = chunk.map((r, j) => {
        params.push(...r)
        const k = j * 7
        return `($${k + 1}::int,$${k + 2}::text,$${k + 3}::numeric,$${k + 4}::numeric,$${k + 5}::numeric,$${k + 6}::timestamptz,$${k + 7}::numeric)`
      })
      await cl.query(
        `insert into balances (token_id, address, balance, received, sent, last_ts, peak)
         select v.column1, v.column2, v.column3, v.column4, v.column5, v.column6, v.column7 from (values ${values.join(',')}) v
         on conflict (token_id, address) do update set
           balance = balances.balance + excluded.balance,
           received = balances.received + excluded.received,
           sent = balances.sent + excluded.sent,
           peak = greatest(balances.peak, excluded.peak),
           last_ts = excluded.last_ts`,
        params,
      )
    }
    await cl.query('update tokens set scanned_to=$2, error=null where id=$1', [t.id, to.toString()])
    if (tradeRows.length || liqRows.length) {
      await cl.query('insert into events (token_id, kind, payload) values ($1,$2,$3)', [t.id, 'activity', { trades: tradeRows.length, liquidity: liqRows.length, to: to.toString() }])
    }
  })
  void c
  return { trades: tradeRows.length, transfers: transferRows.length, liquidity: liqRows.length }
}

async function bulkInsert(cl: { query: (t: string, p: unknown[]) => Promise<unknown> }, table: string, cols: string[], rows: unknown[][]) {
  const per = Math.floor(30000 / cols.length)
  for (let i = 0; i < rows.length; i += per) {
    const chunk = rows.slice(i, i + per)
    const params: unknown[] = []
    const values = chunk.map((r, j) => {
      params.push(...r)
      return '(' + cols.map((_, k) => `$${j * cols.length + k + 1}`).join(',') + ')'
    })
    await cl.query(`insert into ${table} (${cols.join(',')}) values ${values.join(',')} on conflict do nothing`, params)
  }
}

// Pool state via PoolManager.extsload (StateLibrary layout: pools mapping at slot 6, liquidity at +3).
export async function readPoolState(chainId: number, manager: string, poolId: string) {
  const base = keccak256(encodeAbiParameters([{ type: 'bytes32' }, { type: 'uint256' }], [poolId as `0x${string}`, 6n]))
  const liqSlot = ('0x' + (BigInt(base) + 3n).toString(16).padStart(64, '0')) as `0x${string}`
  const [s0, liq] = await Promise.all([
    call(chainId, manager, encodeFunctionData({ abi: managerAbi, functionName: 'extsload', args: [base] })),
    call(chainId, manager, encodeFunctionData({ abi: managerAbi, functionName: 'extsload', args: [liqSlot] })),
  ])
  const w = BigInt(s0)
  const sqrtPriceX96 = w & ((1n << 160n) - 1n)
  const lpFee = Number((w >> 208n) & 0xffffffn)
  const liquidity = BigInt(liq) & ((1n << 128n) - 1n)
  return { sqrtPriceX96, liquidity, lpFee }
}

export async function refreshPoolsAndRef(t: TokenRow) {
  const pools = await q<{ pool_id: string; manager: string; swaps: string }>(
    `select p.pool_id, p.manager, (select count(*) from trades tr where tr.token_id=p.token_id and tr.pool_id=p.pool_id) as swaps
     from pools p where p.token_id=$1`, [t.id])
  for (const p of pools) {
    try {
      const s = await readPoolState(t.chain_id, p.manager, p.pool_id)
      await q('update pools set sqrt_price=$3, liquidity=$4, lp_fee=$5 where token_id=$1 and pool_id=$2', [t.id, p.pool_id, s.sqrtPriceX96.toString(), s.liquidity.toString(), s.lpFee])
    } catch { /* keep last state */ }
  }
  if (!t.ref_pool_pinned && pools.length) {
    const best = pools.slice().sort((a, b) => Number(b.swaps) - Number(a.swaps))[0]
    if (best.pool_id !== t.ref_pool_id) await q('update tokens set ref_pool_id=$2 where id=$1', [t.id, best.pool_id])
  }
  try {
    const m = await readErc20(t.chain_id, t.address)
    if (m.totalSupply) await q('update tokens set total_supply=$2 where id=$1', [t.id, m.totalSupply])
  } catch { /* ignore */ }
}
