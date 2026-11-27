import { one, q } from '@/lib/db.ts'
import { currentUser, hashPassword, verifyPassword, audit } from '@/lib/auth.ts'

export async function POST(req: Request) {
  const u = await currentUser()
  if (!u) return Response.json({ error: 'Non autenticato' }, { status: 401 })
  const { current, next } = await req.json().catch(() => ({}))
  const row = await one<{ password_hash: string }>('select password_hash from users where id=$1', [u.id])
  if (!row || !(await verifyPassword(String(current ?? ''), row.password_hash))) return Response.json({ error: 'Password attuale errata' }, { status: 400 })
  if (String(next ?? '').length < 12) return Response.json({ error: 'Almeno 12 caratteri' }, { status: 400 })
  await q('update users set password_hash=$2 where id=$1', [u.id, await hashPassword(next)])
  await audit(u.id, 'password.change')
  return Response.json({ ok: true })
}
