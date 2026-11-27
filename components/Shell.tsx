'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createContext, useContext } from 'react'
import { useApi, api } from './hooks.ts'
import { usd, pct } from '@/lib/format.ts'
import TokenAvatar from './TokenAvatar.tsx'
import { useTheme, setTheme } from './theme.ts'

export type Me = { id: number; name: string; role: 'owner' | 'operator'; team: string }
const Ctx = createContext<{ me: Me; tokens: any[] | null; reloadTokens: () => void }>({ me: null as any, tokens: null, reloadTokens: () => {} })
export const useShell = () => useContext(Ctx)

export default function Shell({ user, children }: { user: Me; children: React.ReactNode }) {
  const path = usePathname()
  const router = useRouter()
  const { data: tokens, reload } = useApi<any[]>('/api/tokens', 15_000)
  const chainChip = tokens?.[0]?.chain ?? 'elysium'

  async function logout() {
    await api('/api/auth/logout')
    router.push('/login')
  }

  return (
    <Ctx.Provider value={{ me: user, tokens, reloadTokens: reload }}>
      <div className="app">
        <aside className="rail">
          <div className="rail-head">
            <span className="logo-mark"><i /></span>
            <span>Launch Tracker</span>
            <span className="chip" style={{ marginLeft: 'auto' }}>{chainChip}</span>
          </div>
          <div className="rail-team">{user.team}</div>
          <nav>
            <Link href="/" className={path === '/' ? 'on' : ''}>Panoramica</Link>
            <Link href="/team" className={path === '/team' ? 'on' : ''}>Team</Link>
          </nav>
          <div className="rail-label">Token · {tokens?.length ?? 0}</div>
          <div className="rail-tokens">
            {tokens?.map((t) => (
              <Link key={t.id} href={`/token/${t.id}`} className={`rail-token ${path.startsWith(`/token/${t.id}`) ? 'on' : ''}`}>
                <TokenAvatar t={t} dot />
                <div style={{ minWidth: 0 }}>
                  <div className="sym">{t.symbol}</div>
                  <div className="sub" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</div>
                </div>
                <div className="r">
                  <div className="num">{usd(t.mcap)}</div>
                  <div className={`num ${t.change_24h >= 0 ? 'buy' : 'sell'}`} style={{ fontSize: 11 }}>{pct(t.change_24h, 1, true)}</div>
                </div>
              </Link>
            ))}
          </div>
          <div className="rail-foot">
            <Link href="/account" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></svg>
              <span>{user.name} <span className="faint">· {user.role === 'owner' ? 'owner' : 'operatore'}</span></span>
            </Link>
            <ThemeToggle />
            <button onClick={logout} title="Esci">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3" /></svg>
            </button>
          </div>
        </aside>
        <main className="main">{children}</main>
      </div>
    </Ctx.Provider>
  )
}

function ThemeToggle() {
  const t = useTheme()
  const light = t === 'light'
  return (
    <button onClick={() => setTheme(light ? 'dark' : 'light')} title={light ? 'Tema scuro' : 'Tema chiaro'} style={{ marginLeft: 'auto' }}>
      {light ? (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
      ) : (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
      )}
    </button>
  )
}
