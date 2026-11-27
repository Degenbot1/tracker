'use client'
import { useCallback, useEffect, useRef, useState } from 'react'

export function useApi<T = any>(url: string | null, refreshMs = 0) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const urlRef = useRef(url)
  urlRef.current = url

  const load = useCallback(async () => {
    const u = urlRef.current
    if (!u) return
    setLoading(true)
    try {
      const r = await fetch(u, { cache: 'no-store' })
      if (r.status === 401) {
        window.location.href = '/login'
        return
      }
      const j = await r.json()
      if (urlRef.current !== u) return
      if (!r.ok) setError(j?.error ?? 'Errore')
      else {
        setData(j)
        setError(null)
      }
    } catch (e: any) {
      setError(e?.message ?? 'Errore di rete')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    setData(null)
    load()
    if (!refreshMs) return
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') load()
    }, refreshMs)
    return () => clearInterval(t)
  }, [url, refreshMs, load])

  return { data, error, loading, reload: load, setData }
}

export async function api<T = any>(url: string, method = 'POST', body?: unknown): Promise<T> {
  const r = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: body == null ? undefined : JSON.stringify(body) })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j?.error ?? `Errore ${r.status}`)
  return j as T
}

// Live events from the indexer (SSE). Calls onEvent for every activity on the token (or any token).
export function useStream(tokenId: number | null, onEvent: (kind: string, data: any) => void) {
  const cb = useRef(onEvent)
  cb.current = onEvent
  const [lastAt, setLastAt] = useState<number>(Date.now())
  useEffect(() => {
    const es = new EventSource(tokenId ? `/api/stream?tokenId=${tokenId}` : '/api/stream')
    const handler = (kind: string) => (e: MessageEvent) => {
      setLastAt(Date.now())
      try {
        cb.current(kind, JSON.parse(e.data))
      } catch {
        /* ignore */
      }
    }
    for (const k of ['hello', 'activity', 'head']) es.addEventListener(k, handler(k) as any)
    return () => es.close()
  }, [tokenId])
  return lastAt
}

export function useStored<T>(key: string, initial: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(initial)
  useEffect(() => {
    try {
      const s = localStorage.getItem(key)
      if (s != null) setV(JSON.parse(s))
    } catch {
      /* ignore */
    }
  }, [key])
  const set = (nv: T) => {
    setV(nv)
    try {
      localStorage.setItem(key, JSON.stringify(nv))
    } catch {
      /* ignore */
    }
  }
  return [v, set]
}

export function useNow(ms = 1000) {
  const [n, setN] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setN(Date.now()), ms)
    return () => clearInterval(t)
  }, [ms])
  return n
}
