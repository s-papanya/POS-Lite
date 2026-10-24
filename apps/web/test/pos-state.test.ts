import assert from 'node:assert/strict'
import { describe, it } from 'vitest'
import { baht, bangkokDate, definitiveRejection, emptyDraft, loadWorkspace, satang, saveWorkspace, scopeKey, totals } from '../src/pos/state'

const scope = { userId: 'user-a', businessId: 'business-a', storeId: 'store-a' }
const product = { id: '00000000-0000-4000-8000-000000000001', name: 'ก๋วยเตี๋ยว', price: '3500', version: 1, active: true }
describe('POS money and identity-bound recovery', () => {
  it('parses baht exactly and computes the same one-time half-up discount as the server', () => {
    assert.equal(satang('99.75'), 9975n); assert.equal(baht('9000000000000'), '90,000,000,000.00')
    for (const input of ['1.001', '-1', '1e3', 'NaN', '', '01', '90000000000.01']) assert.equal(satang(input), null)
    assert.deepEqual(totals({ ...emptyDraft(), items: [{ product, quantity: 3 }], discountKind: 'PERCENT', discount: '5' }), { gross: 10500n, discount: 525n, net: 9975n })
    assert.equal(bangkokDate(new Date('2026-10-23T17:00:00Z')), '2026-10-24')
    assert.equal(bangkokDate(new Date('2026-10-23T16:59:59Z')), '2026-10-23')
  })
  it('restores the exact pending key/payload only under the original user/business/store', () => {
    const values = new Map<string, string>(); const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) }, removeItem: (key: string) => { values.delete(key) } }
    const draft = { ...emptyDraft(), items: [{ product, quantity: 1 }] }
    const pending = { scope: scopeKey(scope), key: '00000000-0000-4000-8000-000000000003', request: { businessDate: draft.date, occurredAt: '2026-10-24T00:00:00.000Z',
      items: [{ productId: product.id, expectedVersion: 1, quantity: 1 }], discount: { kind: 'FIXED' as const, amount: '0' },
      payments: [{ accountId: '00000000-0000-4000-8000-000000000002', channel: 'CASH' as const, amount: '3500', tendered: '5000' }] } }
    saveWorkspace(storage, scope, draft, pending)
    assert.deepEqual(loadWorkspace(storage, scope), { draft, pending, corrupt: false })
    for (const other of [{ ...scope, userId: 'user-b' }, { ...scope, businessId: 'business-b' }, { ...scope, storeId: 'store-b' }]) assert.equal(loadWorkspace(storage, other).pending, null)
    values.set(scopeKey({ ...scope, userId: 'user-b' }), values.get(scopeKey(scope))!)
    assert.equal(loadWorkspace(storage, { ...scope, userId: 'user-b' }).corrupt, true)
  })
  it('keeps corrupt recovery data untouched and never treats auth/network errors as proof of rollback', () => {
    const storage = { getItem: () => '{broken', setItem: () => assert.fail('must not overwrite'), removeItem: () => assert.fail('must not delete') }
    assert.equal(loadWorkspace(storage, scope).corrupt, true)
    for (const code of ['AUTH_REQUIRED', 'SESSION_CONTEXT_CHANGED', 'IDEMPOTENCY_CONFLICT', 'UNKNOWN_RESPONSE', 'RESOURCE_NOT_FOUND']) assert.equal(definitiveRejection.has(code), false)
    assert.equal(definitiveRejection.has('PRICE_CHANGED'), true); assert.equal(definitiveRejection.has('DAY_CLOSED'), true)
  })
})
