import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { MeResponse } from '@pos-lite/shared'
import { csrfResponseSchema, meResponseSchema } from '@pos-lite/validation'
import { PosWorkspace } from './pos/PosWorkspace'
import { scopeKey, selectionKey } from './pos/state'
import type { WorkState } from './pos/PosWorkspace'

async function api(path: string, options?: RequestInit) {
  return fetch(`/api/v1${path}`, { ...options, credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(8000) })
}

export function StoreAccess() {
  const [me, setMe] = useState<MeResponse['data'] | null>(null)
  const [pending, setPending] = useState(true)
  const [message, setMessage] = useState('กำลังตรวจสอบการเข้าสู่ระบบ…')
  const [selected, setSelected] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [work, setWork] = useState<WorkState>({ draft: false, pending: false })
  const [leaving, setLeaving] = useState<'store' | 'logout' | null>(null)
  const expired = useCallback(() => { setMe(null); setSelected(''); setWork({ draft: false, pending: false }); setMessage('บัญชีหมดอายุหรือเปลี่ยนแล้ว กรุณาเข้าสู่ระบบเดิมเพื่อตรวจบิลค้าง ไม่มีการส่งซ้ำอัตโนมัติ') }, [])
  function restoreSelection(data: MeResponse['data']) {
    try { const id = sessionStorage.getItem(selectionKey(data.user.id, data.business.id)); return data.stores.some(s => s.id === id) ? id! : '' } catch { return '' }
  }

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const result = await api('/me')
        if (!active) return
        if (result.status === 401) { setMe(null); setSelected(''); setMessage(''); return }
        if (!result.ok) throw new Error('Session unavailable')
        const data = meResponseSchema.parse(await result.json()).data
        if (active) { setMe(data); setSelected(restoreSelection(data)); setMessage('') }
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
      const data = meResponseSchema.parse(await current.json()).data
      setMe(data); setSelected(restoreSelection(data)); setMessage('เข้าสู่ระบบแล้ว กรุณาตรวจร้านก่อนขาย')
    } catch { setMessage('ยังยืนยันผลไม่ได้ กรุณากดตรวจสอบบัญชีอีกครั้งก่อนลองเข้าสู่ระบบใหม่') }
    finally { setPending(false) }
  }
  async function logout() {
    setPending(true); setMessage('กำลังออกจากระบบ…')
    try {
      const result = await api('/auth/logout',{method:'POST',headers:{'X-CSRF-Token':await csrf()}})
      if (!result.ok) throw new Error('Logout unavailable')
      if (me) {
        const prefix = `pos-lite:checkout:${me.user.id}:${me.business.id}:`
        for (const key of Object.keys(sessionStorage)) if (key.startsWith(prefix)) sessionStorage.removeItem(key)
        sessionStorage.removeItem(selectionKey(me.user.id, me.business.id))
      }
      setMe(null); setSelected(''); setMessage('ออกจากระบบแล้ว')
    } catch { setMessage('ยังยืนยันการออกจากระบบไม่ได้ กรุณาตรวจสอบบัญชีอีกครั้ง') }
    finally { setPending(false) }
  }
  function leave(action: 'store' | 'logout') {
    if (work.pending) { setMessage('ยังมีบิลรอยืนยัน กรุณาตรวจผลบิลเดิมก่อนเปลี่ยนร้านหรือออกจากระบบ'); return }
    if (action === 'logout' && me) {
      try {
        const prefix = `pos-lite:checkout:${me.user.id}:${me.business.id}:`
        if (Object.keys(sessionStorage).some(key => key.startsWith(prefix) && JSON.parse(sessionStorage.getItem(key) ?? '{}').pending)) {
          setMessage('ยังมีบิลรอยืนยันของบัญชีนี้ กรุณาตรวจผลก่อนออกจากระบบ'); return
        }
      } catch { setMessage('ตรวจข้อมูลค้างไม่ได้ กรุณาให้เจ้าของช่วยตรวจประวัติก่อนออกจากระบบ'); return }
    }
    if (work.draft || action === 'logout') { setLeaving(action); return }
    setSelected(''); setWork({ draft: false, pending: false })
  }
  function finishLeave(discard: boolean) {
    if (!me || !leaving) return
    if (work.pending) { setLeaving(null); setMessage('ยังมีบิลรอยืนยัน จึงยังไม่ทิ้งรายการหรือเปลี่ยนร้าน'); return }
    if (discard && selected) sessionStorage.removeItem(scopeKey({ userId: me.user.id, businessId: me.business.id, storeId: selected }))
    const action = leaving; setLeaving(null); setSelected(''); setWork({ draft: false, pending: false })
    if (action === 'logout') void logout()
  }

  return <section className="store-access" aria-labelledby="access-title" aria-busy={pending}>
    {selected ? <h2 id="access-title" className="sr-only">หน้าร้าน</h2> : <h1 id="access-title">{me ? 'เลือกร้านของคุณ' : 'เข้าสู่ระบบร้านของเรา'}</h1>}
    {me ? <>
      {!selected && <div className="store-list">
        {me.stores.map((store) => <button key={store.id} type="button" aria-pressed={selected === store.id} disabled={pending}
          onClick={() => { setSelected(store.id); setWork({ draft: false, pending: false }); try { sessionStorage.setItem(selectionKey(me.user.id, me.business.id), store.id) } catch { /* Selling remains blocked if pending storage fails. */ } setMessage('') }}>
          <strong>{store.name}</strong><span>{({OWNER:'เจ้าของร้าน',MANAGER:'ผู้จัดการ',STAFF:'พนักงาน'})[store.role]}</span>
        </button>)}
      </div>}
      {!me.stores.length && <p>ยังไม่มีร้านที่เปิดให้บัญชีนี้ใช้งาน กรุณาติดต่อเจ้าของร้าน</p>}
      <details className="account-tools"><summary>บัญชี {me.user.username}</summary><p>{me.business.name}</p>
      <div className="access-actions">{selected && <button type="button" className="secondary-action" disabled={pending} onClick={() => leave('store')}>เปลี่ยนร้าน</button>}
      <button type="button" className="secondary-action" disabled={pending} onClick={() => leave('logout')}>ออกจากระบบ</button></div></details>
      {leaving && <div className="notice" role="group" aria-label="จัดการรายการที่ยังไม่ส่ง"><p>{leaving === 'logout' ? 'ออกจากระบบจะล้างรายการที่ยังไม่ส่งของบัญชีนี้ บิลที่บันทึกแล้วอยู่ในประวัติ' : 'มีรายการที่ยังไม่ส่ง ต้องการเก็บไว้กลับมาทำต่อหรือทิ้งรายการ?'}</p>
        <div className="actions">{leaving === 'store' && <button type="button" onClick={() => finishLeave(false)}>เก็บไว้แล้วเปลี่ยนร้าน</button>}<button type="button" onClick={() => finishLeave(true)}>{leaving === 'store' ? 'ทิ้งแล้วเปลี่ยนร้าน' : 'ล้างรายการแล้วออกจากระบบ'}</button><button type="button" className="secondary-action" onClick={() => setLeaving(null)}>อยู่ต่อ</button></div></div>}
      {selected && me.stores.some(s => s.id === selected) && <fieldset className="workspace-lock" disabled={!!leaving || pending} aria-label="งานหน้าร้าน"><PosWorkspace key={`${me.user.id}:${me.business.id}:${selected}`} me={me} store={me.stores.find(s => s.id === selected)!} onExpired={expired} onWorkChange={setWork} /></fieldset>}
    </> : <form onSubmit={(event) => void login(event)}>
      <label htmlFor="username">ชื่อผู้ใช้</label>
      <input id="username" name="username" autoComplete="username" required minLength={3} maxLength={64} disabled={pending} autoCapitalize="none" spellCheck={false} />
      <label htmlFor="password">รหัสผ่าน</label>
      <input id="password" name="password" type="password" autoComplete="current-password" required maxLength={128} disabled={pending} />
      <button type="submit" disabled={pending}>{pending ? 'กำลังตรวจสอบ…' : 'เข้าสู่ระบบ'}</button>
    </form>}
    <p role="status" aria-live="polite">{message}</p>
    {!selected && <button type="button" className="secondary-action" disabled={pending} onClick={() => {setPending(true);setMessage('กำลังตรวจสอบบัญชี…');setAttempt((n) => n+1)}}>ตรวจสอบบัญชีอีกครั้ง</button>}
  </section>
}
