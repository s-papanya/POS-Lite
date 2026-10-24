import { z } from 'zod'
import { businessDateSchema, reconciliationPreviewResponseSchema, reconciliationPreviewRequestSchema, reconciliationRequestSchema, supplementalSaleRequestSchema } from '@pos-lite/validation'
import { bangkokDate, definitiveRejection, preparePayments, satang, scopeKey } from './state'
import type { ReceivingAccount, Scope } from './state'

const text = z.string().max(40)
const draftSchema = z.strictObject({ mode: z.enum(['additional', 'reconcile']), date: businessDateSchema, reason: z.string().max(1000), amount: text,
  payments: z.array(z.strictObject({ accountId: text, amount: text, tendered: text })).min(1).max(100),
  targets: z.array(z.strictObject({ accountId: text, amount: text })).min(1).max(100) })
const pendingSchema = z.discriminatedUnion('mode', [
  z.strictObject({ mode: z.literal('additional'), scope: z.string(), key: z.uuid(), request: supplementalSaleRequestSchema }),
  z.strictObject({ mode: z.literal('reconcile'), scope: z.string(), key: z.uuid(), request: reconciliationRequestSchema, preview: reconciliationPreviewResponseSchema.shape.data }),
])
export type DailyDraft = z.infer<typeof draftSchema>
export type DailyPending = z.infer<typeof pendingSchema>
export type DailyPreview = z.infer<typeof reconciliationPreviewResponseSchema>['data']
export const dailyKey = (scope: Scope) => `${scopeKey(scope)}:daily`
export const emptyDaily = (): DailyDraft => ({ mode: 'additional', date: bangkokDate(), reason: '', amount: '', payments: [{ accountId: '', amount: '', tendered: '' }], targets: [{ accountId: '', amount: '' }] })
export const hasDaily = (d: DailyDraft) => !!(d.reason || d.amount || d.payments.some(p => p.accountId || p.amount || p.tendered) || d.targets.some(t => t.accountId || t.amount))
export const dailyRollback = new Set([...definitiveRejection, 'STALE_PREVIEW', 'RECONCILIATION_REQUIRES_REVIEW'])
export function loadDaily(storage: Pick<Storage, 'getItem'>, scope: Scope): { draft: DailyDraft; pending: DailyPending | null; corrupt: boolean } {
  try {
    const text = storage.getItem(dailyKey(scope))
    if (!text) return { draft: emptyDaily(), pending: null, corrupt: false }
    if (text.length > 100000) throw new Error('Oversized daily draft')
    const saved = z.strictObject({ draft: draftSchema, pending: pendingSchema.nullable() }).parse(JSON.parse(text))
    if (saved.pending && (saved.pending.scope !== dailyKey(scope) || saved.pending.mode !== saved.draft.mode)) throw new Error('Invalid identity')
    const pending = saved.pending
    if (pending?.mode === 'reconcile') {
      const { preview, request } = pending
      if (preview.revision !== request.expectedRevision || preview.lines.length !== request.targets.length || new Set(preview.lines.map(l => l.accountId)).size !== preview.lines.length || preview.lines.some(l =>
        !request.targets.some(t => t.accountId === l.accountId && t.channel === l.channel && t.amount === l.target) || BigInt(l.delta) !== BigInt(l.target) - BigInt(l.recorded) || l.requiresReview !== (BigInt(l.delta) < 0n))) throw new Error('Invalid pending preview')
    }
    return { ...saved, corrupt: false }
  } catch { return { draft: emptyDaily(), pending: null, corrupt: true } }
}
export function prepareAdditional(draft: DailyDraft, accounts: ReceivingAccount[]) {
  const amount = satang(draft.amount); const payments = preparePayments(draft.payments, accounts)
  if (amount === null || amount <= 0n || payments.reduce((sum, p) => sum + BigInt(p.amount), 0n) !== amount) throw new Error('ยอดชำระทุกช่องทางต้องรวมเท่ากับยอดที่ยังไม่ได้บันทึก')
  if (!draft.reason.trim()) throw new Error('กรุณาระบุเหตุผลของยอดที่ยังไม่ได้บันทึก')
  const parsed = supplementalSaleRequestSchema.safeParse({ businessDate: draft.date, occurredAt: new Date().toISOString(), amount: String(amount), reason: draft.reason, payments })
  if (!parsed.success) throw new Error('บัญชีต้องไม่ซ้ำ และข้อมูลยอดเพิ่มเติมต้องครบถ้วน')
  return parsed.data
}
export function prepareTargets(draft: DailyDraft, accounts: ReceivingAccount[]) {
  const targets = draft.targets.map(t => {
    const account = accounts.find(a => a.id === t.accountId)
    const negative = t.amount.trim().startsWith('-'); const amount = satang(negative ? t.amount.trim().slice(1) : t.amount)
    if (!account || amount === null) throw new Error('เลือกบัญชีและกรอกยอดสุทธิทั้งวันให้ครบ ระบุ0เมื่อยอดเป็นศูนย์')
    return { accountId: account.id, channel: account.type === 'CASH' ? 'CASH' as const : 'TRANSFER' as const, amount: String(negative ? -amount : amount) }
  })
  const parsed = reconciliationPreviewRequestSchema.safeParse({ businessDate: draft.date, targets })
  if (!parsed.success) throw new Error('บัญชีต้องไม่ซ้ำ และยอดต้องอยู่ในขอบเขตที่กำหนด')
  return parsed.data
}
