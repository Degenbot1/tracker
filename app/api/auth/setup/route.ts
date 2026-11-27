import { one } from '@/lib/db.ts'
import { hashPassword, createSession, usersCount, audit } from '@/lib/auth.ts'

// First run only: creates the owner account.
export async function POST(req: Request) {
  if ((await usersCount()) > 0) return Response.json({ error: 'Già configurato' }, { status: 403 })
  const { email, name, password } = await req.json().catch(() => ({}))
  if (!email || !name || String(password ?? '').length < 12) return Response.json({ error: 'Servono email, nome e password di almeno 12 caratteri' }, { status: 400 })
  const u = await one<{ id: number }>("insert into users (email, name, password_hash, role) values ($1,$2,$3,'owner') returning id", [email, name, await hashPassword(password)])
  await createSession(u!.id, req.headers.get('user-agent'))
  await audit(u!.id, 'setup')
  return Response.json({ ok: true })
}
