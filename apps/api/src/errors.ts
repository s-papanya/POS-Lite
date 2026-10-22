import type { ErrorRequestHandler, RequestHandler } from "express";
import type { ApiErrorResponse } from "@pos-lite/shared";

function responseError(code: string, message: string, requestId: string): ApiErrorResponse {
  return { error: { code, message, requestId } };
}

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json(responseError(
    "RESOURCE_NOT_FOUND", "ไม่พบรายการที่ต้องการ", String(res.getHeader("X-Request-Id")),
  ));
};

export const errorHandler: ErrorRequestHandler = (error: unknown, req, res, next) => {
  if (res.headersSent) { next(error); return; }

  const type = typeof error === "object" && error !== null && "type" in error ? error.type : undefined;
  const requestId = String(res.getHeader("X-Request-Id"));
  if (type === "entity.parse.failed") {
    res.status(400).json(responseError("INVALID_REQUEST", "รูปแบบข้อมูลไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง", requestId));
    return;
  }
  if (type === "entity.too.large") {
    res.status(413).json(responseError("PAYLOAD_TOO_LARGE", "ข้อมูลมีขนาดใหญ่เกินที่กำหนด", requestId));
    return;
  }
  req.log.error({ errorCode: "INTERNAL_ERROR", requestId }, "Request failed");
  res.status(500).json(responseError("INTERNAL_ERROR", "ระบบขัดข้อง กรุณาลองใหม่อีกครั้ง", requestId));
};
