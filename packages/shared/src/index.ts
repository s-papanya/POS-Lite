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
export interface ExpenseCategory { id:string; name:string; active:boolean }
export interface OwnerTransaction {id:string;accountId:string;businessDate:string;occurredAt:string;kind:"CONTRIBUTION" | "WITHDRAWAL";amount:string;note:string}
export interface ExpensePayment {id:string;expenseId:string;accountId:string;businessDate:string;occurredAt:string;amount:string}
export interface Expense {id:string;categoryId:string;businessDate:string;occurredAt:string;amount:string;description:string;evidenceReference:string | null;status:"UNPAID" | "PAID";payment:ExpensePayment | null}
export interface FinancialAccount { id:string; name:string; type:"CASH" | "BANK"; active:boolean; storeIds:string[] }
export interface AccountOpening { id:string; accountId:string; storeId:string; amount:string; cutoverAt:string; reason:string }
export interface SaleItem {productId:string;nameSnapshot:string;unitPrice:string;productVersion:number;quantity:number;lineTotal:string}
export interface SalePayment {id:string;accountId:string;channel:"CASH" | "TRANSFER";amount:string;tendered:string | null;change:string | null}
export interface Sale {id:string;reference:string;kind:"POS" | "SUPPLEMENTAL" | "RECONCILIATION";businessDate:string;occurredAt:string;gross:string;discount:string;net:string;
  dayRevision:string;items:SaleItem[];payments:SalePayment[];reason?:string}
export type BusinessDay = {id:string;businessDate:string;state:"OPEN" | "CLOSED";revision:string;
  openingSnapshots?:{accountId:string;amount:string}[]};
