'use client'

const PALETTE = ['#f3a63b', '#34d399', '#7fb4ff', '#c4a1ff', '#fb6a74', '#e58cff']

export default function TokenAvatar({ t, dot = false, size }: { t: any; dot?: boolean; size?: number }) {
  const color = PALETTE[(t?.id ?? 0) % PALETTE.length]
  const style = size ? { width: size, height: size } : undefined
  return (
    <span className="avatar" style={style}>
      {t?.logo ? <img src={t.logo} alt="" /> : <span style={{ color }}>{(t?.symbol ?? '?').slice(0, 2)}</span>}
      {dot && <span className="dot" style={{ background: t?.status === 'live' ? 'var(--buy)' : t?.status === 'error' ? 'var(--sell)' : 'var(--accent)' }} />}
    </span>
  )
}
