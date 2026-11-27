import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { pool } from '../lib/db.ts'

export async function migrate() {
  const sql = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8')
  await pool.query(sql)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await migrate()
  console.log('schema ok')
  await pool.end()
}
