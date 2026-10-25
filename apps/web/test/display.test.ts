import assert from 'node:assert/strict'
import { it } from 'vitest'
import { dayBefore, thaiClock, thaiDay } from '../src/pos/display'

it('uses calendar days for history presets across leap days and years', () => {
  assert.equal(dayBefore('2024-03-01'), '2024-02-29')
  assert.equal(dayBefore('2026-01-01'), '2025-12-31')
  assert.equal(thaiClock('2026-10-25T17:05:00Z'), '00:05')
  assert.match(thaiDay('2026-10-26'), /2569/)
})
