import { q } from '@/lib/db.ts'
import { requireUser, audit } from '@/lib/auth.ts'
import { tokenSummary } from '@/lib/queries.ts'
import { DEFAULT_CHAIN, CHAINS } from '@/lib/chains.ts'
import { addToken } from '@/worker/indexer.ts'

export const dynamic = 'force-dynamic'

export async function GET() {
  const u = await requireUser()
  if (u instanceof Response) return u
  const tokens = await q("select * from tokens where status <> 'removed' order by id")
  return Response.json(await Promise.all(tokens.map(tokenSummary)))
}

export async function POST(req: Request) {
  const u = await requireUser()
  if (u instanceof Response) return u
  const { address, chainId } = await req.json().catch(() => ({}))
  const cid = Number(chainId ?? DEFAULT_CHAIN)
  if (!CHAINS[cid]) return Response.json({ error: 'Chain non supportata' }, { status: 400 })
  if (!/^0x[0-9a-fA-F]{40}$/.test(String(address ?? ''))) return Response.json({ error: 'Indirizzo non valido' }, { status: 400 })
  try {
    const id = await addToken(cid, address)
    await audit(u.id, 'token.add', { chainId: cid, address })
    return Response.json({ id })
  } catch (e: any) {
    return Response.json({ error: e?.message ?? 'Errore' }, { status: 400 })
  }
}
