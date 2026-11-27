// Single-service start: indexer worker + Next.js server in one process group.
import { spawn, spawnSync } from 'node:child_process'

const run = (cmd, args) => {
  const p = spawn(cmd, args, { stdio: 'inherit', env: process.env })
  p.on('exit', (code) => {
    console.error(`${args.join(' ')} exited with ${code}`)
    process.exit(code ?? 1)
  })
  return p
}
// Create or update the schema before the web server takes requests.
const m = spawnSync('node', ['--experimental-strip-types', '--no-warnings', 'worker/migrate.ts'], { stdio: 'inherit', env: process.env })
if (m.status !== 0) process.exit(m.status ?? 1)
run('node', ['--experimental-strip-types', '--no-warnings', 'worker/main.ts'])
run('npx', ['next', 'start', '-p', process.env.PORT || '3000'])
