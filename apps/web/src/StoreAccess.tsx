import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { MeResponse } from '@pos-lite/shared'
import { csrfResponseSchema, meResponseSchema } from '@pos-lite/validation'

async function api(path: string, options?: RequestInit) {
  return fetch(`/api/v1${path}`, { ...options, credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(8000) })
}

export function StoreAccess() {
  const [me, setMe] = useState<MeResponse['data'] | null>(null)
  const [pending, setPending] = useState(true)
  const [message, setMessage] = useState('กำลังตรวจสอบการเข้าสู่ระบบ…')
  const [selected, setSelected] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const result = await api('/me')
        if (!active) return
        if (result.status === 401) { setMe(null); setSelected(''); setMessage(''); return }
        if (!result.ok) throw new Error('Session unavailable')
        const data = meResponseSchema.parse(await result.json()).data
        if (active) { setMe(data); setSelected(''); setMessage('') }
      } catch {
        if (active) setMessage('ยังตรวจสอบบัญชีไม่ได้ กรุณาตรวจการเชื่อมต่อแล้วลองอีกครั้ง')
      } finally { if (active) setPending(false) }
    }
    void load()
    return () => { active = false }
  }, [attempt])

  async function csrf() {
    const result = await api('/auth/csrf')
    if (!result.ok) throw new Error('CSRF unavailable')
    return csrfResponseSchema.parse(await result.json()).data.csrfToken
  }
  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const fields = new FormData(form)
    setPending(true); setMessage('กำลังเข้าสู่ระบบ…')
    try {
      const result = await api('/auth/login', {method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':await csrf()},
        body:JSON.stringify({username:fields.get('username'),password:fields.get('password')})})
      if (!result.ok) {
        setMessage(result.status === 429 ? 'ลองเข้าสู่ระบบหลายครั้งแล้ว กรุณารอประมาณ 15 นาที'
          : result.status === 409 ? 'บัญชีนี้มีหลายธุรกิจ กรุณาระบุธุรกิจกับผู้ดูแลระบบ'
          : 'เข้าสู่ระบบไม่สำเร็จ กรุณาตรวจชื่อผู้ใช้และรหัสผ่าน')
        return
      }
      form.reset()
      const current = await api('/me')
      if (!current.ok) throw new Error('Session unavailable')
      setMe(meResponseSchema.parse(await current.json()).data); setSelected(''); setMessage('เข้าสู่ระบบแล้ว กรุณาเลือกร้าน')
    } catch { setMessage('ยังยืนยันผลไม่ได้ กรุณากดตรวจสอบบัญชีอีกครั้งก่อนลองเข้าสู่ระบบใหม่') }
    finally { setPending(false) }
  }
  async function logout() {
    setPending(true); setMessage('กำลังออกจากระบบ…')
    try {
      const result = await api('/auth/logout',{method:'POST',headers:{'X-CSRF-Token':await csrf()}})
      if (!result.ok) throw new Error('Logout unavailable')
      setMe(null); setSelected(''); setMessage('ออกจากระบบแล้ว')
    } catch { setMessage('ยังยืนยันการออกจากระบบไม่ได้ กรุณาตรวจสอบบัญชีอีกครั้ง') }
    finally { setPending(false) }
  }

  return <section className="store-access" aria-labelledby="access-title" aria-busy={pending}>
    <h2 id="access-title">{me ? 'เลือกร้านของคุณ' : 'เข้าสู่ระบบร้านของเรา'}</h2>
    {me ? <>
      <p>{me.user.username} · {me.business.name}</p>
      <div className="store-list">
        {me.stores.map((store) => <button key={store.id} type="button" aria-pressed={selected === store.id} disabled={pending}
          onClick={() => { setSelected(store.id); setMessage(`เลือกร้าน ${store.name} แล้ว ระบบบันทึกขายจะเปิดให้ใช้ในขั้นถัดไป`) }}>
          <strong>{store.name}</strong><span>{({OWNER:'เจ้าของร้าน',MANAGER:'ผู้จัดการ',STAFF:'พนักงาน'})[store.role]}</span>
        </button>)}
      </div>
      {!me.stores.length && <p>ยังไม่มีร้านที่เปิดให้บัญชีนี้ใช้งาน กรุณาติดต่อเจ้าของร้าน</p>}
      <button type="button" className="secondary-action" disabled={pending} onClick={() => void logout()}>ออกจากระบบ</button>
    </> : <form onSubmit={(event) => void login(event)}>
      <label htmlFor="username">ชื่อผู้ใช้</label>
      <input id="username" name="username" autoComplete="username" required minLength={3} maxLength={64} disabled={pending} autoCapitalize="none" spellCheck={false} />
      <label htmlFor="password">รหัสผ่าน</label>
      <input id="password" name="password" type="password" autoComplete="current-password" required maxLength={128} disabled={pending} />
      <button type="submit" disabled={pending}>{pending ? 'กำลังตรวจสอบ…' : 'เข้าสู่ระบบ'}</button>
    </form>}
    <p role="status" aria-live="polite">{message}</p>
    <button type="button" className="secondary-action" disabled={pending} onClick={() => {setPending(true);setMessage('กำลังตรวจสอบบัญชี…');setAttempt((n) => n+1)}}>ตรวจสอบบัญชีอีกครั้ง</button>
  </section>
}
