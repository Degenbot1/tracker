// Minimal JSON-RPC client: rotates endpoints, retries with backoff, supports batches.
import { chain } from './chains.ts'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const cursor: Record<number, number> = {}

export class RpcError extends Error {
  code?: number
  constructor(message: string, code?: number) {
    super(message)
    this.code = code
  }
}

async function post(chainId: number, body: unknown): Promise<any> {
  const rpcs = chain(chainId).rpcs
  let lastErr: unknown
  for (let attempt = 0; attempt < 6; attempt++) {
    const i = (cursor[chainId] ?? 0) % rpcs.length
    const url = rpcs[i]
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      })
      if (res.status === 429 || res.status >= 500) throw new RpcError(`HTTP ${res.status} from ${url}`, res.status)
      const json = await res.json()
      return json
    } catch (e) {
      lastErr = e
      cursor[chainId] = i + 1
      await sleep(400 * 2 ** attempt)
    }
  }
  throw lastErr
}

export async function rpc<T = any>(chainId: number, method: string, params: unknown[] = []): Promise<T> {
  const json = await post(chainId, { jsonrpc: '2.0', id: 1, method, params })
  if (json.error) throw new RpcError(json.error.message || JSON.stringify(json.error), json.error.code)
  return json.result as T
}

// Batch of calls; returns results in order (null for failed items).
export async function rpcBatch<T = any>(chainId: number, calls: { method: string; params: unknown[] }[], size = 50): Promise<(T | null)[]> {
  const out: (T | null)[] = []
  for (let i = 0; i < calls.length; i += size) {
    const slice = calls.slice(i, i + size)
    const json = await post(
      chainId,
      slice.map((c, j) => ({ jsonrpc: '2.0', id: j, method: c.method, params: c.params })),
    )
    const arr: any[] = Array.isArray(json) ? json : [json]
    const byId = new Map(arr.map((r) => [r.id, r]))
    for (let j = 0; j < slice.length; j++) {
      const r = byId.get(j)
      out.push(r && !r.error ? (r.result as T) : null)
    }
  }
  return out
}

export type RawLog = {
  address: string
  topics: string[]
  data: string
  blockNumber: string
  blockTimestamp?: string
  transactionHash: string
  logIndex: string
}

const hex = (n: bigint) => '0x' + n.toString(16)

// eth_getLogs over [from, to], splitting the window when the node refuses or caps results.
export async function getLogs(
  chainId: number,
  filter: { address?: string | string[]; topics: (string | string[] | null)[] },
  from: bigint,
  to: bigint,
  cap = 10_000,
): Promise<RawLog[]> {
  if (from > to) return []
  const span = BigInt(chain(chainId).logsChunk)
  if (to - from + 1n > span) {
    const out: RawLog[] = []
    for (let a = from; a <= to; a += span) {
      const b = a + span - 1n < to ? a + span - 1n : to
      out.push(...(await getLogs(chainId, filter, a, b, cap)))
    }
    return out
  }
  try {
    const logs = await rpc<RawLog[]>(chainId, 'eth_getLogs', [{ ...filter, fromBlock: hex(from), toBlock: hex(to) }])
    if (logs.length >= cap && to > from) throw new RpcError('cap')
    return logs
  } catch (e) {
    if (to <= from) throw e
    const mid = (from + to) / 2n
    const left = await getLogs(chainId, filter, from, mid, cap)
    const right = await getLogs(chainId, filter, mid + 1n, to, cap)
    return left.concat(right)
  }
}

export async function blockNumber(chainId: number): Promise<bigint> {
  return BigInt(await rpc<string>(chainId, 'eth_blockNumber'))
}
