'use client'
import { useTheme, chartColors } from '@/components/theme.ts'
import { useEffect, useRef, useState } from 'react'
import { createChart, CandlestickSeries, HistogramSeries, createSeriesMarkers, CrosshairMode, type IChartApi, type ISeriesApi, type UTCTimestamp } from 'lightweight-charts'
import { useStored } from '../hooks.ts'
import { tiny, compact, usd, pct, short } from '@/lib/format.ts'

const TFS = ['1s', '15s', '1m', '5m', '15m', '1h', '4h', '1d']

type Props = { token: any; refresh: number }

export default function Chart({ token, refresh }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const chart = useRef<IChartApi | null>(null)
  const candles = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const volume = useRef<ISeriesApi<'Histogram'> | null>(null)
  const markersApi = useRef<any>(null)
  const athLine = useRef<any>(null)
  const lastTf = useRef<string>('')
  const [tf, setTf] = useStored('lt.tf', '5m')
  const [mode, setMode] = useStored<'price' | 'mcap'>('lt.mode', 'mcap')
  const [unit, setUnit] = useStored<'usd' | 'native'>('lt.unit', 'usd')
  const [marks, setMarks] = useStored('lt.marks', { owned: true, kol: true, burn: false })
  const [ohlc, setOhlc] = useState<any>(null)
  const theme = useTheme()
  const col = chartColors(theme)
  const [lastBar, setLastBar] = useState<any>(null)

  const circ = Number(token.supply?.circulating ?? 0) / 10 ** token.decimals
  const k = mode === 'mcap' ? circ : 1
  const fmt = (v: number) => (mode === 'mcap' ? (unit === 'usd' ? usd(v) : compact(v)) : (unit === 'usd' ? '$' : '') + tiny(v))

  // Create chart once.
  useEffect(() => {
    if (!box.current) return
    const c = createChart(box.current, {
      autoSize: true,
      layout: { background: { color: 'transparent' }, textColor: '#66666f', fontFamily: 'var(--font-mono), ui-monospace, monospace', fontSize: 10.5, attributionLogo: false },
      grid: { vertLines: { visible: false }, horzLines: { color: '#ffffff08' } },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.12, bottom: 0.22 } },
      timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false, rightOffset: 6 },
      crosshair: { mode: CrosshairMode.Normal, vertLine: { color: '#ffffff30', labelBackgroundColor: '#1c1c22' }, horzLine: { color: '#ffffff30', labelBackgroundColor: '#1c1c22' } },
      localization: { locale: 'it-IT' },
    })
    const s = c.addSeries(CandlestickSeries, {
      upColor: '#34d399', downColor: '#fb6a74', borderVisible: false, wickUpColor: '#34d39999', wickDownColor: '#fb6a7499',
      priceLineColor: '#fb6a74', priceFormat: { type: 'custom', formatter: (v: number) => fmtRef.current(v), minMove: 1e-12 },
    })
    const v = c.addSeries(HistogramSeries, { priceScaleId: 'vol', priceFormat: { type: 'volume' }, lastValueVisible: false, priceLineVisible: false })
    c.priceScale('vol').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } })
    c.subscribeCrosshairMove((p) => {
      const d = p.seriesData.get(s) as any
      setOhlc(d ? { ...d, vol: (p.seriesData.get(v) as any)?.value } : null)
    })
    chart.current = c
    candles.current = s
    volume.current = v
    markersApi.current = createSeriesMarkers(s, [])
    return () => {
      c.remove()
      chart.current = null
    }
  }, [])

  // Repaint the canvas when the theme changes.
  useEffect(() => {
    chart.current?.applyOptions({
      layout: { textColor: col.text },
      grid: { horzLines: { color: col.grid } },
      crosshair: { vertLine: { color: col.cross, labelBackgroundColor: col.label }, horzLine: { color: col.cross, labelBackgroundColor: col.label } },
    })
    candles.current?.applyOptions({ upColor: col.up, downColor: col.down, wickUpColor: col.up + '99', wickDownColor: col.down + '99', priceLineColor: col.down })
  }, [theme])

  const fmtRef = useRef(fmt)
  fmtRef.current = fmt

  // Load candles + markers.
  useEffect(() => {
    let dead = false
    async function load() {
      const [cr, mr] = await Promise.all([
        fetch(`/api/tokens/${token.id}/candles?tf=${tf}&unit=${unit}`).then((r) => r.json()),
        fetch(`/api/tokens/${token.id}/markers?tf=${tf}`).then((r) => r.json()),
      ])
      if (dead || !candles.current || !cr?.candles) return
      const data = cr.candles.map((c: any) => ({ time: c.time as UTCTimestamp, open: c.open * k, high: c.high * k, low: c.low * k, close: c.close * k }))
      candles.current.setData(data)
      volume.current!.setData(cr.candles.map((c: any) => ({ time: c.time as UTCTimestamp, value: c.volume, color: c.close >= c.open ? col.up + '55' : col.down + '55' })))
      setLastBar(cr.candles.at(-1) ?? null)
      const times = new Set(cr.candles.map((c: any) => c.time))
      const m = (Array.isArray(mr) ? mr : [])
        .filter((x: any) => times.has(x.t) && ((x.who === 'owned' && marks.owned) || (x.who === 'kol' && marks.kol) || (x.who === 'burn' && marks.burn)))
        .map((x: any) => {
          const color = x.who === 'owned' ? col.owned : x.who === 'kol' ? col.kol : col.burn
          if (x.kind === 'burn') return { time: x.t as UTCTimestamp, position: 'aboveBar', color, shape: 'circle', text: '' }
          return {
            time: x.t as UTCTimestamp, position: x.kind === 'buy' ? 'belowBar' : 'aboveBar', color,
            shape: x.kind === 'buy' ? 'arrowUp' : 'arrowDown', text: x.n > 1 ? String(x.n) : x.name ? x.name.slice(0, 8) : '',
          }
        })
      markersApi.current?.setMarkers(m)
      if (athLine.current) candles.current.removePriceLine(athLine.current)
      const ath = token.ath_usd != null ? (unit === 'usd' ? token.ath_usd : token.ath_usd / (token.native_usd || 1)) * k : null
      athLine.current = ath ? candles.current.createPriceLine({ price: ath, color: col.owned + '88', lineStyle: 2, lineWidth: 1, axisLabelVisible: true, title: 'ATH' }) : null
      if (lastTf.current !== `${tf}${mode}${unit}`) {
        lastTf.current = `${tf}${mode}${unit}`
        chart.current?.timeScale().fitContent()
        const n = data.length
        if (n > 180) chart.current?.timeScale().setVisibleLogicalRange({ from: n - 180, to: n + 4 })
      }
    }
    load()
    return () => { dead = true }
  }, [token.id, tf, unit, mode, marks.owned, marks.kol, marks.burn, refresh, k, token.ath_usd, token.native_usd, theme])

  useEffect(() => {
    chart.current?.applyOptions({ timeScale: { secondsVisible: tf === '1s' || tf === '15s' } })
  }, [tf])

  const athNow = token.ath_usd ? (token.price_usd ?? 0) / token.ath_usd - 1 : null
  const shown = ohlc ?? (lastBar ? { open: lastBar.open * k, high: lastBar.high * k, low: lastBar.low * k, close: lastBar.close * k, vol: lastBar.volume } : null)
  const ch = shown ? shown.close / shown.open - 1 : null

  return (
    <div className="panel chart-panel">
      <div className="chart-tools">
        <div className="seg">{TFS.map((x) => <button key={x} className={tf === x ? 'on' : ''} onClick={() => setTf(x)}>{x}</button>)}</div>
        <div className="seg">
          <button className={mode === 'price' ? 'on acc' : ''} onClick={() => setMode('price')}>Prezzo</button>
          <button className={mode === 'mcap' ? 'on acc' : ''} onClick={() => setMode('mcap')}>MCap</button>
        </div>
        <div className="seg">
          <button className={unit === 'usd' ? 'on' : ''} onClick={() => setUnit('usd')}>USD</button>
          <button className={unit === 'native' ? 'on' : ''} onClick={() => setUnit('native')}>{token.native}</button>
        </div>
        <div className="seg">
          <button className={marks.owned ? 'on acc' : ''} onClick={() => setMarks({ ...marks, owned: !marks.owned })}>Nostri</button>
          <button className={marks.kol ? 'on kolc' : ''} onClick={() => setMarks({ ...marks, kol: !marks.kol })}>KOL e altri</button>
          <button className={marks.burn ? 'on' : ''} onClick={() => setMarks({ ...marks, burn: !marks.burn })}>Burn</button>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {token.ath_mcap != null && (
            <span className="badge warn">ATH {usd(mode === 'mcap' ? token.ath_mcap : token.ath_usd)} {athNow != null && pct(athNow, 0)}</span>
          )}
          <span className="faint mono" style={{ fontSize: 10.5 }}>{short(token.ref_pool_id, 8, 6)} · {token.ref_quote}</span>
        </div>
      </div>
      <div className="chart-box" ref={box}>
        {shown && (
          <div className="ohlc mono">
            <span className="faint">O</span><span className={ch! >= 0 ? 'buy' : 'sell'}>{fmt(shown.open)}</span>
            <span className="faint">H</span><span className={ch! >= 0 ? 'buy' : 'sell'}>{fmt(shown.high)}</span>
            <span className="faint">L</span><span className={ch! >= 0 ? 'buy' : 'sell'}>{fmt(shown.low)}</span>
            <span className="faint">C</span><span className={ch! >= 0 ? 'buy' : 'sell'}>{fmt(shown.close)}</span>
            <span className={ch! >= 0 ? 'buy' : 'sell'}>{pct(ch, 2, true)}</span>
            {shown.vol != null && <><span className="faint">Vol</span><span>{compact(shown.vol)}</span></>}
          </div>
        )}
      </div>
    </div>
  )
}
