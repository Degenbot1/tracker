// Chain registry. Add a chain here to track launches on it.

export type ChainConfig = {
  id: number
  key: string
  name: string
  rpcs: string[]
  nativeSymbol: string
  coingeckoId: string           // native coin id on CoinGecko, for USD prices
  wrappedNative: string[]       // lowercase addresses priced 1:1 with native
  stables: Record<string, { symbol: string; decimals: number }> // lowercase address -> stable
  explorer: string              // base url, no trailing slash
  multicall3: string
  burnAddresses: string[]       // lowercase "dead" addresses (0x0 is handled separately)
  logsChunk: number             // max blocks per eth_getLogs window
}

export const ZERO = '0x0000000000000000000000000000000000000000'

export const CHAINS: Record<number, ChainConfig> = {
  99901: {
    id: 99901,
    key: 'elysium',
    name: 'Elysium',
    rpcs: (process.env.ELYSIUM_RPCS || 'https://rpc.elysium.kinetiq.xyz').split(','),
    nativeSymbol: 'HYPE',
    coingeckoId: 'hyperliquid',
    wrappedNative: ['0xba876237b0f021a6c6d852d6c26e107997cc5e81'],
    stables: { '0xb47c4c8f73f009cc0c0d3f92b388d13e293f0b65': { symbol: 'USDC', decimals: 6 } },
    explorer: 'https://elysium.kinetiq.xyz/explorer',
    multicall3: '0xca11bde05977b3631167028862be2a173976ca11',
    burnAddresses: ['0x000000000000000000000000000000000000dead'],
    logsChunk: 2_000_000,
  },
}

export function chain(id: number): ChainConfig {
  const c = CHAINS[id]
  if (!c) throw new Error(`Unknown chain ${id}`)
  return c
}

export const DEFAULT_CHAIN = 99901
