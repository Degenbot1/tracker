'use client'
import { Fragment, useMemo, useState } from 'react'
import { useApi, api, useStored } from '../hooks.ts'
import Modal from '../Modal.tsx'
import Activity from './Activity.tsx'
import { usd, compact, pct, num, ago, short } from '@/lib/format.ts'

const SUBS = [
  { k: 'owned', label: 'Nostri' },
  { k: 'kol', label: 'KOL' },
  { k: 'watched', label: 'Sorvegliati' },
  { k: 'linked', label: 'Collegati' },
] as const

export default function Wallets({ token, refresh, onChanged }: { token: any; refresh: number; onChanged: () => void }) {
  const [sub, setSub] = useStored<string>('lt.walletCat', 'owned')
  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState(false)
  const [groupsOpen, setGroupsOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const { data, reload } = useApi<any>(`/api/tokens/${token.id}/wallets?r=${refresh}`)
  const wallets: any[] = data?.wallets ?? []
  const counts = data?.counts ?? {}

  async function recalc() {
    setBusy(true)
    try { await api(`/api/tokens/${token.id}/recalc`); await reload(); onChanged() } finally { setBusy(false) }
  }
  async function edit(address: string, patch: any) {
    await api(`/api/tokens/${token.id}/wallets/${address}`, 'PATCH', patch)
    reload(); onChanged()
  }
  async function untag(address: string) {
    await api(`/api/tokens/${token.id}/wallets/${address}`, 'DELETE')
    reload(); onChanged()
  }

  const filtered = wallets.filter((w) => w.category === sub && (!search || w.address.includes(search.toLowerCase()) || (w.name ?? '').toLowerCase().includes(search.toLowerCase())))

  return (
    <>
      <div className="toolbar">
        <div className="seg">
          {SUBS.map((s) => (
            <button key={s.k} className={sub === s.k ? 'on' : ''} onClick={() => setSub(s.k)}>{s.label} <span className="count">{counts[s.k] ?? 0}</span></button>
          ))}
        </div>
        <button className="btn primary" onClick={() => setAdding(true)}>+ Aggiungi</button>
        {sub === 'owned' && <button className="btn" disabled={busy} onClick={recalc}>{busy ? 'Ricalcolo…' : '↻ Ricalcola'}</button>}
        {sub === 'owned' && <button className="btn" onClick={() => setGroupsOpen(true)}>Gruppi</button>}
        <input className="input" style={{ width: 200, marginLeft: 'auto' }} placeholder="Cerca wallet…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <div className="scroll">
        {sub === 'owned' && <Owned token={token} wallets={filtered} groupExits={data?.group_exits} groups={token.groups} onEdit={edit} onUntag={untag} />}
        {sub === 'kol' && <Kols token={token} refresh={refresh} search={search} onEdit={edit} onUntag={untag} />}
        {(sub === 'watched' || sub === 'linked') && <Plain token={token} wallets={filtered} linked={sub === 'linked'} all={wallets} onEdit={edit} onUntag={untag} />}
      </div>
      {adding && <AddWallets token={token} category={sub} onClose={() => setAdding(false)} onDone={() => { setAdding(false); reload(); onChanged() }} />}
      {groupsOpen && <Groups token={token} onClose={() => setGroupsOpen(false)} onDone={() => { reload(); onChanged() }} />}
    </>
  )
}

function NameCell({ w, onEdit, color }: { w: any; onEdit: (a: string, p: any) => void; color?: string }) {
  const [editing, setEditing] = useState(false)
  const [v, setV] = useState(w.name ?? '')
  if (editing)
    return (
      <input className="input" autoFocus style={{ height: 24, width: 150 }} value={v} onChange={(e) => setV(e.target.value)}
        onBlur={() => { setEditing(false); if (v !== (w.name ?? '')) onEdit(w.address, { name: v }) }}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditing(false) }} />
    )
  return (
    <span>
      {w.name && <b style={{ color: color ?? 'var(--text)', marginRight: 6 }}>{w.name}</b>}
      <span className="mono muted">{short(w.address)}</span>
      <button className="icon-btn" title="Rinomina" onClick={(e) => { e.stopPropagation(); setEditing(true) }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
      </button>
      {w.auto && <span className="faint" style={{ fontSize: 10.5 }}> · auto</span>}
    </span>
  )
}

function Remove({ onClick }: { onClick: () => void }) {
  return <button className="icon-btn" title="Togli il tag" onClick={(e) => { e.stopPropagation(); onClick() }}>×</button>
}

