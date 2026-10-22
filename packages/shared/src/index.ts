export interface HealthResponse {
  data: { status: "ok"; service: "family-store-manager-api" };
}

export interface ApiErrorResponse {
  error: { code: string; message: string; requestId: string };
}

export interface AccessibleStore { id: string; name: string; code: string; role: "OWNER" | "MANAGER" | "STAFF" }
export interface MeResponse {
  data: { user: { id: string; username: string }; business: { id: string; name: string };
    businessRole: "OWNER" | null; stores: AccessibleStore[] };
}
export interface CsrfResponse { data: { csrfToken: string } }
