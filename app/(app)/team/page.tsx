'use client'
import { useState } from 'react'
import { useApi, api } from '@/components/hooks.ts'
import { useShell } from '@/components/Shell.tsx'
import { ago } from '@/lib/format.ts'

export default function Team() {
  const { me } = useShell()
  const { data, reload } = useApi<any>('/api/team')
  const [link, setLink] = useState<string | null>(null)
  const owner = me.role === 'owner'

  async function invite(role: string) {
    const r = await api<any>('/api/team/invites', 'POST', { role })
    setLink(`${window.location.origin}/invite/${r.id}`)
    reload()
  }
  async function setRole(uid: number, role: string) {
    await api(`/api/team/members/${uid}`, 'PATCH', { role })
    reload()
  }
  async function remove(uid: number, self: boolean) {
    if (!confirm(self ? 'Uscire dal team?' : 'Rimuovere questo membro?')) return
    await api(`/api/team/members/${uid}`, 'DELETE')
    if (self) window.location.href = '/login'
    else reload()
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Team</div>
          <h1 className="h1">{me.team}</h1>
          <div className="faint" style={{ fontSize: 12, marginTop: 3 }}>Il tuo ruolo: {me.role === 'owner' ? 'owner' : 'operatore'}</div>
        </div>
        {owner && (
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn" onClick={() => invite('operator')}>Invita operatore</button>
            <button className="btn primary" onClick={() => invite('owner')}>Invita owner</button>
          </div>
        )}
      </div>
      {link && (
        <div className="panel panel-pad" style={{ marginBottom: 8, display: 'flex', gap: 10, alignItems: 'center' }}>
          <span className="faint">Link di invito, valido 7 giorni e una sola volta:</span>
          <input className="input mono" readOnly value={link} onFocus={(e) => e.target.select()} />
          <button className="btn" onClick={() => navigator.clipboard.writeText(link)}>Copia</button>
        </div>
      )}
      <div className="panel">
        <div className="panel-pad panel-title" style={{ borderBottom: '1px solid var(--line)' }}><b style={{ color: 'var(--text)' }}>Membri <span className="faint">{data?.members?.length ?? ''}</span></b></div>
        <table className="table">
          <thead><tr><th className="l">Nome</th><th className="l">Email</th><th className="l">Ruolo</th><th className="l">Ultima attività</th><th /></tr></thead>
          <tbody>
            {data?.members?.map((m: any) => (
              <tr key={m.id}>
                <td className="l">{m.name}{m.id === me.id && <span className="faint"> · tu</span>}</td>
                <td className="l muted">{m.email}</td>
                <td className="l">
                  {owner && m.id !== me.id ? (
                    <select className="input" style={{ height: 26, width: 120 }} value={m.role} onChange={(e) => setRole(m.id, e.target.value)}>
                      <option value="owner">owner</option><option value="operator">operatore</option>
                    </select>
                  ) : m.role === 'owner' ? 'owner' : 'operatore'}
                </td>
                <td className="l muted">{ago(m.last_seen)}</td>
                <td>{(owner || m.id === me.id) && <button className="btn ghost danger" onClick={() => remove(m.id, m.id === me.id)}>{m.id === me.id ? 'Esci dal team' : 'Rimuovi'}</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {owner && data?.audit?.length > 0 && (
        <div className="panel" style={{ marginTop: 8 }}>
          <div className="panel-pad panel-title" style={{ borderBottom: '1px solid var(--line)' }}><b style={{ color: 'var(--text)' }}>Registro azioni</b></div>
          <div className="scroll" style={{ maxHeight: 320 }}>
            <table className="table">
              <tbody>
                {data.audit.map((a: any, i: number) => (
                  <tr key={i}><td className="l muted">{ago(a.ts)}</td><td className="l">{a.name ?? '—'}</td><td className="l mono">{a.action}</td><td className="l faint mono" style={{ maxWidth: 420, overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.detail ? JSON.stringify(a.detail) : ''}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
