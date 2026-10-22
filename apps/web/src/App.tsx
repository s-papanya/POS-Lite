import { useEffect, useState } from 'react'
import { healthResponseSchema } from '@pos-lite/validation'
import './App.css'
import { StoreAccess } from './StoreAccess'

function App() {
  const [status, setStatus] = useState<'checking' | 'ready' | 'error' | 'offline'>('checking')
  const [online, setOnline] = useState(navigator.onLine)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    function connected() { setOnline(true); setStatus('checking'); setAttempt((value) => value + 1) }
    function disconnected() { setOnline(false); setStatus('offline') }
    window.addEventListener('online', connected)
    window.addEventListener('offline', disconnected)
    return () => {
      window.removeEventListener('online', connected)
      window.removeEventListener('offline', disconnected)
    }
  }, [])

  useEffect(() => {
    if (!online) return
    const controller = new AbortController()
    let active = true
    const timeout = window.setTimeout(() => controller.abort(), 8000)
    async function checkConnection() {
      try {
        const response = await fetch('/api/v1/health', { signal: controller.signal, cache: 'no-store' })
        if (!response.ok) throw new Error('Health check failed')
        healthResponseSchema.parse(await response.json())
        if (active) setStatus('ready')
      } catch {
        if (active) setStatus(navigator.onLine ? 'error' : 'offline')
      } finally {
        window.clearTimeout(timeout)
      }
    }
    void checkConnection()
    return () => { active = false; controller.abort(); window.clearTimeout(timeout) }
  }, [attempt, online])

  const visibleStatus = online ? status : 'offline'
  const connectionText = {
    checking: 'กำลังตรวจสอบการเชื่อมต่อ…',
    ready: 'เชื่อมต่อระบบได้',
    error: 'ยังเชื่อมต่อระบบไม่ได้',
    offline: 'อุปกรณ์ไม่ได้เชื่อมต่ออินเทอร์เน็ต',
  }[visibleStatus]

  return (
    <>
      <header className="site-header"><span>Family Store Manager</span><span>ร้านของครอบครัว</span></header>
      <main>
        <section className="welcome" aria-labelledby="page-title">
          <h1 id="page-title">ดูแลร้านของเรา<br />ให้เป็นเรื่องง่าย</h1>
          <p>ร้านก๋วยเตี๋ยวและร้านเบเกอรี่<br className="mobile-break" /> อยู่ในที่เดียวกัน</p>
          <div className="connection" data-status={visibleStatus}>
            <h2>การเชื่อมต่อระบบ</h2>
            <p role="status" aria-live="polite">{connectionText}</p>
            <button type="button" disabled={visibleStatus === 'checking' || !online}
              onClick={() => { setStatus('checking'); setAttempt((value) => value + 1) }}>
              {visibleStatus === 'checking' ? 'กำลังตรวจสอบ…' : 'ตรวจสอบอีกครั้ง'}
            </button>
          </div>
        </section>
        <div><StoreAccess />
        <section className="preparation" aria-labelledby="preparation-title">
          <h2 id="preparation-title">กำลังเตรียมพร้อมสำหรับร้านของเรา</h2>
          <p>ตอนนี้ยังไม่เปิดบันทึกรายการจริง<br />เรากำลังวางระบบให้พร้อมใช้งานทีละส่วน</p>
          <ul>
            <li><strong>เลือกร้านและเข้าสู่ระบบได้แล้ว</strong><span>แสดงเฉพาะร้านที่บัญชีของคุณมีสิทธิ์</span></li>
            <li><strong>บันทึกขายและรายจ่าย</strong><span>รู้ว่าเงินเข้าออกจากอะไร</span></li>
            <li><strong>ตรวจเงินสดและปิดวัน</strong><span>เห็นยอดที่บันทึกและเงินที่นับได้ชัดเจน</span></li>
          </ul>
          <p className="preparation-note">การเชื่อมต่อสำเร็จยังไม่ได้หมายความว่าบันทึกยอดขายได้แล้ว</p>
        </section>
        </div>
      </main>
      <footer>พัฒนาเพื่อการดูแลร้านของครอบครัว</footer>
    </>
  )
}

export default App
