import { q } from '@/lib/db.ts'
import { requireUser, audit } from '@/lib/auth.ts'

// Pin a pool as price reference, or unpin with { poolId: null }.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await requireUser()
  if (u instanceof Response) return u
  const id = Number((await ctx.params).id)
  const { poolId } = await req.json().catch(() => ({}))
  if (poolId) await q('update tokens set ref_pool_id=$2, ref_pool_pinned=true where id=$1', [id, String(poolId).toLowerCase()])
  else await q('update tokens set ref_pool_pinned=false where id=$1', [id])
  await audit(u.id, 'token.ref_pool', { id, poolId })
  return Response.json({ ok: true })
}
