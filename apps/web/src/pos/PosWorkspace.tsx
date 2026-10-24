import { useCallback, useEffect, useRef, useState } from 'react'
import type { AccessibleStore, MeResponse, Product, Sale } from '@pos-lite/shared'
import { accountListResponseSchema, businessDayResponseSchema, meResponseSchema, productListResponseSchema, productSchema, saleRequestSchema, saleResponseSchema } from '@pos-lite/validation'
import { allPages, ApiFailure, csrfToken, request } from '../api'
import { baht, bangkokDate, definitiveRejection, emptyDraft, hasDraft, inputBaht, loadWorkspace, satang, saveWorkspace, scopeKey, totals } from './state'
import type { Draft, Pending } from './state'
import { History } from './History'
import { Receipt } from './Receipt'

export type WorkState = { draft: boolean; pending: boolean }
type Account = { id: string; name: string; type: 'CASH' | 'BANK' }
const errorCopy: Record<string, string> = { DAY_CLOSED: 'วันนี้ปิดแล้ว กรุณาดูประวัติหรือติดต่อเจ้าของร้าน', PREVIOUS_DAY_UNSETTLED: 'วันก่อนยังไม่ปิดและเคลียร์เงิน กรุณาติดต่อเจ้าของร้าน',
  INITIAL_BALANCES_REQUIRED: 'ยังตั้งค่าบัญชีและยอดตั้งต้นไม่ครบ กรุณาให้เจ้าของร้านจัดเตรียมก่อนขาย', INVALID_SALE_TOTALS: 'ยอดชำระยังไม่ตรงกับยอดบิล กรุณาตรวจอีกครั้ง',
  INSUFFICIENT_TENDERED: 'เงินสดที่รับมายังไม่พอ', ACCOUNT_INACTIVE: 'บัญชีนี้ใช้งานไม่ได้แล้ว กรุณาเลือกบัญชีใหม่', PRODUCT_INACTIVE: 'มีเมนูที่ปิดขายแล้ว กรุณาตรวจรายการ',
  INVALID_OCCURRED_AT: 'เวลารายการไม่ตรงกับวันทำการหรืออยู่ในอนาคต กรุณาตรวจเวลาเครื่อง', INVALID_BUSINESS_DATE: 'วันที่รายการไม่ใช่วันนี้ กรุณาตรวจประวัติแล้วเริ่มบิลของวันนี้' }

