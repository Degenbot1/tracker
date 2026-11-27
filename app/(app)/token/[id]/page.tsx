'use client'
import { use, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useApi, useStream, useNow, api } from '@/components/hooks.ts'
import TokenAvatar from '@/components/TokenAvatar.tsx'
import Chart from '@/components/token/Chart.tsx'
import Activity from '@/components/token/Activity.tsx'
import Wallets from '@/components/token/Wallets.tsx'
import { Holders, Pools } from '@/components/token/Holders.tsx'
import RightRail from '@/components/token/RightRail.tsx'
import { useShell } from '@/components/Shell.tsx'
import { usd, usdPrice, pct, num, short } from '@/lib/format.ts'

const TABS = [
  { k: 'activity', label: 'Attività', count: (t: any) => t.trades },
  { k: 'wallets', label: 'Wallet', count: (t: any, w: number) => w, acc: true },
  { k: 'holders', label: 'Holder', count: (t: any) => t.holders },
  { k: 'pools', label: 'Pool', count: (t: any) => t.pools },
]

export default function TokenPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const sp = useSearchParams()
  const tab = sp.get('tab') || 'activity'
  const { me, reloadTokens } = useShell()
  const [refresh, setRefresh] = useState(0)
  const { data: t, error, reload } = useApi<any>(`/api/tokens/${id}`, 20_000)
  const [menu, setMenu] = useState(false)
  const lastLive = useStream(Number(id), (kind) => {
    if (kind === 'activity') {
      setRefresh((r) => r + 1)
      reload()
    }
  })
  const now = useNow(1000)
  const tabsRef = useRef<HTMLDivElement>(null)

  useEffect(() => { document.title = t ? `${t.symbol} ${usd(t.mcap)} · Launch Tracker` : 'Launch Tracker' }, [t?.symbol, t?.mcap])

  const setTab = (k: string) => router.replace(`/token/${id}?tab=${k}`, { scroll: false })
  if (error) return <div className="page"><div className="empty">{error}</div></div>
  if (!t) return <div className="page"><div className="empty">Carico…</div></div>

  const walletsCount = (t.owned?.members ?? 0) + t.kols

  async function pin(poolId: string | null) {
    await api(`/api/tokens/${id}/ref-pool`, 'POST', { poolId })
    reload()
  }
  async function removeToken() {
    if (!confirm(`Smettere di seguire ${t.symbol}? I dati indicizzati vengono cancellati.`)) return
    await api(`/api/tokens/${id}`, 'DELETE')
    reloadTokens()
    router.push('/')
  }

  return (
    <div className="token">
      <div className="panel token-head">
        <div className="token-id">
          <TokenAvatar t={t} />
          <div>
            <div className="name">{t.symbol}<small>{t.name}</small></div>
            <div className="addr mono" title="Copia" onClick={() => navigator.clipboard.writeText(t.address)}>{short(t.address)} ⧉</div>
          </div>
        </div>
        <div>
          <div className="big-price mono">{usdPrice(t.price_usd)}</div>
          <span className={`badge ${t.change_24h >= 0 ? 'good' : 'bad'}`} style={{ marginTop: 3 }}>{pct(t.change_24h, 2, true)} 24h</span>
        </div>
        <div className="stat"><div className="label">Market cap</div><div className="value">{usd(t.mcap)}</div></div>
        <div className="stat"><div className="label">FDV</div><div className="value">{usd(t.fdv)}</div></div>
        <div className="stat"><div className="label">Volume 24h</div><div className="value">{usd(t.volume_24h)}</div></div>
        <div className="stat"><div className="label">Holder</div><div className="value">{num(t.holders, 0)}</div></div>
        <div className="head-actions">
          <span className={`badge ${t.status === 'live' ? 'live' : 'warn'}`}>{t.status === 'live' ? 'live' : 'indicizza'} · {Math.max(0, Math.floor((now - lastLive) / 1000))}s</span>
          <button className="btn icon" title="Aggiorna" onClick={() => { reload(); setRefresh((r) => r + 1) }}>↻</button>
          <div style={{ position: 'relative' }}>
            <button className="btn icon" onClick={() => setMenu(!menu)}>⋯</button>
            {menu && (
              <div className="menu" onMouseLeave={() => setMenu(false)}>
                <a href={`${t.explorer}/token/${t.address}`} target="_blank" rel="noreferrer">↗ Apri nell'explorer</a>
                <button onClick={() => { navigator.clipboard.writeText(t.address); setMenu(false) }}>⧉ Copia indirizzo</button>
                {me.role === 'owner' && <button className="sell" onClick={removeToken}>Smetti di seguire</button>}
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap)', minWidth: 0 }}>
        <Chart token={t} refresh={refresh} />
        <div className="panel tabs-panel" ref={tabsRef}>
          <div className="tabs-head">
            {TABS.map((x) => (
              <button key={x.k} className={`tab ${tab === x.k ? 'on' : ''}`} onClick={() => setTab(x.k)}>
                {x.label} <span className={`count ${x.acc ? 'acc' : ''}`}>{compactCount(x.count(t, walletsCount))}</span>
              </button>
            ))}
          </div>
          <div style={{ overflowX: 'auto' }}>
          {tab === 'activity' && <Activity token={t} refresh={refresh} />}
          {tab === 'wallets' && <Wallets token={t} refresh={refresh} onChanged={() => reload()} />}
          {tab === 'holders' && <Holders token={t} refresh={refresh} />}
          {tab === 'pools' && <Pools token={t} onPin={pin} />}
          </div>
        </div>
      </div>

      <RightRail token={t} onManage={() => { setTab('wallets'); tabsRef.current?.scrollIntoView({ behavior: 'smooth' }) }} />
    </div>
  )
}

const compactCount = (n: number) => (n >= 1000 ? Math.floor(n / 1000) + 'K' : String(n ?? 0))
