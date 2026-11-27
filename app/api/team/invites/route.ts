import { randomBytes } from 'node:crypto'
import { one } from '@/lib/db.ts'
import { requireUser, audit } from '@/lib/auth.ts'

// Owner creates a one-time invite link valid for 7 days.
export async function POST(req: Request) {
  const u = await requireUser('owner')
  if (u instanceof Response) return u
  const { role } = await req.json().catch(() => ({}))
  const r = role === 'owner' ? 'owner' : 'operator'
  const id = randomBytes(18).toString('base64url')
  const inv = await one("insert into invites (id, role, created_by, expires_at) values ($1,$2,$3, now() + interval '7 days') returning id, role, expires_at", [id, r, u.id])
  await audit(u.id, 'invite.create', { role: r })
  return Response.json(inv)
}
