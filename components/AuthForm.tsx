'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { api } from './hooks.ts'

export default function AuthForm({ mode, code }: { mode: 'login' | 'setup' | 'invite'; code?: string }) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const url = mode === 'login' ? '/api/auth/login' : mode === 'setup' ? '/api/auth/setup' : `/api/auth/invite/${code}`
  const title = mode === 'login' ? 'Accedi' : mode === 'setup' ? 'Crea il primo account' : 'Entra nel team'
  const sub = mode === 'login' ? 'Launch Tracker del team' : mode === 'setup' ? 'Sarai owner: potrai invitare gli altri.' : 'Scegli nome e password.'

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (mode !== 'login' && !name.trim()) return setErr('Scrivi il tuo nome')
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setErr('Email non valida')
    if (mode !== 'login' && password.length < 12) return setErr(`La password deve avere almeno 12 caratteri (ora ${password.length})`)
    if (!password) return setErr('Scrivi la password')
    setBusy(true)
    setErr(null)
    try {
      await api(url, 'POST', { email: email.trim(), name: name.trim(), password })
      window.location.href = '/'
    } catch (e: any) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth">
      <form className="panel box" onSubmit={submit} noValidate>
        <div className="mb" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span className="logo-mark"><i /></span><b>Launch Tracker</b>
          </div>
          <div>
            <h1>{title}</h1>
            <div className="faint" style={{ fontSize: 12 }}>{sub}</div>
          </div>
          {mode !== 'login' && <div className="field"><label>Nome</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} required /></div>}
          <div className="field"><label>Email</label><input className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
          <div className="field"><label>Password{mode !== 'login' && <span className="faint"> · almeno 12 caratteri</span>}</label>
            <input className="input" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={mode === 'login' ? 1 : 12} /></div>
          {err && <div className="err">{err}</div>}
          <button className="btn primary" style={{ height: 34, justifyContent: 'center' }} disabled={busy}>{busy ? '…' : title}</button>
        </div>
      </form>
    </div>
  )
}
