import { q, one } from '@/lib/db.ts'
import { requireUser, audit } from '@/lib/auth.ts'

type Ctx = { params: Promise<{ uid: string }> }

// Owner changes a member's role.
export async function PATCH(req: Request, ctx: Ctx) {
  const u = await requireUser('owner')
  if (u instanceof Response) return u
  const uid = Number((await ctx.params).uid)
  const { role } = await req.json().catch(() => ({}))
  if (!['owner', 'operator'].includes(role)) return Response.json({ error: 'Ruolo non valido' }, { status: 400 })
  if (uid === u.id && role !== 'owner') {
    const owners = await one<{ n: string }>("select count(*) as n from users where role='owner'")
    if (Number(owners?.n) <= 1) return Response.json({ error: 'Serve almeno un owner' }, { status: 400 })
  }
  await q('update users set role=$2 where id=$1', [uid, role])
  await audit(u.id, 'member.role', { uid, role })
  return Response.json({ ok: true })
}

// Owner removes a member, or a member leaves the team.
export async function DELETE(_: Request, ctx: Ctx) {
  const u = await requireUser()
  if (u instanceof Response) return u
  const uid = Number((await ctx.params).uid)
  if (uid !== u.id && u.role !== 'owner') return Response.json({ error: 'Serve un owner' }, { status: 403 })
  const target = await one<{ role: string }>('select role from users where id=$1', [uid])
  if (target?.role === 'owner') {
    const owners = await one<{ n: string }>("select count(*) as n from users where role='owner'")
    if (Number(owners?.n) <= 1) return Response.json({ error: "L'ultimo owner non può uscire" }, { status: 400 })
  }
  await q('delete from users where id=$1', [uid])
  await audit(u.id, 'member.remove', { uid })
  return Response.json({ ok: true })
}
