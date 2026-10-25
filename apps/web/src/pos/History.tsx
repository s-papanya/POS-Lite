import { useCallback, useEffect, useRef, useState } from 'react'
import type { Sale } from '@pos-lite/shared'
import { businessDateSchema, saleListResponseSchema, saleResponseSchema } from '@pos-lite/validation'
import { ApiFailure, request } from '../api'
import { baht, bangkokDate } from './state'
import { Receipt } from './Receipt'
import { dayBefore, thaiClock, thaiDay } from './display'

export function History({ storeId, accountName, onExpired }: { storeId: string; accountName: (id: string) => string; onExpired: () => void }) {
  const [dates, setDates] = useState({ from: bangkokDate(), to: bangkokDate() })
  const [query, setQuery] = useState({ ...dates, attempt: 0 })
  const [rows, setRows] = useState<Sale[]>([]); const [cursor, setCursor] = useState<string | null>(null)
  const [receipt, setReceipt] = useState<Sale | null>(null); const [busy, setBusy] = useState(true); const [message, setMessage] = useState('กำลังอ่านประวัติ…')
  const alive = useRef(true); const lock = useRef(false)
  const selected = useRef<HTMLButtonElement | null>(null); const detailTitle = useRef<HTMLHeadingElement>(null)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => { if (receipt) detailTitle.current?.focus() }, [receipt])
  const failure = useCallback((error: unknown) => {
    if (error instanceof ApiFailure && error.status === 401) { onExpired(); return }
    setMessage('อ่านข้อมูลไม่สำเร็จ กรุณากดโหลดประวัติใหม่ หรือเลือกบิลอีกครั้ง')
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
  function search(range: typeof dates) {
    if (busy || lock.current) return
    if (!businessDateSchema.safeParse(range.from).success || !businessDateSchema.safeParse(range.to).success || range.from > range.to || (Date.parse(range.to) - Date.parse(range.from)) / 86400000 >= 366) { setMessage('เลือกช่วงวันที่ไม่เกิน 366 วัน และวันเริ่มต้องไม่เกินวันสิ้นสุด'); return }
    setDates(range); setReceipt(null); setBusy(true); setMessage('กำลังอ่านประวัติ…'); setRows([]); setCursor(null); setQuery({ ...range, attempt: query.attempt + 1 })
  }
  const today = bangkokDate(); const yesterday = dayBefore(today)
  return <section className="history" aria-labelledby="history-title" aria-busy={busy}>
    <header className="task-heading"><div><h3 id="history-title">ประวัติบิล</h3><p>เลือกวัน แล้วแตะบิลเพื่อดูรายละเอียด</p></div><button type="button" className="secondary-action" disabled={busy} onClick={() => search({ from: query.from, to: query.to })}>โหลดประวัติใหม่</button></header>
    <div className="history-tools">
      <div className="date-presets" role="group" aria-label="เลือกวันดูประวัติ"><button type="button" disabled={busy} aria-pressed={query.from === today && query.to === today} onClick={() => search({ from: today, to: today })}>วันนี้</button><button type="button" disabled={busy} aria-pressed={query.from === yesterday && query.to === yesterday} onClick={() => search({ from: yesterday, to: yesterday })}>เมื่อวาน</button></div>
      <details className="history-date-range"><summary>เลือกช่วงวันที่</summary><form className="history-filter" onSubmit={event => { event.preventDefault(); search(dates) }}>
        <label>ตั้งแต่วันที่<input type="date" value={dates.from} onChange={e => setDates({ ...dates, from: e.target.value })} required disabled={busy} /></label>
        <label>ถึงวันที่<input type="date" value={dates.to} onChange={e => setDates({ ...dates, to: e.target.value })} required disabled={busy} /></label><button disabled={busy}>ค้นหาบิล</button>
      </form></details>
    </div>
    <p className="history-range">ประวัติวันที่ {query.from === query.to ? thaiDay(query.from) : `${thaiDay(query.from)} ถึง ${thaiDay(query.to)}`}<span>โหลดแล้ว {rows.length} บิล{cursor ? ' · ยังมีบิลเพิ่มเติม' : ''}</span></p>
    <p className="task-status" role="status" aria-live="polite">{message}</p>
    <div className="history-layout" data-detail={!!receipt}>
      <div className="history-master">
        {busy && !rows.length && <div className="history-skeleton" aria-hidden="true"><div /><div /><div /></div>}
        {!busy && !rows.length && !message.startsWith('อ่านข้อมูล') && <div className="history-empty"><h4>ยังไม่มีบิลในวันที่เลือก</h4><p>ลองเลือกเมื่อวานหรือช่วงวันที่อื่น หากเพิ่งบันทึกบิล ให้กดโหลดประวัติใหม่</p></div>}
        <ul className="history-list">{rows.map((sale, index) => <li key={sale.id}>
          {query.from !== query.to && (index === 0 || rows[index - 1].businessDate !== sale.businessDate) && <p className="history-day">{thaiDay(sale.businessDate)}</p>}
          <button type="button" disabled={busy} aria-current={receipt?.id === sale.id ? 'true' : undefined} onClick={event => { selected.current = event.currentTarget; void open(sale.id) }}>
            <span className="history-row-main"><strong>{sale.reference}</strong><span>{thaiClock(sale.occurredAt)} น. · {sale.kind === 'RECONCILIATION' ? 'ส่วนต่างจากตรวจยอด' : sale.kind === 'SUPPLEMENTAL' ? 'เพิ่มยอดตกหล่น' : 'ขายหน้าร้าน'}</span></span>
            <span className="history-row-amount"><strong>{baht(sale.net)} <small>บาท</small></strong><span>ดูบิล</span></span>
          </button>
        </li>)}</ul>
        {cursor && <button type="button" className="secondary-action history-more" disabled={busy} onClick={() => void more()}>{busy ? 'กำลังอ่าน…' : 'อ่านบิลเพิ่มเติม'}</button>}
      </div>
      <section className="history-detail" aria-label="รายละเอียดบิล">
        {receipt ? <><button type="button" className="secondary-action history-back" onClick={() => { setReceipt(null); requestAnimationFrame(() => selected.current?.focus()) }}>กลับรายการบิล</button><h4 tabIndex={-1} ref={detailTitle}>รายละเอียดบิล</h4><Receipt sale={receipt} accountName={accountName} /></> : <div className="history-detail-empty"><h4>รายละเอียดบิล</h4><p>แตะบิลจากรายการเพื่อดูสินค้า ช่องทางรับเงิน และเลขอ้างอิง</p></div>}
      </section>
    </div>
  </section>
}
