import { describe, expect, it, vi } from "vitest";
import { dispatchQrEvidenceAction, getQrEvidenceAction } from "../client/src/lib/qrEvidenceGuard";

describe("QR evidence dashboard action guard", () => {
  it("blocks mutation dispatch when the live dispute queue is empty", () => {
    expect(getQrEvidenceAction(null)).toMatchObject({
      allowed: false,
      message: "QR evidence is available after a signed live dispute arrives.",
    });
  });

  it("permits the exact live case ID only when a case is available", () => {
    expect(getQrEvidenceAction("DSP-live-123")).toEqual({ allowed: true, caseId: "DSP-live-123" });
  });

  it("never invokes the QR mutation dispatch for an empty queue, even if the handler runs", () => {
    const dispatchMutation = vi.fn();
    const onUnavailable = vi.fn();
    const onAuthenticationRequired = vi.fn();

    const result = dispatchQrEvidenceAction({
      caseId: undefined,
      isAuthenticated: true,
      dispatchMutation,
      onUnavailable,
      onAuthenticationRequired,
    });

    expect(result).toEqual({ dispatched: false, reason: "no_live_case" });
    expect(dispatchMutation).not.toHaveBeenCalled();
    expect(onUnavailable).toHaveBeenCalledOnce();
    expect(onAuthenticationRequired).not.toHaveBeenCalled();
  });
});