function Owned({ token, wallets, groupExits, groups, onEdit, onUntag }: any) {
  const [closed, setClosed] = useStored<Record<string, boolean>>('lt.closed', {})
  const sections = useMemo(() => {
    const list = [...(groups ?? []).map((g: any) => ({ ...g })), { id: null, name: 'Senza gruppo', color: '#66666f' }]
    return list.map((g: any) => ({ g, rows: wallets.filter((w: any) => (w.group_id ?? null) === g.id) })).filter((s: any) => s.rows.length)
  }, [wallets, groups])
  if (!wallets.length) return <div className="empty">Nessun wallet nostro. Aggiungili per vedere exit, HYPE e trade.</div>
  return (
    <table className="table">
      <thead>
        <tr><th className="l">Wallet</th><th>Quantità</th><th>% circ.</th><th>Rimasto</th><th>A mercato</th><th>Exit</th><th>{token.native}</th><th>Trade</th><th>Ultima attività</th><th>Gruppo</th><th /></tr>
      </thead>
      <tbody>
        {sections.map(({ g, rows }: any) => {
          const key = String(g.id)
          const sum = (f: string) => rows.reduce((a: number, r: any) => a + (r[f] ?? 0), 0)
          return (
            <Fragment key={key}>
              <tr className="group click" onClick={() => setClosed({ ...closed, [key]: !closed[key] })}>
                <td className="l"><span className="faint">{closed[key] ? '›' : '⌄'}</span> <span className="dot" style={{ background: g.color }} />{g.name} <span className="faint" style={{ fontWeight: 400 }}>{rows.length} wallet</span></td>
                <td>{compact(sum('balance'))}</td><td>{pct(sum('pct'))}</td><td /><td>{usd(sum('value_usd'))}</td>
                <td>{(() => { const ge = groupExits?.[key]; return ge?.exit ? <>{num(ge.exit, 2)} {token.native}<span className="sub2 sell">−{pct(ge.impact, 1)}</span></> : '—' })()}</td>
                <td>{num(sum('native'), 3)}<span className="sub2">{usd(sum('native') * (token.native_usd ?? 0))}</span></td><td>{sum('trades')}</td><td /><td /><td />
              </tr>
              {!closed[key] && rows.map((w: any) => (
                <tr key={w.address}>
                  <td className="l" style={{ paddingLeft: 28 }}><NameCell w={w} onEdit={onEdit} color="var(--accent)" /></td>
                  <td>{compact(w.balance)}</td>
                  <td>{pct(w.pct)}</td>
                  <td><span className="bar" style={{ width: 50, marginRight: 6 }}><i style={{ width: `${Math.min(100, w.remaining * 100)}%` }} /></span>{pct(w.remaining, 0)}</td>
                  <td>{usd(w.value_usd)}</td>
                  <td>{w.exit_native ? num(w.exit_native, 3) : '—'}{w.exit_native && w.exit_impact ? <span className="sub2 sell">−{pct(w.exit_impact, 1)}</span> : null}</td>
                  <td>{num(w.native, 4)}<span className="sub2">{usd((w.native ?? 0) * (token.native_usd ?? 0))}</span></td>
                  <td>{w.trades}</td>
                  <td className="muted">{ago(w.last_ts)}</td>
                  <td>
                    <select className="input" style={{ height: 24, width: 120, padding: '0 6px' }} value={w.group_id ?? ''} onChange={(e) => onEdit(w.address, { group_id: e.target.value ? Number(e.target.value) : null })}>
                      <option value="">Senza gruppo</option>
                      {(groups ?? []).map((gg: any) => <option key={gg.id} value={gg.id}>{gg.name}</option>)}
                    </select>
                  </td>
                  <td><Remove onClick={() => onUntag(w.address)} /></td>
                </tr>
              ))}
            </Fragment>
          )
        })}
      </tbody>
    </table>
  )
}

