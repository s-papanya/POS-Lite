import { useEffect, useRef, useState } from 'react'
import type { MeResponse, Sale } from '@pos-lite/shared'
import { meResponseSchema, reconciliationPreviewResponseSchema, reconciliationRequestSchema, reconciliationResponseSchema, saleResponseSchema } from '@pos-lite/validation'
import { ApiFailure, csrfToken, request } from '../api'
import { baht, bangkokDate } from './state'
import type { ReceivingAccount, Scope } from './state'
import { dailyKey, dailyRollback, emptyDaily, hasDaily, prepareAdditional, prepareTargets } from './daily-state'
import type { DailyDraft, DailyPending, DailyPreview, loadDaily } from './daily-state'
import type { WorkState } from './PosWorkspace'
import { Receipt } from './Receipt'

type Result = { mode: 'additional'; sale: Sale } | { mode: 'reconcile'; id: string; createdSales: Sale[] }
export function DailyWorkspace({ me, scope, storeName, accounts, initial, blocked, loading, allowed, closed, online, today, onExpired, onWorkChange, onHistory, onReload }: {
  me: MeResponse['data']; scope: Scope; storeName: string; accounts: ReceivingAccount[]; initial: ReturnType<typeof loadDaily>; blocked: boolean; loading: boolean; allowed: boolean; closed: boolean; online: boolean; today: string;
  onExpired: () => void; onWorkChange: (work: WorkState) => void; onHistory: () => void; onReload: () => void
}) {
  const [draft, setDraft] = useState(initial.draft); const [pending, setPending] = useState<DailyPending | null>(initial.pending)
  const [preview, setPreview] = useState<DailyPreview | null>(initial.pending?.mode === 'reconcile' ? initial.pending.preview : null)
  const [additional, setAdditional] = useState<ReturnType<typeof prepareAdditional> | null>(null)
  const [step, setStep] = useState<'edit' | 'review'>(initial.pending ? 'review' : 'edit')
  const [busy, setBusy] = useState(false); const [result, setResult] = useState<Result | null>(null)
  const [message, setMessage] = useState(initial.corrupt ? 'อ่านรายการยอดขายค้างไม่ได้ กรุณาตรวจประวัติและให้เจ้าของช่วยกู้ก่อนทำรายการใหม่' : initial.pending ? 'มีรายการรอยืนยัน ตรวจผลด้วยข้อมูลเดิมเท่านั้น ไม่มีการส่งอัตโนมัติ' : hasDaily(initial.draft) ? 'คืนรายการที่ยังไม่ส่งแล้ว กรุณาตรวจร้านและยอดก่อนทำต่อ' : '')
  const sending = useRef(false); const alive = useRef(true); const notice = useRef<HTMLParagraphElement>(null)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => { onWorkChange({ draft: hasDaily(draft), pending: !!pending || initial.corrupt || busy }) }, [draft, pending, initial.corrupt, busy, onWorkChange])
  const accountName = (id: string) => accounts.find(a => a.id === id)?.name ?? `บัญชี ${id}`
  const locked = !!pending || busy || blocked || initial.corrupt || !allowed
  const oldDate = draft.date !== today
  function persist(next: DailyDraft, transaction: DailyPending | null) {
    try {
      if (!hasDaily(next) && !transaction) sessionStorage.removeItem(dailyKey(scope))
      else sessionStorage.setItem(dailyKey(scope), JSON.stringify({ draft: next, pending: transaction }))
      return true
    } catch { setMessage('เก็บรายการค้างในอุปกรณ์ไม่ได้ จึงยังไม่ส่ง กรุณาตรวจการตั้งค่าเบราว์เซอร์'); return false }
  }
  function edit(next: DailyDraft) {
    if (locked) return
    if (!hasDaily(draft)) next = { ...next, date: bangkokDate() }
    if (!persist(next, null)) return
    setDraft(next); setPreview(null); setAdditional(null); setResult(null)
  }
  function failure(error: unknown, transaction: DailyPending | null = null) {
    if (!alive.current) return
    if (error instanceof ApiFailure && (error.status === 401 || error.code === 'SESSION_CONTEXT_CHANGED')) { onExpired(); return }
    if (transaction && error instanceof ApiFailure && dailyRollback.has(error.code)) {
      if (persist(draft, null)) { setPending(null); setPreview(null); setAdditional(null); setStep('edit') }
      setMessage(error.code === 'STALE_PREVIEW' ? 'มีรายการใหม่หลังตรวจยอด กรุณาดูส่วนต่างใหม่และยืนยันอีกครั้ง' : error.code === 'RECONCILIATION_REQUIRES_REVIEW' ? 'ยอดสุทธิทั้งวันต่ำกว่าที่บันทึก กรุณาตรวจประวัติกับเจ้าของ ไม่มีการลดยอด' : error.code === 'DAY_CLOSED' ? 'วันนี้ปิดแล้ว กรุณาดูประวัติและติดต่อเจ้าของร้าน' : 'รายการถูกปฏิเสธ กรุณาตรวจวัน ยอด บัญชี และเงินสดก่อนทำใหม่')
    } else setMessage(transaction ? `ยังไม่ทราบผล ห้ามทำรายการซ้ำ กรุณาตรวจผลรายการเดิม${error instanceof ApiFailure && error.requestId ? ` · อ้างอิง ${error.requestId}` : ''}` : error instanceof ApiFailure ? 'อ่านข้อมูลไม่สำเร็จ กรุณาตรวจบัญชี สิทธิ์ และการเชื่อมต่อแล้วลองใหม่' : error instanceof Error ? error.message : 'กรุณาตรวจรายการอีกครั้ง')
    notice.current?.focus()
  }
  async function review() {
    if (sending.current || locked || !online || closed || oldDate) return
    sending.current = true; setBusy(true); setMessage('กำลังตรวจข้อมูล…')
    try {
      if (!draft.reason.trim()) throw new Error('กรุณาระบุเหตุผลก่อนตรวจรายการ')
      if (draft.mode === 'additional') setAdditional(prepareAdditional(draft, accounts))
      else {
        const result = await request(`/stores/${scope.storeId}/sales-reconciliations/preview`, reconciliationPreviewResponseSchema, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': await csrfToken(), 'X-Expected-User-Id': scope.userId, 'X-Expected-Business-Id': scope.businessId }, body: JSON.stringify(prepareTargets(draft, accounts)) })
        if (!alive.current) return
        setPreview(result.data)
      }
      setStep('review'); setMessage('ตรวจร้าน บัญชี เหตุผล และยอดก่อนยืนยัน ยังไม่ได้บันทึก')
    } catch (error) { failure(error) }
    finally { sending.current = false; if (alive.current) setBusy(false) }
  }
  async function submit() {
    if (sending.current || !allowed || initial.corrupt || !online || (blocked && !pending) || (!pending && (closed || oldDate))) return
    sending.current = true; setBusy(true); setMessage('กำลังตรวจบัญชีและยืนยันรายการ…')
    let transaction = pending
    try {
      const current = (await request('/me', meResponseSchema)).data
      if (current.user.id !== me.user.id || current.business.id !== me.business.id || !current.stores.some(s => s.id === scope.storeId)) throw new ApiFailure(403, 'SESSION_CONTEXT_CHANGED')
      if (!transaction) {
        const base = { scope: dailyKey(scope), key: crypto.randomUUID() }
        if (draft.mode === 'additional') {
          if (!additional) throw new Error('กรุณาตรวจรายการใหม่')
          transaction = { ...base, mode: 'additional', request: additional }
        } else {
          if (!preview || preview.lines.some(l => l.requiresReview)) throw new Error('กรุณาตรวจส่วนต่างใหม่ก่อนยืนยัน')
          transaction = { ...base, mode: 'reconcile', preview, request: reconciliationRequestSchema.parse({ ...prepareTargets(draft, accounts), occurredAt: new Date().toISOString(), expectedRevision: preview.revision, reason: draft.reason }) }
        }
        if (!persist(draft, transaction)) return
        setPending(transaction)
      }
      const options = { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': await csrfToken(), 'Idempotency-Key': transaction.key, 'X-Expected-User-Id': scope.userId, 'X-Expected-Business-Id': scope.businessId }, body: JSON.stringify(transaction.request) }
      const result: Result = transaction.mode === 'additional' ? { mode: 'additional', sale: (await request(`/stores/${scope.storeId}/supplemental-sales`, saleResponseSchema, options)).data }
        : { mode: 'reconcile', ...(await request(`/stores/${scope.storeId}/sales-reconciliations`, reconciliationResponseSchema, options)).data }
      const empty = emptyDaily()
      if (!persist(empty, null)) return
      if (alive.current) { setDraft(empty); setPending(null); setPreview(null); setAdditional(null); setResult(result); setMessage('ยืนยันผลจากระบบแล้ว') }
    } catch (error) { failure(error, transaction) }
    finally { sending.current = false; if (alive.current) setBusy(false) }
  }
  const reviewed = pending?.mode === 'additional' ? pending.request : additional
  return <section className="daily" aria-labelledby="daily-title"><h3 id="daily-title">ยอดขายเพิ่มเติมและตรวจยอด</h3>
    {!allowed && <p className="notice">งานนี้สำหรับเจ้าของหรือผู้จัดการ กรุณาติดต่อเจ้าของเพื่อตรวจรายการค้าง</p>}
    {loading ? <p role="status">กำลังอ่านบัญชีรับเงิน…</p> : !accounts.length && <div className="notice"><p>ยังไม่มีบัญชีรับเงินที่อ่านได้ กรุณาให้เจ้าของตั้งค่า หรือตรวจการเชื่อมต่อแล้วโหลดบัญชีใหม่</p><button type="button" disabled={busy || !online} onClick={onReload}>โหลดบัญชีใหม่</button></div>}
    <p role="status" aria-live="polite" tabIndex={-1} ref={notice}>{message}</p>
    {result ? <><h4>{result.mode === 'additional' ? 'บันทึกยอดเพิ่มเติมแล้ว' : result.createdSales.length ? 'บันทึกส่วนต่างแล้ว' : 'ยอดตรงกันแล้ว ไม่เพิ่มยอดขายหรือเงิน'}</h4>
      {result.mode === 'additional' ? <Receipt sale={result.sale} accountName={accountName} /> : <><p className="record-reference">เลขผลตรวจ {result.id}</p><ul>{result.createdSales.map(s => <li key={s.id}>{s.reference} · เพิ่ม {baht(s.net)} บาท</li>)}</ul></>}
      <div className="actions"><button type="button" onClick={() => { setResult(null); setStep('edit'); setMessage('') }}>ทำรายการใหม่</button><button type="button" className="secondary-action" onClick={onHistory}>ดูประวัติบิล</button></div></>
      : <>{step === 'edit' ? <form onSubmit={event => { event.preventDefault(); void review() }}>
        <div className="daily-modes"><button type="button" disabled={locked} aria-pressed={draft.mode === 'additional'} onClick={() => edit({ ...draft, mode: 'additional' })}>เพิ่มยอดที่ยังไม่ได้บันทึก</button><button type="button" disabled={locked} aria-pressed={draft.mode === 'reconcile'} onClick={() => edit({ ...draft, mode: 'reconcile' })}>ตรวจยอดขายรวมทั้งวัน</button></div>
        <p>{draft.mode === 'additional' ? 'กรอกเฉพาะเงินจากยอดขายที่ยังไม่เคยลงบิล ไม่ใช่ยอดขายรวมทั้งวัน' : 'กรอกยอดขายสุทธิทั้งวันหลังคืนเงินต่อบัญชี รวมยอดที่บันทึกไว้แล้ว ไม่ใช่ยอดเงินคงเหลือในบัญชี บัญชีที่ไม่ระบุจะไม่เปลี่ยน'}</p>
        {oldDate && <div className="notice"><p>รายการนี้เป็นของวันที่ {draft.date} กรุณาตรวจประวัติก่อนเริ่มวันนี้</p><button type="button" disabled={locked} onClick={() => { const empty = emptyDaily(); if (persist(empty, null)) { setDraft(empty); setMessage('เริ่มรายการวันนี้แล้ว') } }}>ทิ้งรายการเก่าและเริ่มวันนี้</button></div>}
        <fieldset disabled={locked || oldDate || closed}><label>เหตุผล<textarea value={draft.reason} required maxLength={1000} onChange={e => edit({ ...draft, reason: e.target.value })} /></label>
          {draft.mode === 'additional' ? <><label>ยอดที่ยังไม่ได้บันทึก (บาท)<input inputMode="decimal" required value={draft.amount} maxLength={40} onChange={e => edit({ ...draft, amount: e.target.value })} /></label>
            {draft.payments.map((p, i) => <fieldset key={i}><legend>ช่องทางเพิ่มเติมที่ {i + 1}</legend><label>บัญชีรับเงินเพิ่มเติม<select required value={p.accountId} onChange={e => edit({ ...draft, payments: draft.payments.map((p, n) => n === i ? { ...p, accountId: e.target.value, tendered: '' } : p) })}><option value="">เลือกบัญชีรับเงิน</option>{accounts.map(a => <option key={a.id} value={a.id} disabled={draft.payments.some((other, n) => n !== i && other.accountId === a.id)}>{a.name} · {a.type === 'CASH' ? 'เงินสด' : 'โอนเงิน'}</option>)}</select></label>
              <label>ยอดรับสุทธิช่องทางนี้ (บาท)<input required inputMode="decimal" value={p.amount} maxLength={40} onChange={e => edit({ ...draft, payments: draft.payments.map((p, n) => n === i ? { ...p, amount: e.target.value } : p) })} /></label>
              {accounts.find(a => a.id === p.accountId)?.type === 'CASH' && <><label>เงินสดที่รับมาเพิ่มเติม (บาท)<input required inputMode="decimal" value={p.tendered} maxLength={40} onChange={e => edit({ ...draft, payments: draft.payments.map((p, n) => n === i ? { ...p, tendered: e.target.value } : p) })} /></label><button type="button" className="secondary-action" onClick={() => edit({ ...draft, payments: draft.payments.map((p, n) => n === i ? { ...p, tendered: p.amount } : p) })}>รับพอดีตามยอดช่องทางนี้</button><p>เงินทอนจะแสดงตอนตรวจรายการ</p></>}
              {draft.payments.length > 1 && <button type="button" className="secondary-action" onClick={() => edit({ ...draft, payments: draft.payments.filter((_, n) => n !== i) })}>ลบช่องทางเพิ่มเติมนี้</button>}</fieldset>)}
            <button type="button" className="secondary-action" disabled={draft.payments.length >= accounts.length || draft.payments.length >= 100} onClick={() => edit({ ...draft, payments: [...draft.payments, { accountId: '', amount: '', tendered: '' }] })}>แบ่งรับเงินอีกช่องทาง</button></>
            : <>{draft.targets.map((t, i) => <fieldset key={i}><legend>ยอดทั้งวันบัญชีที่ {i + 1}</legend><label>บัญชีที่จะตรวจยอด<select value={t.accountId} required onChange={e => edit({ ...draft, targets: draft.targets.map((t, n) => n === i ? { ...t, accountId: e.target.value } : t) })}><option value="">เลือกบัญชีที่จะตรวจ</option>{accounts.map(a => <option key={a.id} value={a.id} disabled={draft.targets.some((other, n) => n !== i && other.accountId === a.id)}>{a.name}</option>)}</select></label><label>ยอดขายสุทธิทั้งวัน (บาท)<input required inputMode="text" value={t.amount} maxLength={40} placeholder="ระบุ 0 หากยอดเป็นศูนย์" onChange={e => edit({ ...draft, targets: draft.targets.map((t, n) => n === i ? { ...t, amount: e.target.value } : t) })} /></label>{draft.targets.length > 1 && <button type="button" className="secondary-action" onClick={() => edit({ ...draft, targets: draft.targets.filter((_, n) => n !== i) })}>ไม่ตรวจบัญชีนี้</button>}</fieldset>)}<button type="button" className="secondary-action" disabled={draft.targets.length >= accounts.length || draft.targets.length >= 100} onClick={() => edit({ ...draft, targets: [...draft.targets, { accountId: '', amount: '' }] })}>ตรวจอีกบัญชี</button></>}
        </fieldset><button disabled={locked || !online || closed || oldDate || !accounts.length}>{busy ? 'กำลังตรวจ…' : draft.mode === 'additional' ? 'ตรวจยอดเพิ่มเติมก่อนบันทึก' : 'ดูส่วนต่างก่อนยืนยัน'}</button>
      </form> : <section className="review" aria-label="ตรวจรายการยอดขาย"><h4>{pending?.mode === 'additional' || (!pending && draft.mode === 'additional') ? 'ตรวจยอดที่ยังไม่ได้บันทึก' : 'ตรวจยอดขายสุทธิรวมทั้งวัน'}</h4>
        <p>ร้าน {storeName} · วันที่ {pending?.request.businessDate ?? draft.date} · เหตุผล {pending?.request.reason ?? draft.reason}</p>
        {reviewed && <><p className="daily-total">เพิ่มยอดขาย {baht(reviewed.amount)} บาท</p>{reviewed.payments.map(p => <div className="payment-summary" key={p.accountId}><strong>{accountName(p.accountId)} · {p.channel === 'CASH' ? 'เงินสด' : 'โอนเงิน'}</strong><p>รับสุทธิ {baht(p.amount)} บาท</p>{p.channel === 'CASH' && <p>รับมา {baht(p.tendered)} · เงินทอน {baht(BigInt(p.tendered) - BigInt(p.amount))} บาท</p>}</div>)}</>}
        {preview && <><ul className="daily-comparison">{preview.lines.map(l => <li key={l.accountId}><h4>{accountName(l.accountId)}</h4><dl className="money-summary"><div><dt>บันทึกแล้ว</dt><dd>{baht(l.recorded)} บาท</dd></div><div><dt>ยอดสุทธิทั้งวัน</dt><dd>{baht(l.target)} บาท</dd></div><div><dt>{l.requiresReview ? 'ส่วนต่างที่ต้องตรวจ' : 'ส่วนต่างที่จะเพิ่ม'}</dt><dd>{baht(l.delta)} บาท</dd></div></dl></li>)}</ul><p>ยอดสุทธิตามยอดที่กรอก {baht(preview.netSales)} บาท</p>{preview.lines.some(l => l.requiresReview) ? <p className="notice">ยอดจริงต่ำกว่าที่บันทึก กรุณาตรวจบิลกับเจ้าของ ไม่มีการลดยอดให้อัตโนมัติ</p> : preview.lines.every(l => l.delta === '0') && <p className="notice">ยอดตรงกันแล้ว จะเก็บผลตรวจโดยไม่เพิ่มยอดขายหรือเงิน</p>}</>}
        <div className="actions"><button type="button" className="secondary-action" disabled={locked} onClick={() => { setStep('edit'); setPreview(null); setAdditional(null); setMessage('แก้ข้อมูลแล้วต้องตรวจใหม่ก่อนยืนยัน') }}>กลับแก้รายการ</button><button type="button" disabled={busy || initial.corrupt || !allowed || !online || (!pending && (blocked || oldDate || closed || !!preview?.lines.some(l => l.requiresReview)))} onClick={() => void submit()}>{busy ? 'กำลังยืนยัน…' : pending ? 'ตรวจผลรายการเดิม' : draft.mode === 'additional' ? 'ยืนยันเพิ่มยอดที่ยังไม่ได้บันทึก' : 'ยืนยันผลตรวจยอดทั้งวัน'}</button></div><button type="button" className="secondary-action" onClick={onHistory}>ตรวจประวัติบิล</button>
      </section>}</>}
    {!pending && hasDaily(draft) && !result && <button type="button" className="secondary-action" disabled={locked} onClick={() => { if (window.confirm('ทิ้งข้อมูลเพิ่มเติมและยอดทั้งวันที่ยังไม่ส่งของร้านนี้?')) { const empty = emptyDaily(); if (persist(empty, null)) { setDraft(empty); setPreview(null); setAdditional(null); setStep('edit'); setMessage('ทิ้งรายการที่ยังไม่ส่งแล้ว') } } }}>ทิ้งรายการยอดขายที่ยังไม่ส่ง</button>}
  </section>
}
