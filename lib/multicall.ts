// Multicall3 (aggregate3): many eth_call reads in one call, so the RPC counts one request instead of N.
// Falls back to a JSON-RPC batch of plain eth_calls if the aggregate call itself fails.
import { encodeFunctionData, decodeFunctionResult, parseAbi } from 'viem'
import { chain } from './chains.ts'
import { rpc, rpcBatch } from './rpc.ts'

const abi = parseAbi([
  'struct Call3 { address target; bool allowFailure; bytes callData; }',
  'struct Result { bool success; bytes returnData; }',
  'function aggregate3(Call3[] calls) payable returns (Result[] returnData)',
  'function getEthBalance(address addr) view returns (uint256 balance)',
])

export type Read = { target: string; data: string }

// Returns the raw return data of each read, in order, or null where that read reverted.
export async function multicall(chainId: number, reads: Read[], size = 150): Promise<(string | null)[]> {
  const mc = chain(chainId).multicall3
  const out: (string | null)[] = []
  for (let i = 0; i < reads.length; i += size) {
    const slice = reads.slice(i, i + size)
    try {
      const data = encodeFunctionData({
        abi,
        functionName: 'aggregate3',
        args: [slice.map((r) => ({ target: r.target as `0x${string}`, allowFailure: true, callData: r.data as `0x${string}` }))],
      })
      const raw = await rpc<string>(chainId, 'eth_call', [{ to: mc, data }, 'latest'])
      const res = decodeFunctionResult({ abi, functionName: 'aggregate3', data: raw as `0x${string}` }) as readonly { success: boolean; returnData: string }[]
      for (const r of res) out.push(r.success && r.returnData !== '0x' ? r.returnData : null)
    } catch {
      const res = await rpcBatch<string>(chainId, slice.map((r) => ({ method: 'eth_call', params: [{ to: r.target, data: r.data }, 'latest'] })))
      for (const r of res) out.push(r && r !== '0x' ? r : null)
    }
  }
  return out
}

// Native balances through Multicall3.getEthBalance; null where the read failed.
export async function nativeBalances(chainId: number, addrs: string[]): Promise<(bigint | null)[]> {
  const mc = chain(chainId).multicall3
  const raw = await multicall(chainId, addrs.map((a) => ({
    target: mc,
    data: encodeFunctionData({ abi, functionName: 'getEthBalance', args: [a as `0x${string}`] }),
  })), 300)
  return raw.map((r) => (r == null ? null : BigInt(r)))
}
