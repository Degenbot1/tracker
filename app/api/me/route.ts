import { currentUser } from '@/lib/auth.ts'
import { q } from '@/lib/db.ts'

export async function GET() {
  const u = await currentUser()
  if (!u) return Response.json({ error: 'Non autenticato' }, { status: 401 })
  const sessions = await q('select id = $1 as current, created_at, user_agent from sessions where user_id=$2 and expires_at > now() order by created_at desc', [u.session, u.id])
  return Response.json({ user: { id: u.id, email: u.email, name: u.name, role: u.role }, sessions })
}

// Close every other session.
export async function DELETE() {
  const u = await currentUser()
  if (!u) return Response.json({ error: 'Non autenticato' }, { status: 401 })
  await q('delete from sessions where user_id=$1 and id <> $2', [u.id, u.session])
  return Response.json({ ok: true })
}
