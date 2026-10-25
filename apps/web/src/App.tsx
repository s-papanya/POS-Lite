import { useEffect, useState } from 'react'
import { healthResponseSchema } from '@pos-lite/validation'
import './App.css'
import './pos/pos.css'
import './pos/workflows.css'
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
      <header className="site-header"><span>ร้านของครอบครัว</span><details className="connection-menu" data-status={visibleStatus}>
        <summary aria-label="ตรวจการเชื่อมต่อ"><span role="status" aria-live="polite">{visibleStatus === 'ready' ? 'ออนไลน์' : visibleStatus === 'offline' ? 'ออฟไลน์' : visibleStatus === 'checking' ? 'กำลังเชื่อมต่อ' : 'เชื่อมต่อไม่ได้'}</span></summary>
        <div><p>{connectionText}</p><button type="button" disabled={visibleStatus === 'checking' || !online} onClick={() => { setStatus('checking'); setAttempt(value => value + 1) }}>ตรวจอีกครั้ง</button></div>
      </details></header>
      <main className="app-main">
        <StoreAccess />
      </main>
      <footer>พัฒนาเพื่อการดูแลร้านของครอบครัว</footer>
    </>
  )
}

export default App
