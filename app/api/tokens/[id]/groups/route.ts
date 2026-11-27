import { one } from '@/lib/db.ts'
import { requireUser, audit } from '@/lib/auth.ts'

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await requireUser()
  if (u instanceof Response) return u
  const id = Number((await ctx.params).id)
  const { name, color } = await req.json().catch(() => ({}))
  if (!name) return Response.json({ error: 'Serve un nome' }, { status: 400 })
  const g = await one('insert into groups (token_id, name, color) values ($1,$2,$3) returning id, name, color', [id, name, color || '#7fb4ff'])
  await audit(u.id, 'group.add', { token: id, name })
  return Response.json(g)
}
