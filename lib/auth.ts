import { randomBytes, scrypt as _scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { cookies } from 'next/headers'
import { q, one } from './db.ts'

const scrypt = promisify(_scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>
export const COOKIE = 'lt_session'
const DAYS = 30

export type User = { id: number; email: string; name: string; role: 'owner' | 'operator' }

export async function hashPassword(pw: string) {
  const salt = randomBytes(16)
  const key = await scrypt(pw, salt, 64)
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`
}

export async function verifyPassword(pw: string, stored: string) {
  const [, saltHex, keyHex] = stored.split('$')
  if (!saltHex || !keyHex) return false
  const key = await scrypt(pw, Buffer.from(saltHex, 'hex'), 64)
  const want = Buffer.from(keyHex, 'hex')
  return want.length === key.length && timingSafeEqual(want, key)
}

export async function createSession(userId: number, ua: string | null) {
  const id = randomBytes(32).toString('base64url')
  await q(`insert into sessions (id, user_id, expires_at, user_agent) values ($1,$2, now() + interval '${DAYS} days', $3)`, [id, userId, ua])
  const jar = await cookies()
  jar.set(COOKIE, id, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: DAYS * 86400 })
  return id
}

export async function currentUser(): Promise<(User & { session: string }) | null> {
  const jar = await cookies()
  const sid = jar.get(COOKIE)?.value
  if (!sid) return null
  const u = await one<User & { session: string }>(
    `select u.id, u.email, u.name, u.role, s.id as session from sessions s join users u on u.id=s.user_id
     where s.id=$1 and s.expires_at > now()`, [sid])
  if (u) q('update users set last_seen=now() where id=$1', [u.id]).catch(() => {})
  return u
}

export async function destroySession() {
  const jar = await cookies()
  const sid = jar.get(COOKIE)?.value
  if (sid) await q('delete from sessions where id=$1', [sid])
  jar.delete(COOKIE)
}

export async function usersCount() {
  const r = await one<{ n: string }>('select count(*) as n from users')
  return Number(r?.n ?? 0)
}

export async function audit(userId: number | null, action: string, detail: unknown = null) {
  await q('insert into audit (user_id, action, detail) values ($1,$2,$3)', [userId, action, detail as any])
}

// API guard: returns the user or a 401 Response.
export async function requireUser(role?: 'owner'): Promise<User | Response> {
  const u = await currentUser()
  if (!u) return Response.json({ error: 'Non autenticato' }, { status: 401 })
  if (role === 'owner' && u.role !== 'owner') return Response.json({ error: 'Serve un owner' }, { status: 403 })
  return u
}
