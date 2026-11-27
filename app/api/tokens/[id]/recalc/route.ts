import { requireUser } from '@/lib/auth.ts'
import { computeExit, refreshNative } from '@/worker/wallets.ts'
import { refreshPoolsAndRef } from '@/worker/indexer.ts'
import { tokenRow } from '@/lib/queries.ts'

export async function POST(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await requireUser()
  if (u instanceof Response) return u
  const t = await tokenRow(Number((await ctx.params).id))
  if (!t) return Response.json({ error: 'Token non trovato' }, { status: 404 })
  await refreshPoolsAndRef(t)
  await refreshNative(t.chain_id)
  const exit = await computeExit(t.id)
  return Response.json({ exit })
}
