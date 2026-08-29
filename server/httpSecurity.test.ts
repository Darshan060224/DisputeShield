import { describe, expect, it } from "vitest";
import { applyBaselineSecurityHeaders, safeApiParserError } from "./httpSecurity";

describe("HTTP security boundaries", () => {
  it("applies baseline browser hardening headers without a server fingerprint", () => {
    const values = new Map<string, string>();
    applyBaselineSecurityHeaders({ setHeader: (name, value) => values.set(name, value) });
    expect(Object.fromEntries(values)).toEqual({
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    });
  });

  it("maps parser failures to safe status-specific API bodies without internal error text", () => {
    expect(safeApiParserError({ type: "entity.too.large" })).toEqual({ status: 413, body: { ok: false, error: "request_too_large" } });
    expect(safeApiParserError({ type: "entity.parse.failed" })).toEqual({ status: 400, body: { ok: false, error: "invalid_request_body" } });
    expect(safeApiParserError(new Error("internal source path"))).toEqual({ status: 500, body: { ok: false, error: "request_processing_failed" } });
  });
});
