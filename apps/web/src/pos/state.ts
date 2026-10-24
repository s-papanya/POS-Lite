import type { Product } from '@pos-lite/shared'
import type { SaleRequest } from '@pos-lite/validation'
import { businessDateSchema, productSchema, saleRequestSchema } from '@pos-lite/validation'

export type Scope = { userId: string; businessId: string; storeId: string }
export type Draft = { date: string; items: { product: Product; quantity: number }[]; discountKind: 'FIXED' | 'PERCENT'; discount: string;
  payments: { accountId: string; amount: string; tendered: string }[] }
export type Pending = { scope: string; key: string; request: SaleRequest }
type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
export const scopeKey = (scope: Scope) => `pos-lite:checkout:${scope.userId}:${scope.businessId}:${scope.storeId}`
export const selectionKey = (userId: string, businessId: string) => `pos-lite:selected:${userId}:${businessId}`
export function bangkokDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  return ['year', 'month', 'day'].map(type => parts.find(p => p.type === type)!.value).join('-')
}
export function satang(text: string): bigint | null {
  const value = text.trim()
  if (!/^(0|[1-9][0-9]{0,10})(\.[0-9]{1,2})?$/.test(value)) return null
  const [whole, fraction = ''] = value.split('.')
  const amount = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))
  return amount <= 9000000000000n ? amount : null
}
export function baht(amount: string | bigint) {
  const n = BigInt(amount); const absolute = n < 0n ? -n : n
  return `${n < 0n ? '-' : ''}${(absolute / 100n).toLocaleString('en-US')}.${String(absolute % 100n).padStart(2, '0')}`
}
export function inputBaht(amount: string | bigint) { return baht(amount).replaceAll(',', '') }
export function emptyDraft(): Draft { return { date: bangkokDate(), items: [], discountKind: 'FIXED', discount: '0', payments: [{ accountId: '', amount: '', tendered: '' }] } }
export function hasDraft(d: Draft) { return d.items.length > 0 || d.discount !== '0' || d.payments.some(p => p.accountId || p.amount || p.tendered) }
export function totals(d: Draft) {
  const gross = d.items.reduce((sum, item) => sum + BigInt(item.product.price) * BigInt(item.quantity), 0n)
  const entered = satang(d.discount)
  if (entered === null || (d.discountKind === 'PERCENT' && entered > 10000n)) throw new Error('กรุณาระบุส่วนลดให้ถูกต้อง ไม่เกิน 100%')
  const discount = d.discountKind === 'FIXED' ? entered : (gross * entered + 5000n) / 10000n
  if (gross > 9000000000000n || discount > gross) throw new Error('ยอดหรือส่วนลดเกินขอบเขต กรุณาตรวจรายการ')
  return { gross, discount, net: gross - discount }
}
export const definitiveRejection = new Set(['PRICE_CHANGED', 'DAY_CLOSED', 'PREVIOUS_DAY_UNSETTLED', 'INITIAL_BALANCES_REQUIRED', 'INVALID_SALE_TOTALS',
  'INSUFFICIENT_TENDERED', 'ACCOUNT_CHANNEL_MISMATCH', 'ACCOUNT_INACTIVE', 'PRODUCT_INACTIVE', 'INVALID_OCCURRED_AT', 'INVALID_BUSINESS_DATE'])
export function saveWorkspace(storage: StorageLike, scope: Scope, draft: Draft, pending: Pending | null) {
  if (!hasDraft(draft) && !pending) storage.removeItem(scopeKey(scope))
  else storage.setItem(scopeKey(scope), JSON.stringify({ draft, pending }))
}
export function loadWorkspace(storage: StorageLike, scope: Scope): { draft: Draft; pending: Pending | null; corrupt: boolean } {
  try {
    const text = storage.getItem(scopeKey(scope))
    if (!text) return { draft: emptyDraft(), pending: null, corrupt: false }
    if (text.length > 100000) throw new Error('Oversized draft')
    const raw = JSON.parse(text) as { draft?: Partial<Draft>; pending?: Partial<Pending> | null }
    const d = raw.draft
    const small = (v: unknown): v is string => typeof v === 'string' && v.length <= 40
    if (!d || !Array.isArray(d.items) || d.items.length > 100 || !Array.isArray(d.payments) || d.payments.length > 100 ||
      !d.payments.length || !small(d.discount) || !['FIXED', 'PERCENT'].includes(d.discountKind ?? '')) throw new Error('Invalid draft')
    const items = d.items.map(i => {
      if (!i || !Number.isInteger(i.quantity) || i.quantity < 1 || i.quantity > 999) throw new Error('Invalid quantity')
      return { product: productSchema.parse(i.product), quantity: i.quantity }
    })
    const payments = d.payments.map(p => {
      if (!p || !small(p.accountId) || !small(p.amount) || !small(p.tendered)) throw new Error('Invalid payment')
      return { accountId: p.accountId, amount: p.amount, tendered: p.tendered }
    })
    const draft: Draft = { date: businessDateSchema.parse(d.date), items, payments, discount: d.discount, discountKind: d.discountKind as Draft['discountKind'] }
    let pending: Pending | null = null
    if (raw.pending) {
      if (raw.pending.scope !== scopeKey(scope) || typeof raw.pending.key !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(raw.pending.key)) throw new Error('Invalid pending identity')
      pending = { scope: raw.pending.scope, key: raw.pending.key, request: saleRequestSchema.parse(raw.pending.request) }
    }
    return { draft, pending, corrupt: false }
  } catch { return { draft: emptyDraft(), pending: null, corrupt: true } }
}
