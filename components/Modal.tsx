'use client'
import { useEffect } from 'react'

export default function Modal({ title, subtitle, children, footer, onClose, width }: {
  title: string; subtitle?: string; children: React.ReactNode; footer?: React.ReactNode; onClose: () => void; width?: number
}) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={width ? { width } : undefined}>
        <div className="mb">
          <div>
            <h3>{title}</h3>
            {subtitle && <div className="faint" style={{ fontSize: 11.5, marginTop: 3 }}>{subtitle}</div>}
          </div>
          {children}
        </div>
        {footer && <div className="mf">{footer}</div>}
      </div>
    </div>
  )
}
