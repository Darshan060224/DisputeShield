export type HeaderSink = { setHeader: (name: string, value: string) => void };

export function applyBaselineSecurityHeaders(response: HeaderSink) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
}

export function safeApiParserError(error: unknown): { status: 400 | 413 | 500; body: { ok: false; error: "invalid_request_body" | "request_too_large" | "request_processing_failed" } } {
  const record = error && typeof error === "object" ? error as { status?: number; type?: string } : null;
  if (record?.status === 413 || record?.type === "entity.too.large") {
    return { status: 413, body: { ok: false, error: "request_too_large" } };
  }
  if (record?.status === 400 || record?.type === "entity.parse.failed") {
    return { status: 400, body: { ok: false, error: "invalid_request_body" } };
  }
  return { status: 500, body: { ok: false, error: "request_processing_failed" } };
}