function Kols({ token, refresh, search, onEdit, onUntag }: any) {
  const { data } = useApi<any>(`/api/tokens/${token.id}/kols?r=${refresh}`)
  const [open, setOpen] = useState<string | null>(null)
  const t = data?.totals
  const rows = (data?.kols ?? []).filter((k: any) => !search || k.address.includes(search.toLowerCase()) || (k.name ?? '').toLowerCase().includes(search.toLowerCase()))
  const STATUS: Record<string, [string, string]> = { holding: ['tiene', 'good'], selling: ['vende', 'warn'], exited: ['uscito', 'bad'] }
  return (
    <>
      {t && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', borderBottom: '1px solid var(--line)' }}>
          {[
            ['Inviati ai KOL', compact(t.sent), `${pct(t.sent_pct)} supply · ${usd(t.sent_usd)} all'invio`, ''],
            ['Ancora in mano', compact(t.held), `${usd(t.held_usd)} · KOL e collegati`, ''],
            ['Venduto', usd(t.sold_usd), 'KOL e collegati', 'sell'],
            ['Usciti', `${t.exited} / ${t.count}`, 'meno del 5% rimasto', ''],
          ].map(([l, v, h, c], i) => (
            <div key={i} style={{ padding: '14px 16px', borderLeft: i ? '1px solid var(--line)' : 0 }}>
              <div className="faint" style={{ fontSize: 11 }}>{l}</div>
              <div className={`num ${c}`} style={{ fontSize: 20, fontWeight: 650, marginTop: 4 }}>{v}</div>
              <div className="faint" style={{ fontSize: 10.5, marginTop: 3 }}>{h}</div>
            </div>
          ))}
        </div>
      )}
      <table className="table">
        <thead>
          <tr><th className="l">KOL</th><th>Da noi</th><th>In mano</th><th>Venduti</th><th>Spostati</th><th>Collegati</th><th className="l">Stato</th><th /></tr>
        </thead>
        <tbody>
          {rows.map((k: any) => (
            <Fragment key={k.address}>
              <tr className="click" onClick={() => setOpen(open === k.address ? null : k.address)}>
                <td className="l"><span className="faint" style={{ marginRight: 6 }}>{open === k.address ? '⌄' : '›'}</span><NameCell w={k} onEdit={onEdit} />
                  <span className="sub2" style={{ paddingLeft: 14 }}>attivo {ago(k.last_ts)}</span></td>
                <td>{compact(k.sent)}<span className="sub2">{pct(k.sent_pct)} · {usd(k.sent_usd)}</span></td>
                <td>{compact(k.held)}<span className="sub2">{pct(k.remaining, 0)} del massimo</span>
                  <span className="bar" style={{ width: 70, marginTop: 4 }}><i style={{ width: `${Math.min(100, k.remaining * 100)}%`, background: 'var(--kol)' }} /></span></td>
                <td className={k.sold ? 'sell' : 'faint'}>{k.sold ? compact(k.sold) : '—'}{k.sold ? <span className="sub2">{usd(k.sold_usd)}</span> : null}</td>
                <td className={k.moved ? '' : 'faint'}>{k.moved ? compact(k.moved) : '—'}</td>
                <td className={k.linked ? '' : 'faint'}>{k.linked ? <>{k.linked}<span className="sub2">{compact(k.linked_balance)} in mano</span></> : '—'}</td>
                <td className="l"><span className={`badge ${STATUS[k.status][1]}`}>{STATUS[k.status][0]}</span>
                  {k.first_sell && <span className="sub2">prima vendita {ago(k.first_sell)}</span>}</td>
                <td><Remove onClick={() => onUntag(k.address)} /></td>
              </tr>
              {open === k.address && (
                <tr className="expand"><td colSpan={8}><Activity token={token} refresh={refresh} wallet={k.address} compactView /></td></tr>
              )}
            </Fragment>
          ))}
          {data && !rows.length && <tr><td colSpan={8} className="empty">Nessun KOL. Chi riceve token dai nostri wallet viene aggiunto da solo.</td></tr>}
        </tbody>
      </table>
    </>
  )
}

