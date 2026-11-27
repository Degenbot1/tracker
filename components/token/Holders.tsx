'use client'
import { useApi } from '../hooks.ts'
import { usd, compact, pct, ago, short } from '@/lib/format.ts'

export function Holders({ token, refresh }: { token: any; refresh: number }) {
  const { data } = useApi<any[]>(`/api/tokens/${token.id}/holders?r=${refresh}`)
  const top = data?.[0]?.pct || 1
  return (
    <div className="scroll">
      <table className="table">
        <thead><tr><th className="l">#</th><th className="l">Wallet</th><th>Quantità</th><th>% circolante</th><th>Valore</th><th>Trade</th><th>Ultima attività</th></tr></thead>
        <tbody>
          {data?.map((h) => (
            <tr key={h.address}>
              <td className="l faint">{h.rank}</td>
              <td className="l mono">
                {h.name && <b className={h.category === 'owned' ? 'accent' : h.category === 'kol' || h.category === 'linked' ? 'kol' : 'info'} style={{ fontFamily: 'var(--font-sans)', marginRight: 6 }}>{h.name}</b>}
                <a className="muted" href={`${token.explorer}/address/${h.address}`} target="_blank" rel="noreferrer">{short(h.address)}</a>
                {h.is_pool && <span className="tag-pool">POOL</span>}
                {!h.name && h.category && <span className={`badge ${h.category === 'owned' ? 'warn' : 'kolb'}`} style={{ marginLeft: 6 }}>{h.category === 'owned' ? 'nostro' : h.category}</span>}
              </td>
              <td>{compact(h.balance)}</td>
              <td>{pct(h.pct)} <span className="bar" style={{ width: 70, marginLeft: 8 }}><i style={{ width: `${(h.pct / top) * 100}%` }} /></span></td>
              <td>{usd(h.value_usd)}</td>
              <td className="faint">{h.trades || '—'}</td>
              <td className="muted">{ago(h.last_ts)}</td>
            </tr>
          ))}
          {!data && <tr><td colSpan={7} className="empty">Carico…</td></tr>}
        </tbody>
      </table>
    </div>
  )
}

export function Pools({ token, onPin }: { token: any; onPin: (id: string | null) => void }) {
  const feeLabel = (p: any) => (p.dynamic ? 'dinamica' : `${+(p.fee / 10000).toFixed(4)}%`)
  return (
    <div className="scroll">
      <table className="table">
        <thead><tr><th className="l">Pool id</th><th className="l">Quote</th><th>Fee</th><th className="l">Hook</th><th className="l">Pool manager</th><th>Creato</th><th>Trade</th><th>Ultimo trade</th><th /></tr></thead>
        <tbody>
          {token.pool_list?.map((p: any) => (
            <tr key={p.pool_id}>
              <td className="l mono">{short(p.pool_id, 8, 6)} {p.is_ref && <span className="badge warn" style={{ marginLeft: 6 }}>riferimento</span>}</td>
              <td className="l">{p.quote}</td>
              <td>{feeLabel(p)}</td>
              <td className="l mono faint">{/^0x0+$/.test(p.hooks) ? '—' : short(p.hooks)}</td>
              <td className="l mono faint">{short(p.manager)}</td>
              <td className="muted">{ago(p.created_at)}</td>
              <td>{p.swaps.toLocaleString('it-IT')}</td>
              <td className="muted">{ago(p.last_trade_at)}</td>
              <td>
                {p.is_ref
                  ? token.ref_pool_pinned ? <button className="btn ghost" onClick={() => onPin(null)}>Sblocca</button> : <span className="faint" style={{ fontSize: 11 }}>auto</span>
                  : <button className="btn ghost" onClick={() => onPin(p.pool_id)}>Usa come riferimento</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
