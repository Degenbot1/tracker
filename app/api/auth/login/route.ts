import { one } from '@/lib/db.ts'
import { verifyPassword, createSession, audit } from '@/lib/auth.ts'

export async function POST(req: Request) {
  const { email, password } = await req.json().catch(() => ({}))
  const u = await one<{ id: number; password_hash: string }>('select id, password_hash from users where lower(email)=lower($1)', [String(email ?? '')])
  if (!u || !(await verifyPassword(String(password ?? ''), u.password_hash))) {
    await new Promise((r) => setTimeout(r, 600))
    return Response.json({ error: 'Email o password errate' }, { status: 401 })
  }
  await createSession(u.id, req.headers.get('user-agent'))
  await audit(u.id, 'login')
  return Response.json({ ok: true })
}
