'use client'
import { useState } from 'react'
import { useApi, api } from '@/components/hooks.ts'
import { ago } from '@/lib/format.ts'

export default function Account() {
  const { data, reload } = useApi<any>('/api/me')
  const [cur, setCur] = useState('')
  const [next, setNext] = useState('')
  const [rep, setRep] = useState('')
  const [msg, setMsg] = useState<string | null>(null)

  async function change() {
    if (next !== rep) return setMsg('Le due password nuove non coincidono')
    try {
      await api('/api/me/password', 'POST', { current: cur, next })
      setMsg('Password cambiata')
      setCur(''); setNext(''); setRep('')
    } catch (e: any) { setMsg(e.message) }
  }
  async function closeOthers() {
    await api('/api/me', 'DELETE')
    reload()
  }

  const u = data?.user
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Account</div>
          <h1 className="h1">{u?.name ?? '…'}</h1>
          <div className="faint" style={{ fontSize: 12, marginTop: 3 }}>{u?.email}</div>
        </div>
      </div>
      <div className="panel panel-pad" style={{ marginBottom: 8 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', marginBottom: 10 }}><b>Password</b><span className="faint" style={{ fontSize: 12 }}>Almeno 12 caratteri. Meglio una frase lunga che una parola complicata.</span></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 8 }}>
          <input className="input" type="password" placeholder="Attuale" value={cur} onChange={(e) => setCur(e.target.value)} />
          <input className="input" type="password" placeholder="Nuova" value={next} onChange={(e) => setNext(e.target.value)} />
          <input className="input" type="password" placeholder="Ripeti la nuova" value={rep} onChange={(e) => setRep(e.target.value)} />
          <button className="btn" onClick={change}>Cambia</button>
        </div>
        {msg && <div className="faint" style={{ marginTop: 8 }}>{msg}</div>}
      </div>
      <div className="panel">
        <div className="panel-pad" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--line)' }}>
          <b>Sessioni aperte</b><button className="btn" onClick={closeOthers}>Chiudi le altre</button>
        </div>
        <table className="table">
          <tbody>
            {data?.sessions?.map((s: any, i: number) => (
              <tr key={i}><td className="l">{s.current ? <span className="badge live">questa</span> : null} <span className="muted">{(s.user_agent ?? '').slice(0, 90)}</span></td><td className="muted">aperta {ago(s.created_at)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
