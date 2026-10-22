export interface HealthResponse {
  data: { status: "ok"; service: "family-store-manager-api" };
}

export interface ApiErrorResponse {
  error: { code: string; message: string; requestId: string };
}
