'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useShell } from '@/components/Shell.tsx'
import TokenAvatar from '@/components/TokenAvatar.tsx'
import Modal from '@/components/Modal.tsx'
import { api } from '@/components/hooks.ts'
import { usd, usdPrice, pct, num, ago, short } from '@/lib/format.ts'

export default function Overview() {
  const { tokens, reloadTokens } = useShell()
  const router = useRouter()
  const [adding, setAdding] = useState(false)

  const list = tokens ?? []
  const exitUsd = list.reduce((a, t) => a + (t.owned?.exit_native ?? 0) * (t.native_usd ?? 0), 0)
  const nativeTotal = list.reduce((a, t) => a + (t.owned?.native_total ?? 0), 0)
  const nUsd = list[0]?.native_usd ?? 0
  const sym = list[0]?.native ?? 'HYPE'

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Panoramica</div>
          <h1 className="h1">Token seguiti</h1>
        </div>
        <button className="btn primary" onClick={() => setAdding(true)}>+ Aggiungi token</button>
      </div>

      <div className="kpis">
        <div className="panel kpi">
          <div className="label">Exit nostri wallet</div>
          <div className="value num">{usd(exitUsd)}</div>
          <div className="hint">tutti i token, venduti adesso</div>
        </div>
        <div className="panel kpi">
          <div className="label">{sym} nei wallet</div>
          <div className="value num">{num(nativeTotal, 3)}</div>
          <div className="hint">{usd(nativeTotal * nUsd)}</div>
        </div>
        <div className="panel kpi glow">
          <div className="label">Liquidabile ora</div>
          <div className="value num accent">{usd(exitUsd + nativeTotal * nUsd)}</div>
          <div className="hint">exit + {sym}</div>
        </div>
      </div>

      <div className="panel">
        <table className="table">
          <thead>
            <tr>
              <th className="l">Token</th><th>Prezzo</th><th>Market cap</th><th>24h</th><th>Trade 24h</th><th>Trade totali</th><th>Pool</th>
              <th>Nostri · exit</th><th>KOL</th><th>Ultimo trade</th><th>Stato</th>
            </tr>
          </thead>
          <tbody>
            {list.map((t) => (
              <tr key={t.id} className="click" onClick={() => router.push(`/token/${t.id}`)}>
                <td className="l">
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <TokenAvatar t={t} />
                    <div>
                      <div style={{ fontWeight: 600 }}>{t.symbol} <span className="faint" style={{ fontWeight: 400 }}>{t.name}</span></div>
                      <div className="faint mono" style={{ fontSize: 10.5 }}>{short(t.address)}</div>
                    </div>
                  </div>
                </td>
                <td className="mono">{usdPrice(t.price_usd)}</td>
                <td>{usd(t.mcap)}</td>
                <td className={t.change_24h >= 0 ? 'buy' : 'sell'}>{pct(t.change_24h, 2, true)}</td>
                <td>{num(t.trades_24h, 0)}</td>
                <td>{num(t.trades, 0)}</td>
                <td>{t.pools}</td>
                <td>
                  {t.owned?.members ? (
                    <>
                      <span className="faint">{t.owned.members} · </span>{usd((t.owned.exit_native ?? 0) * t.native_usd)}
                      <span className="sub2 sell">impatto −{pct(t.owned.exit_impact, 1)}</span>
                    </>
                  ) : <span className="faint">—</span>}
                </td>
                <td>{t.kols}</td>
                <td className="muted">{ago(t.last_trade_at)}</td>
                <td>
                  {t.status === 'live' ? <span className="badge live">live</span>
                    : t.status === 'error' ? <span className="badge bad">errore</span>
                    : <span className="badge warn">indicizza</span>}
                </td>
              </tr>
            ))}
            {!list.length && (
              <tr><td colSpan={11} className="empty">Nessun token. Aggiungine uno con il suo indirizzo.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {adding && <AddToken onClose={() => setAdding(false)} onAdded={(id) => { reloadTokens(); router.push(`/token/${id}`) }} />}
    </div>
  )
}

function AddToken({ onClose, onAdded }: { onClose: () => void; onAdded: (id: number) => void }) {
  const [address, setAddress] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  async function submit() {
    setBusy(true)
    setErr(null)
    try {
      const r = await api<{ id: number }>('/api/tokens', 'POST', { address: address.trim() })
      onAdded(r.id)
    } catch (e: any) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal title="Aggiungi token" subtitle="La storia viene ricostruita dal blocco di deploy. I pool v4 si trovano da soli." onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Annulla</button><button className="btn primary" disabled={busy || !address} onClick={submit}>{busy ? 'Aggiungo…' : 'Aggiungi'}</button></>}>
      <div className="field">
        <label>Indirizzo del token</label>
        <input className="input mono" autoFocus placeholder="0x…" value={address} onChange={(e) => setAddress(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
      </div>
      {err && <div className="err">{err}</div>}
    </Modal>
  )
}
