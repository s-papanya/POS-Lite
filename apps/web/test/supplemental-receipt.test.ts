import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { it } from 'vitest'
import { Receipt } from '../src/pos/Receipt'
import type { Sale } from '@pos-lite/shared'

it('labels supplemental history receipts explicitly instead of inventing products or discounts', () => {
  const sale: Sale = { id: 'fixture', reference: 'SUP-20261025-000001', kind: 'SUPPLEMENTAL', reason: 'ยอดขายช่วงเช้า',
    businessDate: '2026-10-25', occurredAt: '2026-10-25T00:00:00Z', gross: '10000', discount: '0', net: '10000', dayRevision: '1', items: [], payments: [] }
  const html = renderToStaticMarkup(createElement(Receipt, { sale, accountName: () => 'บัญชี' }))
  for (const text of ['เพิ่มยอดที่ยังไม่ได้บันทึก', 'ยอดขายช่วงเช้า', 'ยอดขายเพิ่มเติม', '100.00']) assert.ok(html.includes(text))
  assert.equal(html.includes('ส่วนลด'), false)
  const reconciliation = renderToStaticMarkup(createElement(Receipt, { sale: { ...sale, kind: 'RECONCILIATION' }, accountName: () => 'บัญชี' }))
  assert.ok(reconciliation.includes('ส่วนต่างจากการตรวจยอดขายรวมทั้งวัน'))
  assert.ok(reconciliation.includes('ยอดขายส่วนต่าง'))
})
