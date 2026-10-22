export interface HealthResponse {
  data: { status: "ok"; service: "family-store-manager-api" };
}

export interface ApiErrorResponse {
  error: { code: string; message: string; requestId: string; details?: Record<string, unknown> };
}

export interface AccessibleStore { id: string; name: string; code: string; role: "OWNER" | "MANAGER" | "STAFF" }
export interface MeResponse {
  data: { user: { id: string; username: string }; business: { id: string; name: string };
    businessRole: "OWNER" | null; stores: AccessibleStore[] };
}
export interface CsrfResponse { data: { csrfToken: string } }
export interface Product { id: string; name: string; price: string; version: number; active: boolean }
export interface FinancialAccount { id:string; name:string; type:"CASH" | "BANK"; active:boolean; storeIds:string[] }
export interface AccountOpening { id:string; accountId:string; storeId:string; amount:string; cutoverAt:string; reason:string }
