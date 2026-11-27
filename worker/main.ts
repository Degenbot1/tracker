// Indexer worker: keeps every token in the database in sync with the chain.
import { q } from '../lib/db.ts'
import { blockNumber } from '../lib/rpc.ts'
import { migrate } from './migrate.ts'
import { indexRange, refreshPoolsAndRef, type TokenRow } from './indexer.ts'
import { autoTag, computeExit, refreshNative } from './wallets.ts'
import { syncHistory, syncSpot } from './prices.ts'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const WINDOW = BigInt(process.env.BACKFILL_WINDOW || 1_000_000)
const last: Record<string, number> = {}
const due = (key: string, everyMs: number) => {
  const now = Date.now()
  if ((last[key] ?? 0) + everyMs > now) return false
  last[key] = now
  return true
}
const log = (...a: unknown[]) => console.log(new Date().toISOString(), ...a)

async function tick() {
  const tokens = await q<TokenRow>("select * from tokens where status <> 'paused' order by id")
  const chains = [...new Set(tokens.map((t) => t.chain_id))]
  for (const c of chains) {
    if (due(`hist:${c}`, 6 * 3600_000)) await syncHistory(c).catch((e) => log('price history', e.message))
    if (due(`spot:${c}`, 120_000)) await syncSpot(c).catch((e) => log('price spot', e.message))
  }
  const heads = new Map<number, bigint>()
  for (const c of chains) heads.set(c, await blockNumber(c))

  for (const t of tokens) {
    const head = heads.get(t.chain_id)!
    try {
      let from = BigInt(t.scanned_to ?? t.deploy_block ?? '0') + 1n
      let moved = false
      while (from <= head) {
        const to = from + WINDOW - 1n < head ? from + WINDOW - 1n : head
        const r = await indexRange(t, from, to)
        if (r.trades || r.transfers) moved = true
        if (t.status !== 'live') log(`#${t.id} ${from}-${to}`, r)
        from = to + 1n
        if (t.status !== 'live' && to < head) await q('update tokens set status=$2 where id=$1', [t.id, 'backfill'])
      }
      if (t.status !== 'live') {
        await q("update tokens set status='live' where id=$1", [t.id])
        t.status = 'live'
        await refreshPoolsAndRef(t)
        last[`pools:${t.id}`] = Date.now()
      }
      if (moved || due(`tag:${t.id}`, 60_000)) await autoTag(t.id, t.chain_id)
      if (due(`pools:${t.id}`, 30_000)) await refreshPoolsAndRef(t)
      if (due(`exit:${t.id}`, 60_000)) await computeExit(t.id)
    } catch (e: any) {
      log(`token #${t.id} error`, e?.message ?? e)
      await q('update tokens set error=$2 where id=$1', [t.id, String(e?.message ?? e).slice(0, 300)])
    }
  }
  for (const c of chains) if (due(`native:${c}`, 120_000)) await refreshNative(c).catch((e) => log('native', e.message))
  if (due('trim', 600_000)) await q("delete from events where ts < now() - interval '1 hour'")
}

await migrate()
log('worker started')
for (;;) {
  try {
    await tick()
  } catch (e: any) {
    log('tick error', e?.message ?? e)
  }
  await sleep(Number(process.env.TICK_MS || 3000))
}
