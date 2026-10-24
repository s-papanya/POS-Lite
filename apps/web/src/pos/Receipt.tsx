import type { Sale } from '@pos-lite/shared'
import { baht } from './state'

export function Receipt({ sale, accountName }: { sale: Sale; accountName: (id: string) => string }) {
  return <section className="receipt" aria-labelledby="receipt-title">
    <h3 id="receipt-title">บิล {sale.reference}</h3>
    <p>วันที่ {sale.businessDate} · {new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' }).format(new Date(sale.occurredAt))} น.</p>
    {sale.kind !== 'POS' && <p>{sale.kind === 'RECONCILIATION' ? 'ส่วนต่างจากการตรวจยอดขายรวมทั้งวัน' : 'เพิ่มยอดที่ยังไม่ได้บันทึก'} · เหตุผล: {sale.reason}</p>}
    <ul className="bill-lines">{sale.items.map(i => <li key={i.productId}><span>{i.nameSnapshot}<small>{i.quantity} × {baht(i.unitPrice)} บาท</small></span><strong>{baht(i.lineTotal)}</strong></li>)}</ul>
    <dl className="money-summary"><div><dt>{sale.kind === 'RECONCILIATION' ? 'ยอดขายส่วนต่าง' : sale.kind === 'SUPPLEMENTAL' ? 'ยอดขายเพิ่มเติม' : 'ยอดสินค้า'}</dt><dd>{baht(sale.gross)} บาท</dd></div>{sale.kind === 'POS' && <div><dt>ส่วนลด</dt><dd>{baht(sale.discount)} บาท</dd></div>}<div className="net"><dt>ยอดชำระ</dt><dd>{baht(sale.net)} บาท</dd></div></dl>
    <h4>การชำระเงิน</h4>
    {sale.payments.map(p => <div className="payment-summary" key={p.id}><strong>{p.channel === 'CASH' ? 'เงินสด' : 'โอนเงิน'} · {accountName(p.accountId)}</strong><p>รับสุทธิ {baht(p.amount)} บาท</p>
      {p.tendered !== null && <p>รับมา {baht(p.tendered)} · เงินทอน {baht(p.change!)} บาท</p>}</div>)}
  </section>
}
