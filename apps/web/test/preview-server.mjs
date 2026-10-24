// Local UI contract fixture only: no PostgreSQL, credentials or real financial writes.
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { saleRequestSchema, supplementalSaleRequestSchema, reconciliationPreviewRequestSchema, reconciliationRequestSchema } from '@pos-lite/validation'
import { reconciliationPreview } from '../../api/src/modules/reconciliation/money.ts'

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const user = { id: id(1), username: 'ui-test' }; const business = { id: id(2), name: 'กิจการทดสอบ UI · ข้อมูลจำลอง' }
const stores = [{ id: id(3), name: 'ก๋วยเตี๋ยว · ทดสอบ UI', code: 'NOODLE', role: 'OWNER' }, { id: id(4), name: 'เบเกอรี่ · ทดสอบ UI', code: 'BAKERY', role: 'OWNER' }]
const accounts = [{ id: id(5), name: 'เงินสดหน้าร้าน', type: 'CASH' }, { id: id(6), name: 'บัญชีรับโอน', type: 'BANK' }]
let scenario = 'normal'; let first = true; let logged = true; let version = 1; let price = '3500'; let sales = []; let received = []; let keys = new Map(); let revision = 0
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date())
const menu = () => [{ id: id(7), name: 'ก๋วยเตี๋ยวหมูน้ำใส', price, version, active: true }, { id: id(8), name: 'ก๋วยเตี๋ยวต้มยำหมูสับพิเศษใส่ไข่ออนเซ็น', price: '5000', version: 1, active: true }, { id: id(9), name: 'ขนมปังสังขยา', price: '2500', version: 1, active: true }, { id: id(10), name: 'น้ำดื่ม', price: '1000', version: 1, active: true }]
const server = await createServer({ root: fileURLToPath(new URL('../', import.meta.url)), configFile: fileURLToPath(new URL('../vite.config.ts', import.meta.url)),
  server: { host: '127.0.0.1', port: 5180, strictPort: true }, plugins: [{ name: 'ui-contract-fixture', configureServer(vite) {
    vite.middlewares.use(async (req, res, next) => {
      const url = new URL(req.url, 'http://127.0.0.1:5180'); const path = url.pathname
      if (!path.startsWith('/api/v1/') && path !== '/__fixture/state') return next()
      const json = (body, status = 200) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify(body)) }
      const fail = (code, status, details) => json({ error: { code, message: 'UI fixture', requestId: randomUUID(), ...(details ? { details } : {}) } }, status)
      try {
        let raw = ''; for await (const chunk of req) raw += chunk
        const body = raw ? JSON.parse(raw) : {}
        if (path === '/__fixture/state') {
          if (req.method === 'POST') { scenario = body.scenario; first = true; logged = true; version = 1; price = '3500'; sales = []; received = []; keys = new Map(); revision = 0 }
          return json({ scenario, received, sales })
        }
        if (path.endsWith('/health')) return json({ data: { status: 'ok', service: 'family-store-manager-api' } })
        if (path.endsWith('/auth/csrf')) return json({ data: { csrfToken: 'a'.repeat(64) } })
        if (path.endsWith('/auth/login')) { logged = true; return json({ data: {} }) }
        if (path.endsWith('/auth/logout')) { logged = false; return json({ data: {} }) }
        if (!logged) return fail('AUTH_REQUIRED', 401)
        if (path.endsWith('/me')) return json({ data: { user, business, businessRole: 'OWNER', stores } })
        if (path.endsWith('/products')) return json({ data: scenario === 'empty' ? [] : menu(), page: { nextCursor: null } })
        if (path.endsWith('/accounts')) return json({ data: scenario === 'empty' ? [] : accounts, page: { nextCursor: null } })
        if (path.includes('/business-days/')) return scenario === 'closed' ? json({ data: { id: id(11), businessDate: today(), state: 'CLOSED', revision: '0', openingSnapshots: [] } }) : fail('RESOURCE_NOT_FOUND', 404)
        if (path.endsWith('/supplemental-sales') || path.includes('/sales-reconciliations')) {
          if (req.headers['x-expected-user-id'] !== user.id || req.headers['x-expected-business-id'] !== business.id) return fail('SESSION_CONTEXT_CHANGED', 403)
          const recorded = accounts.map(a => ({ accountId: a.id, channel: a.type === 'CASH' ? 'CASH' : 'TRANSFER', amount: String(sales.reduce((sum, s) => sum + s.payments.filter(p => p.accountId === a.id).reduce((n, p) => n + BigInt(p.amount), 0n), 0n)) }))
          if (path.endsWith('/preview')) { const input = reconciliationPreviewRequestSchema.parse(body); return json({ data: reconciliationPreview(String(revision), input.targets, recorded) }) }
          const additional = path.endsWith('/supplemental-sales'); const input = additional ? supplementalSaleRequestSchema.parse(body) : reconciliationRequestSchema.parse(body)
          const key = req.headers['idempotency-key']; received.push({ key, input, path })
          if (keys.has(key)) { const old = keys.get(key); return old.path === path && JSON.stringify(old.input) === JSON.stringify(input) ? json({ data: old.result }, 201) : fail('IDEMPOTENCY_CONFLICT', 409) }
          if (scenario === 'closed') return fail('DAY_CLOSED', 409)
          if (scenario === 'daily-expired' && first) { first = false; logged = false; return fail('AUTH_REQUIRED', 401) }
          if (!additional && scenario === 'daily-stale' && first) { first = false; revision++; return fail('STALE_PREVIEW', 409) }
          if (!additional && input.expectedRevision !== String(revision)) return fail('STALE_PREVIEW', 409)
          const preview = additional ? null : reconciliationPreview(String(revision), input.targets, recorded)
          if (preview?.lines.some(l => l.requiresReview)) return fail('RECONCILIATION_REQUIRES_REVIEW', 409)
          const makeSale = (amount, payments, kind) => ({ id: randomUUID(), reference: `${kind === 'SUPPLEMENTAL' ? 'SUP' : 'REC'}-${today().replaceAll('-', '')}-${String(sales.length + 1).padStart(6, '0')}`, kind, reason: input.reason, businessDate: input.businessDate, occurredAt: input.occurredAt, gross: amount, net: amount, discount: '0', items: [], dayRevision: String(++revision), payments: payments.map(p => ({ ...p, id: randomUUID(), tendered: p.channel === 'CASH' ? p.tendered : null, change: p.channel === 'CASH' ? String(BigInt(p.tendered) - BigInt(p.amount)) : null })) })
          const created = additional ? [makeSale(input.amount, input.payments, 'SUPPLEMENTAL')] : preview.lines.filter(l => BigInt(l.delta) > 0n).map(l => makeSale(l.delta, [{ accountId: l.accountId, channel: l.channel, amount: l.delta, ...(l.channel === 'CASH' ? { tendered: l.delta } : {}) }], 'RECONCILIATION'))
          if (!created.length) revision++
          sales.push(...created); const result = additional ? created[0] : { id: randomUUID(), createdSales: created, dayRevision: String(revision) }
          keys.set(key, { input, result, path })
          if (scenario === 'daily-unknown' && first) { first = false; return fail('UNKNOWN_RESPONSE', 503) }
          return json({ data: result }, 201)
        }
        if (path.endsWith('/sales') && req.method === 'POST') {
          const input = saleRequestSchema.parse(body); const key = req.headers['idempotency-key']
          received.push({ key, input, expectedUser: req.headers['x-expected-user-id'], expectedBusiness: req.headers['x-expected-business-id'] })
          if (req.headers['x-expected-user-id'] !== user.id || req.headers['x-expected-business-id'] !== business.id) return fail('SESSION_CONTEXT_CHANGED', 403)
          if (keys.has(key)) return JSON.stringify(keys.get(key).input) === JSON.stringify(input) ? json({ data: keys.get(key).sale }, 201) : fail('IDEMPOTENCY_CONFLICT', 409)
          if (scenario === 'expired' && first) { first = false; logged = false; return fail('AUTH_REQUIRED', 401) }
          if (scenario === 'price' && first) { first = false; version = 2; price = '4000'; return fail('PRICE_CHANGED', 409, { current: menu()[0] }) }
          for (const item of input.items) { const product = menu().find(p => p.id === item.productId); if (!product) return fail('RESOURCE_NOT_FOUND', 404); if (item.expectedVersion !== product.version) return fail('PRICE_CHANGED', 409, { current: product }) }
          const items = input.items.map(i => { const p = menu().find(p => p.id === i.productId); return { productId: p.id, nameSnapshot: p.name, unitPrice: p.price, productVersion: p.version, quantity: i.quantity, lineTotal: String(BigInt(p.price) * BigInt(i.quantity)) } })
          const gross = items.reduce((n, i) => n + BigInt(i.lineTotal), 0n)
          const discount = input.discount.kind === 'FIXED' ? BigInt(input.discount.amount) : (gross * BigInt(input.discount.basisPoints) + 5000n) / 10000n
          if (input.payments.reduce((n, p) => n + BigInt(p.amount), 0n) !== gross - discount) return fail('INVALID_SALE_TOTALS', 422)
          const sale = { id: randomUUID(), reference: `POS-${today().replaceAll('-', '')}-${String(sales.length + 1).padStart(6, '0')}`, kind: 'POS', businessDate: input.businessDate, occurredAt: input.occurredAt,
            gross: String(gross), discount: String(discount), net: String(gross - discount), dayRevision: String(++revision), items,
            payments: input.payments.map(p => ({ id: randomUUID(), ...p, tendered: p.channel === 'CASH' ? p.tendered : null, change: p.channel === 'CASH' ? String(BigInt(p.tendered) - BigInt(p.amount)) : null })) }
          keys.set(key, { input, sale }); sales.push(sale)
          if (scenario === 'unknown' && first) { first = false; return fail('UNKNOWN_RESPONSE', 503) }
          if (scenario === 'slow' && first) { first = false; setTimeout(() => json({ data: sale }, 201), 10000); return }
          return json({ data: sale }, 201)
        }
        if (path.endsWith('/sales')) return json({ data: sales.toReversed(), page: { nextCursor: null } })
        if (path.includes('/sales/')) { const sale = sales.find(s => s.id === path.split('/').at(-1)); return sale ? json({ data: sale }) : fail('RESOURCE_NOT_FOUND', 404) }
        return fail('RESOURCE_NOT_FOUND', 404)
      } catch { return fail('INVALID_REQUEST', 400) }
    })
  } }] })
await server.listen(); console.log('UI fixture: http://127.0.0.1:5180 (simulated data only)')
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { void server.close().then(() => process.exit(0)) })
