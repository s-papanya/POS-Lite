import { useCallback, useEffect, useRef, useState } from 'react'
import type { Sale } from '@pos-lite/shared'
import { businessDateSchema, saleListResponseSchema, saleResponseSchema } from '@pos-lite/validation'
import { ApiFailure, request } from '../api'
import { baht, bangkokDate } from './state'
import { Receipt } from './Receipt'

export function History({ storeId, accountName, onExpired }: { storeId: string; accountName: (id: string) => string; onExpired: () => void }) {
  const [dates, setDates] = useState({ from: bangkokDate(), to: bangkokDate() })
  const [query, setQuery] = useState({ ...dates, attempt: 0 })
  const [rows, setRows] = useState<Sale[]>([]); const [cursor, setCursor] = useState<string | null>(null)
  const [receipt, setReceipt] = useState<Sale | null>(null); const [busy, setBusy] = useState(true); const [message, setMessage] = useState('กำลังอ่านประวัติ…')
  const alive = useRef(true); const lock = useRef(false)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const failure = useCallback((error: unknown) => {
    if (error instanceof ApiFailure && error.status === 401) { onExpired(); return }
    setMessage('อ่านประวัติไม่ได้ กรุณาตรวจการเชื่อมต่อแล้วลองอีกครั้ง')
  }, [onExpired])
  useEffect(() => {
    let active = true
    request(`/stores/${storeId}/sales?from=${query.from}&to=${query.to}&limit=30`, saleListResponseSchema)
      .then(result => { if (active) { setRows(result.data); setCursor(result.page.nextCursor); setMessage(result.data.length ? '' : 'ยังไม่มีบิลในช่วงวันที่นี้') } })
      .catch(error => { if (active) failure(error) }).finally(() => { if (active) setBusy(false) })
    return () => { active = false }
  }, [storeId, query, failure])
  async function more() {
    if (!cursor || lock.current) return
    lock.current = true; setBusy(true)
    try {
      const result = await request(`/stores/${storeId}/sales?from=${query.from}&to=${query.to}&limit=30&cursor=${encodeURIComponent(cursor)}`, saleListResponseSchema)
      if (alive.current) { setRows(previous => [...previous, ...result.data]); setCursor(result.page.nextCursor); setMessage('') }
    } catch (error) { if (alive.current) failure(error) }
    finally { lock.current = false; if (alive.current) setBusy(false) }
  }
  async function open(id: string) {
    if (lock.current) return
    lock.current = true; setBusy(true); setMessage('กำลังอ่านบิล…')
    try { const result = await request(`/stores/${storeId}/sales/${id}`, saleResponseSchema); if (alive.current) { setReceipt(result.data); setMessage('') } }
    catch (error) { if (alive.current) failure(error) }
    finally { lock.current = false; if (alive.current) setBusy(false) }
  }
  return <section aria-labelledby="history-title"><h3 id="history-title">ประวัติบิล</h3>
    {receipt ? <><button type="button" className="secondary-action" onClick={() => setReceipt(null)}>กลับรายการบิล</button><Receipt sale={receipt} accountName={accountName} /></> : <>
      <form className="history-filter" onSubmit={event => {
        event.preventDefault()
        if (!businessDateSchema.safeParse(dates.from).success || !businessDateSchema.safeParse(dates.to).success || dates.from > dates.to || (Date.parse(dates.to) - Date.parse(dates.from)) / 86400000 >= 366) { setMessage('เลือกช่วงวันที่ไม่เกิน 366 วัน และวันเริ่มต้องไม่เกินวันสิ้นสุด'); return }
        setBusy(true); setMessage('กำลังอ่านประวัติ…'); setRows([]); setCursor(null); setQuery({ ...dates, attempt: query.attempt + 1 })
      }}><label>ตั้งแต่วันที่<input type="date" value={dates.from} onChange={e => setDates({ ...dates, from: e.target.value })} required disabled={busy} /></label>
        <label>ถึงวันที่<input type="date" value={dates.to} onChange={e => setDates({ ...dates, to: e.target.value })} required disabled={busy} /></label><button disabled={busy}>ค้นหาบิล</button></form>
      <ul className="history-list">{rows.map(sale => <li key={sale.id}><button type="button" disabled={busy} onClick={() => void open(sale.id)}><span>{sale.reference}<small>{sale.businessDate} · {sale.items.reduce((n, i) => n + i.quantity, 0)} ชิ้น</small></span><strong>{baht(sale.net)} บาท</strong></button></li>)}</ul>
      {cursor && <button type="button" className="secondary-action" disabled={busy} onClick={() => void more()}>อ่านบิลเพิ่มเติม</button>}
    </>}
    <p role="status" aria-live="polite">{message}</p>
  </section>
}
