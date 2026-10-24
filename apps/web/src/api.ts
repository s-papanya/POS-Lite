import { apiErrorResponseSchema, csrfResponseSchema } from '@pos-lite/validation'

export class ApiFailure extends Error {
  status: number; code: string; requestId?: string; details?: Record<string, unknown>
  constructor(status: number, code: string, requestId?: string, details?: Record<string, unknown>) {
    super(code); this.status = status; this.code = code; this.requestId = requestId; this.details = details
  }
}
export async function request<T>(path: string, schema: { parse: (value: unknown) => T }, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api/v1${path}`, { ...options, credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(8000) })
  const body: unknown = await response.json()
  if (!response.ok) {
    const parsed = apiErrorResponseSchema.safeParse(body)
    if (!parsed.success) throw new ApiFailure(response.status, 'UNKNOWN_RESPONSE')
    const { code, requestId, details } = parsed.data.error
    throw new ApiFailure(response.status, code, requestId, details)
  }
  return schema.parse(body)
}
export async function csrfToken() { return (await request('/auth/csrf', csrfResponseSchema)).data.csrfToken }
export async function allPages<T>(path: string, schema: { parse: (value: unknown) => { data: T[]; page: { nextCursor: string | null } } }) {
  const data: T[] = []; let cursor: string | null = null; const seen = new Set<string>()
  do {
    const page: { data: T[]; page: { nextCursor: string | null } } = await request(path + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''), schema)
    data.push(...page.data); cursor = page.page.nextCursor
    if (cursor && (seen.has(cursor) || seen.size >= 100)) throw new Error('Invalid pagination')
    if (cursor) seen.add(cursor)
  } while (cursor)
  return data
}