function Plain({ token, wallets, linked, all, onEdit, onUntag }: any) {
  const nameOf = (a: string) => all.find((w: any) => w.address === a)?.name
  if (!wallets.length) return <div className="empty">{linked ? 'Nessun wallet collegato. Chi riceve token da un KOL compare qui da solo.' : 'Nessun wallet sorvegliato.'}</div>
  return (
    <table className="table">
      <thead>
        <tr><th className="l">Wallet</th>{linked && <th className="l">KOL</th>}<th>Quantità</th><th>% circolante</th><th>Rimasto del massimo</th><th>A mercato</th><th>Ricevuti</th><th>Usciti</th><th>Trade</th><th>Ultima attività</th><th className="l">Note</th><th /></tr>
      </thead>
      <tbody>
        {wallets.map((w: any) => (
          <tr key={w.address}>
            <td className="l"><NameCell w={w} onEdit={onEdit} color={linked ? 'var(--kol)' : 'var(--info)'} /></td>
            {linked && <td className="l"><span className="kol">{nameOf(w.linked_to) ?? short(w.linked_to)}</span>{w.auto && <span className="faint"> · auto</span>}</td>}
            <td>{compact(w.balance)}</td>
            <td>{pct(w.pct)}</td>
            <td>{pct(w.remaining, 0)} <span className="bar" style={{ width: 50, marginLeft: 6 }}><i style={{ width: `${Math.min(100, w.remaining * 100)}%`, background: linked ? 'var(--kol)' : 'var(--accent)' }} /></span></td>
            <td>{usd(w.value_usd)}</td>
            <td>{compact(w.received)}</td>
            <td>{compact(w.sent)}</td>
            <td className="faint">{w.trades}</td>
            <td className="muted">{ago(w.last_ts)}</td>
            <td className="l faint" style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>{w.notes}</td>
            <td><Remove onClick={() => onUntag(w.address)} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function AddWallets({ token, category, onClose, onDone }: any) {
  const [cat, setCat] = useState(category)
  const [addresses, setAddresses] = useState('')
  const [name, setName] = useState('')
  const [group, setGroup] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const n = (addresses.match(/0x[0-9a-fA-F]{40}/g) ?? []).length
  async function submit() {
    try {
      await api(`/api/tokens/${token.id}/wallets`, 'POST', { addresses, category: cat, name: name || undefined, group_id: group ? Number(group) : undefined })
      onDone()
    } catch (e: any) { setErr(e.message) }
  }
  return (
    <Modal title="Aggiungi wallet" subtitle="Incolla uno o più indirizzi, uno per riga." onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Annulla</button><button className="btn primary" disabled={!n} onClick={submit}>Aggiungi {n > 1 ? n : ''}</button></>}>
      <div className="seg">
        {SUBS.filter((s) => s.k !== 'linked').map((s) => <button key={s.k} className={cat === s.k ? 'on' : ''} onClick={() => setCat(s.k)}>{s.label}</button>)}
      </div>
      <div className="field"><label>Indirizzi</label><textarea className="input mono" rows={5} placeholder="0x…" value={addresses} onChange={(e) => setAddresses(e.target.value)} /></div>
      {n <= 1 && <div className="field"><label>Nome (facoltativo)</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>}
      {cat === 'owned' && token.groups?.length > 0 && (
        <div className="field"><label>Gruppo</label>
          <select className="input" value={group} onChange={(e) => setGroup(e.target.value)}>
            <option value="">Senza gruppo</option>
            {token.groups.map((g: any) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </div>
      )}
      {err && <div className="err">{err}</div>}
    </Modal>
  )
}

const COLORS = ['#7fb4ff', '#f3a63b', '#34d399', '#c4a1ff', '#fb6a74', '#e58cff']

function Groups({ token, onClose, onDone }: any) {
  const [name, setName] = useState('')
  const [color, setColor] = useState(COLORS[0])
  const [list, setList] = useState<any[]>(token.groups ?? [])
  async function add() {
    if (!name) return
    const g = await api(`/api/tokens/${token.id}/groups`, 'POST', { name, color })
    setList([...list, g]); setName(''); onDone()
  }
  async function del(id: number) {
    await api(`/api/tokens/${token.id}/groups/${id}`, 'DELETE')
    setList(list.filter((g) => g.id !== id)); onDone()
  }
  return (
    <Modal title="Gruppi dei nostri wallet" subtitle="Raggruppa i wallet per vedere exit e saldo di ogni gruppo." onClose={onClose}
      footer={<button className="btn" onClick={onClose}>Chiudi</button>}>
      {list.map((g) => (
        <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="dot" style={{ background: g.color }} /><span style={{ flex: 1 }}>{g.name}</span>
          <button className="btn ghost danger" onClick={() => del(g.id)}>Elimina</button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 6 }}>
        <input className="input" placeholder="Nuovo gruppo" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {COLORS.map((c) => <button key={c} onClick={() => setColor(c)} style={{ width: 16, height: 16, borderRadius: 5, background: c, border: color === c ? '2px solid #fff' : '0', cursor: 'pointer' }} />)}
        </div>
        <button className="btn primary" onClick={add}>Crea</button>
      </div>
    </Modal>
  )
}