export function PosWorkspace({ me, store, onExpired, onWorkChange }: { me: MeResponse['data']; store: AccessibleStore; onExpired: () => void; onWorkChange: (work: WorkState) => void }) {
  const scope = { userId: me.user.id, businessId: me.business.id, storeId: store.id }
  const [seed] = useState(() => { try { return loadWorkspace(sessionStorage, scope) } catch { return { draft: emptyDraft(), pending: null, corrupt: true } } })
  const [draft, setDraft] = useState(seed.draft); const [pending, setPending] = useState<Pending | null>(seed.pending)
  const [products, setProducts] = useState<Product[]>([]); const [accounts, setAccounts] = useState<Account[]>([])
  const [tab, setTab] = useState<'sale' | 'history'>('sale'); const [step, setStep] = useState<'items' | 'pay' | 'review'>(seed.pending ? 'review' : 'items')
  const [receipt, setReceipt] = useState<Sale | null>(null); const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState(seed.corrupt ? 'ข้อมูลบิลค้างอ่านไม่ได้ กรุณาตรวจประวัติและให้เจ้าของช่วยกู้รายการก่อนขายต่อ' : seed.pending ? 'มีบิลรอยืนยัน กรุณาตรวจผลด้วยรายการเดิม' : hasDraft(seed.draft) ? 'นำรายการที่ยังไม่ส่งกลับมาแล้ว กรุณาตรวจร้านและยอดอีกครั้ง' : '')
  const [attempt, setAttempt] = useState(0); const [search, setSearch] = useState(''); const [closed, setClosed] = useState(false)
  const [online, setOnline] = useState(navigator.onLine); const [today, setToday] = useState(bangkokDate())
  const [changed, setChanged] = useState<Product | null>(null)
  const sending = useRef(false); const alive = useRef(true); const errorRef = useRef<HTMLParagraphElement>(null)
  const expired = useCallback(() => onExpired(), [onExpired])
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => {
    const connected = () => setOnline(navigator.onLine)
    window.addEventListener('online', connected); window.addEventListener('offline', connected)
    const timer = window.setInterval(() => setToday(bangkokDate()), 30000)
    return () => { window.removeEventListener('online', connected); window.removeEventListener('offline', connected); window.clearInterval(timer) }
  }, [])
  useEffect(() => { onWorkChange({ draft: hasDraft(draft), pending: !!pending || seed.corrupt || busy }) }, [draft, pending, seed.corrupt, busy, onWorkChange])
  useEffect(() => {
    let active = true
    Promise.all([allPages(`/stores/${store.id}/products?limit=100`, productListResponseSchema), allPages(`/stores/${store.id}/accounts?limit=100`, accountListResponseSchema),
      request(`/stores/${store.id}/business-days/${bangkokDate()}`, businessDayResponseSchema).catch(error => { if (error instanceof ApiFailure && error.status === 404) return null; throw error })])
      .then(([menu, financial, day]) => { if (active) { setProducts(menu); setAccounts(financial); setClosed(day?.data.state === 'CLOSED') } })
      .catch(error => { if (active) { if (error instanceof ApiFailure && error.status === 401) expired(); else setMessage('อ่านเมนูหรือบัญชีไม่ได้ กรุณาตรวจการเชื่อมต่อแล้วกดโหลดใหม่') } })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [store.id, attempt, expired])
  function persist(next: Draft, transaction: Pending | null) {
    try { saveWorkspace(sessionStorage, scope, next, transaction); return true }
    catch { setMessage('เก็บรายการค้างในอุปกรณ์ไม่ได้ จึงยังไม่ส่งบิล กรุณาตรวจการตั้งค่าเบราว์เซอร์'); return false }
  }
  function edit(next: Draft) {
    if (pending || seed.corrupt || busy) return
    if (!hasDraft(draft)) next = { ...next, date: bangkokDate() }
    persist(next, null); setDraft(next); setReceipt(null)
  }
  function quantity(product: Product, delta: number) {
    const found = draft.items.find(i => i.product.id === product.id)
    if (!found && draft.items.length >= 100) { setMessage('หนึ่งบิลมีได้ไม่เกิน 100 เมนู'); return }
    const count = Math.max(0, Math.min(999, (found?.quantity ?? 0) + delta))
    edit({ ...draft, items: found ? draft.items.flatMap(i => i.product.id === product.id ? count ? [{ ...i, quantity: count }] : [] : [i]) : [...draft.items, { product, quantity: count }] })
  }
  function payment(index: number, values: Partial<Draft['payments'][number]>) { edit({ ...draft, payments: draft.payments.map((p, i) => i === index ? { ...p, ...values } : p) }) }
  let money = { gross: 0n, discount: 0n, net: 0n }; let moneyError = ''
  try { money = totals(draft) } catch (error) { moneyError = (error as Error).message }
  const accountName = (id: string) => accounts.find(a => a.id === id)?.name ?? `บัญชี ${id}`
  function prepare() {
    if (moneyError) throw new Error(moneyError)
    if (!draft.items.length || money.net <= 0n) throw new Error('กรุณาเลือกสินค้า และตรวจให้ยอดหลังส่วนลดมากกว่าศูนย์')
    const payments = draft.payments.map(p => {
      const account = accounts.find(a => a.id === p.accountId); const amount = satang(p.amount)
      if (!account || amount === null || amount <= 0n) throw new Error('เลือกบัญชีและจำนวนเงินให้ครบทุกช่องทาง')
      if (account.type === 'BANK') return { accountId: account.id, channel: 'TRANSFER' as const, amount: String(amount) }
      const tendered = satang(p.tendered)
      if (tendered === null || tendered < amount) throw new Error('กรอกเงินสดที่รับมาให้ไม่น้อยกว่ายอดเงินสด')
      return { accountId: account.id, channel: 'CASH' as const, amount: String(amount), tendered: String(tendered) }
    })
    if (payments.reduce((sum, p) => sum + BigInt(p.amount), 0n) !== money.net) throw new Error('ยอดชำระทุกช่องทางต้องรวมเท่ากับยอดบิล')
    const parsed = saleRequestSchema.safeParse({ businessDate: draft.date, occurredAt: new Date().toISOString(),
      items: draft.items.map(i => ({ productId: i.product.id, expectedVersion: i.product.version, quantity: i.quantity })),
      discount: draft.discountKind === 'FIXED' ? { kind: 'FIXED', amount: String(satang(draft.discount)!) } : { kind: 'PERCENT', basisPoints: Number(satang(draft.discount)!) }, payments })
    if (!parsed.success) throw new Error('ข้อมูลบิลไม่ถูกต้อง กรุณาตรวจเมนู จำนวน และบัญชีที่เลือกซ้ำ')
    return parsed.data
  }
  async function submit() {
    if (sending.current || !online || seed.corrupt) return
    sending.current = true; setBusy(true); setMessage('กำลังตรวจบัญชีและบันทึกบิล…')
    let transaction = pending
    try {
      const current = (await request('/me', meResponseSchema)).data
      if (current.user.id !== scope.userId || current.business.id !== scope.businessId || !current.stores.some(s => s.id === scope.storeId)) throw new ApiFailure(403, 'SESSION_CONTEXT_CHANGED')
      if (!transaction) {
        transaction = { scope: scopeKey(scope), key: crypto.randomUUID(), request: prepare() }
        if (!persist(draft, transaction)) return
        setPending(transaction)
      }
      const result = await request(`/stores/${store.id}/sales`, saleResponseSchema, { method: 'POST', headers: { 'Content-Type': 'application/json',
        'X-CSRF-Token': await csrfToken(), 'Idempotency-Key': transaction.key, 'X-Expected-User-Id': scope.userId, 'X-Expected-Business-Id': scope.businessId }, body: JSON.stringify(transaction.request) })
      const empty = emptyDraft(); persist(empty, null)
      if (alive.current) { setPending(null); setDraft(empty); setReceipt(result.data); setMessage(`บันทึกขายแล้ว เลขบิล ${result.data.reference}`) }
    } catch (error) {
      if (!alive.current) return
      if (error instanceof ApiFailure && (error.status === 401 || error.code === 'SESSION_CONTEXT_CHANGED')) { expired(); return }
      if (error instanceof ApiFailure && definitiveRejection.has(error.code)) {
        persist(draft, null); setPending(null)
        if (error.code === 'PRICE_CHANGED') {
          const parsed = productSchema.safeParse(error.details?.current)
          if (parsed.success) setChanged(parsed.data)
          setMessage('ราคาเปลี่ยนแล้ว กรุณาตรวจราคาใหม่และการชำระก่อนยืนยันอีกครั้ง')
        } else { setStep('pay'); setMessage(errorCopy[error.code] ?? 'รายการถูกปฏิเสธ กรุณาตรวจข้อมูลก่อนยืนยันใหม่'); if (error.code === 'DAY_CLOSED') setClosed(true) }
      } else if (transaction) setMessage(`ยังไม่ทราบผลการบันทึก ห้ามเริ่มบิลซ้ำ กรุณาตรวจผลบิลเดิม${error instanceof ApiFailure && error.requestId ? ` · อ้างอิง ${error.requestId}` : ''}`)
      else setMessage(error instanceof Error && !(error instanceof ApiFailure) ? error.message : 'ยังตรวจสอบบัญชีไม่ได้ กรุณาลองอีกครั้ง')
      errorRef.current?.focus()
    } finally { sending.current = false; if (alive.current) setBusy(false) }
  }
  const locked = !!pending || seed.corrupt || busy
  const oldDate = draft.date !== today
  const paid = draft.payments.reduce((sum, p) => sum + (satang(p.amount) ?? 0n), 0n)
  const reviewedPayments = pending?.request.payments ?? draft.payments.map(p => ({ accountId: p.accountId, channel: accounts.find(a => a.id === p.accountId)?.type === 'CASH' ? 'CASH' as const : 'TRANSFER' as const,
    amount: String(satang(p.amount) ?? 0n), tendered: String(satang(p.tendered) ?? 0n) }))
  return <section className="pos" aria-labelledby="store-title">
    <header className="pos-heading"><h1 id="store-title">{store.name}</h1><p>วันทำการ {pending?.request.businessDate ?? draft.date}</p></header>
    <nav className="pos-tabs" aria-label="งานหน้าร้าน"><button type="button" aria-current={tab === 'sale' ? 'page' : undefined} onClick={() => setTab('sale')}>ขายสินค้า{pending ? ' · รอยืนยัน' : ''}</button><button type="button" aria-current={tab === 'history' ? 'page' : undefined} onClick={() => setTab('history')}>ประวัติบิล</button></nav>
    {!online && <p className="notice">ยังไม่ได้เชื่อมต่อ รายการยังอยู่ในอุปกรณ์ จะไม่ส่งบิลอัตโนมัติ</p>}
    {closed && <p className="notice">วันทำการนี้ปิดแล้ว ดูประวัติบิลได้ หรือติดต่อเจ้าของร้าน</p>}
    <p className="pos-message" role="status" aria-live="polite" tabIndex={-1} ref={errorRef}>{message}</p>
    {tab === 'history' ? <History storeId={store.id} accountName={accountName} onExpired={expired} /> : receipt ? <>
      <h3 className="success-title">บันทึกขายแล้ว</h3><Receipt sale={receipt} accountName={accountName} /><button type="button" onClick={() => { setReceipt(null); setStep('items'); setMessage('') }}>ขายบิลใหม่</button>
    </> : <>
      {loading && <p role="status">กำลังอ่านเมนูและบัญชี…</p>}
      {!loading && (!products.length || !accounts.length) && <p className="notice">ยังไม่มีเมนูหรือบัญชีรับเงิน กรุณาให้เจ้าของร้านตั้งค่าก่อนขาย</p>}
      {oldDate && !pending && hasDraft(draft) && <div className="notice"><p>รายการค้างเป็นของวันที่ {draft.date} ไม่ใช่วันนี้ กรุณาตรวจประวัติก่อนเริ่มใหม่</p><button type="button" onClick={() => { const empty = emptyDraft(); persist(empty, null); setDraft(empty); setStep('items'); setMessage('') }}>ทิ้งรายการเก่าและเริ่มบิลวันนี้</button></div>}
      {changed && <div className="notice"><p>{changed.name}: ราคาเดิม {baht(draft.items.find(i => i.product.id === changed.id)?.product.price ?? '0')} → ราคาใหม่ {baht(changed.price)} บาท</p>
        <button type="button" onClick={() => { edit({ ...draft, items: draft.items.map(i => i.product.id === changed.id ? { ...i, product: changed } : i) }); setProducts(previous => previous.map(p => p.id === changed.id ? changed : p)); setChanged(null); setStep('pay'); setMessage('ใช้ราคาใหม่แล้ว กรุณาตรวจยอดและช่องทางชำระอีกครั้ง') }}>ใช้ราคาใหม่แล้วตรวจยอดอีกครั้ง</button></div>}
      {step === 'items' && <div className="selling-layout"><section aria-labelledby="menu-title"><h3 id="menu-title">เลือกเมนู</h3><label htmlFor="menu-search">ค้นหาเมนู</label><input id="menu-search" value={search} onChange={e => setSearch(e.target.value)} type="search" />
        <div className="product-grid">{products.filter(p => p.name.includes(search.trim())).map(p => <button type="button" key={p.id} disabled={locked || closed} onClick={() => quantity(p, 1)}><strong>{p.name}</strong><span>{baht(p.price)} บาท</span></button>)}</div>
        {!!products.length && !products.some(p => p.name.includes(search.trim())) && <p>ไม่พบเมนูที่ค้นหา</p>}<button type="button" className="secondary-action reload" disabled={loading || busy || !online} onClick={() => { setLoading(true); setAttempt(n => n + 1) }}>โหลดเมนูและบัญชีใหม่</button></section>
        <section aria-labelledby="basket-title"><h3 id="basket-title">รายการในบิล</h3>{!draft.items.length && <p className="empty">แตะเมนูเพื่อเพิ่มลงบิล</p>}
          <ul className="basket">{draft.items.map(i => <li key={i.product.id}><div><strong>{i.product.name}</strong><span>{baht(i.product.price)} บาท / ชิ้น</span></div><div className="quantity"><button type="button" aria-label={`ลดจำนวน ${i.product.name}`} disabled={locked} onClick={() => quantity(i.product, -1)}>ลด</button><output aria-label={`จำนวน ${i.product.name}`}>{i.quantity}</output><button type="button" aria-label={`เพิ่มจำนวน ${i.product.name}`} disabled={locked || i.quantity >= 999} onClick={() => quantity(i.product, 1)}>เพิ่ม</button></div></li>)}</ul>
        </section></div>}
      {step === 'pay' && <form onSubmit={event => { event.preventDefault(); try { prepare(); setStep('review'); setMessage('กรุณาตรวจร้าน ยอดชำระ และเงินทอนก่อนบันทึก') } catch (error) { setMessage(error instanceof Error ? error.message : 'ตรวจข้อมูลอีกครั้ง'); errorRef.current?.focus() } }}>
        <h3>ชำระเงิน</h3><div className="discount-fields"><label>รูปแบบส่วนลด<select value={draft.discountKind} disabled={locked} onChange={e => edit({ ...draft, discountKind: e.target.value as Draft['discountKind'], discount: '0' })}><option value="FIXED">ลดเป็นบาท</option><option value="PERCENT">ลดเป็นเปอร์เซ็นต์</option></select></label><label>ส่วนลด ({draft.discountKind === 'FIXED' ? 'บาท' : '%'})<input inputMode="decimal" value={draft.discount} maxLength={20} disabled={locked} onChange={e => edit({ ...draft, discount: e.target.value })} /></label></div>
        {draft.payments.map((p, index) => { const cash = accounts.find(a => a.id === p.accountId)?.type === 'CASH'; const remaining = money.net - paid + (satang(p.amount) ?? 0n)
          return <fieldset key={index} disabled={locked}><legend>ช่องทางที่ {index + 1}</legend><label>บัญชีรับเงิน<select value={p.accountId} required onChange={e => payment(index, { accountId: e.target.value, tendered: '' })}><option value="">เลือกบัญชีรับเงิน</option>{accounts.map(a => <option key={a.id} value={a.id} disabled={draft.payments.some((other, n) => n !== index && other.accountId === a.id)}>{a.name} · {a.type === 'CASH' ? 'เงินสด' : 'โอนเงิน'}</option>)}</select></label>
            <label>ยอดชำระช่องทางนี้ (บาท)<input inputMode="decimal" value={p.amount} required maxLength={20} onChange={e => payment(index, { amount: e.target.value })} /></label>
            {remaining > 0n && <button type="button" className="secondary-action" onClick={() => payment(index, { amount: inputBaht(remaining) })}>ใช้ยอดที่เหลือ {baht(remaining)} บาท</button>}
            {cash && <><label>เงินสดที่รับมา (บาท)<input inputMode="decimal" value={p.tendered} required maxLength={20} onChange={e => payment(index, { tendered: e.target.value })} /></label><button type="button" className="secondary-action" onClick={() => payment(index, { tendered: p.amount })}>รับพอดี</button><p>{satang(p.tendered) === null ? 'กรอกเงินสดที่รับมาเพื่อคำนวณเงินทอน' : (satang(p.tendered) ?? 0n) < (satang(p.amount) ?? 0n) ? `เงินสดยังขาด ${baht((satang(p.amount) ?? 0n) - (satang(p.tendered) ?? 0n))} บาท` : `เงินทอน ${baht((satang(p.tendered) ?? 0n) - (satang(p.amount) ?? 0n))} บาท`}</p></>}
            {draft.payments.length > 1 && <button type="button" className="secondary-action" onClick={() => edit({ ...draft, payments: draft.payments.filter((_, n) => n !== index) })}>ลบช่องทางนี้</button>}</fieldset> })}
        <button type="button" className="secondary-action" disabled={locked || draft.payments.length >= accounts.length || draft.payments.length >= 100} onClick={() => edit({ ...draft, payments: [...draft.payments, { accountId: '', amount: '', tendered: '' }] })}>แบ่งชำระอีกช่องทาง</button>
        <dl className="money-summary"><div><dt>ยอดหลังส่วนลด</dt><dd>{baht(money.net)} บาท</dd></div><div><dt>จัดสรรแล้ว</dt><dd>{baht(paid)} บาท</dd></div></dl>
        <div className="actions"><button type="button" className="secondary-action" disabled={locked} onClick={() => setStep('items')}>กลับเลือกเมนู</button><button disabled={locked || !online || closed || oldDate || !!moneyError}>ตรวจบิลก่อนบันทึก</button></div>
      </form>}
      {step === 'review' && <section className="review" aria-labelledby="review-title"><h3 id="review-title">ตรวจบิลก่อนบันทึก</h3><p>ร้าน {store.name} · วันที่ {pending?.request.businessDate ?? draft.date}</p>
        <ul className="bill-lines">{draft.items.map(i => <li key={i.product.id}><span>{i.product.name} × {i.quantity}</span><strong>{baht(BigInt(i.product.price) * BigInt(i.quantity))}</strong></li>)}</ul>
        <dl className="money-summary"><div><dt>ยอดสินค้า</dt><dd>{baht(money.gross)} บาท</dd></div><div><dt>ส่วนลด</dt><dd>{baht(money.discount)} บาท</dd></div><div className="net"><dt>ยอดชำระ</dt><dd>{baht(pending ? pending.request.payments.reduce((sum, p) => sum + BigInt(p.amount), 0n) : money.net)} บาท</dd></div></dl>
        {reviewedPayments.map(p => <div className="payment-summary" key={p.accountId}><strong>{accountName(p.accountId)} · {p.channel === 'CASH' ? 'เงินสด' : 'โอนเงิน'}</strong><p>รับสุทธิ {baht(p.amount)} บาท</p>{p.channel === 'CASH' && <p>รับมา {baht(p.tendered!)} · เงินทอน {baht(BigInt(p.tendered!) - BigInt(p.amount))} บาท</p>}</div>)}
        <div className="actions"><button type="button" className="secondary-action" disabled={locked} onClick={() => setStep('pay')}>กลับแก้ไข</button><button type="button" disabled={busy || !online || seed.corrupt || (!pending && (closed || oldDate || !!changed))} onClick={() => void submit()}>{busy ? 'กำลังยืนยัน…' : pending ? 'ตรวจผลบิลเดิม' : `ยืนยันบันทึกขาย ${baht(money.net)} บาท`}</button></div>
      </section>}
      {step === 'items' && <div className="checkout-bar"><span>รวม {draft.items.reduce((sum, i) => sum + i.quantity, 0)} ชิ้น<strong>{baht(money.net)} บาท</strong></span><button type="button" disabled={!draft.items.length || locked || loading || closed || oldDate || !accounts.length || !online} onClick={() => { setStep('pay'); setMessage('') }}>ไปชำระเงิน</button></div>}
      {moneyError && <p role="alert">{moneyError}</p>}
    </>}
  </section>
}
