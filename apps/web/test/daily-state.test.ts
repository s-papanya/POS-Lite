import assert from 'node:assert/strict'
import { it } from 'vitest'
import { emptyDaily, prepareAdditional, prepareTargets, loadDaily, dailyKey, dailyRollback } from '../src/pos/daily-state'

const scope = { userId: 'u', businessId: 'b', storeId: 's' }
const id = '00000000-0000-4000-8000-000000000001'
const accounts = [{ id, name: 'เงินสด', type: 'CASH' as const }]
it('keeps additional money separate from signed daily targets without guessing accounts', () => {
  assert.equal(emptyDaily().mode, 'reconcile')
  const draft = { ...emptyDaily(), mode: 'additional' as const, amount: '100.25', reason: 'ตกหล่น', payments: [{ accountId: id, amount: '100.25', tendered: '200' }] }
  assert.equal(prepareAdditional(draft, accounts).amount, '10025')
  assert.throws(() => prepareAdditional({ ...draft, amount: '101' }, accounts))
  assert.throws(() => prepareAdditional({ ...draft, payments: [{ accountId: '', amount: '100.25', tendered: '200' }] }, accounts))
  assert.equal(prepareTargets({ ...draft, targets: [{ accountId: id, amount: '-25.50' }] }, accounts).targets[0]!.amount, '-2550')
  assert.throws(() => prepareTargets({ ...draft, targets: [{ accountId: id, amount: '' }] }, accounts))
})
it('binds pending daily requests to the exact identity, mode and payload and preserves corrupt storage', () => {
  const draft = { ...emptyDaily(), mode: 'additional' as const, amount: '10', reason: 'ตกหล่น', payments: [{ accountId: id, amount: '10', tendered: '10' }] }
  const pending = { mode: 'additional', scope: dailyKey(scope), key: id, request: prepareAdditional(draft, accounts) }
  const raw = JSON.stringify({ draft, pending })
  const storage = { getItem: () => raw }
  assert.deepEqual(loadDaily(storage, scope).pending, pending)
  assert.equal(loadDaily(storage, { ...scope, userId: 'v' }).corrupt, true)
  assert.equal(loadDaily({ getItem: () => '{broken' }, scope).corrupt, true)
  assert.equal(dailyRollback.has('STALE_PREVIEW'), true)
  for (const code of ['AUTH_REQUIRED', 'SESSION_CONTEXT_CHANGED', 'UNKNOWN_RESPONSE', 'IDEMPOTENCY_CONFLICT']) assert.equal(dailyRollback.has(code), false)
})
it('keeps the original reconciliation preview with its exact pending revision and targets', () => {
  const draft = { ...emptyDaily(), mode: 'reconcile' as const, reason: 'ตรวจยอด', targets: [{ accountId: id, amount: '500' }] }
  const preview = { revision: '2', lines: [{ accountId: id, channel: 'CASH', recorded: '40000', target: '50000', delta: '10000', requiresReview: false }], netSales: '50000', accountEffects: [{ accountId: id, delta: '10000' }] }
  const pending = { mode: 'reconcile', scope: dailyKey(scope), key: id, preview, request: { ...prepareTargets(draft, accounts), occurredAt: '2026-10-25T00:00:00.000Z', expectedRevision: '2', reason: 'ตรวจยอด' } }
  const load = (value: unknown) => loadDaily({ getItem: () => JSON.stringify({ draft, pending: value }) }, scope)
  assert.deepEqual(load(pending).pending, pending)
  assert.equal(load({ ...pending, preview: { ...preview, revision: '3' } }).corrupt, true)
  assert.equal(load({ ...pending, request: { ...pending.request, targets: [{ accountId: id, channel: 'CASH', amount: '60000' }] } }).corrupt, true)
  assert.equal(load({ ...pending, preview: { ...preview, lines: [{ ...preview.lines[0], delta: '1' }] } }).corrupt, true)
  assert.equal(load({ ...pending, preview: { ...preview, lines: [preview.lines[0], preview.lines[0]] }, request: { ...pending.request, targets: [...pending.request.targets, { accountId: '00000000-0000-4000-8000-000000000002', channel: 'TRANSFER', amount: '0' }] } }).corrupt, true)
})
