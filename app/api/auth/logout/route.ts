import { destroySession } from '@/lib/auth.ts'

export async function POST() {
  await destroySession()
  return Response.json({ ok: true })
}
