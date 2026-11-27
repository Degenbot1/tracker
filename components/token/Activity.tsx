'use client'
import { useEffect, useState } from 'react'
import { useStored } from '../hooks.ts'
import { usd, compact, tiny, time, ago, short, num } from '@/lib/format.ts'

const TYPES = [
  { k: 'buy', label: 'Buy', c: 'var(--buy)' },
  { k: 'sell', label: 'Sell', c: 'var(--sell)' },
  { k: 'burn', label: 'Burn', c: 'var(--accent)' },
  { k: 'add', label: '+ Liq', c: 'var(--liq-add)' },
  { k: 'remove', label: '− Liq', c: 'var(--liq-rem)' },
]
const LABEL: Record<string, string> = { buy: 'Buy', sell: 'Sell', burn: 'Burn', add: '+ Liq', remove: '− Liq' }

export default function Activity({ token, refresh, wallet, compactView }: { token: any; refresh: number; wallet?: string; compactView?: boolean }) {
  const [types, setTypes] = useStored<string[]>('lt.types', ['buy', 'sell', 'burn', 'add', 'remove'])
  const [who, setWho] = useStored('lt.who', 'all')
  const [rows, setRows] = useState<any[] | null>(null)
  const [more, setMore] = useState(true)

  const qs = (before?: string) => {
    const p = new URLSearchParams({ types: (wallet ? ['buy', 'sell', 'burn', 'add', 'remove'] : types).join(','), who: wallet ? 'all' : who, limit: wallet ? '200' : '100' })
    if (before) p.set('before', before)
    if (wallet) p.set('wallet', wallet)
    return `/api/tokens/${token.id}/activity?${p}`
  }

  useEffect(() => {
    let dead = false
    fetch(qs()).then((r) => r.json()).then((j) => {
      if (dead || !Array.isArray(j)) return
      setRows((prev) => {
        if (!prev) return j
        // keep loaded older pages, refresh the head
        const seen = new Set(j.map((r: any) => r.tx + r.type + r.amount))
        return [...j, ...prev.filter((r) => !seen.has(r.tx + r.type + r.amount) && Number(r.block) < Number(j.at(-1)?.block ?? 0))]
      })
    })
    return () => { dead = true }
  }, [token.id, types.join(), who, refresh, wallet])

  useEffect(() => { setRows(null); setMore(true) }, [types.join(), who, wallet])

  async function loadMore() {
    const last = rows?.at(-1)
    if (!last) return
    const j = await fetch(qs(last.block)).then((r) => r.json())
    if (!Array.isArray(j) || !j.length) return setMore(false)
    setRows([...(rows ?? []), ...j])
  }

  const toggle = (k: string) => setTypes(types.includes(k) ? types.filter((x) => x !== k) : [...types, k])

  return (
    <>
      {!wallet && (
        <div className="toolbar">
          <div style={{ display: 'flex', gap: 6 }}>
            {TYPES.map((t) => (
              <button key={t.k} className="badge" onClick={() => toggle(t.k)}
                style={{ cursor: 'pointer', background: types.includes(t.k) ? 'var(--panel-3)' : 'transparent', color: types.includes(t.k) ? 'var(--text)' : 'var(--faint)' }}>
                <span className="dot" style={{ background: t.c, margin: 0 }} />{t.label}
              </button>
            ))}
          </div>
          <div className="seg" style={{ marginLeft: 'auto' }}>
            {[['all', 'Tutti'], ['owned', 'Nostri'], ['kol', 'KOL'], ['tagged', 'Taggati']].map(([k, l]) => (
              <button key={k} className={who === k ? 'on' : ''} onClick={() => setWho(k)}>{l}</button>
            ))}
          </div>
        </div>
      )}
      <div className="scroll" style={compactView ? { maxHeight: 300 } : undefined}>
        <table className="table">
          <thead>
            <tr>
              <th className="l">Ora</th><th className="l">Tipo</th><th>Valore</th><th>{token.symbol}</th><th>Quote</th><th>Prezzo</th>
              {!wallet && <th className="l">Wallet</th>}<th className="l">Tx</th>
            </tr>
          </thead>
          <tbody>
            {rows?.map((r, i) => {
              const color = r.type === 'buy' ? 'var(--buy)' : r.type === 'sell' ? 'var(--sell)' : r.type === 'burn' ? 'var(--accent)' : r.type === 'add' ? 'var(--liq-add)' : 'var(--liq-rem)'
              return (
                <tr key={r.tx + i}>
                  <td className="l mono" style={{ borderLeft: `2px solid ${color}` }}>{wallet ? new Date(r.ts).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : time(r.ts)} <span className="faint">{ago(r.ts).replace(' fa', '')}</span></td>
                  <td className="l" style={{ color, fontWeight: 600 }}>{LABEL[r.type]}</td>
                  <td style={{ color }}>{r.value_usd != null ? usd(r.value_usd) : '—'}</td>
                  <td>{r.amount != null ? compact(r.amount) : '—'}</td>
                  <td>{r.quote != null ? <>{num(r.quote, 4)} <span className="faint">{r.quote_symbol}</span></> : '—'}</td>
                  <td className="mono">{r.price_usd != null ? '$' + tiny(r.price_usd) : '—'}</td>
                  {!wallet && (
                    <td className="l mono">
                      {r.name ? <span className={r.category === 'owned' ? 'accent' : r.category === 'kol' || r.category === 'linked' ? 'kol' : 'info'}>{r.name} </span> : r.category ? <span className={r.category === 'owned' ? 'accent' : 'kol'}>● </span> : null}
                      <span className="muted">{short(r.wallet)}</span>
                    </td>
                  )}
                  <td className="l mono"><a className="faint" href={`${token.explorer}/tx/${r.tx}`} target="_blank" rel="noreferrer">{short(r.tx)}</a></td>
                </tr>
              )
            })}
            {rows && !rows.length && <tr><td colSpan={8} className="empty">Nessun evento</td></tr>}
            {!rows && <tr><td colSpan={8} className="empty">Carico…</td></tr>}
          </tbody>
        </table>
        {rows && rows.length >= 100 && more && (
          <div style={{ padding: 10, textAlign: 'center' }}><button className="btn" onClick={loadMore}>Carica altri</button></div>
        )}
      </div>
    </>
  )
}
