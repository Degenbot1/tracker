import { one, q } from '@/lib/db.ts'
import { hashPassword, createSession, audit } from '@/lib/auth.ts'

export async function GET(_: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params
  const inv = await one<any>('select role, expires_at, used_by from invites where id=$1', [code])
  if (!inv || inv.used_by || new Date(inv.expires_at) < new Date()) return Response.json({ error: 'Invito non valido o scaduto' }, { status: 404 })
  return Response.json({ role: inv.role })
}

export async function POST(req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params
  const inv = await one<any>('select role, expires_at, used_by from invites where id=$1', [code])
  if (!inv || inv.used_by || new Date(inv.expires_at) < new Date()) return Response.json({ error: 'Invito non valido o scaduto' }, { status: 404 })
  const { email, name, password } = await req.json().catch(() => ({}))
  if (!email || !name || String(password ?? '').length < 12) return Response.json({ error: 'Servono email, nome e password di almeno 12 caratteri' }, { status: 400 })
  const exists = await one('select 1 from users where lower(email)=lower($1)', [email])
  if (exists) return Response.json({ error: 'Email già registrata' }, { status: 409 })
  const u = await one<{ id: number }>('insert into users (email, name, password_hash, role) values ($1,$2,$3,$4) returning id', [email, name, await hashPassword(password), inv.role])
  await q('update invites set used_by=$2 where id=$1', [code, u!.id])
  await createSession(u!.id, req.headers.get('user-agent'))
  await audit(u!.id, 'invite.accept', { role: inv.role })
  return Response.json({ ok: true })
}
