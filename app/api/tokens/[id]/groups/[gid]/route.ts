import { q } from '@/lib/db.ts'
import { requireUser, audit } from '@/lib/auth.ts'

type Ctx = { params: Promise<{ id: string; gid: string }> }

export async function PATCH(req: Request, ctx: Ctx) {
  const u = await requireUser()
  if (u instanceof Response) return u
  const { id, gid } = await ctx.params
  const { name, color } = await req.json().catch(() => ({}))
  await q('update groups set name=coalesce($3,name), color=coalesce($4,color) where token_id=$1 and id=$2', [Number(id), Number(gid), name ?? null, color ?? null])
  await audit(u.id, 'group.edit', { token: Number(id), gid, name, color })
  return Response.json({ ok: true })
}

// Wallets in the group fall back to "no group" (FK on delete set null).
export async function DELETE(_: Request, ctx: Ctx) {
  const u = await requireUser()
  if (u instanceof Response) return u
  const { id, gid } = await ctx.params
  await q('delete from groups where token_id=$1 and id=$2', [Number(id), Number(gid)])
  await audit(u.id, 'group.remove', { token: Number(id), gid })
  return Response.json({ ok: true })
}
