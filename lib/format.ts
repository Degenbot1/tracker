// Display helpers (Italian UI, numbers in en-US style like the reference).

const SUB = '₀₁₂₃₄₅₆₇₈₉'

export function compact(n: number | null | undefined, digits = 2): string {
  if (n == null || !isFinite(n)) return '—'
  const a = Math.abs(n)
  const s = n < 0 ? '-' : ''
  if (a >= 1e9) return s + (a / 1e9).toFixed(digits) + 'B'
  if (a >= 1e6) return s + (a / 1e6).toFixed(digits) + 'M'
  if (a >= 1e3) return s + (a / 1e3).toFixed(digits) + 'K'
  return s + a.toFixed(a >= 100 ? 0 : digits)
}

export const usd = (n: number | null | undefined, digits = 2) => (n == null || !isFinite(n) ? '—' : (n < 0 ? '-$' : '$') + compact(Math.abs(n), digits))

// Tiny prices with subscript zero count: 0.000205 -> 0.0₃205
export function tiny(n: number | null | undefined, sig = 4): string {
  if (n == null || !isFinite(n)) return '—'
  if (n === 0) return '0'
  if (n >= 1) return n.toLocaleString('en-US', { maximumFractionDigits: 4 })
  if (n >= 0.01) return n.toFixed(4)
  const str = n.toExponential(sig - 1) // e.g. 2.057e-4
  const [m, e] = str.split('e')
  const zeros = -Number(e) - 1
  const digits = m.replace('.', '').replace(/0+$/, '')
  const subs = String(zeros).split('').map((d) => SUB[Number(d)]).join('')
  return `0.0${subs}${digits}`
}

export const usdPrice = (n: number | null | undefined) => (n == null ? '—' : '$' + tiny(n))

export function pct(n: number | null | undefined, digits = 2, sign = false): string {
  if (n == null || !isFinite(n)) return '—'
  const v = (n * 100).toFixed(digits)
  return (sign && n > 0 ? '+' : '') + v + '%'
}

export const short = (a: string | null | undefined, l = 6, r = 4) => (a ? `${a.slice(0, l)}…${a.slice(-r)}` : '—')

export function ago(ts: string | number | Date | null | undefined): string {
  if (!ts) return '—'
  const s = Math.max(0, (Date.now() - new Date(ts).getTime()) / 1000)
  if (s < 60) return `${Math.floor(s)}s fa`
  if (s < 3600) return `${Math.floor(s / 60)}m fa`
  if (s < 86400) return `${Math.floor(s / 3600)}h fa`
  return `${Math.floor(s / 86400)}g fa`
}

export const time = (ts: string | number | Date) => new Date(ts).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
export const dateTime = (ts: string | number | Date) =>
  new Date(ts).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })

export const num = (n: number | null | undefined, digits = 3) =>
  n == null || !isFinite(n) ? '—' : n.toLocaleString('en-US', { maximumFractionDigits: digits })
