import pg from 'pg'

// numeric -> string (big integers stay exact); int8 -> string.
pg.types.setTypeParser(1700, (v: string) => v)

const g = globalThis as unknown as { __ltPool?: pg.Pool }

export const pool: pg.Pool =
  g.__ltPool ??
  new pg.Pool({
    connectionString: process.env.DATABASE_URL || 'postgres://lt:lt@localhost:5432/launch_tracker',
    max: Number(process.env.PG_POOL_MAX || 10),
    ssl: process.env.PGSSL === '1' ? { rejectUnauthorized: false } : undefined,
  })
g.__ltPool = pool

export async function q<T = any>(text: string, params: unknown[] = []): Promise<T[]> {
  const r = await pool.query(text, params as any[])
  return r.rows as T[]
}

export async function one<T = any>(text: string, params: unknown[] = []): Promise<T | null> {
  const rows = await q<T>(text, params)
  return rows[0] ?? null
}

export async function tx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect()
  try {
    await c.query('begin')
    const out = await fn(c)
    await c.query('commit')
    return out
  } catch (e) {
    await c.query('rollback')
    throw e
  } finally {
    c.release()
  }
}
