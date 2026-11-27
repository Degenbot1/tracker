import { q, one } from '@/lib/db.ts'
import { currentUser } from '@/lib/auth.ts'

export const dynamic = 'force-dynamic'

// Server-Sent Events: forwards indexer events (new trades, liquidity) every 2 seconds.
export async function GET(req: Request) {
  if (!(await currentUser())) return new Response('unauthorized', { status: 401 })
  const tokenId = Number(new URL(req.url).searchParams.get('tokenId') || 0) || null
  const enc = new TextEncoder()
  let lastId = Number((await one<{ id: string }>('select coalesce(max(id),0) as id from events'))?.id ?? 0)
  let closed = false
  const stream = new ReadableStream({
    async start(ctrl) {
      const send = (event: string, data: unknown) => ctrl.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      send('hello', { at: Date.now() })
      req.signal.addEventListener('abort', () => { closed = true })
      let beat = 0
      while (!closed) {
        await new Promise((r) => setTimeout(r, 2000))
        try {
          const rows = await q<any>(
            'select id, token_id, kind, payload, ts from events where id > $1 and ($2::int is null or token_id=$2) order by id limit 200',
            [lastId, tokenId])
          for (const r of rows) {
            lastId = Number(r.id)
            send(r.kind, { token_id: r.token_id, ...r.payload, ts: r.ts })
          }
          if (++beat % 5 === 0) {
            const h = await q<any>('select id, scanned_to, status from tokens')
            send('head', h)
          }
        } catch {
          /* keep the stream open */
        }
      }
      ctrl.close()
    },
    cancel() { closed = true },
  })
  return new Response(stream, {
    headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive', 'x-accel-buffering': 'no' },
  })
}
