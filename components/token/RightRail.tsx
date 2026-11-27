'use client'
import { usd, compact, pct, num, ago, tiny } from '@/lib/format.ts'

export default function RightRail({ token, onManage }: { token: any; onManage: () => void }) {
  const dec = 10 ** token.decimals
  const o = token.owned
  const nUsd = token.native_usd ?? 0
  const circ = Number(token.supply.circulating) / dec
  const minted = Number(token.supply.minted) / dec || Number(token.supply.total) / dec
  const bal = o ? Number(o.balance) / dec : 0
  const exitUsd = o ? o.exit_native * nUsd : 0
  const s = token.supply
  const parts = [
    { l: 'Circolante', v: circ, c: 'var(--text)' },
    { l: 'Bruciati (indirizzi morti)', v: Number(s.burned_dead) / dec, c: 'var(--accent)' },
    { l: 'Bruciati (0x0)', v: Number(s.burned_zero) / dec, c: 'var(--sell)' },
  ]
  const buyShare = token.buys_24h + token.sells_24h ? token.buys_24h / (token.buys_24h + token.sells_24h) : 0.5

  return (
    <div className="rr">
      <div className="panel card">
        <div className="ttl"><span className="accent">Nostri wallet · {o?.members ?? 0}</span><a href="#" onClick={(e) => { e.preventDefault(); onManage() }}>gestisci →</a></div>
        <div className="hero num">{usd(exitUsd)}</div>
        <div className="heroSub">valore di exit, tutto venduto adesso{o?.members ? <> · calcolato {ago(token.owned_updated_at)}</> : null}</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, fontSize: 12 }}>
          <span><b>{pct(circ ? bal / circ : 0)}</b> <span className="faint">della circolante</span></span>
          <span><b>{compact(bal)}</b> <span className="faint">token</span></span>
        </div>
        <div className="bar" style={{ width: '100%', height: 5, marginTop: 6 }}><i style={{ width: `${Math.min(100, circ ? (bal / circ) * 100 : 0)}%`, background: 'var(--muted)' }} /></div>
        {o?.groups?.length > 0 && (
          <table className="mini">
            <thead><tr><th>Gruppo</th><th>Token</th><th>Supply</th><th>Exit</th></tr></thead>
            <tbody>
              {o.groups.map((g: any) => (
                <tr key={String(g.id)}>
                  <td><span className="dot" style={{ background: g.color }} />{g.name} <span className="faint">· {g.members}</span>
                    <span className="sub2">{num(g.native, 3)} {token.native} · {usd(g.native * nUsd)}</span></td>
                  <td>{compact(Number(g.balance) / dec)}</td>
                  <td>{pct(circ ? Number(g.balance) / dec / circ : 0)}</td>
                  <td>{g.exit_native ? usd(g.exit_native * nUsd) : '—'}</td>
                </tr>
              ))}
              <tr className="total">
                <td>Totale <span className="faint">· {o.members}</span><span className="sub2">{num(o.native_total, 3)} {token.native} · {usd(o.native_total * nUsd)}</span></td>
                <td>{compact(bal)}</td><td>{pct(circ ? bal / circ : 0)}</td><td>{usd(exitUsd)}</td>
              </tr>
            </tbody>
          </table>
        )}
        {!o?.members ? (
          <div className="faint" style={{ fontSize: 12, marginTop: 14, lineHeight: 1.5 }}>Nessun wallet nostro su questo token. Aggiungili dalla scheda Wallet per vedere exit, impatto e {token.native} disponibili.</div>
        ) : <div className="grid2">
          <div><div className="label">Quantità</div><div className="value">{compact(bal)}</div></div>
          <div><div className="label">A mercato</div><div className="value">{usd(bal * (token.price_usd ?? 0))}</div></div>
          <div><div className="label">Exit</div><div className="value">{num(o?.exit_native, 3)} {token.native}</div></div>
          <div><div className="label">Impatto sul prezzo</div><div className="value sell">{o ? '−' + pct(o.exit_impact, 1) : '—'}</div></div>
          <div><div className="label">{token.native} nei wallet</div><div className="value">{num(o?.native_total, 3)}<small>{usd((o?.native_total ?? 0) * nUsd)}</small></div></div>
          <div><div className="label">Liquidabile ora</div><div className="value accent">{usd(exitUsd + (o?.native_total ?? 0) * nUsd)}<small>exit + {token.native}</small></div></div>
        </div>}
      </div>

      <div className="panel card">
        <div className="ttl"><span>Supply circolante</span><span className="badge">{pct(minted ? circ / minted : 0)} del mintato</span></div>
        <div className="hero num">{compact(circ)}</div>
        <div className="split">{parts.map((p) => <i key={p.l} style={{ width: `${minted ? (p.v / minted) * 100 : 0}%`, background: p.c }} />)}</div>
        <div className="legend">
          {parts.map((p) => (
            <div key={p.l}><span><span className="dot" style={{ background: p.c }} />{p.l}</span><span className="faint">{pct(minted ? p.v / minted : 0)}</span><b>{compact(p.v)}</b></div>
          ))}
          <div style={{ borderTop: '1px solid var(--line)', paddingTop: 7 }}><span className="muted"><span className="dot" style={{ background: 'var(--faint)' }} />Supply totale</span><span /><b>{compact(Number(s.total) / dec)}</b></div>
        </div>
      </div>

      <div className="panel card">
        <div className="ttl"><span>Attività 24h</span><span className="badge">{num(token.trades_24h, 0)} trade</span></div>
        <div className="hero num">{usd(token.volume_24h)}</div>
        <div className="heroSub">volume nelle ultime 24 ore</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, fontSize: 11.5 }}>
          <span className="buy">Buy <b>{num(token.buys_24h, 0)}</b></span><span className="faint">{pct(buyShare, 0)} buy</span><span className="sell"><b>{num(token.sells_24h, 0)}</b> Sell</span>
        </div>
        <div className="split" style={{ margin: '6px 0 0' }}><i style={{ width: `${buyShare * 100}%`, background: 'var(--buy)' }} /><i style={{ width: `${(1 - buyShare) * 100}%`, background: 'var(--sell)' }} /></div>
        <div className="grid2" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
          <div><div className="label">Trader unici</div><div className="value">{num(token.traders, 0)}</div></div>
          <div><div className="label">Holder</div><div className="value">{num(token.holders, 0)}</div></div>
          <div><div className="label">Volume totale</div><div className="value">{usd(token.volume_usd)}</div></div>
        </div>
      </div>

      <div className="panel card">
        <div className="ttl"><span>Mercato</span><span className="badge">{token.pools} pool</span></div>
        <div className="grid2" style={{ marginTop: 0 }}>
          <div><div className="label">Prezzo USD</div><div className="value mono">${tiny(token.price_usd)}</div></div>
          <div><div className="label">Prezzo {token.native}</div><div className="value mono">{tiny(token.price_native)}</div></div>
          <div><div className="label">Market cap</div><div className="value">{usd(token.mcap)}</div></div>
          <div><div className="label">FDV</div><div className="value">{usd(token.fdv)}</div></div>
          <div><div className="label">{token.native} / USD</div><div className="value">${num(nUsd, 2)}</div></div>
          <div><div className="label">Eventi di liquidità</div><div className="value">{num(token.liquidity_events, 0)}</div></div>
        </div>
      </div>

      <div className="panel card">
        <div className="ttl"><span>Indicizzazione</span><span className={`badge ${token.status === 'live' ? 'live' : 'warn'}`}>{token.status === 'live' ? 'live' : 'backfill'}</span></div>
        <div className="grid2" style={{ marginTop: 0 }}>
          <div><div className="label">Ultimo blocco</div><div className="value">{token.scanned_to}</div></div>
          <div><div className="label">Blocco di deploy</div><div className="value">{token.deploy_block}</div></div>
          <div><div className="label">Storico</div><div className="value">{token.status === 'live' ? 'completo' : 'in corso'}</div></div>
          <div><div className="label">Ultimo trade</div><div className="value">{ago(token.last_trade_at)}</div></div>
        </div>
        {token.error && <div className="err" style={{ marginTop: 8 }}>{token.error}</div>}
      </div>
    </div>
  )
}
