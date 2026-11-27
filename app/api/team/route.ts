import { q } from '@/lib/db.ts'
import { requireUser } from '@/lib/auth.ts'

export const dynamic = 'force-dynamic'

export async function GET() {
  const u = await requireUser()
  if (u instanceof Response) return u
  const members = await q('select id, email, name, role, created_at, last_seen from users order by role desc, id')
  const invites = u.role === 'owner'
    ? await q('select id, role, created_at, expires_at from invites where used_by is null and expires_at > now() order by created_at desc')
    : []
  const audit = u.role === 'owner'
    ? await q('select a.action, a.detail, a.ts, u.name from audit a left join users u on u.id=a.user_id order by a.ts desc limit 50')
    : []
  return Response.json({ me: u, members, invites, audit })
}
