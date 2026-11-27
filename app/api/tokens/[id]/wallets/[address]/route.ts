import { q, one } from '@/lib/db.ts'
import { requireUser, audit } from '@/lib/auth.ts'

type Ctx = { params: Promise<{ id: string; address: string }> }

export async function PATCH(req: Request, ctx: Ctx) {
  const u = await requireUser()
  if (u instanceof Response) return u
  const { id, address } = await ctx.params
  const b = await req.json().catch(() => ({}))
  const fields: string[] = []
  const vals: unknown[] = [Number(id), address.toLowerCase()]
  for (const k of ['name', 'color', 'notes', 'group_id', 'category', 'linked_to']) {
    if (k in b) {
      vals.push(b[k] === '' ? null : b[k])
      fields.push(`${k}=$${vals.length}`)
    }
  }
  if (!fields.length) return Response.json({ ok: true })
  await q(`update wallets set ${fields.join(', ')}, auto=false where token_id=$1 and address=$2`, vals)
  await audit(u.id, 'wallet.edit', { token: Number(id), address, ...b })
  return Response.json({ ok: true })
}

// Untag: the row stays hidden so the indexer never adds it back automatically.
export async function DELETE(_: Request, ctx: Ctx) {
  const u = await requireUser()
  if (u instanceof Response) return u
  const { id, address } = await ctx.params
  const w = await one<any>('select auto from wallets where token_id=$1 and address=$2', [Number(id), address.toLowerCase()])
  if (!w) return Response.json({ ok: true })
  await q('update wallets set hidden=true, group_id=null where token_id=$1 and address=$2', [Number(id), address.toLowerCase()])
  await audit(u.id, 'wallet.untag', { token: Number(id), address })
  return Response.json({ ok: true })
}
